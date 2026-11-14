/**
 * Stepwhere QA firmware, route 1: board tests over TTL.
 *
 * Flash this on the Bench, keep the serial console open, and the tests run once
 * at boot. Every result is one machine-readable line the Bench records on the
 * unit:
 *
 *   @QA {"v":1,"e":"test","run":1,"uid":"…","id":"gsm","status":"pass","ms":8120,"data":{…}}
 *
 * The protocol lives in packages/types/src/qa-tests.ts. Human-readable [QA]
 * lines and the raw [AT] traffic are printed alongside for debugging.
 * Route 2 (business logic with debug logs) is a separate build, still to come.
 *
 * Pins (same board as stepwhere.ino):
 *   USART1 PB6 TX / PB7 RX  115200  console + @QA lines
 *   USART2 PA2 TX / PA3 RX  115200  Neoway N706 modem
 *   USART3 PB8 TX / PB9 RX  9600    G7A GPS
 *   I2C PA12 SDA / PA11 SCL         accelerometer, SA0 PA1 driven high, INT2 PB4
 *   SPI1 PA7 MOSI / PA6 MISO / PA5 SCK, /CS PC6, /WP PC7, /HOLD PB12   W25Q128 flash
 *   PA10 LDO_EN (modem + GPS rail), PB13 modem PWRKEY, PB10 battery ADC
 *
 * Accelerometer: found by WHO_AM_I, like stepwhere.ino. A LIS2DH12 (0x33 at
 * 0x19 or 0x18) is read through its FIFO and its steps come from the shoe
 * pedometer in src/pedometer.h; a LIS2DS12 (0x43 at 0x1D or 0x1E) uses its
 * hardware step counter on INT2.
 *
 * Console commands: QA RUN, QA RUN <test>, QA GO, QA ABORT, QA STATUS, QA HELP.
 * The step test waits for QA GO (the Start button in admin), so on a bench of
 * 30 boards each one is walked when the operator gets to it.
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <SPI.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>

#include "src/pedometer.h"

#define QA_FW_VERSION "qa-0.5.0"

// ─── Limits ───────────────────────────────────────────────────────────────────
// The firmware decides pass or fail and reports the limit it used.
constexpr uint32_t BATTERY_MIN_MV = 3400;           // modem cut-off in stepwhere.ino
constexpr uint32_t BATTERY_MAX_MV = 4400;           // above a full Li-ion cell (4.2 V) plus margin
constexpr uint16_t ADC_SATURATED_RAW = 4090;        // 12-bit ADC pinned at the top: not a real reading
constexpr uint32_t VDDA_MIN_MV = 3000;              // MCU supply is 3.3 V
constexpr uint32_t VDDA_MAX_MV = 3600;
constexpr int32_t GSM_CSQ_MIN = 10;                 // the antenna is a wire; below 10 (−93 dBm) is a defect
// Same APN as the production firmware v2.2.0. Change it here if the bench SIMs need another one
// (Airtel IoT, for example, may use "airteliot.com"); or build with -DQA_APN=\"…\".
#ifndef QA_APN
#define QA_APN "internet"
#endif
constexpr uint32_t GSM_REGISTER_LIMIT_MS = 60000;   // power-on to network registration (spec v2;
                                                    // a weak antenna is caught by GSM_CSQ_MIN)
constexpr uint32_t GSM_REGISTER_GIVE_UP_MS = 60000; // keep measuring a late registration
constexpr uint32_t DATA_LIMIT_MS = 60000;           // power-on to a data IP
// GPS fix is information only (QA spec v2): look for one this long after GPS power-on.
constexpr uint32_t GPS_FIX_INFO_LIMIT_MS = 3UL * 60UL * 1000UL;
constexpr uint32_t GPS_NMEA_LIMIT_MS = 5000;        // first NMEA bytes after GPS power-on
constexpr uint8_t GPS_MIN_SATELLITES = 4;           // stepwhere.ino requires more than 3
constexpr uint32_t STEP_WINDOW_MS = 60000;
constexpr uint32_t STEP_START_LIMIT_MS = 10UL * 60UL * 1000UL;  // wait this long for QA GO
constexpr uint16_t STEP_TARGET = 10;
constexpr uint16_t WIFI_MIN_APS = 1;
constexpr int32_t ACCEL_MIN_MG = 700;               // at rest the board reads about 1 g
constexpr int32_t ACCEL_MAX_MG = 1300;

// ─── Hardware ─────────────────────────────────────────────────────────────────
#define GSM_PWRKEY PB13
#define LDO_EN PA10
#define BATTERY_ADC PB10
#define CHARGER_CHRG PB14   // TP4056 CHRG, open-drain, low = charging
#define CHARGER_STDBY PB15  // TP4056 STDBY, open-drain, low = charge complete
constexpr uint32_t VREFINT_CAL_VDDA_MV = 3000;  // the factory VREFINT value is measured at 3.0 V
#ifndef QA_READ_VREFINT_CAL
// STM32G0 VREFINT_CAL: 16-bit word in system memory (RM0444, datasheet table "Internal voltage reference").
#define QA_READ_VREFINT_CAL() (*(const volatile uint16_t *)0x1FFF75AAUL)
#endif
#define I2C_SDA PA12
#define I2C_SCL PA11
#define ACCEL_SA0 PA1
#define ACCEL_INT2 PB4
#define ACCEL_REG_WHO_AM_I 0x0F
#define LIS2DS12_WHO_AM_I_VALUE 0x43
#define LIS2DH12_WHO_AM_I_VALUE 0x33

// LIS2DH12 registers and the configuration stepwhere.ino ships.
#define LIS2DH12_CTRL_REG1 0x20
#define LIS2DH12_CTRL_REG2 0x21
#define LIS2DH12_CTRL_REG3 0x22
#define LIS2DH12_CTRL_REG4 0x23
#define LIS2DH12_CTRL_REG5 0x24
#define LIS2DH12_CTRL_REG6 0x25
#define LIS2DH12_OUT_X_L 0x28
#define LIS2DH12_FIFO_CTRL 0x2E
#define LIS2DH12_FIFO_SRC 0x2F
#define LIS2DH12_ODR_25HZ_XYZ 0x37   // CTRL_REG1: 25 Hz, normal mode, X/Y/Z on
#define LIS2DH12_BDU_8G 0xA0         // CTRL_REG4: block data update, ±8 g
#define LIS2DH12_FIFO_ENABLE 0x40    // CTRL_REG5
#define LIS2DH12_FIFO_STREAM 0x80    // FIFO_CTRL: stream mode

constexpr uint32_t ACCEL_POLL_INTERVAL_MS = 200;  // same as stepwhere.ino; the FIFO holds 1.28 s

// W25Q128 external flash (IC8). Same pins as the OTA flash driver. It sits on the
// MCU supply (it answers with the modem/GPS rail off), so the test needs nothing first.
#define W25Q_MOSI PA7
#define W25Q_MISO PA6
#define W25Q_SCK PA5
#define W25Q_CS PC6
#define W25Q_WP PC7     // driven high: low blocks status-register writes
#define W25Q_HOLD PB12  // driven high: low pauses the chip and reads return 0xFF
constexpr uint32_t W25Q_JEDEC_EXPECTED = 0xEF4018;  // Winbond (EF), W25Q128 (40 18)
constexpr uint32_t W25Q_SPI_HZ = 4000000;
constexpr uint8_t W25Q_CMD_RELEASE_PD = 0xAB;
constexpr uint8_t W25Q_CMD_JEDEC_ID = 0x9F;
constexpr uint8_t W25Q_CMD_WRITE_ENABLE = 0x06;
constexpr uint8_t W25Q_CMD_READ_SR1 = 0x05;
constexpr uint8_t W25Q_CMD_READ = 0x03;
constexpr uint8_t W25Q_CMD_PAGE_PROGRAM = 0x02;
constexpr uint8_t W25Q_CMD_SECTOR_ERASE = 0x20;
constexpr uint8_t W25Q_SR1_BUSY = 0x01;
constexpr uint16_t W25Q_PAGE_SIZE = 256;
// The last 4 KB sector: EXT_SELFTEST_ADDR in the OTA layout (Smartshoe24/Stepwhere-Firmware,
// libraries/StepwhereOTA/src/ota_layout.h), outside every OTA slot and the motion log.
// The flash self-test uses the same sector, so a QA run never touches real data.
constexpr uint32_t W25Q_TEST_ADDR = 0xFFF000;
constexpr uint32_t W25Q_ERASE_TIMEOUT_MS = 1000;   // tSE max 400 ms
constexpr uint32_t W25Q_PROGRAM_TIMEOUT_MS = 20;   // tPP max 3 ms

constexpr uint32_t CONSOLE_BAUD = 115200;
constexpr uint32_t GSM_BAUD = 115200;
constexpr uint32_t GPS_BAUD = 9600;
constexpr uint32_t AT_TIMEOUT_MS = 5000;
constexpr uint32_t WIFI_SCAN_TIMEOUT_MS = 30000;
constexpr uint32_t XIIC_TIMEOUT_MS = 15000;
constexpr uint32_t VREF_CAL_MV = 1212;
constexpr uint16_t ADC_MAX = 4095;
constexpr size_t AT_LINE_CAPACITY = 192;
constexpr size_t AT_REPLY_CAPACITY = 512;

HardwareSerial SerialGSM(PA3, PA2);
HardwareSerial SerialGPS(PB9, PB8);
HardwareSerial SerialDBG(PB7, PB6);
TwoWire qaI2c(I2C_SDA, I2C_SCL);
SPIClass flashSpi(W25Q_MOSI, W25Q_MISO, W25Q_SCK);
TinyGPSPlus gps;
// GSV field 3 is "satellites in view" for each constellation's talker.
TinyGPSCustom gsvGps(gps, "GPGSV", 3);
TinyGPSCustom gsvGlonass(gps, "GLGSV", 3);
TinyGPSCustom gsvGalileo(gps, "GAGSV", 3);
TinyGPSCustom gsvBeidou(gps, "BDGSV", 3);
TinyGPSCustom gsvBeidouGb(gps, "GBGSV", 3);

// ─── Tests ────────────────────────────────────────────────────────────────────
// Same order as QA_BOARD_TEST_IDS in packages/types/src/qa-tests.ts.
enum TestId : uint8_t { T_POWER, T_IMU, T_FLASH, T_MODEM, T_SIM, T_GSM, T_WIFI, T_CELL, T_DATA, T_STEPS, T_GPS, TEST_COUNT };

const char *const TEST_NAMES[TEST_COUNT] = {
  "power", "imu", "flash", "modem", "sim", "gsm", "wifi", "cell", "data", "steps", "gps",
};

// Running one test also runs what it needs first.
const uint16_t TEST_NEEDS[TEST_COUNT] = {
  0,                                                       // power
  0,                                                       // imu
  0,                                                       // flash
  (1 << T_POWER),                                          // modem
  (1 << T_POWER) | (1 << T_MODEM),                         // sim
  (1 << T_POWER) | (1 << T_MODEM) | (1 << T_SIM),          // gsm
  (1 << T_POWER) | (1 << T_MODEM),                         // wifi
  (1 << T_POWER) | (1 << T_MODEM) | (1 << T_SIM) | (1 << T_GSM),  // cell
  (1 << T_POWER) | (1 << T_MODEM) | (1 << T_SIM) | (1 << T_GSM),  // data
  (1 << T_IMU),                                            // steps
  (1 << T_POWER),                                          // gps
};

enum class Outcome : uint8_t { None, Pass, Fail, Skip };
enum class At : uint8_t { Ok, Error, Timeout };

struct RunState {
  uint32_t number = 0;
  bool active = false;
  bool abortRequested = false;
  bool startRequested = false;  // QA GO while a test waits for the operator
  uint16_t selected = 0;
  Outcome outcome[TEST_COUNT] = {};
  uint32_t startedAt = 0;
  uint32_t ldoOnAt = 0;       // GPS power-on
  uint32_t pwrkeyAt = 0;      // modem power-on
  bool modemReady = false;
  bool registered = false;
  char imei[16] = "";
} run;

struct ServingCell {
  bool valid = false;
  uint16_t mcc = 0;
  uint16_t mnc = 0;
  uint16_t tac = 0;
  uint32_t cellId = 0;
  bool hasPci = false;
  uint16_t pci = 0;
  char band[41] = "";
  bool hasRsrp = false;
  int16_t rsrpTenthsDbm = 0;
  char duplex[4] = "";
};

// Types used in function signatures must be declared before the first function:
// the Arduino builder inserts its generated prototypes there.
struct BatteryReading {
  uint32_t mv = 0;       // battery voltage after the 1:2 divider
  uint16_t raw = 0;      // PB10, 12-bit, averaged
  uint32_t vddaMv = 0;   // MCU analog supply, from VREFINT
  bool factoryCal = false;
};

enum class ChargeState : uint8_t { Idle, Charging, Complete, Invalid };

char chipUid[25] = "";
volatile uint32_t stepInterrupts = 0;

enum class AccelChip : uint8_t { None, Lis2ds12, Lis2dh12 };
AccelChip accelChip = AccelChip::None;
uint8_t accelAddress = 0;
stepwhere::ShoePedometer pedometer;
uint16_t accelOverruns = 0;  // LIS2DH12 FIFO overruns during the step test

// ─── Console and @QA lines ────────────────────────────────────────────────────

/** Writes one `@QA {…}` line field by field. Strings are escaped; one line per message. */
class QaLine {
 public:
  explicit QaLine(const char *event) {
    SerialDBG.print("@QA {\"v\":1,\"e\":\"");
    SerialDBG.print(event);
    SerialDBG.print('"');
  }
  QaLine &str(const char *key, const char *value) {
    key_(key);
    if (!value) {
      SerialDBG.print("null");
      return *this;
    }
    SerialDBG.write('"');
    print_escaped(value);
    SerialDBG.write('"');
    return *this;
  }
  QaLine &num(const char *key, int32_t value) {
    key_(key);
    SerialDBG.print(value);
    return *this;
  }
  QaLine &unum(const char *key, uint32_t value) {
    key_(key);
    SerialDBG.print(value);
    return *this;
  }
  QaLine &dec(const char *key, double value, uint8_t digits) {
    key_(key);
    SerialDBG.print(value, digits);
    return *this;
  }
  QaLine &flag(const char *key, bool value) {
    key_(key);
    SerialDBG.print(value ? "true" : "false");
    return *this;
  }
  /** Fields after this go into "data". */
  QaLine &data() {
    SerialDBG.print(",\"data\":{");
    inData_ = true;
    first_ = true;
    return *this;
  }
  void end() {
    if (inData_) SerialDBG.print('}');
    SerialDBG.println('}');
  }

