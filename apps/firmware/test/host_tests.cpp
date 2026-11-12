// Host-side tests for the firmware's pure logic. Run: pnpm --filter @stepwhere/firmware test
//
// Pedometer inputs are synthetic shoe-motion signals: they check the detector's
// logic (stance/swing segmentation, regulation, rejection), not its real-world
// accuracy, which needs labelled captures from the capture build.
//
// Modem replies are written in the field layout the dev firmware parsed; no
// real AT+NETDMSG/AT+WIFIAPSCAN capture is committed yet.

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <functional>
#include <vector>

#include "../src/pedometer.h"
#include "../src/radio_parsers.h"

using namespace stepwhere;

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(condition)                                                     \
  do {                                                                       \
    ++g_checks;                                                              \
    if (!(condition)) {                                                      \
      ++g_failures;                                                          \
      fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__, __LINE__, #condition); \
    }                                                                        \
  } while (0)

#define CHECK_NEAR(actual, expected, tolerance)                                          \
  do {                                                                                   \
    ++g_checks;                                                                          \
    const long a_ = (long)(actual), e_ = (long)(expected), t_ = (long)(tolerance);       \
    if (labs(a_ - e_) > t_) {                                                            \
      ++g_failures;                                                                      \
      fprintf(stderr, "%s:%d: %s = %ld, expected %ld ± %ld\n", __FILE__, __LINE__,       \
              #actual, a_, e_, t_);                                                      \
    }                                                                                    \
  } while (0)

// ─── Synthetic shoe signal ────────────────────────────────────────────────────

struct Sample {
  int16_t x, y, z;
};

struct Signal {
  std::vector<Sample> samples;
  uint32_t seed = 12345;
  int gravity_mg = 1000;

  int noise(int amplitude) {
    seed = seed * 1103515245u + 12345u;
    if (amplitude == 0) return 0;
    return (int)((seed >> 16) % (2u * amplitude + 1)) - amplitude;
  }

  void push(int x, int y, int z) {
    samples.push_back({ (int16_t)x, (int16_t)y, (int16_t)z });
  }

  void stand(int duration_ms, int noise_mg = 30) {
    for (int t = 0; t < duration_ms; t += 40) {
      push(noise(noise_mg), noise(noise_mg), gravity_mg + noise(noise_mg));
    }
  }

  // One stride of the instrumented foot: stance, then a swing ending in a
  // heel strike.
  void stride(int period_ms, double stance_fraction, int stance_noise_mg = 30, double scale = 1.0) {
    const int stance_ms = (int)(period_ms * stance_fraction);
    stand(stance_ms, stance_noise_mg);
    const int swing_samples = (period_ms - stance_ms) / 40;
    for (int i = 0; i < swing_samples; ++i) {
      const double phase = swing_samples > 1 ? (double)i / (swing_samples - 1) : 1.0;
      double x = 1400.0 * sin(2.0 * M_PI * phase) * scale;
      double z = gravity_mg + 900.0 * sin(M_PI * phase) * scale;
      if (i == swing_samples - 1) z += 2500.0 * scale;  // heel strike
      push((int)x + noise(40), noise(40), (int)z + noise(40));
    }
  }

  void walk(int strides, int period_ms = 1100, double stance_fraction = 0.6) {
    for (int i = 0; i < strides; ++i) stride(period_ms, stance_fraction);
  }
};

static uint32_t count_steps(const Signal &signal) {
  ShoePedometer pedometer;
  uint32_t steps = 0;
  for (const Sample &s : signal.samples) steps += pedometer.update(s.x, s.y, s.z);
  return steps;
}

// ─── Pedometer tests ──────────────────────────────────────────────────────────

static void test_isqrt() {
  CHECK(isqrt32(0) == 0);
  CHECK(isqrt32(1) == 1);
  CHECK(isqrt32(999999) == 999);
  CHECK(isqrt32(1000000) == 1000);
  CHECK(isqrt32(192000000) == 13856);
  CHECK(isqrt32(3221028867u) == 56754);  // 3 × 32767²
}

static void test_walking_counts_two_steps_per_stride() {
  Signal signal;
  signal.stand(1000);
  signal.walk(60);
  signal.stand(3000);
  CHECK_NEAR(count_steps(signal), 120, 2);
}

static void test_running() {
  Signal signal;
  signal.stand(1000);
  for (int i = 0; i < 50; ++i) signal.stride(700, 0.35, 80, 1.6);
  signal.stand(3000);
  CHECK_NEAR(count_steps(signal), 100, 4);
}

static void test_child_cadence() {
  Signal signal;
  signal.stand(1000);
  for (int i = 0; i < 40; ++i) signal.stride(600, 0.45, 60, 1.2);
  signal.stand(3000);
  CHECK_NEAR(count_steps(signal), 80, 4);
}

static void test_short_shuffle_is_not_counted() {
  Signal signal;
  signal.stand(1000);
  signal.walk(3);
  signal.stand(5000);
  CHECK(count_steps(signal) == 0);
}

static void test_bouts_are_confirmed_separately() {
  Signal signal;
  signal.stand(1000);
  signal.walk(10);
  signal.stand(4000);
  signal.walk(10);
  signal.stand(3000);
  CHECK_NEAR(count_steps(signal), 40, 2);
}

static void test_steps_are_back_filled_on_confirmation() {
  Signal signal;
  signal.stand(1000);
  ShoePedometer pedometer;
  std::vector<uint16_t> outputs;
  signal.walk(6);
  for (const Sample &s : signal.samples) {
    const uint16_t steps = pedometer.update(s.x, s.y, s.z);
    if (steps) outputs.push_back(steps);
  }
  // Four strides confirm the bout at once (8 steps), later strides add 2 each.
  CHECK(outputs.size() >= 2);
  if (outputs.size() >= 2) {
    CHECK(outputs[0] == 8);
    CHECK(outputs[1] == 2);
  }
}

static void test_vehicle_vibration_is_ignored() {
  Signal signal;
  signal.stand(60000, 150);
  CHECK(count_steps(signal) == 0);
}

static void test_isolated_bumps_are_ignored() {
  Signal signal;
  signal.stand(1000);
  for (int i = 0; i < 20; ++i) {
    signal.stand(3000 + (i % 3) * 1000);
    signal.push(0, 0, 2600);
    signal.push(0, 0, 2200);
  }
  signal.stand(3000);
  CHECK(count_steps(signal) == 0);
}

static void test_continuous_shaking_is_ignored() {
  Signal signal;
  signal.stand(1000);
  for (int i = 0; i < 250; ++i) {  // 10 s of 3 Hz shaking, never still
    const double t = i * 0.04;
    signal.push((int)(1500 * sin(2 * M_PI * 3 * t)), 0, 1000 + (int)(1000 * sin(2 * M_PI * 3 * t + 1.0)));
  }
  signal.stand(3000);
  CHECK(count_steps(signal) == 0);
}

static void test_gravity_offset_is_tracked() {
  Signal signal;
  signal.gravity_mg = 1080;  // sensor offset / scale error
  signal.stand(5000);
  signal.walk(30);
  signal.stand(3000);
  CHECK_NEAR(count_steps(signal), 60, 2);
}

// ─── NETDMSG parser tests ─────────────────────────────────────────────────────

static const char *kNetdmsg =
  "\r\n+NETDMSG: \"404+45\",0x1A2B,0x1234567,123,\"FDD LTE\",\"LTE BAND 3\",1300,-75,10,0,0,0,-985,-102,85\r\n\r\nOK\r\n";

static void test_netdmsg_valid() {
  ServingCell cell;
  const char *error = nullptr;
  CHECK(parse_netdmsg(kNetdmsg, cell, error));
  CHECK(error == nullptr);
  CHECK(cell.valid);
  CHECK(cell.mobile_country_code == 404);
  CHECK(cell.mobile_network_code == 45);
  CHECK(cell.tracking_area_code == 0x1A2B);
  CHECK(cell.cell_id == 0x1234567);
  CHECK(cell.has_physical_cell_id && cell.physical_cell_id == 123);
  CHECK(strcmp(cell.duplex_mode, "fdd") == 0);
  CHECK(cell.has_band && strcmp(cell.band, "LTE BAND 3") == 0);
  CHECK(cell.has_earfcn && cell.earfcn == 1300);
  CHECK(cell.has_rx_dbm && cell.rx_dbm == -75);
  CHECK(cell.has_tx_dbm && cell.tx_dbm == 10);
  CHECK(cell.has_rsrp && cell.rsrp_tenths_dbm == -985);
  CHECK(cell.has_rsrq && cell.rsrq_tenths_db == -102);
  CHECK(cell.has_sinr && cell.sinr_tenths_db == 85);
}

static void test_netdmsg_decimal_and_tdd() {
  ServingCell cell;
  const char *error = nullptr;
  CHECK(parse_netdmsg("+NETDMSG: 404+10,6699,23456789,503,\"TDD LTE\",40,38950,-90,23,0,0,0,-1100,-150,-30", cell, error));
  CHECK(cell.tracking_area_code == 6699);
  CHECK(cell.cell_id == 23456789);
  CHECK(strcmp(cell.duplex_mode, "tdd") == 0);
  CHECK(cell.sinr_tenths_db == -30);
}

static void test_netdmsg_optional_fields_out_of_range_are_dropped() {
  ServingCell cell;
  const char *error = nullptr;
  // PCI 504, rx 199 (unknown) and tx 150 exceed the server schema.
  CHECK(parse_netdmsg("+NETDMSG: \"404+45\",1,2,504,\"FDD LTE\",\"\",x,199,150,0,0,0,y,z,w", cell, error));
  CHECK(cell.valid);
  CHECK(!cell.has_physical_cell_id);
  CHECK(!cell.has_band);
  CHECK(!cell.has_earfcn);
  CHECK(!cell.has_rx_dbm);
  CHECK(!cell.has_tx_dbm);
  CHECK(!cell.has_rsrp && !cell.has_rsrq && !cell.has_sinr);
}

static void test_netdmsg_rejections() {
  ServingCell cell;
  const char *error = nullptr;
  CHECK(!parse_netdmsg("\r\nOK\r\n", cell, error) && strstr(error, "+NETDMSG"));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45\",1,2,3", cell, error) && strstr(error, "15"));
  CHECK(!parse_netdmsg("+NETDMSG: \"40445\",1,2,3,\"FDD LTE\",b,1,1,1,0,0,0,1,1,1", cell, error)
        && strstr(error, "MCC+MNC"));
  CHECK(!parse_netdmsg("+NETDMSG: \"1000+45\",1,2,3,\"FDD LTE\",b,1,1,1,0,0,0,1,1,1", cell, error)
        && strstr(error, "MCC"));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45\",1,2,3,\"GSM\",b,1,1,1,0,0,0,1,1,1", cell, error)
        && strstr(error, "LTE"));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45\",70000,2,3,\"FDD LTE\",b,1,1,1,0,0,0,1,1,1", cell, error)
        && strstr(error, "tracking"));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45\",1,268435456,3,\"FDD LTE\",b,1,1,1,0,0,0,1,1,1", cell, error)
        && strstr(error, "cell ID"));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45\",-1,2,3,\"FDD LTE\",b,1,1,1,0,0,0,1,1,1", cell, error));
  CHECK(!parse_netdmsg("+NETDMSG: \"404+45,1,2,3,FDD LTE,b,1,1,1,0,0,0,1,1,1", cell, error));
  CHECK(!cell.valid);
}