 private:
  static void print_escaped(const char *text) {
    for (const char *c = text; *c; c++) {
      if (*c == '"' || *c == '\\') {
        SerialDBG.write('\\');
        SerialDBG.write(*c);
      } else if ((uint8_t)*c < 0x20) {
        SerialDBG.write(' ');
      } else {
        SerialDBG.write(*c);
      }
    }
  }
  void key_(const char *key) {
    if (!inData_ || !first_) SerialDBG.write(',');
    first_ = false;
    SerialDBG.write('"');
    SerialDBG.print(key);
    SerialDBG.print("\":");
  }
  bool inData_ = false;
  bool first_ = true;
};

/** A message about the current run: carries the run number and chip UID. */
QaLine run_line(const char *event) {
  QaLine line(event);
  line.unum("run", run.number).str("uid", chipUid);
  return line;
}

void read_chip_uid() {
  snprintf(chipUid, sizeof(chipUid), "%08lX%08lX%08lX",
           (unsigned long)HAL_GetUIDw0(), (unsigned long)HAL_GetUIDw1(),
           (unsigned long)HAL_GetUIDw2());
}

void report_running(TestId id) {
  SerialDBG.print("[QA] ");
  SerialDBG.print(TEST_NAMES[id]);
  SerialDBG.println(" ...");
  run_line("test").str("id", TEST_NAMES[id]).str("status", "running").end();
}

void report_progress(TestId id, const char *text) {
  run_line("progress").str("id", TEST_NAMES[id]).str("text", text).end();
}

void report_prompt(TestId id, const char *text, uint32_t timeoutMs, bool waitsForStart = false) {
  SerialDBG.print("[QA] >>> ");
  SerialDBG.println(text);
  QaLine line = run_line("prompt");
  line.str("id", TEST_NAMES[id]).str("text", text).unum("timeoutMs", timeoutMs);
  if (waitsForStart) line.str("action", "start");
  line.end();
}

void print_result_human(TestId id, Outcome outcome, uint32_t ms, const char *error) {
  SerialDBG.print("[QA] ");
  SerialDBG.print(TEST_NAMES[id]);
  SerialDBG.print(outcome == Outcome::Pass ? " PASS" : outcome == Outcome::Fail ? " FAIL" : " SKIP");
  SerialDBG.print(" (");
  SerialDBG.print(ms);
  SerialDBG.print(" ms)");
  if (error) {
    SerialDBG.print(": ");
    SerialDBG.print(error);
  }
  SerialDBG.println();
}

/** Starts a result line; the caller adds data fields and calls end(). */
QaLine result_line(TestId id, Outcome outcome, uint32_t ms, const char *error = nullptr) {
  run.outcome[id] = outcome;
  print_result_human(id, outcome, ms, error);
  QaLine line = run_line("test");
  line.str("id", TEST_NAMES[id])
    .str("status", outcome == Outcome::Pass ? "pass" : outcome == Outcome::Fail ? "fail" : "skip")
    .unum("ms", ms);
  if (error) line.str("error", error);
  return line;
}

void skip(TestId id, const char *reason) {
  result_line(id, Outcome::Skip, 0, reason).end();
}

// ─── Background work during every wait ───────────────────────────────────────

void poll_console();

/** Feeds the GPS parser and the console. Call it from every wait loop. */
void service() {
  while (SerialGPS.available()) gps.encode(SerialGPS.read());
  poll_console();
}

void wait_ms(uint32_t durationMs) {
  const uint32_t startedAt = millis();
  while (millis() - startedAt < durationMs) {
    service();
    delay(1);
  }
}

// ─── Power ────────────────────────────────────────────────────────────────────

/** The G0's factory VREFINT reading, taken at VDDA = 3.0 V. 0 if it looks unprogrammed. */
uint16_t vrefint_factory_cal() {
  const uint16_t cal = QA_READ_VREFINT_CAL();
  return (cal > 1000 && cal < 2400) ? cal : 0;  // about 1650 on a real part
}

/**
 * Battery and VDDA, averaged over 16 readings. VDDA comes from the factory
 * VREFINT calibration when it is programmed, else from the nominal 1212 mV
 * the main firmware uses. Same 1:2 divider as the main firmware.
 */
BatteryReading read_battery() {
  BatteryReading r;
  uint32_t vrefSum = 0, batterySum = 0;
  for (uint8_t i = 0; i < 16; i++) {
    vrefSum += analogRead(AVREF);
    batterySum += analogRead(BATTERY_ADC);
  }
  const uint32_t vrefRaw = vrefSum / 16;
  r.raw = (uint16_t)(batterySum / 16);
  if (vrefRaw == 0) return r;
  const uint16_t cal = vrefint_factory_cal();
  r.factoryCal = cal != 0;
  r.vddaMv = r.factoryCal ? (VREFINT_CAL_VDDA_MV * cal) / vrefRaw : (VREF_CAL_MV * ADC_MAX) / vrefRaw;
  r.mv = (2UL * r.raw * r.vddaMv) / ADC_MAX;
  return r;
}