// ─── Wi-Fi parser tests ───────────────────────────────────────────────────────

static void test_wifi_mac_normalization() {
  char mac[18];
  CHECK(normalize_wifi_mac("a1b2c3d4e5f6", mac) && strcmp(mac, "A1:B2:C3:D4:E5:F6") == 0);
  CHECK(normalize_wifi_mac("a1:b2:c3:d4:e5:f6", mac) && strcmp(mac, "A1:B2:C3:D4:E5:F6") == 0);
  CHECK(!normalize_wifi_mac("a1-b2-c3-d4-e5-f6", mac));
  CHECK(!normalize_wifi_mac("a1b2c3d4e5", mac));
  CHECK(!normalize_wifi_mac("g1b2c3d4e5f6", mac));
}

static void test_wifi_lines() {
  WifiScanResult result;
  result.clear();
  CHECK(parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-60,6", result, 100));
  CHECK(parse_wifi_ap_line("+WIFIAPSCAN:A1:B2:C3:D4:E5:F7,-71,11\r", result, 100));
  CHECK(result.count == 2);
  CHECK(strcmp(result.points[0].mac, "A1:B2:C3:D4:E5:F6") == 0);
  CHECK(result.points[0].rssi == -60 && result.points[0].channel == 6);
  CHECK(result.points[0].observed_at_ms == 100);

  // Duplicates keep the strongest reading.
  CHECK(parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-80,6", result, 200));
  CHECK(result.count == 2 && result.points[0].rssi == -60);
  CHECK(parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-50,6", result, 300));
  CHECK(result.count == 2 && result.points[0].rssi == -50 && result.points[0].observed_at_ms == 300);
  CHECK(result.lines_seen == 4);

  CHECK(!parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,5,6", result, 0));
  CHECK(!parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-60,15", result, 0));
  CHECK(!parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-60,6,extra", result, 0));
  CHECK(!parse_wifi_ap_line("+WIFIAPSCAN: a1b2c3d4e5f6,-60", result, 0));
  CHECK(!parse_wifi_ap_line("OK", result, 0));
  CHECK(result.count == 2);
}

static void test_wifi_keeps_strongest_sixteen() {
  WifiScanResult result;
  result.clear();
  char line[64];
  for (int i = 0; i < 20; ++i) {
    snprintf(line, sizeof(line), "+WIFIAPSCAN: 0000000000%02x,%d,1", i, -90 + i);
    CHECK(parse_wifi_ap_line(line, result, 0));
  }
  CHECK(result.count == kMaxWifiAccessPoints);
  int weakest = 0;
  for (uint8_t i = 0; i < result.count; ++i) {
    if (result.points[i].rssi < weakest) weakest = result.points[i].rssi;
  }
  CHECK(weakest == -86);  // the four weakest (-90..-87) were displaced
}

int main() {
  const std::vector<std::pair<const char *, std::function<void()>>> tests = {
    { "isqrt", test_isqrt },
    { "walking counts two steps per stride", test_walking_counts_two_steps_per_stride },
    { "running", test_running },
    { "child cadence", test_child_cadence },
    { "short shuffle is not counted", test_short_shuffle_is_not_counted },
    { "bouts are confirmed separately", test_bouts_are_confirmed_separately },
    { "steps are back-filled on confirmation", test_steps_are_back_filled_on_confirmation },
    { "vehicle vibration is ignored", test_vehicle_vibration_is_ignored },
    { "isolated bumps are ignored", test_isolated_bumps_are_ignored },
    { "continuous shaking is ignored", test_continuous_shaking_is_ignored },
    { "gravity offset is tracked", test_gravity_offset_is_tracked },
    { "netdmsg valid", test_netdmsg_valid },
    { "netdmsg decimal and tdd", test_netdmsg_decimal_and_tdd },
    { "netdmsg drops out-of-range optional fields", test_netdmsg_optional_fields_out_of_range_are_dropped },
    { "netdmsg rejections", test_netdmsg_rejections },
    { "wifi mac normalization", test_wifi_mac_normalization },
    { "wifi lines", test_wifi_lines },
    { "wifi keeps strongest sixteen", test_wifi_keeps_strongest_sixteen },
  };
  for (const auto &test : tests) {
    const int before = g_failures;
    test.second();
    printf("%s %s\n", g_failures == before ? "ok  " : "FAIL", test.first);
  }
  printf("\n%d checks, %d failed\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