uint32_t battery_mv() {
  return read_battery().mv;
}

/** TP4056 CHRG / STDBY, open-drain and active low (as stepwhere.ino reads them). */
ChargeState read_charge_state(bool &chrgLow, bool &stdbyLow) {
  chrgLow = digitalRead(CHARGER_CHRG) == LOW;
  stdbyLow = digitalRead(CHARGER_STDBY) == LOW;
  if (chrgLow && !stdbyLow) return ChargeState::Charging;
  if (!chrgLow && stdbyLow) return ChargeState::Complete;
  if (!chrgLow && !stdbyLow) return ChargeState::Idle;
  return ChargeState::Invalid;
}

const char *charge_state_name(ChargeState state) {
  switch (state) {
    case ChargeState::Charging: return "charging";
    case ChargeState::Complete: return "charge complete";
    case ChargeState::Idle: return "not charging";
    default: return "invalid";
  }
}

/** Cuts the rail, then powers the GPS and modem the way stepwhere.ino does. Times both. */
void power_cycle_radios() {
  SerialDBG.println("[QA] Power-cycling the modem and GPS rail ...");
  digitalWrite(GSM_PWRKEY, HIGH);
  digitalWrite(LDO_EN, LOW);
  wait_ms(1500);

  digitalWrite(LDO_EN, HIGH);
  run.ldoOnAt = millis();
  wait_ms(600);
  SerialGSM.begin(GSM_BAUD);
  SerialGPS.begin(GPS_BAUD);
  wait_ms(600);

  digitalWrite(GSM_PWRKEY, HIGH);
  wait_ms(100);
  digitalWrite(GSM_PWRKEY, LOW);
  wait_ms(1200);
  digitalWrite(GSM_PWRKEY, HIGH);
  run.pwrkeyAt = millis();
  SerialDBG.println("[QA] Modem power key pulsed.");
}

// ─── Modem AT helper ──────────────────────────────────────────────────────────

bool starts_with(const char *text, const char *prefix) {
  return strncmp(text, prefix, strlen(prefix)) == 0;
}

/**
 * Sends one command and collects the reply lines (without the echo) into
 * `reply`, joined by '\n'. Raw traffic is logged as [AT] lines.
 */
At at(const char *command, uint32_t timeoutMs, char *reply = nullptr, size_t replyLength = 0,
      uint16_t *prefixCount = nullptr, const char *countPrefix = nullptr) {
  while (SerialGSM.available()) SerialGSM.read();  // stale URCs
  if (reply && replyLength) reply[0] = '\0';
  size_t used = 0;

  SerialDBG.print("[AT] >> ");
  SerialDBG.println(command);
  SerialGSM.print(command);
  SerialGSM.print("\r\n");

  char line[AT_LINE_CAPACITY];
  size_t lineLength = 0;
  const uint32_t startedAt = millis();

  while (millis() - startedAt < timeoutMs) {
    while (SerialGSM.available()) {
      const char c = (char)SerialGSM.read();
      if (c == '\r') continue;
      if (c != '\n') {
        if (lineLength + 1 < sizeof(line)) line[lineLength++] = c;
        continue;
      }
      line[lineLength] = '\0';
      lineLength = 0;
      if (line[0] == '\0' || strcmp(line, command) == 0) continue;

      SerialDBG.print("[AT] << ");
      SerialDBG.println(line);

      if (strcmp(line, "OK") == 0) return At::Ok;
      if (strcmp(line, "ERROR") == 0 || starts_with(line, "+CME ERROR")) return At::Error;
      if (prefixCount && countPrefix && starts_with(line, countPrefix) && *prefixCount < 65535) {
        (*prefixCount)++;
      }
      if (reply && replyLength) {
        const size_t length = strlen(line);
        if (used + length + 2 < replyLength) {
          if (used) reply[used++] = '\n';
          memcpy(reply + used, line, length);
          used += length;
          reply[used] = '\0';
        }
      }
    }
    service();
    delay(1);
  }

  SerialDBG.print("[AT] TIMEOUT ");
  SerialDBG.println(command);
  return At::Timeout;
}

/** The first run of digits of at least `minDigits` in `text`, copied into `out`. */
bool extract_digits(const char *text, size_t minDigits, char *out, size_t outLength) {
  for (const char *c = text; *c; c++) {
    if (*c < '0' || *c > '9') continue;
    size_t length = strspn(c, "0123456789");
    if (length >= minDigits && length < outLength) {
      memcpy(out, c, length);
      out[length] = '\0';
      return true;
    }
    c += length - 1;
  }
  return false;
}

// ─── NETDMSG parsing (from stepwhere.ino) ────────────────────────────────────


bool parse_unsigned_token(const String &token, uint32_t maximum, uint32_t &result) {
  String value = token;
  value.trim();
  if (value.length() == 0 || value.charAt(0) == '-') return false;
  int base = value.length() > 2 && value.charAt(0) == '0'
      && (value.charAt(1) == 'x' || value.charAt(1) == 'X') ? 16 : 10;
  errno = 0;
  char *end = nullptr;
  unsigned long parsed = strtoul(value.c_str(), &end, base);
  if (errno == ERANGE || end == value.c_str() || *end != '\0' || parsed > maximum) return false;
  result = (uint32_t)parsed;
  return true;
}

bool parse_signed_token(const String &token, int32_t minimum, int32_t maximum, int32_t &result) {
  String value = token;
  value.trim();
  if (value.length() == 0) return false;
  errno = 0;
  char *end = nullptr;
  long parsed = strtol(value.c_str(), &end, 10);
  if (errno == ERANGE || end == value.c_str() || *end != '\0' || parsed < minimum || parsed > maximum) {
    return false;
  }
  result = (int32_t)parsed;
  return true;
}

bool split_netdmsg_fields(const String &payload, String fields[], size_t expected) {
  bool quoted = false;
  size_t count = 0;
  String field;
  for (size_t i = 0; i < payload.length(); i++) {
    char c = payload.charAt(i);
    if (c == '"') {
      quoted = !quoted;
      continue;
    }
    if (c == ',' && !quoted) {
      if (count >= expected) return false;
      field.trim();
      fields[count++] = field;
      field = "";
      continue;
    }
    field += c;
  }
  if (quoted || count >= expected) return false;
  field.trim();
  fields[count++] = field;
  return count == expected;
}

/** `+NETDMSG: "460+00",0x1816,0x9B7A0C2,…` (15 fields), LTE only. */
bool parse_netdmsg(const char *reply, ServingCell &cell, const char *&error) {
  cell = ServingCell{};
  const char *start = strstr(reply, "+NETDMSG:");
  if (!start) {
    error = "no +NETDMSG line";
    return false;
  }
  start += strlen("+NETDMSG:");
  const char *end = strchr(start, '\n');
  String payload = end ? String(start).substring(0, end - start) : String(start);
  payload.trim();

  String fields[15];
  if (!split_netdmsg_fields(payload, fields, 15)) {
    error = "expected 15 fields";
    return false;
  }
  int plus = fields[0].indexOf('+');
  uint32_t mcc, mnc, tac, cellId, optional;
  if (plus <= 0 || !parse_unsigned_token(fields[0].substring(0, plus), 999, mcc)
      || !parse_unsigned_token(fields[0].substring(plus + 1), 999, mnc)) {
    error = "invalid MCC+MNC";
    return false;
  }
  if (fields[4].equalsIgnoreCase("FDD LTE")) memcpy(cell.duplex, "fdd", 4);
  else if (fields[4].equalsIgnoreCase("TDD LTE")) memcpy(cell.duplex, "tdd", 4);
  else {
    error = "not on LTE";
    return false;
  }
  if (!parse_unsigned_token(fields[1], 65535, tac) || !parse_unsigned_token(fields[2], 268435455UL, cellId)) {
    error = "invalid TAC or cell ID";
    return false;
  }
  cell.mcc = mcc;
  cell.mnc = mnc;
  cell.tac = tac;
  cell.cellId = cellId;
  if (parse_unsigned_token(fields[3], 503, optional)) {
    cell.hasPci = true;
    cell.pci = optional;
  }
  if (fields[5].length() > 0 && fields[5].length() <= 40) fields[5].toCharArray(cell.band, sizeof(cell.band));
  int32_t rsrp;
  if (parse_signed_token(fields[12], -2000, 1000, rsrp)) {
    cell.hasRsrp = true;
    cell.rsrpTenthsDbm = rsrp;
  }
  cell.valid = true;
  return true;
}

// ─── Accelerometer (LIS2DH12 or LIS2DS12) ────────────────────────────────────

bool accel_read_at(uint8_t address, uint8_t reg, uint8_t *out, uint8_t count) {
  qaI2c.beginTransmission(address);
  qaI2c.write(count > 1 ? (reg | 0x80) : reg);  // MSB set = auto-increment on both chips
  if (qaI2c.endTransmission(false) != 0) return false;
  if (qaI2c.requestFrom(address, count) != count) return false;
  for (uint8_t i = 0; i < count; i++) out[i] = qaI2c.read();
  return true;
}

bool imu_write(uint8_t reg, uint8_t value) {
  qaI2c.beginTransmission(accelAddress);
  qaI2c.write(reg);
  qaI2c.write(value);
  return qaI2c.endTransmission() == 0;
}

bool imu_read(uint8_t reg, uint8_t *out, uint8_t count) {
  return accel_read_at(accelAddress, reg, out, count);
}

/**
 * Finds the accelerometer the way stepwhere.ino does: SA0 is driven high, and
 * the alternate addresses cover boards wired the other way. Sets accelChip and
 * accelAddress. `whoAmIOut` gets the last ID read. Returns false if no address
 * answered at all (a part can answer and still read 0x00).
 */
bool accel_detect(uint8_t &whoAmIOut) {
  accelChip = AccelChip::None;
  accelAddress = 0;
  whoAmIOut = 0;
  bool anyAnswered = false;
  const uint8_t lis2dh12Addresses[] = {0x19, 0x18};
  const uint8_t lis2ds12Addresses[] = {0x1D, 0x1E};
  for (uint8_t attempt = 0; attempt < 5 && accelChip == AccelChip::None; attempt++) {
    if (attempt) wait_ms(20);
    for (uint8_t address : lis2dh12Addresses) {
      uint8_t id = 0;
      if (accelChip != AccelChip::None || !accel_read_at(address, ACCEL_REG_WHO_AM_I, &id, 1)) continue;
      anyAnswered = true;
      whoAmIOut = id;
      if (id == LIS2DH12_WHO_AM_I_VALUE) {
        accelChip = AccelChip::Lis2dh12;
        accelAddress = address;
      }
    }
    for (uint8_t address : lis2ds12Addresses) {
      uint8_t id = 0;
      if (accelChip != AccelChip::None || !accel_read_at(address, ACCEL_REG_WHO_AM_I, &id, 1)) continue;
      anyAnswered = true;
      whoAmIOut = id;
      if (id == LIS2DS12_WHO_AM_I_VALUE) {
        accelChip = AccelChip::Lis2ds12;
        accelAddress = address;
      }
    }
  }
  return anyAnswered;
}

const char *accel_chip_name() {
  switch (accelChip) {
    case AccelChip::Lis2dh12: return "LIS2DH12";
    case AccelChip::Lis2ds12: return "LIS2DS12";
    default: return nullptr;
  }
}

void on_step_interrupt() {
  stepInterrupts++;
}

/** LIS2DS12: same register setup as stepwhere.ino, so the step test exercises the shipping config. */
void lis2ds12_configure() {
  imu_write(0x20, 0x60);  // CTRL1: 400 Hz, ±2 g
  imu_write(0x3F, 0x01);  // FUNC_CTRL: step counter
  imu_write(0x21, 0x00);  // CTRL2
  imu_write(0x22, 0x38);  // CTRL3: tap on X, Y, Z
  imu_write(0x23, 0x08);  // CTRL4: double tap to INT1
  imu_write(0x24, 0x0C);  // CTRL5: step / significant motion to INT2
  imu_write(0x31, 0x0C);  // TAP_6D_THS
  imu_write(0x32, 0x7F);  // INT_DUR
  imu_write(0x33, 0x80);  // WAKE_UP_THS: single and double tap
  // Step pulses arrive on INT2. As in stepwhere.ino, only a LIS2DS12 board uses it.
  pinMode(ACCEL_INT2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ACCEL_INT2), on_step_interrupt, FALLING);
}

/** LIS2DH12: same configuration as stepwhere.ino (25 Hz, ±8 g, FIFO stream). */
bool lis2dh12_configure() {
  imu_write(LIS2DH12_CTRL_REG1, 0x00);  // power down while configuring
  imu_write(LIS2DH12_CTRL_REG2, 0x00);  // no high-pass: the pedometer needs gravity
  imu_write(LIS2DH12_CTRL_REG3, 0x00);  // FIFO is polled, no interrupts
  imu_write(LIS2DH12_CTRL_REG4, LIS2DH12_BDU_8G);
  imu_write(LIS2DH12_CTRL_REG5, LIS2DH12_FIFO_ENABLE);
  imu_write(LIS2DH12_CTRL_REG6, 0x00);
  imu_write(LIS2DH12_FIFO_CTRL, 0x00);  // bypass clears the FIFO
  imu_write(LIS2DH12_FIFO_CTRL, LIS2DH12_FIFO_STREAM);
  imu_write(LIS2DH12_CTRL_REG1, LIS2DH12_ODR_25HZ_XYZ);
  uint8_t ctrl1 = 0;
  return imu_read(LIS2DH12_CTRL_REG1, &ctrl1, 1) && ctrl1 == LIS2DH12_ODR_25HZ_XYZ;
}

/**
 * Reads every sample waiting in the LIS2DH12 FIFO, in mg, and hands each to
 * `onSample`. Returns the number read; counts overruns like stepwhere.ino.
 */
template <typename OnSample>
uint8_t lis2dh12_drain_fifo(OnSample onSample) {
  uint8_t fifoSrc = 0;
  if (!imu_read(LIS2DH12_FIFO_SRC, &fifoSrc, 1)) return 0;
  uint8_t samples = fifoSrc & 0x1F;
  if (fifoSrc & 0x40) {  // overrun: the FIFO is full and older samples were lost
    samples = 32;
    if (accelOverruns < UINT16_MAX) accelOverruns++;
  }
  uint8_t read = 0;
  for (uint8_t i = 0; i < samples; i++) {
    uint8_t raw[6];
    if (!imu_read(LIS2DH12_OUT_X_L, raw, sizeof(raw))) break;
    // Left-justified 10-bit output at ±8 g (16 mg/digit): the 16-bit word >> 2 is mg.
    const int16_t x = (int16_t)(raw[0] | (raw[1] << 8)) >> 2;
    const int16_t y = (int16_t)(raw[2] | (raw[3] << 8)) >> 2;
    const int16_t z = (int16_t)(raw[4] | (raw[5] << 8)) >> 2;
    onSample(x, y, z);
    read++;
  }
  return read;
}

// ─── The tests ───────────────────────────────────────────────────────────────

bool selected(TestId id) {
  return run.selected & (1 << id);
}

bool passed(TestId id) {
  return run.outcome[id] == Outcome::Pass;
}

bool aborted() {
  return run.abortRequested;
}

void test_power() {
  report_running(T_POWER);
  const BatteryReading b = read_battery();
  bool chrgLow = false, stdbyLow = false;
  const ChargeState charge = read_charge_state(chrgLow, stdbyLow);

  // A saturated or impossibly high reading is a broken divider or ADC input,
  // not a full battery: it would otherwise pass the minimum check.
  const char *error = nullptr;
  if (b.vddaMv == 0) error = "VREFINT read 0; the ADC is not working";
  else if (b.raw >= ADC_SATURATED_RAW) error = "Battery ADC saturated (PB10 divider open, or the input is too high)";
  else if (b.mv > BATTERY_MAX_MV) error = "Battery reads above 4.4 V (check the 1:2 divider on PB10)";
  else if (b.mv < BATTERY_MIN_MV) error = "Battery below the modem cut-off; charge it";
  else if (b.vddaMv < VDDA_MIN_MV || b.vddaMv > VDDA_MAX_MV) error = "MCU supply (VDDA) out of range; check the 3.3 V regulator";
  else if (charge == ChargeState::Invalid) error = "Charger CHRG (PB14) and STDBY (PB15) both low; check the charger IC";

  result_line(T_POWER, error ? Outcome::Fail : Outcome::Pass, 0, error)
    .data().unum("mv", b.mv).unum("minMv", BATTERY_MIN_MV).unum("maxMv", BATTERY_MAX_MV)
    .unum("raw", b.raw).unum("vddaMv", b.vddaMv).flag("factoryCal", b.factoryCal)
    .str("charger", charge_state_name(charge)).flag("chrgLow", chrgLow).flag("stdbyLow", stdbyLow).end();
}

void test_imu() {
  report_running(T_IMU);
  const uint32_t startedAt = millis();
  uint8_t whoAmI = 0;
  const bool anyAnswered = accel_detect(whoAmI);
  char whoHex[5];
  snprintf(whoHex, sizeof(whoHex), "0x%02X", whoAmI);

  if (accelChip == AccelChip::None) {
    if (!anyAnswered) {
      result_line(T_IMU, Outcome::Fail, millis() - startedAt,
                  "No answer at I2C 0x19/0x18/0x1D/0x1E (check SDA PA12, SCL PA11, SA0 PA1, sensor supply)")
        .data().str("addresses", "0x19,0x18,0x1D,0x1E").end();
    } else {
      result_line(T_IMU, Outcome::Fail, millis() - startedAt,
                  "WHO_AM_I is not 0x33 (LIS2DH12) or 0x43 (LIS2DS12); wrong or damaged sensor")
        .data().str("whoAmI", whoHex).end();
    }
    return;
  }

  char addressHex[5];
  snprintf(addressHex, sizeof(addressHex), "0x%02X", accelAddress);

  // Average a few samples; at rest the vector length is about 1 g.
  int32_t sumMg = 0;
  uint8_t samples = 0;
  if (accelChip == AccelChip::Lis2dh12) {
    if (!lis2dh12_configure()) {
      result_line(T_IMU, Outcome::Fail, millis() - startedAt, "LIS2DH12 found but CTRL_REG1 did not take the configuration")
        .data().str("chip", "LIS2DH12").str("address", addressHex).str("whoAmI", whoHex).end();
      return;
    }
    // 25 Hz: about 8 samples in 340 ms. Skip the first ones after power-up.
    wait_ms(120);
    lis2dh12_drain_fifo([](int16_t, int16_t, int16_t) {});
    wait_ms(340);
    lis2dh12_drain_fifo([&](int16_t x, int16_t y, int16_t z) {
      if (samples >= 16) return;
      sumMg += (int32_t)stepwhere::isqrt32((uint32_t)((int32_t)x * x) + (uint32_t)((int32_t)y * y)
                                           + (uint32_t)((int32_t)z * z));
      samples++;
    });
  } else {
    lis2ds12_configure();
    wait_ms(100);
    for (uint8_t i = 0; i < 8; i++) {
      uint8_t raw[6];
      if (imu_read(0x28, raw, 6)) {
        const int16_t x = (int16_t)(raw[0] | (raw[1] << 8));
        const int16_t y = (int16_t)(raw[2] | (raw[3] << 8));
        const int16_t z = (int16_t)(raw[4] | (raw[5] << 8));
        // ±2 g full scale: 0.061 mg per LSB of the 16-bit value.
        const float mg = sqrtf((float)x * x + (float)y * y + (float)z * z) * 0.061f;
        sumMg += (int32_t)mg;
        samples++;
      }
      wait_ms(20);
    }
  }
  const int32_t mg = samples ? sumMg / samples : 0;
  const bool ok = samples > 0 && mg >= ACCEL_MIN_MG && mg <= ACCEL_MAX_MG;
  result_line(T_IMU, ok ? Outcome::Pass : Outcome::Fail, millis() - startedAt,
              ok ? nullptr : samples == 0 ? "No samples read from the accelerometer"
                                          : "Acceleration is not about 1 g; keep the board still and retest")
    .data().str("chip", accel_chip_name()).str("address", addressHex).str("whoAmI", whoHex)
    .num("restMg", mg).unum("samples", samples).num("minMg", ACCEL_MIN_MG).num("maxMg", ACCEL_MAX_MG).end();
}

/** One SPI command to the flash: sends `command`, then clocks out `count` bytes into `out`. */
void flash_command(uint8_t command, uint8_t *out, uint8_t count) {
  flashSpi.beginTransaction(SPISettings(W25Q_SPI_HZ, MSBFIRST, SPI_MODE0));
  digitalWrite(W25Q_CS, LOW);
  flashSpi.transfer(command);
  for (uint8_t i = 0; i < count; i++) out[i] = flashSpi.transfer(0x00);
  digitalWrite(W25Q_CS, HIGH);
  flashSpi.endTransaction();
}

/** A command with a 24-bit address, then `count` bytes clocked in (`in`) or out (`out`). */
void flash_command_addr(uint8_t command, uint32_t address, const uint8_t *out, uint8_t *in, uint16_t count) {
  flashSpi.beginTransaction(SPISettings(W25Q_SPI_HZ, MSBFIRST, SPI_MODE0));
  digitalWrite(W25Q_CS, LOW);
  flashSpi.transfer(command);
  flashSpi.transfer((uint8_t)(address >> 16));
  flashSpi.transfer((uint8_t)(address >> 8));
  flashSpi.transfer((uint8_t)address);
  for (uint16_t i = 0; i < count; i++) {
    const uint8_t got = flashSpi.transfer(out ? out[i] : 0x00);
    if (in) in[i] = got;
  }
  digitalWrite(W25Q_CS, HIGH);
  flashSpi.endTransaction();
}

uint8_t flash_status() {
  uint8_t sr1 = 0xFF;
  flash_command(W25Q_CMD_READ_SR1, &sr1, 1);
  return sr1;
}

/** Waits for BUSY to clear. Returns false on timeout. */
bool flash_wait_ready(uint32_t timeoutMs) {
  const uint32_t startedAt = millis();
  while (flash_status() & W25Q_SR1_BUSY) {
    if (millis() - startedAt > timeoutMs) return false;
    delay(1);
  }
  return true;
}

/** True if `count` bytes at `address` equal `expected` (or are all 0xFF when it is null). */
bool flash_verify(uint32_t address, const uint8_t *expected, uint16_t count, uint16_t &firstBad) {
  uint8_t buffer[W25Q_PAGE_SIZE];
  flash_command_addr(W25Q_CMD_READ, address, nullptr, buffer, count);
  for (uint16_t i = 0; i < count; i++) {
    if (buffer[i] != (expected ? expected[i] : 0xFF)) {
      firstBad = i;
      return false;
    }
  }
  return true;
}

bool flash_erase_test_sector(uint32_t &eraseMs) {
  flash_command(W25Q_CMD_WRITE_ENABLE, nullptr, 0);
  const uint32_t startedAt = millis();
  flash_command_addr(W25Q_CMD_SECTOR_ERASE, W25Q_TEST_ADDR, nullptr, nullptr, 0);
  const bool ok = flash_wait_ready(W25Q_ERASE_TIMEOUT_MS);
  eraseMs = millis() - startedAt;
  return ok;
}

/**
 * Erases, writes and reads back one page of the sector reserved for tests
 * (EXT_SELFTEST_ADDR in the OTA layout: outside every OTA slot and the motion
 * log), then erases it again. Returns null on success or the reason it failed.
 */
const char *flash_write_test(uint32_t &eraseMs, uint32_t &programMs) {
  uint16_t bad = 0;
  if (!flash_erase_test_sector(eraseMs)) return "Erase timed out (BUSY never cleared)";
  if (!flash_verify(W25Q_TEST_ADDR, nullptr, W25Q_PAGE_SIZE, bad)) {
    return "Erase did not take (write-protected, /WP PC7 low, or SR1 protect bits set)";
  }

  uint8_t pattern[W25Q_PAGE_SIZE];
  for (uint16_t i = 0; i < W25Q_PAGE_SIZE; i++) pattern[i] = (uint8_t)(i ^ 0xA5);
  flash_command(W25Q_CMD_WRITE_ENABLE, nullptr, 0);
  const uint32_t startedAt = millis();
  flash_command_addr(W25Q_CMD_PAGE_PROGRAM, W25Q_TEST_ADDR, pattern, nullptr, W25Q_PAGE_SIZE);
  const bool programmed = flash_wait_ready(W25Q_PROGRAM_TIMEOUT_MS);
  programMs = millis() - startedAt;
  if (!programmed) return "Page program timed out (BUSY never cleared)";
  if (!flash_verify(W25Q_TEST_ADDR, pattern, W25Q_PAGE_SIZE, bad)) {
    uint16_t unused = 0;
    const bool stillErased = flash_verify(W25Q_TEST_ADDR, nullptr, W25Q_PAGE_SIZE, unused);
    uint32_t cleanupMs = 0;
    flash_erase_test_sector(cleanupMs);  // best effort: leave the test sector clean
    return stillErased ? "Nothing was written (write-protected: /WP PC7 low, or SR1 protect bits set)"
                       : "Read-back differs from what was written (MOSI PA7, or a weak cell)";
  }

  uint32_t cleanupMs = 0;
  if (!flash_erase_test_sector(cleanupMs) || !flash_verify(W25Q_TEST_ADDR, nullptr, W25Q_PAGE_SIZE, bad)) {
    return "Second erase failed";
  }
  return nullptr;
}

/**
 * Reads the W25Q128's JEDEC ID, then writes and reads back the reserved test
 * sector. Nothing outside that one 4 KB sector is ever erased or written.
 */
void test_flash() {
  report_running(T_FLASH);
  const uint32_t startedAt = millis();
  pinMode(W25Q_CS, OUTPUT);
  digitalWrite(W25Q_CS, HIGH);
  pinMode(W25Q_WP, OUTPUT);
  digitalWrite(W25Q_WP, HIGH);
  pinMode(W25Q_HOLD, OUTPUT);
  digitalWrite(W25Q_HOLD, HIGH);
  flashSpi.begin();
  delay(1);

  // The chip may have been left in deep power-down; it ignores 9Fh until released.
  flash_command(W25Q_CMD_RELEASE_PD, nullptr, 0);
  delayMicroseconds(50);  // tRES1 is 3 µs
  uint8_t id[3] = {0, 0, 0};
  flash_command(W25Q_CMD_JEDEC_ID, id, 3);

  const uint32_t jedec = ((uint32_t)id[0] << 16) | ((uint32_t)id[1] << 8) | id[2];
  char idHex[7];
  snprintf(idHex, sizeof(idHex), "%02X%02X%02X", id[0], id[1], id[2]);
  char expectedHex[7];
  snprintf(expectedHex, sizeof(expectedHex), "%06lX", (unsigned long)W25Q_JEDEC_EXPECTED);

  const char *error = nullptr;
  if (jedec == W25Q_JEDEC_EXPECTED) {
    // pass
  } else if (jedec == 0xFFFFFF) error = "No answer from the memory chip (MISO PA6 open, /CS PC6, /HOLD PB12 or its supply)";
  else if (jedec == 0x000000) error = "Memory chip ID reads 00 00 00 (MISO PA6 stuck low, or the chip has no supply)";
  else if (id[0] == 0xEF) error = "Winbond chip, but its ID is not EF 40 18 (a different part than the BOM's W25Q128)";
  else error = "Unexpected memory chip ID (wrong part, or bad solder on IC8)";

  // Production writes this chip for OTA updates, so an ID alone is not enough.
  uint32_t eraseMs = 0, programMs = 0;
  const bool idOk = error == nullptr;
  if (idOk) error = flash_write_test(eraseMs, programMs);
  const uint8_t sr1 = flash_status();
  flashSpi.end();

  char sr1Hex[5];
  snprintf(sr1Hex, sizeof(sr1Hex), "0x%02X", sr1);
  char testAddrHex[7];
  snprintf(testAddrHex, sizeof(testAddrHex), "%06lX", (unsigned long)W25Q_TEST_ADDR);

  QaLine line = result_line(T_FLASH, error ? Outcome::Fail : Outcome::Pass, millis() - startedAt, error);
  line.data().str("jedecId", idHex).str("expected", expectedHex);
  if (idOk) {
    line.str("writeTest", error ? "fail" : "ok").str("testAddr", testAddrHex).unum("eraseMs", eraseMs)
      .unum("programMs", programMs).str("sr1", sr1Hex);
  }
  line.end();
}

void test_modem() {
  report_running(T_MODEM);
  wait_ms(3000);  // N706 boot time after the power key
  for (uint8_t attempt = 1; attempt <= 10 && !aborted(); attempt++) {
    if (at("AT", 1000) == At::Ok) {
      run.modemReady = true;
      break;
    }
    wait_ms(500);
  }
  const uint32_t readyMs = millis() - run.pwrkeyAt;
  if (!run.modemReady) {
    result_line(T_MODEM, Outcome::Fail, readyMs, "Modem does not answer AT (check level shifter IC1 VCCB 3.3 V, LDO PA10, PWRKEY PB13, UART PA2/PA3)").end();
    return;
  }
  at("ATE0", AT_TIMEOUT_MS);

  char reply[AT_REPLY_CAPACITY];
  char revision[48] = "";
  if (at("AT+GMR", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok) {
    const char *first = reply;
    size_t length = strcspn(first, "\n");
    if (length >= sizeof(revision)) length = sizeof(revision) - 1;
    memcpy(revision, first, length);
    revision[length] = '\0';
  }

  run.imei[0] = '\0';
  if (at("AT+CGSN", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok) {
    extract_digits(reply, 15, run.imei, sizeof(run.imei));
  }
  if (strlen(run.imei) == 15) {
    // Same line as stepwhere.ino; the Bench links the IMEI from it too.
    SerialDBG.print("[IMEI] ");
    SerialDBG.println(run.imei);
  }

  const bool ok = strlen(run.imei) == 15;
  result_line(T_MODEM, ok ? Outcome::Pass : Outcome::Fail, readyMs, ok ? nullptr : "Modem answered but returned no IMEI")
    .data().str("revision", revision).str("imei", run.imei[0] ? run.imei : nullptr).end();
}

void test_sim() {
  report_running(T_SIM);
  const uint32_t startedAt = millis();
  char reply[AT_REPLY_CAPACITY];
  bool ready = false;
  // The SIM can take a few seconds to initialise after power-on.
  while (millis() - startedAt < 15000 && !aborted()) {
    if (at("AT+CPIN?", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok && strstr(reply, "READY")) {
      ready = true;
      break;
    }
    wait_ms(1000);
  }
  char iccid[24] = "";
  if (ready && at("AT+CCID", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok) {
    extract_digits(reply, 18, iccid, sizeof(iccid));
  }
  result_line(T_SIM, ready ? Outcome::Pass : Outcome::Fail, millis() - startedAt,
              ready ? nullptr : "SIM not ready (check it is inserted and not PIN-locked)")
    .data().str("iccid", iccid[0] ? iccid : nullptr).str("imei", run.imei[0] ? run.imei : nullptr).end();
}

/** `+CEREG: <n>,<stat>`: 1 home, 5 roaming. */
bool parse_registered(const char *reply) {
  const char *field = strstr(reply, "+CEREG:");
  if (!field) return false;
  const char *comma = strchr(field, ',');
  if (!comma) return false;
  const int stat = atoi(comma + 1);
  return stat == 1 || stat == 5;
}

void test_gsm() {
  report_running(T_GSM);
  char reply[AT_REPLY_CAPACITY];
  uint32_t lastProgress = 0;
  while (millis() - run.pwrkeyAt < GSM_REGISTER_GIVE_UP_MS && !aborted()) {
    if (at("AT+CEREG?", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok && parse_registered(reply)) {
      run.registered = true;
      break;
    }
    if (millis() - lastProgress >= 3000) {
      lastProgress = millis();
      char text[48];
      snprintf(text, sizeof(text), "Searching for network · %lu s",
               (unsigned long)((millis() - run.pwrkeyAt) / 1000));
      report_progress(T_GSM, text);
    }
    wait_ms(500);
  }
  const uint32_t registerMs = millis() - run.pwrkeyAt;

  int32_t csq = -1;
  if (run.registered && at("AT+CSQ", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok) {
    const char *field = strstr(reply, "+CSQ:");
    if (field) csq = atoi(field + 5);
  }

  if (!run.registered) {
    result_line(T_GSM, Outcome::Fail, registerMs, "Not registered on the network within the limit (antenna, SIM or coverage)")
      .data().unum("limitMs", GSM_REGISTER_LIMIT_MS).end();
    return;
  }
  const bool inTime = registerMs <= GSM_REGISTER_LIMIT_MS;
  const bool signalKnown = csq >= 0 && csq != 99;
  const bool signalOk = signalKnown && csq >= GSM_CSQ_MIN;
  const char *error = nullptr;
  if (!inTime) error = "Registered, but slower than the limit";
  else if (!signalKnown) error = "Registered, but signal strength unknown (CSQ 99); check the antenna wire";
  else if (!signalOk) error = "Signal too weak (CSQ below 10); check the antenna wire and its solder joint";
  QaLine line = result_line(T_GSM, error ? Outcome::Fail : Outcome::Pass, registerMs, error);
  line.data().unum("registerMs", registerMs).unum("limitMs", GSM_REGISTER_LIMIT_MS).num("csqMin", GSM_CSQ_MIN);
  if (signalKnown) line.num("csq", csq).num("rssiDbm", -113 + 2 * csq);
  line.end();
}

void test_wifi() {
  report_running(T_WIFI);
  const uint32_t startedAt = millis();
  char reply[AT_REPLY_CAPACITY];
  uint16_t aps = 0;
  const At result = at("AT+WIFIAPSCAN", WIFI_SCAN_TIMEOUT_MS, reply, sizeof(reply), &aps, "+WIFIAPSCAN:");
  const uint32_t ms = millis() - startedAt;
  char sample[80] = "";
  const char *first = strstr(reply, "+WIFIAPSCAN:");
  if (first) {
    size_t length = strcspn(first, "\n");
    if (length >= sizeof(sample)) length = sizeof(sample) - 1;
    memcpy(sample, first, length);
    sample[length] = '\0';
  }
  if (result != At::Ok) {
    result_line(T_WIFI, Outcome::Fail, ms, result == At::Timeout ? "Wi-Fi scan timed out" : "Wi-Fi scan returned an error")
      .data().unum("aps", aps).end();
    return;
  }
  const bool ok = aps >= WIFI_MIN_APS;
  result_line(T_WIFI, ok ? Outcome::Pass : Outcome::Fail, ms, ok ? nullptr : "No access points seen (antenna, or no Wi-Fi nearby)")
    .data().unum("aps", aps).unum("minAps", WIFI_MIN_APS).str("sample", sample[0] ? sample : nullptr).end();
}

void test_cell() {
  report_running(T_CELL);
  const uint32_t startedAt = millis();
  char reply[AT_REPLY_CAPACITY];
  if (at("AT+NETDMSG", AT_TIMEOUT_MS, reply, sizeof(reply)) != At::Ok) {
    result_line(T_CELL, Outcome::Fail, millis() - startedAt, "AT+NETDMSG failed").end();
    return;
  }
  ServingCell cell;
  const char *error = nullptr;
  if (!parse_netdmsg(reply, cell, error)) {
    result_line(T_CELL, Outcome::Fail, millis() - startedAt, error).end();
    return;
  }
  QaLine line = result_line(T_CELL, Outcome::Pass, millis() - startedAt);
  line.data().unum("mcc", cell.mcc).unum("mnc", cell.mnc).unum("tac", cell.tac).unum("cellId", cell.cellId)
    .str("duplex", cell.duplex).str("band", cell.band[0] ? cell.band : nullptr);
  if (cell.hasPci) line.unum("pci", cell.pci);
  if (cell.hasRsrp) line.dec("rsrpDbm", cell.rsrpTenthsDbm / 10.0, 1);
  line.end();
}

/** `+XIIC:    1,10.107.216.162` */
bool parse_xiic_ip(const char *reply, char *ip, size_t ipLength) {
  const char *field = strstr(reply, "+XIIC:");
  if (!field) return false;
  field += strlen("+XIIC:");
  while (*field == ' ') field++;
  if (*field != '1') return false;
  const char *comma = strchr(field, ',');
  if (!comma) return false;
  const char *value = comma + 1;
  while (*value == ' ') value++;
  size_t length = strcspn(value, " \n");
  if (length == 0 || length >= ipLength) return false;
  memcpy(ip, value, length);
  ip[length] = '\0';
  return strcmp(ip, "0.0.0.0") != 0;
}

void test_data() {
  report_running(T_DATA);
  char reply[AT_REPLY_CAPACITY];
  char ip[40] = "";
  at("AT+CGDCONT=1,\"IP\",\"" QA_APN "\"", AT_TIMEOUT_MS);
  at("AT+XIIC=0", AT_TIMEOUT_MS);
  at("AT+XIIC=1", XIIC_TIMEOUT_MS);
  while (millis() - run.pwrkeyAt < DATA_LIMIT_MS && !aborted()) {
    if (at("AT+XIIC?", AT_TIMEOUT_MS, reply, sizeof(reply)) == At::Ok && parse_xiic_ip(reply, ip, sizeof(ip))) break;
    ip[0] = '\0';
    wait_ms(1000);
  }
  const uint32_t ms = millis() - run.pwrkeyAt;
  const bool ok = ip[0] != '\0';
  result_line(T_DATA, ok ? Outcome::Pass : Outcome::Fail, ms, ok ? nullptr : "No data IP (APN \"" QA_APN "\", SIM data plan, coverage)")
    .data().str("ip", ok ? ip : nullptr).unum("limitMs", DATA_LIMIT_MS).str("apn", QA_APN).end();
}

// Step counting for the step test: INT2 pulses on a LIS2DS12, the shoe
// pedometer on the LIS2DH12 FIFO stream (as stepwhere.ino does).
uint32_t pedometerSteps = 0;
uint32_t accelLastPoll = 0;

void steps_reset() {
  noInterrupts();
  stepInterrupts = 0;
  interrupts();
  if (accelChip == AccelChip::Lis2dh12) {
    lis2dh12_drain_fifo([](int16_t, int16_t, int16_t) {});  // drop samples from before the window
    pedometer.reset();
    pedometerSteps = 0;
    accelOverruns = 0;
    accelLastPoll = millis();
  }
}

/** Call from the step-test wait loop; feeds the pedometer every ACCEL_POLL_INTERVAL_MS. */
void steps_service() {
  if (accelChip != AccelChip::Lis2dh12 || millis() - accelLastPoll < ACCEL_POLL_INTERVAL_MS) return;
  accelLastPoll = millis();
  lis2dh12_drain_fifo([](int16_t x, int16_t y, int16_t z) { pedometerSteps += pedometer.update(x, y, z); });
}

uint32_t steps_now() {
  if (accelChip == AccelChip::Lis2dh12) return pedometerSteps;
  noInterrupts();
  const uint32_t count = stepInterrupts;
  interrupts();
  return count;
}

void test_steps() {
  report_running(T_STEPS);
  const bool softwarePedometer = accelChip == AccelChip::Lis2dh12;
  steps_reset();
  // LIS2DS12 only: its hardware counter is read as a cross-check.
  uint8_t counter[2] = {0, 0};
  const bool counterReadable = !softwarePedometer && imu_read(0x3B, counter, 2);
  const uint16_t counterStart = counter[0] | (counter[1] << 8);

  // Wait for the operator, so a board isn't failed just because nobody was at its slot.
  run.startRequested = false;
  report_prompt(T_STEPS, "Pick up the board, then press Start (or type QA GO)", STEP_START_LIMIT_MS, true);
  const uint32_t waitStartedAt = millis();
  while (!run.startRequested && millis() - waitStartedAt < STEP_START_LIMIT_MS && !aborted()) wait_ms(50);
  if (aborted()) {
    result_line(T_STEPS, Outcome::Skip, millis() - waitStartedAt, "Aborted").end();
    return;
  }
  if (!run.startRequested) {
    result_line(T_STEPS, Outcome::Skip, millis() - waitStartedAt, "Nobody pressed Start within 10 min. Type QA RUN steps to try again")
      .end();
    return;
  }
  run.startRequested = false;
  steps_reset();

  char text[128];
  if (softwarePedometer) {
    // The shoe pedometer counts one stride (two steps) per swing, and needs the
    // board to rest briefly between swings, as a foot does in stance.
    // One swing is one stride, two steps; round up so an odd target is still reached.
    snprintf(text, sizeof(text),
             "Walk with the board on a shoe, or swing it heel-to-toe at least %u times, pausing still between swings",
             (unsigned)((STEP_TARGET + 1) / 2));
  } else {
    snprintf(text, sizeof(text), "Walk with the board, or swing it like a step, %u times", STEP_TARGET * 2);
  }
  report_prompt(T_STEPS, text, STEP_WINDOW_MS);

  const uint32_t startedAt = millis();
  uint32_t lastProgress = 0;
  uint32_t lastCount = 0;
  uint32_t lastStrides = 0;
  while (millis() - startedAt < STEP_WINDOW_MS && steps_now() < STEP_TARGET && !aborted()) {
    steps_service();
    const uint32_t count = steps_now();
    // The pedometer commits nothing until its 4th stride, so show strides too:
    // the operator sees each swing register before the step count jumps.
    const uint32_t strides = softwarePedometer ? pedometer.stats().strides : 0;
    if (count != lastCount || strides != lastStrides || millis() - lastProgress >= 5000) {
      lastCount = count;
      lastStrides = strides;
      lastProgress = millis();
      const unsigned long secondsLeft = (unsigned long)((STEP_WINDOW_MS - (millis() - startedAt)) / 1000);
      if (softwarePedometer) {
        snprintf(text, sizeof(text), "%lu/%u steps · %lu swings seen · %lu s left", (unsigned long)lastCount,
                 STEP_TARGET, (unsigned long)strides, secondsLeft);
      } else {
        snprintf(text, sizeof(text), "%lu/%u steps · %lu s left", (unsigned long)lastCount, STEP_TARGET, secondsLeft);
      }
      report_progress(T_STEPS, text);
    }
    wait_ms(50);
  }
  steps_service();
  const uint32_t steps = steps_now();
  const bool ok = steps >= STEP_TARGET;

  if (softwarePedometer) {
    const stepwhere::PedometerStats &stats = pedometer.stats();
    result_line(T_STEPS, ok ? Outcome::Pass : Outcome::Fail, millis() - startedAt,
                ok ? nullptr : "Too few steps from the shoe pedometer (swing heel-to-toe with pauses, or walk it on a shoe)")
      .data().str("chip", "LIS2DH12").unum("steps", steps).unum("target", STEP_TARGET)
      .unum("bursts", stats.bursts).unum("strides", stats.strides).unum("tooLong", stats.too_long)
      .unum("tooWeak", stats.too_weak).unum("tooShort", stats.too_short).unum("tooClose", stats.too_close)
      .unum("streakBreaks", stats.streak_breaks).unum("fifoOverruns", accelOverruns).end();
    return;
  }

  uint16_t counterDelta = 0;
  if (counterReadable && imu_read(0x3B, counter, 2)) {
    counterDelta = (uint16_t)((counter[0] | (counter[1] << 8)) - counterStart);
  }
  result_line(T_STEPS, ok ? Outcome::Pass : Outcome::Fail, millis() - startedAt,
              ok ? nullptr : "Too few step interrupts (INT2 PB4, or walk more steadily)")
    .data().str("chip", "LIS2DS12").unum("steps", steps).unum("target", STEP_TARGET)
    .unum("counterDelta", counterDelta).end();
}

/** Satellites in view, summed over every constellation's GSV "total in view" field. */
uint32_t gps_satellites_in_view() {
  TinyGPSCustom *const views[] = {&gsvGps, &gsvGlonass, &gsvGalileo, &gsvBeidou, &gsvBeidouGb};
  uint32_t total = 0;
  for (TinyGPSCustom *view : views) {
    if (view->isValid()) total += (uint32_t)atoi(view->value());
  }
  return total;
}

/**
 * GPS (QA spec v2, as approved): the module must talk, i.e. send NMEA with
 * valid checksums. A fix is information: the bench is often indoors, so a
 * missing fix never fails a board. Satellites in view are reported so a dead
 * antenna still shows up. Location is checked again in the functional tests.
 */
void test_gps() {
  report_running(T_GPS);
  const uint32_t nmeaDeadline = run.ldoOnAt + GPS_NMEA_LIMIT_MS;
  while ((int32_t)(millis() - nmeaDeadline) < 0 && gps.passedChecksum() == 0) wait_ms(50);
  if (gps.passedChecksum() == 0) {
    const char *error = gps.charsProcessed() == 0
        ? "No NMEA from the GPS (check its power and UART PB8/PB9)"
        : "GPS sends bytes but no valid NMEA (wrong baud rate, or noise on PB9)";
    result_line(T_GPS, Outcome::Fail, millis() - run.ldoOnAt, error)
      .data().unum("limitMs", GPS_NMEA_LIMIT_MS).unum("nmeaChars", gps.charsProcessed())
      .unum("badChecksums", gps.failedChecksum()).end();
    return;
  }

  // Keep looking for a fix for a while; it is reported but does not decide the result.
  report_prompt(T_GPS, "GPS is working. Near a window it may also get a fix (shown as information)", GPS_FIX_INFO_LIMIT_MS);
  auto hasFix = []() {
    const uint32_t satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
    return gps.location.isValid() && gps.location.age() < 2000 && satellites >= GPS_MIN_SATELLITES;
  };
  uint32_t lastProgress = 0;
  // The step test before this one can take minutes, so the window may already be
  // over: always look once, so a board that already has a fix reports it.
  bool fixed = hasFix();
  const bool fixedBeforeWindow = fixed;
  while (!fixed && millis() - run.ldoOnAt < GPS_FIX_INFO_LIMIT_MS && !aborted()) {
    const uint32_t satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
    if (hasFix()) {
      fixed = true;
      break;
    }
    if (millis() - lastProgress >= 5000) {
      lastProgress = millis();
      char text[80];
      const uint32_t elapsed = (millis() - run.ldoOnAt) / 1000;
      snprintf(text, sizeof(text), "Looking for a fix · %lu in view · %lu used · %lu:%02lu",
               (unsigned long)gps_satellites_in_view(), (unsigned long)satellites,
               (unsigned long)(elapsed / 60), (unsigned long)(elapsed % 60));
      report_progress(T_GPS, text);
    }
    wait_ms(100);
  }
  const uint32_t ms = millis() - run.ldoOnAt;
  if (aborted() && !fixed) {
    result_line(T_GPS, Outcome::Skip, ms, "Aborted").end();
    return;
  }
  QaLine line = result_line(T_GPS, Outcome::Pass, ms);
  line.data().flag("fix", fixed).unum("inView", gps_satellites_in_view())
    .unum("satellites", gps.satellites.isValid() ? gps.satellites.value() : 0)
    .unum("fixInfoLimitMs", GPS_FIX_INFO_LIMIT_MS).unum("nmeaOk", gps.passedChecksum())
    .unum("badChecksums", gps.failedChecksum());
  if (fixed) {
    // Time to first fix only when it was measured here; a fix found at the first look
    // happened earlier, during the step test.
    if (!fixedBeforeWindow) line.unum("fixMs", ms);
    if (gps.hdop.isValid()) line.dec("hdop", gps.hdop.hdop(), 1);
    line.dec("lat", gps.location.lat(), 5).dec("lng", gps.location.lng(), 5);
  }
  line.end();
}

// ─── Run ──────────────────────────────────────────────────────────────────────

uint16_t with_needs(uint16_t tests) {
  uint16_t all = tests;
  for (uint8_t i = 0; i < TEST_COUNT; i++) {
    if (tests & (1 << i)) all |= TEST_NEEDS[i];
  }
  return all;
}

void run_tests(uint16_t requested) {
  run.number++;
  run.active = true;
  run.abortRequested = false;
  run.selected = with_needs(requested);
  run.startedAt = millis();
  run.modemReady = false;
  run.registered = false;
  run.imei[0] = '\0';
  for (uint8_t i = 0; i < TEST_COUNT; i++) run.outcome[i] = Outcome::None;

  SerialDBG.print("[QA] Run ");
  SerialDBG.print(run.number);
  SerialDBG.println(" starting.");
  {
    QaLine line = run_line("run");
    line.str("fw", QA_FW_VERSION);
    SerialDBG.print(",\"tests\":[");
    bool first = true;
    for (uint8_t i = 0; i < TEST_COUNT; i++) {
      if (!selected((TestId)i)) continue;
      if (!first) SerialDBG.write(',');
      first = false;
      SerialDBG.write('"');
      SerialDBG.print(TEST_NAMES[i]);
      SerialDBG.write('"');
    }
    SerialDBG.print(']');
    line.end();
  }

  const bool radios = selected(T_MODEM) || selected(T_GPS);
  if (selected(T_POWER)) test_power();
  if (selected(T_IMU)) test_imu();
  if (selected(T_FLASH)) test_flash();

  const bool powerOk = !selected(T_POWER) || passed(T_POWER);
  if (radios && powerOk && !aborted()) power_cycle_radios();

  // Each test runs only when what it needs passed; otherwise it is skipped with the reason.
  if (selected(T_MODEM)) {
    if (aborted()) skip(T_MODEM, "Aborted");
    else if (!powerOk) skip(T_MODEM, "Battery too low");
    else test_modem();
  }
  if (selected(T_SIM)) {
    if (aborted()) skip(T_SIM, "Aborted");
    else if (!passed(T_MODEM)) skip(T_SIM, "Modem not ready");
    else test_sim();
  }
  if (selected(T_GSM)) {
    if (aborted()) skip(T_GSM, "Aborted");
    else if (!passed(T_SIM)) skip(T_GSM, "SIM not ready");
    else test_gsm();
  }
  if (selected(T_WIFI)) {
    if (aborted()) skip(T_WIFI, "Aborted");
    else if (!passed(T_MODEM)) skip(T_WIFI, "Modem not ready");
    else test_wifi();
  }
  if (selected(T_CELL)) {
    if (aborted()) skip(T_CELL, "Aborted");
    else if (!run.registered) skip(T_CELL, "Not registered on the network");
    else test_cell();
  }
  if (selected(T_DATA)) {
    if (aborted()) skip(T_DATA, "Aborted");
    else if (!run.registered) skip(T_DATA, "Not registered on the network");
    else test_data();
  }
  if (selected(T_STEPS)) {
    if (aborted()) skip(T_STEPS, "Aborted");
    else if (!passed(T_IMU)) skip(T_STEPS, "Accelerometer not working");
    else test_steps();
  }
  if (selected(T_GPS)) {
    if (aborted()) skip(T_GPS, "Aborted");
    else if (!powerOk) skip(T_GPS, "Battery too low");
    else test_gps();
  }

  uint8_t passedCount = 0, failedCount = 0, skippedCount = 0;
  for (uint8_t i = 0; i < TEST_COUNT; i++) {
    if (!selected((TestId)i)) continue;
    if (run.outcome[i] == Outcome::Pass) passedCount++;
    else if (run.outcome[i] == Outcome::Fail) failedCount++;
    else skippedCount++;
  }
  const uint32_t ms = millis() - run.startedAt;
  run_line("done").unum("passed", passedCount).unum("failed", failedCount).unum("skipped", skippedCount).unum("ms", ms).end();
  SerialDBG.print("[QA] Run ");
  SerialDBG.print(run.number);
  SerialDBG.print(failedCount ? " FAILED: " : " PASSED: ");
  SerialDBG.print(passedCount);
  SerialDBG.print(" passed, ");
  SerialDBG.print(failedCount);
  SerialDBG.print(" failed, ");
  SerialDBG.print(skippedCount);
  SerialDBG.println(" skipped. Type QA RUN to test again.");
  run.active = false;
}

// ─── Console ──────────────────────────────────────────────────────────────────

uint16_t pendingRun = 0;

void show_help() {
  SerialDBG.println("[QA] Commands:");
  SerialDBG.println("[QA]   QA RUN          run every board test");
  SerialDBG.println("[QA]   QA RUN <test>   run one test and what it needs, e.g. QA RUN gps");
  SerialDBG.println("[QA]   QA GO           start the step test when it waits for you");
  SerialDBG.println("[QA]   QA ABORT        stop the current run");
  SerialDBG.println("[QA]   QA STATUS       firmware, chip UID, battery");
  SerialDBG.print("[QA] Tests:");
  for (uint8_t i = 0; i < TEST_COUNT; i++) {
    SerialDBG.print(' ');
    SerialDBG.print(TEST_NAMES[i]);
  }
  SerialDBG.println();
}

void print_status() {
  SerialDBG.print("[QA] fw=" QA_FW_VERSION " uid=");
  SerialDBG.print(chipUid);
  SerialDBG.print(" batteryMv=");
  SerialDBG.print(battery_mv());
  SerialDBG.print(" run=");
  SerialDBG.print(run.number);
  SerialDBG.println(run.active ? " (running)" : " (idle)");
}

void dispatch(char *command) {
  for (char *c = command; *c; c++) {
    if (*c >= 'a' && *c <= 'z') *c -= 'a' - 'A';
  }
  if (strcmp(command, "QA HELP") == 0 || strcmp(command, "HELP") == 0) {
    show_help();
  } else if (strcmp(command, "QA STATUS") == 0) {
    print_status();
  } else if (strcmp(command, "QA GO") == 0) {
    if (run.active) {
      run.startRequested = true;
    } else {
      SerialDBG.println("[QA] Nothing is waiting for Start. Type QA RUN.");
    }
  } else if (strcmp(command, "QA ABORT") == 0) {
    if (run.active) {
      run.abortRequested = true;
      SerialDBG.println("[QA] Aborting after the current step ...");
    }
  } else if (strncmp(command, "QA RUN", 6) == 0) {
    if (run.active) {
      SerialDBG.println("[QA] A run is in progress. Type QA ABORT first.");
      return;
    }
    const char *name = command + 6;
    while (*name == ' ') name++;
    if (*name == '\0') {
      pendingRun = (1 << TEST_COUNT) - 1;
      return;
    }
    for (uint8_t i = 0; i < TEST_COUNT; i++) {
      char upper[8];
      strncpy(upper, TEST_NAMES[i], sizeof(upper));
      upper[sizeof(upper) - 1] = '\0';
      for (char *c = upper; *c; c++) *c -= 'a' - 'A';
      if (strcmp(name, upper) == 0) {
        pendingRun = 1 << i;
        return;
      }
    }
    SerialDBG.println("[QA] Unknown test. Type QA HELP.");
  } else {
    SerialDBG.println("[QA] Unknown command. Type QA HELP.");
  }
}

void poll_console() {
  static char input[32];
  static size_t length = 0;
  static bool overflow = false;
  while (SerialDBG.available()) {
    const char c = (char)SerialDBG.read();
    if (c == '\r' || c == '\n') {
      if (length == 0 && !overflow) continue;
      input[length] = '\0';
      if (overflow) SerialDBG.println("[QA] Command too long. Type QA HELP.");
      else dispatch(input);
      length = 0;
      overflow = false;
    } else if (length + 1 < sizeof(input)) {
      input[length++] = c;
    } else {
      overflow = true;
    }
  }
}

// ─── Arduino ──────────────────────────────────────────────────────────────────

void setup() {
  pinMode(GSM_PWRKEY, OUTPUT);
  digitalWrite(GSM_PWRKEY, HIGH);
  pinMode(LDO_EN, OUTPUT);
  digitalWrite(LDO_EN, LOW);
  analogReadResolution(12);
  pinMode(BATTERY_ADC, INPUT_ANALOG);
  pinMode(CHARGER_CHRG, INPUT_PULLUP);   // as stepwhere.ino
  pinMode(CHARGER_STDBY, INPUT_PULLUP);

  pinMode(ACCEL_SA0, OUTPUT);
  digitalWrite(ACCEL_SA0, HIGH);  // LIS2DH12 0x19, LIS2DS12 0x1D
  // INT2 (PB4) is set up by lis2ds12_configure() once a LIS2DS12 is found.
  qaI2c.begin();

  SerialDBG.begin(CONSOLE_BAUD);
  delay(200);
  read_chip_uid();
  SerialDBG.println("[QA] Stepwhere QA firmware " QA_FW_VERSION ": board tests");
  QaLine("boot").str("uid", chipUid).str("fw", QA_FW_VERSION).unum("uptimeMs", millis()).end();
  print_status();
  show_help();

  // Test once at boot, so flashing this firmware is enough to start.
  pendingRun = (1 << TEST_COUNT) - 1;
}

void loop() {
  service();
  if (pendingRun) {
    const uint16_t tests = pendingRun;
    pendingRun = 0;
    run_tests(tests);
  }
  delay(1);
}
