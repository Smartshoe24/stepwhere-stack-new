/**
 * STM32G071CB — Neoway N706 GSM + G7A GPS
 *
 * Pin Mapping:
 *   GSM TX/RX  : PA2 / PA3   (USART2)
 *   GPS TX/RX  : PB8 / PB9   (USART3)
 *   DEBUG      : PB6 / PB7   (USART1)
 *   GSM PWRKEY : PB13
 *   LDO_EN     : PA10
 *
 * Libraries required:
 *   - TinyGPSPlus  (by Mikal Hart)
 *   - STM32duino core
 *
 * AT command reference: Neoway N706 AT Commands Manual V1.0
 */

#include <STM32TimerInterrupt.h>  //v1.3.0
#include <Wire.h>
#include <STM32_ISR_Timer.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <errno.h>
#include <ctype.h>
#include <stdlib.h>
#include <string.h>
// #include "cert.h"

// ─── Pin definitions ──────────────────────────────────────────────────────────
#define GSM_PWRKEY PB13
#define LDO_EN PA10
#define DEBUG_EN
#define I2C_SDA PA12
#define I2C_SCL PA11
#define LIS2DS12_SA0 PA1
#define LIS2DS12_INT1 PB3
#define LIS2DS12_INT2 PB4

#define ADC_PIN PB10       // External analog input (ADC_IN8)
#define ADC_VREF_CH AVREF  // Internal Vref channel (STM32 built-in)
#define ADC_RESOLUTION 12  // 12-bit = 0..4095
#define VREF_MV        3300.0f    // Supply / Vref voltage in mV
#define MIN_BAT_VOLT   3.2f  // Minimum battery voltage 3.20
#define BAT_RATIO      112      //100      //230
/*
* 143 == (100 /(4.2 - 3.5))
* 112 == (100 / (4.1 - 3.2))
*/

#define BATTERY_LOW_OFF 3.40f
#define BATTERY_LOW_ON 3.70f

#define BMS_STATUS1 PB15  //No  battery charging status on controller
#define BMS_STATUS2 PB14  //No  battery charging status on controller

#define CHRG_PIN PB14
#define STDBY_PIN PB15

typedef enum ChargeStatus {
  CHARGE_UNKNOWN,
  CHARGE_CHARGING,
  CHARGE_COMPLETE,
  CHARGE_ERROR,
  CHARGE_IDLE
};

struct vdd_mon {
  int battery_level;
  float bat_volt;
  float vdd_volt;
} g_vdd_mon;


#define GPS_RESET_MAGIC 0xCAFE1234UL

uint32_t gpsreset_magic
  __attribute__((section(".noinit")));

// ─── Serial port aliases ──────────────────────────────────────────────────────
// STM32duino HardwareSerial constructor takes (RX_pin, TX_pin).

HardwareSerial SerialGSM(PA3, PA2);  // USART2 — Neoway N706
HardwareSerial SerialGPS(PB9, PB8);  // USART3 — G7A GPS
HardwareSerial SerialDBG(PB7, PB6);  // USART1 — Debug console

TwoWire dev_i2c(I2C_SDA, I2C_SCL);

STM32Timer ITimer(TIM1);    // Init STM32 timer TIM1
STM32_ISR_Timer ISR_Timer;  // Init STM32_ISR_Timer

// #define INFO SerialDBG

// #ifdef DEBUG_EN
// #define DEBUG SerialDBG
// #else
// #define DEBUG
// #endif


#define LOG_SERIAL SerialDBG   // e.g. #define SerialDBG Serial

// ---------------------------------------------------------------
// Level values (higher = more verbose)
// ---------------------------------------------------------------
#define LVL_NONE    0
#define LVL_ERROR   1
#define LVL_WARN    2
#define LVL_INFO    3
#define LVL_DEBUG   4
#define LVL_VERBOSE 5

#define LOG_LEVEL LVL_DEBUG

// Set active level (override with -D LOG_LEVEL=x in build flags)
#ifndef LOG_LEVEL
#define LOG_LEVEL LVL_INFO
#endif

class NullStream : public Print {
public:
  size_t write(uint8_t) override { return 1; }
  size_t write(const uint8_t *buffer, size_t size) override { return size; }
};

NullStream nullStream;   // define once in a .cpp, see below


#if LOG_LEVEL >= LVL_ERROR
  #define ERR   LOG_SERIAL
#else
  #define ERR   nullStream
#endif

#if LOG_LEVEL >= LVL_WARN
  #define WARN  LOG_SERIAL
#else
  #define WARN  nullStream
#endif

#if LOG_LEVEL >= LVL_INFO
  #define INFO  LOG_SERIAL
#else
  #define INFO
#endif

#if LOG_LEVEL >= LVL_DEBUG
  #define DEBUG LOG_SERIAL
#else
  #define DEBUG nullStream
#endif



#define MIN_SAT 3
#define GPS_NO_FIX_TIMEOUT_MS (10UL * 60UL * 1000UL)

uint32_t gpsNoFixStart = 0;
bool gpsNoFixTimerRunning = false;


// ─── Baud rates ───────────────────────────────────────────────────────────────
#define GSM_BAUD 115200
#define GPS_BAUD 9600
#define DBG_BAUD 115200

// ─── Timeouts (ms) ───────────────────────────────────────────────────────────
#define AT_TIMEOUT 3000
#define AT_LONG_TIMEOUT 15000
#define HTTP_TIMEOUT 30000
#define CELL_PROBE_TIMEOUT_MS (300UL * 1000UL)  // N706 manual: AT+MYCELLINFO may take up to 300 s

//─── Power / location timer config ───────────────────────────────────────────
#define CHECK_INTERVAL_MS 30000UL     // check location every 30000 seconds
#define STATIONARY_LIMIT_MS 300000UL  // sleep after 5 min with no movement
#define SLEEP_DURATION_S 300          // wake from RTC sleep after 5 minutes
#define MOVE_THRESHOLD_M 10.0         // metres — below this = no movement

#define MIN_STEPS 20  // min steps/min to cancel sleep mode
#define IDLE_TIME 5
#define STEP_INACTIVITY_LIMIT_MS 300000UL  // sleep after 5 min with no steps
#define STEP_TIMER_INTERVAL_MS 60000UL     // STM32 timer fires every 1 minute
#define WAKE_MIN_DISTANCE_M 15.0
// Measured from the end of the previous upload, so it is also the radio quiet
// time before the next Wi-Fi scan (scans failed while LTE was still active).
#define HTTP_REQ_DELAY 15000UL
// Minimum time since the last data activity (HTTP or data activation) before a scan.
#define WIFI_SCAN_QUIET_MS 12000UL
// A terminal scan ERROR is retried once after this quiet wait.
#define WIFI_SCAN_RETRY_DELAY_MS 5000UL
// The N706 rejected AT+HTTPACTION=2,4367,2 with an immediate ERROR. Start at
// 4 KiB and lower the limit whenever the modem rejects a declared body length.
#define HTTP_MAX_BODY_BYTES 4096U
// Floor for the learned limit; a location-only body with 16 APs is about 2 KB.
#define HTTP_MIN_BODY_LIMIT 2048U
#define DEV_HEALTH_INTERVAL_MS 5000UL
#define MODEM_READY_TIMEOUT_MS 30000UL
#define SIM_READY_TIMEOUT_MS 60000UL
#define WIFI_DIAGNOSTIC_AWAKE_MS (30UL * 60UL * 1000UL)

//_____LIS2DS

// LIS2DS12 Register Addresses
#define LIS2DS12_ADDRESS 0x1D

#define LIS2DS12_REG_CTRL1 0x20
#define LIS2DS12_REG_CTRL2 0x21
#define LIS2DS12_REG_CTRL3 0x22
#define LIS2DS12_REG_CTRL4 0x23
#define LIS2DS12_REG_CTRL5 0x24

#define LIS2DS12_TAP_6D_THS 0x31
#define LIS2DS12_REG_INT_DUR 0x32
#define LIS2DS12_WAKE_UP_THS 0x33
#define LIS2DS12_FUNC_CTRL 0x3F
#define LIS2DS12_REG_SM_THS 0x34

#define LIS2DS12_REG_STATUS 0x27
#define LIS2DS12_REG_OUT_X_L 0x28
#define LIS2DS12_REG_OUT_X_H 0x29
#define LIS2DS12_REG_OUT_Y_L 0x2A
#define LIS2DS12_REG_OUT_Y_H 0x2B
#define LIS2DS12_REG_OUT_Z_L 0x2C
#define LIS2DS12_REG_OUT_Z_H 0x2D

//______ Variable

// ─── Network / server config ─ edit before flashing ──────────────────────────
#define APN "internet"                           // Operator APN
#define HTTP_SERVER "http://admin.stepwhere.in"  // Host (no http://)
#define HTTP_PORT 80
#define HTTPS_PORT 443
// #define HTTP_PATH "/api/location-store"  // Endpoint
// #define SERVER_CMD "AT+HTTPPARA=url,\"http://admin.stepwhere.in/api/location-store\""
// #define SERVER_CMD "AT+HTTPPARA=url,\"http://8545-106-219-71-174.ngrok-free.app/api/location-store\""

#define HTTP_PATH "/location"
#define SERVER_CMD "AT+HTTPPARA=url,\"http://npafhgmeij.a.pinggy.link/v1/telemetry/location\""

#define HTTPS_SERVER_CMD "AT+HTTPSPARA=url,\"https://admin.stepwhere.in/api/location-store\""

#if 0
#define NEOWWAY_SERVER "AT+HTTPPARA=url,\"121.15.200.97/Service1.asmx/GetNote\""
#define NEOWAY_DATA "MAC=NEOWAY&DATA=0123456"
#else
#define NEOWWAY_SERVER "AT+HTTPPARA=url,\"http://www.example.com\""
#define NEOWAY_DATA "MAC=NEOWAY&DATA=0123456"
#endif

//"AT+HTTPPARA=url,\"http://admin.stepwhere.in/api/location-store\"", 1000

// ─── SSL / Certificate config ─────────────────────────────────────────────────
#define CA_CERT_FILENAME "ca_cert.pem"  // name stored on the module
#define CERT_UPLOAD_TIMEOUT 10000UL     // ms to wait for CONNECT / +CERTADD: OK

const char ROOT_CA[] = { 0 };

// ─── HTTPS server config — edit before flashing ───────────────────────────────
// #define HTTPS_SERVER  "admin.stepwhere.in"   // Host (no https://)
#define HTTPS_SERVER "011d-106-219-68-21.ngrok-free.app"  // Host (no https://)
#define HTTPS_PORT 443
#define HTTPS_PATH "/api/location-store"  // Endpoint
#define HTTPS_SSL_VERSION 3               // 0=SSL3.0 1=TLS1.0 2=TLS1.1 3=TLS1.2
#define HTTPS_AUTH_MODE 1                 // 0=no auth 1=server auth 2=mutual auth

// ─── Version ────────────────────────────────────────────────────────────────
#define APP_VERSION "v1.3-dev-wifi-quiet"
// ─── TinyGPS++ ────────────────────────────────────────────────────────────────
TinyGPSPlus gps;


//variable
String g_imei = "";
volatile uint32_t wake_count = 0;
uint8_t is_charging = false;

struct CellularTowerObservation {
  bool valid;
  uint16_t mobile_country_code;
  uint16_t mobile_network_code;
  uint16_t tracking_area_code;
  uint32_t cell_id;
  bool has_physical_cell_id;
  uint16_t physical_cell_id;
  bool has_band;
  char band[41];
  uint32_t earfcn;
  bool has_earfcn;
  int16_t rx_dbm;
  bool has_rx_dbm;
  int16_t tx_dbm;
  bool has_tx_dbm;
  int16_t rsrp_tenths_dbm;
  bool has_rsrp;
  int16_t rsrq_tenths_db;
  bool has_rsrq;
  int16_t sinr_tenths_db;
  bool has_sinr;
  char duplex_mode[4];
} g_cellular_tower;

struct DiagnosticSnapshot {
  uint16_t battery_adc_raw = 0;
  uint16_t vref_adc_raw = 0;
  uint16_t vdda_mv = 0;
  ChargeStatus charge_status = CHARGE_UNKNOWN;
  bool low_battery = false;
  char gprs_ip[40] = "";
  const char *cell_query_status = "skipped_gps_fix";
  char cell_query_raw[256] = "";
  char cell_query_error[96] = "";
} g_diagnostics;

struct WifiObservation {
  char mac[18];
  int16_t rssi;
  uint8_t channel;
  uint32_t observed_at;
};
WifiObservation g_wifi_points[16];
uint8_t g_wifi_count = 0;
struct WifiScanDiagnostics {
  const char *status = "skipped_gps_fix";
  uint32_t duration_ms = 0;
  uint16_t ap_count = 0;
  char raw[1025] = "";
  bool raw_truncated = false;
  char error[96] = "";
  uint8_t attempts = 0;
  bool quiet_known = false;
  uint32_t quiet_ms = 0;  // Time since the last data activity when the final scan started.
} g_wifi_scan;
bool g_data_activity_seen = false;
uint32_t g_last_data_activity_at = 0;
bool g_wifi_modem_state_unknown = false;
uint8_t g_wifi_scan_failures = 0;
bool g_wifi_error_probe_attempted = false;
uint32_t g_wifi_error_probe_at = 0;

struct ModemStateSnapshot {
  bool captured = false;
  uint32_t captured_at = 0;
  int8_t cfun = -1;
  int8_t registration_status = -1;
  bool data_known = false;
  bool data_connected = false;
  char ip[40] = "";
};
ModemStateSnapshot g_wifi_failure_modem_state;

struct WifiExperimentStage {
  const char *name;
  const char *status = "not_started";
  const char *skip_reason = nullptr;
  uint32_t started_at = 0;
  bool scan_attempted = false;
  uint32_t scan_started_at = 0;
  uint32_t duration_ms = 0;
  uint16_t observed_aps = 0;
  uint8_t retained_aps = 0;
  bool has_command_gap = false;
  uint32_t command_gap_ms = 0;
  ModemStateSnapshot modem_state;
  uint32_t battery_before_mv = 0;
  uint32_t battery_after_mv = 0;
  char raw[257] = "";
  bool raw_truncated = false;
  char error[96] = "";
};
struct WifiExperimentDiagnostics {
  bool attempted = false;
  bool reported = false;  // An accepted upload carried the boot-comparison summary.
  const char *state = "not_started";
  char modem_revision[96] = "";
  WifiExperimentStage stages[4] = {
    {"disconnected"}, {"connected_before_cell"},
    {"connected_after_cell"}, {"connected_after_cell_quiet"}
  };
} g_wifi_experiment;
volatile bool g_wifi_sleep_suppressed = true;
bool g_wifi_awake_window_started = false;
uint32_t g_wifi_awake_window_started_at = 0;
uint32_t g_wifi_scan_started_at = 0;
uint32_t g_last_at_completed_at = 0;

const char *g_dev_phase = "starting";
const char *g_modem_waiting_for = nullptr;
bool g_last_at_timed_out = false;
uint32_t g_dev_phase_started_at = 0;
uint32_t g_last_dev_health_at = 0;
bool g_gps_uart_started = false;
bool g_adc_initialized = false;
bool g_modem_rail_on = false;
bool g_sim_ready = false;
bool g_modem_functionality_ready = false;
bool g_extended_errors_attempted = false;
uint8_t g_modem_recovery_cycles = 0;
bool g_modem_recovery_wait = false;
uint32_t g_modem_recovery_wait_at = 0;
bool g_sim_retry_wait = false;
uint32_t g_sim_retry_at = 0;
uint32_t g_mcu_reset_flags = 0;

struct MinuteLogSnapshot {
  uint32_t steps;
  uint16_t minute;
  uint8_t sleep_minutes;
  bool connected;
  bool gps_valid;
  bool evaluated;
  bool flagged_sleep;
  double distance;
} g_minute_log;
volatile bool g_minute_log_pending = false;

extern bool step_ready;

// ─── Forward declarations ─────────────────────────────────────────────────────

void ldo_enable(bool on);
void service_dev_diagnostics(bool force = false);
void dev_wait(uint32_t duration_ms);
void set_dev_phase(const char *phase);
void invalidate_modem_state();
void run_boot_wifi_experiment();
bool capture_modem_state(ModemStateSnapshot &snapshot);
bool parse_xiic_state(const String &value, ModemStateSnapshot &snapshot);
bool diagnostic_timeout_requires_reset();
void run_wifi_experiment_stage(WifiExperimentStage &stage, uint8_t index);
void skip_wifi_experiment_stage(WifiExperimentStage &stage, const char *reason);
void append_modem_state_json(String &body, const ModemStateSnapshot &snapshot);
void append_wifi_experiment_json(String &body);
void append_wifi_experiment_summary_json(String &body);
void print_wifi_experiment_json();
void clear_wifi_observations();
void print_minute_log();
float adc_read_battery_mv_calibrated();
bool ensure_system_ready();
bool query_data_connection();
void verify_transport_recovery();
void gsm_power_on();
void gsm_power_off();
bool gsm_send_at(const char *cmd, const char *expect,
                 uint32_t timeout_ms, String *response = nullptr);
void clear_cellular_tower_observation();
bool query_serving_cell_tower();
bool handle_cell_probe_console();
bool parse_netdmsg_response(const String &response,
                            CellularTowerObservation &observation,
                            String &error);
void append_tenths_json(String &body, int16_t value);
bool modem_check();
String get_imei();
bool gprs_on();
bool http_post_json(const char *json_payload, bool *body_rejected = nullptr);
bool http_post(const char *json_payload);
bool https_post_location_json(const char *json_payload);
enum TelemetryDetail : uint8_t {
  TELEMETRY_DETAIL_MINIMAL = 0,  // Location/cell/Wi-Fi fields only, no debug block.
  TELEMETRY_DETAIL_COMPACT = 1,  // Debug block without raw modem text or boot comparison.
  TELEMETRY_DETAIL_FULL = 2      // Debug block, failure raw text and unreported boot comparison.
};
String build_location_telemetry_json(TelemetryDetail detail);
void upload_location_telemetry();
String json_escape(const String &value);
bool https_post(const char *json_payload);
void gps_feed(uint32_t duration_ms);
void print_gps_info();
void build_json(char *buf, size_t buf_size, const String &imei);
bool neoway_test(const char *json_payload);
// ═════════════════════════════════════════════════════════════════════════════
//  POWER MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

/** Enable / disable the LDO that powers the GSM & GPS modules */
void ldo_enable(bool on) {
  digitalWrite(LDO_EN, on ? HIGH : LOW);
  g_modem_rail_on = on;
  if (!on) invalidate_modem_state();
  DEBUG.print("[LDO] ");
  DEBUG.println(on ? "ON" : "OFF");
  if (on) dev_wait(100);  // let the rail stabilise
}

/**
 * Power ON — Neoway N706.
 * PWRKEY must be held LOW for ≥ 1 s while VBAT is present.
 */
void gsm_power_on() {
  set_dev_phase("modem_power_on");
  DEBUG.println("[GSM] Power ON ...");
  ldo_enable(true);
  dev_wait(500);  // LDO settle
  // Diagnostic dev build: GPS UART and no-fix resets stay disabled.

  digitalWrite(GSM_PWRKEY, HIGH);
  dev_wait(100);
  digitalWrite(GSM_PWRKEY, LOW);
  dev_wait(1200);  // hold ≥ 1 s
  digitalWrite(GSM_PWRKEY, HIGH);

  DEBUG.println("[GSM] Waiting for boot ...");
  dev_wait(3000);

  while (SerialGSM.available()) SerialGSM.read();  // flush boot noise
  DEBUG.println("[GSM] Power ON complete.");
}

/**
 * Power OFF — Neoway N706.
 * AT+CFUN=0 turns off radio and SIM power (N706 AT Manual §3.14).
 * Then cut the LDO.
 */
void gsm_power_off() {
  set_dev_phase("modem_power_off");
  DEBUG.println("[GSM] Power OFF ...");
  if (g_modem_rail_on && !g_wifi_modem_state_unknown)
    gsm_send_at("AT+CFUN=0", "OK", 5000);
  ldo_enable(false);
  dev_wait(2000); // Actual shared GSM/GPS rail removal, not just CFUN=0.
  DEBUG.println("[GSM] Power OFF complete.");
}


// =============================================================================
//  SYSTEM STATUS FLAGS
// =============================================================================
struct http_status {
  bool ok = false;
  uint8_t reconnect_cnt = 0;
  unsigned long last_send = 0;
  const char *previous_result = "not_attempted";
  // Additive detail so older backends (which strip unknown keys) still accept the payload.
  const char *previous_failure_reason = nullptr;  // "payload_rejected" or null
  int previous_status_code = 0;
  unsigned long previous_duration_ms = 0;
  size_t previous_body_bytes = 0;
  uint32_t consecutive_failures = 0;
  // Largest body the modem is believed to accept; lowered when HTTPACTION rejects a length.
  size_t body_limit = HTTP_MAX_BODY_BYTES;
  // A length at or below an accepted size cannot be a length rejection.
  size_t largest_accepted_bytes = 0;
} g_http_status;

void mark_data_activity() {
  g_data_activity_seen = true;
  g_last_data_activity_at = millis();
}

int http_response_status_code(const String &response) {
  int version = response.indexOf("HTTP/1.");
  if (version < 0) return 0;
  int separator = response.indexOf(' ', version);
  if (separator < 0 || separator + 3 >= (int)response.length()) return 0;
  int code = 0;
  for (int i = 1; i <= 3; i++) {
    char digit = response.charAt(separator + i);
    if (digit < '0' || digit > '9') return 0;
    code = code * 10 + digit - '0';
  }
  return code;
}

bool finish_http_post(bool accepted, int status_code, unsigned long started_at,
                      bool payload_rejected = false) {
  // Every attempt opens the HTTP link, so it counts as radio activity for Wi-Fi scheduling.
  mark_data_activity();
  g_http_status.ok = accepted;
  g_http_status.previous_result = accepted ? "accepted" :
    (status_code ? "http_error" : "transport_error");
  g_http_status.previous_failure_reason = payload_rejected ? "payload_rejected" : nullptr;
  g_http_status.previous_status_code = status_code;
  g_http_status.previous_duration_ms = millis() - started_at;
  // A rejected body length is not a transport fault; keep it out of reconnect checks.
  if (status_code) g_http_status.reconnect_cnt = 0;
  else if (!payload_rejected && g_http_status.reconnect_cnt < UINT8_MAX) g_http_status.reconnect_cnt++;
  if (accepted) {
    g_http_status.consecutive_failures = 0;
  } else if (g_http_status.consecutive_failures < UINT32_MAX) {
    g_http_status.consecutive_failures++;
  }
  set_dev_phase("ready");
  return accepted;
}


struct SystemStatus {
  bool powered_on;      // LDO on + modem responded to AT
  bool imei_valid;      // IMEI is 15 digits and non-empty
  bool gprs_connected;  // AT+XIIC=1 succeeded and IP assigned
  bool is_gps_ready;

  // Returns true only when all three conditions are met
  bool ready() const {
    return powered_on && imei_valid && gprs_connected;
  }

  void reset() {
    powered_on = false;
    gprs_connected = false;
    is_gps_ready = false;
  }

  void print() const {
    INFO.println("[STATUS] ---- System Status ----");
    INFO.print("[STATUS] Powered ON   : ");
    INFO.println(powered_on ? "YES" : "NO");
    INFO.print("[STATUS] IMEI valid   : ");
    INFO.println(imei_valid ? "YES" : "NO");
    INFO.print("[STATUS] GPRS connect : ");
    INFO.println(gprs_connected ? "YES" : "NO");
    INFO.print("[STATUS] GPS        : ");
    INFO.println(is_gps_ready ? "YES" : "NO");
    INFO.print("[STATUS] Ready        : ");
    INFO.println(ready() ? "YES" : "NO");
    INFO.println("[STATUS] --------------------");
  }
} g_status;


// ─── Step / activity tracker ──────────────────────────────────────────────────
struct StepTracker {
  volatile uint32_t step_isr_count = 0;  // incremented in INT2 ISR
  uint32_t steps_this_min = 0;           // steps in last 1-min window
  uint32_t steps_total = 0;              // lifetime step total
  uint32_t previous_steps = 0;           // snapshot at last minute boundary
  uint16_t minute_counter = 0;           // uptime in minutes (wraps at 10000)
  unsigned long last_active_ms = 0;      // millis() of last step event
  bool active = false;                   // had steps in last window
  volatile bool sleep_mode_on = false;   // sleep flag
  uint8_t sleep_minute_count = 0;        // minutes elapsed since last wake-up
  double sleep_ref_lat = 0.0;            // GPS position at wake-up
  double sleep_ref_lon = 0.0;
  bool start_safe_shut_down = false;
  bool send_sleep_data = false;

  void mark_active() {
    last_active_ms = millis();
    active = true;
    sleep_mode_on = false;
  }
  bool is_inactive() {
    return (millis() - last_active_ms) >= STEP_INACTIVITY_LIMIT_MS;
  }
} g_steps;

// ─── Location / sleep tracker ─────────────────────────────────────────────────
struct LocationTracker {
  double last_lat = 0.0;
  double last_lon = 0.0;
  double current_lat = 0.0;
  double current_lon = 0.0;
  int num_satellite = 0;
  unsigned long last_check_ms = 0;     // millis() of last 1-min check
  unsigned long stationary_since = 0;  // millis() when movement stopped
  bool has_fix = false;                // at least one valid fix stored to store
  bool is_stationary = false;          // currently below threshold

  void update_reference(double lat, double lon) {
    last_lat = lat;
    last_lon = lon;
    has_fix = true;
    stationary_since = millis();
    is_stationary = false;
  }
} g_loc;

void set_dev_phase(const char *phase) {
  g_dev_phase = phase;
  g_dev_phase_started_at = millis();
  INFO.print("[DEV][PHASE] phase="); INFO.print(phase);
  INFO.print(" uptimeMs="); INFO.println(millis());
}

void service_dev_diagnostics(bool force) {
  if (g_wifi_awake_window_started && g_wifi_sleep_suppressed
      && millis() - g_wifi_awake_window_started_at >= WIFI_DIAGNOSTIC_AWAKE_MS) {
    const uint32_t primask = __get_PRIMASK();
    __disable_irq();
    g_steps.sleep_minute_count = 0;
    g_wifi_sleep_suppressed = false;
    __set_PRIMASK(primask);
    INFO.println("[WIFI][EXPERIMENT] 30-minute awake window ended; normal inactivity evaluation resumes. GPS remains disabled.");
  }
  if (!g_modem_waiting_for) print_minute_log(); // Foreground, between modem operations.
  const uint32_t now = millis();
  if (!force && now - g_last_dev_health_at < DEV_HEALTH_INTERVAL_MS) return;
  // Drain pending modem bytes before printing a health line on the TTL UART.
  if (!force && g_modem_waiting_for && SerialGSM.available()) return;
  g_last_dev_health_at = now;
  INFO.print("[DEV][HEALTH] uptimeMs="); INFO.print(now);
  INFO.print(" phase="); INFO.print(g_dev_phase);
  INFO.print(" phaseElapsedMs="); INFO.print(now - g_dev_phase_started_at);
  const float battery_mv = g_adc_initialized ? adc_read_battery_mv_calibrated() * 2.0f : 0;
  INFO.print(" batteryMv="); INFO.print((uint32_t)battery_mv);
  INFO.print(" modemReady="); INFO.print(g_status.powered_on ? "yes" : "no");
  INFO.print(" simReady="); INFO.print(g_sim_ready ? "yes" : "no");
  INFO.print(" dataConnected="); INFO.print(g_status.gprs_connected ? "yes" : "no");
  INFO.print(" waitingFor="); INFO.print(g_modem_waiting_for ? g_modem_waiting_for : "none");
  INFO.print(" stateUnknown="); INFO.println(g_wifi_modem_state_unknown ? "yes" : "no");
}

void dev_wait(uint32_t duration_ms) {
  const uint32_t started = millis();
  while (millis() - started < duration_ms) {
    service_dev_diagnostics();
    delay(1);
  }
}

void invalidate_modem_state() {
  g_status.reset();
  g_status.imei_valid = false;
  g_sim_ready = false;
  g_modem_functionality_ready = false;
  g_extended_errors_attempted = false;
  g_sim_retry_wait = false;
  g_diagnostics.gprs_ip[0] = '\0';
  g_wifi_failure_modem_state = ModemStateSnapshot();
  g_wifi_scan_failures = 0;
  g_wifi_error_probe_attempted = false;
  clear_cellular_tower_observation();
  clear_wifi_observations();
  g_diagnostics.cell_query_raw[0] = '\0';
  g_diagnostics.cell_query_error[0] = '\0';
  g_diagnostics.cell_query_status = "command_failed";
  g_loc.has_fix = false;
  g_loc.is_stationary = false;
  g_loc.current_lat = g_loc.current_lon = 0;
  g_loc.num_satellite = 0;
  if (g_gps_uart_started) {
    SerialGPS.end();
    g_gps_uart_started = false;
  }
  gps = TinyGPSPlus(); // A new rail cycle must not reuse an old GPS fix.
}

volatile bool g_double_tap = false;  // set in INT1 ISR, cleared in loop()
// ═════════════════════════════════════════════════════════════════════════════
//  AT COMMAND HELPER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Send an AT command and wait for an expected substring in the response.
 *
 * @param cmd        Command string — \r\n is appended automatically.
 *                   Pass "" to only listen (e.g. after sending raw body bytes).
 * @param expect     Substring that marks success (e.g. "OK", "+XIIC:")
 * @param timeout_ms Milliseconds to wait
 * @param response   Optional: receives the full reply
 * @return true if expect was found within timeout
 */
#if 0
bool gsm_send_at(const char *cmd, const char *expect,
                 uint32_t timeout_ms, String *response) {

    // while (SerialGSM.available()) SerialGSM.read();   // flush RX

    if (cmd[0] != '\0') {
        DEBUG.print("[AT] >> ");
        DEBUG.println(cmd);
        SerialGSM.print(cmd);
        SerialGSM.print("\r\n");
    }

    String reply  = "";
    unsigned long t0   = millis();
    char c;
    uint8_t linecount = 0;
    unsigned long  dot  = millis();
    uint8_t dataReceived = 0;
    unsigned long  lastDataTime  = millis();
    while (millis() - t0 < timeout_ms) {
        while (SerialGSM.available())
        {
            c = (char)SerialGSM.read();
            reply += c;
            if(c == '\n')  linecount++;

            if(c == '>') {
                DEBUG.print("[AT] << ");
                DEBUG.println(reply);
                if (response) *response = reply;
                return true;
            }

            if(linecount >= 2)
            {
                dataReceived = 1;
                lastDataTime = millis();
            }
        }


        if(millis() - dot > 1000)
        {
            dot  = millis();
            DEBUG.print(".");
        }
         // If we've started receiving and it’s been quiet for 200 ms → done
        if (dataReceived && (millis() - lastDataTime > 2000)) {
            if (reply.indexOf(expect) != -1) {
                DEBUG.print("[AT] << ");
                DEBUG.println(reply);
                if (response) *response = reply;
                return true;
            }
            if (reply.indexOf("ERROR") != -1) break;
        }
    }

    DEBUG.print("[AT] FAIL — got: ");
    DEBUG.println(reply);
    if (response) *response = reply;
    return false;
}
#else

bool gsm_send_at(const char *cmd,
                 const char *expect,
                 uint32_t timeout_ms,
                 String *response) {
  // Listening for a delayed HTTP result must not flush an already-arrived URC.
  if (cmd && cmd[0] != '\0') {
    service_dev_diagnostics();
    while (SerialGSM.available()) SerialGSM.read();
    DEBUG.print("[AT][CMD] >> ");
    DEBUG.println(cmd);
    SerialGSM.print(cmd);
    SerialGSM.print("\r\n");
  }

  static String reply;
  reply = "";
  reply.reserve(128);
  g_modem_waiting_for = cmd && cmd[0] ? cmd : expect;
  g_last_at_timed_out = false;
  unsigned long start = millis();
  bool ret_code = false;
  bool complete = false;
  String line;
  line.reserve(128);
  while ((millis() - start) < timeout_ms) {
    while (SerialGSM.available()) {
      char c = (char)SerialGSM.read();
      reply += c;
      if (expect && strcmp(expect, ">") == 0 && c == '>') {
        ret_code = true;
        complete = true;
        break;
      }
      // Asynchronous receive notifications are followed by the HTTP body.
      if ((!cmd || !cmd[0]) && expect && reply.indexOf(expect) != -1) {
        ret_code = true;
        complete = true;
        break;
      }
      if (c == '\r') continue;
      if (c != '\n') {
        line += c;
        continue;
      }
      line.trim();
      if (line == "ERROR" || line.startsWith("+CME ERROR:") || line.startsWith("+CMS ERROR:")) {
        complete = true;
        break;
      }
      if (line == "OK") {
        // CPIN/XIIC callers receive the whole reply, not a partial prefix.
        if (!expect || strcmp(expect, "OK") == 0 || reply.indexOf(expect) != -1) {
          ret_code = true;
          complete = true;
          break;
        }
      } else if (expect && (strcmp(expect, "CONNECT") == 0) && line.startsWith("CONNECT")) {
        ret_code = true;
        complete = true;
        break;
      }
      line = "";
    }
    if (complete) break;
    service_dev_diagnostics();
    delay(1);
  }
  g_modem_waiting_for = nullptr;
  if (complete) g_last_at_completed_at = millis();
  DEBUG.print("[AT][RSP] << ");
  DEBUG.println(reply);
  if (!complete) {
    g_last_at_timed_out = true;
    WARN.print("[DEV][AT] timeout elapsedMs="); WARN.println(millis() - start);
  }
  if (response)
    *response = reply;
  return ret_code;
}
#endif

// ═════════════════════════════════════════════════════════════════════════════
//  SERVING CELL INFORMATION  (AT+NETDMSG)
// ═════════════════════════════════════════════════════════════════════════════

void clear_cellular_tower_observation() {
  memset(&g_cellular_tower, 0, sizeof(g_cellular_tower));
}

bool parse_unsigned_token(const String &token,
                          uint32_t maximum,
                          uint32_t &result) {
  String value = token;
  value.trim();
  if (value.length() == 0 || value.charAt(0) == '-') return false;

  int base = value.length() > 2
      && value.charAt(0) == '0'
      && (value.charAt(1) == 'x' || value.charAt(1) == 'X')
    ? 16
    : 10;
  errno = 0;
  char *end = nullptr;
  unsigned long parsed = strtoul(value.c_str(), &end, base);
  if (errno == ERANGE || end == value.c_str() || *end != '\0' || parsed > maximum) {
    return false;
  }

  result = (uint32_t)parsed;
  return true;
}

bool parse_signed_token(const String &token,
                        int32_t minimum,
                        int32_t maximum,
                        int32_t &result) {
  String value = token;
  value.trim();
  if (value.length() == 0) return false;

  errno = 0;
  char *end = nullptr;
  long parsed = strtol(value.c_str(), &end, 10);
  if (errno == ERANGE || end == value.c_str() || *end != '\0'
      || parsed < minimum || parsed > maximum) {
    return false;
  }

  result = (int32_t)parsed;
  return true;
}

bool split_netdmsg_fields(const String &payload,
                          String fields[],
                          size_t expected_fields) {
  bool inside_quotes = false;
  size_t field_count = 0;
  String field;
  field.reserve(32);

  for (size_t i = 0; i < payload.length(); i++) {
    char c = payload.charAt(i);
    if (c == '"') {
      inside_quotes = !inside_quotes;
      continue;
    }

    if (c == ',' && !inside_quotes) {
      if (field_count >= expected_fields) return false;
      field.trim();
      fields[field_count++] = field;
      field = "";
      continue;
    }

    field += c;
  }

  if (inside_quotes || field_count >= expected_fields) return false;
  field.trim();
  fields[field_count++] = field;
  return field_count == expected_fields;
}

bool parse_netdmsg_response(const String &response,
                            CellularTowerObservation &observation,
                            String &error) {
  memset(&observation, 0, sizeof(observation));
  error = "";

  const char prefix[] = "+NETDMSG:";
  int prefix_index = response.indexOf(prefix);
  if (prefix_index < 0) {
    error = "response did not contain +NETDMSG";
    return false;
  }

  int payload_start = prefix_index + strlen(prefix);
  int payload_end = response.indexOf('\n', payload_start);
  if (payload_end < 0) payload_end = response.length();

  String payload = response.substring(payload_start, payload_end);
  payload.trim();

  String fields[15];
  if (!split_netdmsg_fields(payload, fields, 15)) {
    error = "expected 15 comma-separated fields";
    return false;
  }

  int separator = fields[0].indexOf('+');
  if (separator <= 0 || separator >= (int)fields[0].length() - 1) {
    error = "invalid MCC+MNC field";
    return false;
  }

  uint32_t parsed_mcc;
  uint32_t parsed_mnc;
  if (!parse_unsigned_token(fields[0].substring(0, separator), 999, parsed_mcc)
      || !parse_unsigned_token(fields[0].substring(separator + 1), 999, parsed_mnc)) {
    error = "MCC or MNC was outside the backend range";
    return false;
  }

  if (fields[4].equalsIgnoreCase("FDD LTE")) {
    memcpy(observation.duplex_mode, "fdd", 4);
  } else if (fields[4].equalsIgnoreCase("TDD LTE")) {
    memcpy(observation.duplex_mode, "tdd", 4);
  } else {
    error = "network mode was not LTE";
    return false;
  }

  uint32_t parsed_tac;
  uint32_t parsed_cell_id;
  if (!parse_unsigned_token(fields[1], 65535, parsed_tac)) {
    error = "invalid LTE tracking area code";
    return false;
  }
  if (!parse_unsigned_token(fields[2], 268435455UL, parsed_cell_id)) {
    error = "invalid LTE cell ID";
    return false;
  }

  observation.mobile_country_code = (uint16_t)parsed_mcc;
  observation.mobile_network_code = (uint16_t)parsed_mnc;
  observation.tracking_area_code = (uint16_t)parsed_tac;
  observation.cell_id = parsed_cell_id;

  uint32_t optional_unsigned;
  if (parse_unsigned_token(fields[3], 503, optional_unsigned)) {
    observation.has_physical_cell_id = true;
    observation.physical_cell_id = (uint16_t)optional_unsigned;
  }

  if (fields[5].length() > 0 && fields[5].length() <= 40) {
    observation.has_band = true;
    fields[5].toCharArray(observation.band, sizeof(observation.band));
  }

  if (parse_unsigned_token(fields[6], UINT32_MAX, optional_unsigned)) {
    observation.has_earfcn = true;
    observation.earfcn = optional_unsigned;
  }

  int32_t optional_signed;
  if (parse_signed_token(fields[7], -200, 199, optional_signed)
      && optional_signed != 199) {
    observation.has_rx_dbm = true;
    observation.rx_dbm = (int16_t)optional_signed;
  }
  if (parse_signed_token(fields[8], -200, 199, optional_signed)
      && optional_signed != 199) {
    observation.has_tx_dbm = true;
    observation.tx_dbm = (int16_t)optional_signed;
  }
  if (parse_signed_token(fields[12], -2000, 1000, optional_signed)) {
    observation.has_rsrp = true;
    observation.rsrp_tenths_dbm = (int16_t)optional_signed;
  }
  if (parse_signed_token(fields[13], -1000, 1000, optional_signed)) {
    observation.has_rsrq = true;
    observation.rsrq_tenths_db = (int16_t)optional_signed;
  }
  if (parse_signed_token(fields[14], -1000, 1000, optional_signed)) {
    observation.has_sinr = true;
    observation.sinr_tenths_db = (int16_t)optional_signed;
  }

  observation.valid = true;
  return true;
}

void log_serving_cell_tower(const CellularTowerObservation &observation) {
  INFO.println("[NETDMSG][TTL] Parsed LTE serving cell:");
  INFO.print("[NETDMSG][TTL] radio=lte duplex=");
  INFO.print(observation.duplex_mode);
  INFO.print(" mcc=");
  INFO.print(observation.mobile_country_code);
  INFO.print(" mnc=");
  INFO.println(observation.mobile_network_code);

  INFO.print("[NETDMSG][TTL] tac=");
  INFO.print(observation.tracking_area_code);
  INFO.print(" cellId=");
  INFO.print(observation.cell_id);
  if (observation.has_physical_cell_id) {
    INFO.print(" pci=");
    INFO.print(observation.physical_cell_id);
  }
  INFO.println();

  INFO.print("[NETDMSG][TTL] band=");
  INFO.print(observation.has_band ? observation.band : "unavailable");
  INFO.print(" earfcn=");
  if (observation.has_earfcn) INFO.print(observation.earfcn);
  else INFO.print("unavailable");
  INFO.println();

  INFO.print("[NETDMSG][TTL] rxDbm=");
  if (observation.has_rx_dbm) INFO.print(observation.rx_dbm);
  else INFO.print("unavailable");
  INFO.print(" txDbm=");
  if (observation.has_tx_dbm) INFO.print(observation.tx_dbm);
  else INFO.print("unavailable");
  INFO.print(" rsrpDbm=");
  if (observation.has_rsrp) INFO.print(observation.rsrp_tenths_dbm / 10.0f, 1);
  else INFO.print("unavailable");
  INFO.print(" rsrqDb=");
  if (observation.has_rsrq) INFO.print(observation.rsrq_tenths_db / 10.0f, 1);
  else INFO.print("unavailable");
  INFO.print(" sinrDb=");
  if (observation.has_sinr) INFO.print(observation.sinr_tenths_db / 10.0f, 1);
  else INFO.print("unavailable");
  INFO.println();
}

bool query_serving_cell_tower() {
  clear_cellular_tower_observation();
  g_diagnostics.cell_query_raw[0] = '\0';
  g_diagnostics.cell_query_error[0] = '\0';
  INFO.println("[NETDMSG][TTL] GPS fix unavailable; querying serving cell.");

  String response;
  bool query_ok = gsm_send_at("AT+NETDMSG", "OK", AT_TIMEOUT, &response);
  int line_start = response.indexOf("+NETDMSG:");
  if (line_start < 0) line_start = 0;
  int line_end = response.indexOf('\n', line_start);
  String raw_line = line_end < 0
    ? response.substring(line_start)
    : response.substring(line_start, line_end);
  raw_line.trim();
  raw_line.toCharArray(g_diagnostics.cell_query_raw,
                       sizeof(g_diagnostics.cell_query_raw));

  if (!query_ok) {
    g_diagnostics.cell_query_status = "command_failed";
    strncpy(g_diagnostics.cell_query_error, "AT+NETDMSG failed",
            sizeof(g_diagnostics.cell_query_error) - 1);
    WARN.println("[NETDMSG][TTL] Query failed; cellular will be omitted.");
    return false;
  }

  String error;
  if (!parse_netdmsg_response(response, g_cellular_tower, error)) {
    g_diagnostics.cell_query_status = "parse_failed";
    error.toCharArray(g_diagnostics.cell_query_error,
                      sizeof(g_diagnostics.cell_query_error));
    WARN.print("[NETDMSG][TTL] Response rejected: ");
    WARN.print(error);
    WARN.println("; cellular will be omitted.");
    return false;
  }

  g_diagnostics.cell_query_status = "success";
  log_serving_cell_tower(g_cellular_tower);
  return true;
}

// Diagnostic-only AT queries. The normal AT helper buffers its reply and uses
// short timeouts, so a long multi-cell response must be streamed to TTL instead.
bool stream_cell_probe_response(const char *command, uint32_t timeout_ms) {
  while (SerialGSM.available()) SerialGSM.read();

  SerialDBG.print("[CELLPROBE] >> ");
  SerialDBG.println(command);
  SerialGSM.print(command);
  SerialGSM.print("\r\n");
  g_modem_waiting_for = command;

  char line[24] = "";
  size_t line_length = 0;
  bool line_overflow = false;
  uint32_t byte_count = 0;
  unsigned long started_at = millis();

  while (millis() - started_at < timeout_ms) {
    while (SerialGSM.available()) {
      char c = (char)SerialGSM.read();
      SerialDBG.write((uint8_t)c);
      byte_count++;

      if (c == '\n') {
        if (line_length > 0 && !line_overflow) {
          line[line_length] = '\0';
          if (strcmp(line, "OK") == 0 || strcmp(line, "ERROR") == 0
              || strncmp(line, "+CME ERROR:", 11) == 0
              || strncmp(line, "+CMS ERROR:", 11) == 0) {
            bool succeeded = strcmp(line, "OK") == 0;
            SerialDBG.print("[CELLPROBE] ");
            SerialDBG.print(command);
            SerialDBG.print(succeeded ? " complete, bytes=" : " failed, bytes=");
            SerialDBG.println(byte_count);
            g_modem_waiting_for = nullptr;
            return succeeded;
          }
        }
        line_length = 0;
        line_overflow = false;
      } else if (c != '\r' && !line_overflow) {
        if (line_length < sizeof(line) - 1) line[line_length++] = c;
        else line_overflow = true;
      }
    }

    // Keep the GPS parser fed while the modem performs a potentially long scan.
    service_dev_diagnostics();
    delay(1);
  }

  SerialDBG.print("[CELLPROBE] ");
  SerialDBG.print(command);
  SerialDBG.print(" timed out, bytes=");
  SerialDBG.println(byte_count);
  g_modem_waiting_for = nullptr;
  g_wifi_modem_state_unknown = true;
  ERR.println("[CELLPROBE] Unresolved timeout; no further commands. Reset the board.");
  return false;
}

bool handle_cell_probe_console() {
  static char command[24] = "";
  static size_t command_length = 0;
  static bool command_overflow = false;

  while (SerialDBG.available()) {
    char c = (char)SerialDBG.read();
    if (c == '\r' || c == '\n') {
      if (command_length == 0) continue;
      command[command_length] = '\0';
      bool run_probe = !command_overflow && strcmp(command, "CELLPROBE") == 0;
      command_length = 0;
      command_overflow = false;
      if (!run_probe) continue;

      if (!g_status.powered_on || g_steps.sleep_mode_on) {
        SerialDBG.println("[CELLPROBE] Modem is off or sleeping; try again when it is ready.");
        return true;
      }

      SerialDBG.println("[CELLPROBE] Starting one-shot N706 scan. Telemetry pauses until it finishes.");
      if (!stream_cell_probe_response("AT+GMR", AT_TIMEOUT)) {
        SerialDBG.println("[CELLPROBE] Modem did not answer AT+GMR; scan cancelled.");
        return true;
      }
      stream_cell_probe_response("AT+NRSP", AT_LONG_TIMEOUT);
      if (g_wifi_modem_state_unknown) return true;
      stream_cell_probe_response("AT+MYCELLINFO", CELL_PROBE_TIMEOUT_MS);
      if (g_wifi_modem_state_unknown) return true;
      SerialDBG.println("[CELLPROBE] Finished. Normal telemetry resumes.");
      return true;
    }

    if (!command_overflow) {
      if (command_length < sizeof(command) - 1) command[command_length++] = c;
      else command_overflow = true;
    }
  }
  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MODEM CHECK  (AT + AT+CPIN?)
// ═════════════════════════════════════════════════════════════════════════════

// AT responsiveness is deliberately independent of SIM and data readiness.
bool modem_check() {
  set_dev_phase("modem_at_check");
  const uint32_t started = millis();
  while (millis() - started < MODEM_READY_TIMEOUT_MS) {
    const uint32_t remaining = MODEM_READY_TIMEOUT_MS - (millis() - started);
    if (gsm_send_at("AT", "OK", remaining < AT_TIMEOUT ? remaining : AT_TIMEOUT)) {
      INFO.println("[DEV] Modem responds to AT.");
      return true;
    }
    const uint32_t elapsed = millis() - started;
    if (elapsed < MODEM_READY_TIMEOUT_MS)
      dev_wait(MODEM_READY_TIMEOUT_MS - elapsed < 1000 ? MODEM_READY_TIMEOUT_MS - elapsed : 1000);
  }
  ERR.println("[DEV] No AT responsiveness within 30 seconds.");
  return false;
}

String at_response_value(const String &reply, const char *prefix) {
  // Only a complete response line can supply a state; ignore echoes and URCs.
  int offset = 0;
  while (offset < (int)reply.length()) {
    int end = reply.indexOf('\n', offset);
    if (end < 0) break;
    String line = reply.substring(offset, end);
    line.trim();
    if (line.startsWith(prefix)) {
      line.remove(0, strlen(prefix));
      line.trim();
      return line;
    }
    offset = end + 1;
  }
  return "";
}

bool prepare_modem_functionality() {
  set_dev_phase("modem_functionality");
  gsm_send_at("ATE0", "OK", AT_TIMEOUT);
  String reply;
  if (!gsm_send_at("AT+CFUN?", "OK", AT_TIMEOUT, &reply)) return false;
  const String mode = at_response_value(reply, "+CFUN:");
  if (mode == "0" || mode == "4") {
    INFO.println("[DEV] Restoring full modem functionality (CFUN=1).");
    if (!gsm_send_at("AT+CFUN=1", "OK", AT_LONG_TIMEOUT)) return false;
    if (!gsm_send_at("AT+CFUN?", "OK", AT_TIMEOUT, &reply)
        || at_response_value(reply, "+CFUN:") != "1") return false;
  } else if (mode != "1") {
    WARN.println("[DEV] Unexpected CFUN state; readiness remains false.");
    return false;
  }
  if (!g_extended_errors_attempted) {
    g_extended_errors_attempted = true;
    if (!gsm_send_at("AT+CMEE=2", "OK", AT_TIMEOUT))
      WARN.println("[DEV] Extended error reporting unavailable; continuing with raw replies.");
    if (gsm_send_at("AT+GMR", "OK", AT_TIMEOUT, &reply)) {
      const String revision = at_response_value(reply, "+GMR:");
      revision.toCharArray(g_wifi_experiment.modem_revision, sizeof(g_wifi_experiment.modem_revision));
    }
  }
  return true;
}

bool wait_for_sim_ready() {
  set_dev_phase("sim_status");
  const uint32_t started = millis();
  while (millis() - started < SIM_READY_TIMEOUT_MS) {
    String reply;
    const uint32_t remaining = SIM_READY_TIMEOUT_MS - (millis() - started);
    if (gsm_send_at("AT+CPIN?", "OK", remaining < AT_TIMEOUT ? remaining : AT_TIMEOUT, &reply)
        && at_response_value(reply, "+CPIN:") == "READY") {
      INFO.println("[DEV] SIM READY.");
      return true;
    }
    const uint32_t elapsed = millis() - started;
    if (elapsed < SIM_READY_TIMEOUT_MS)
      dev_wait(SIM_READY_TIMEOUT_MS - elapsed < 2000 ? SIM_READY_TIMEOUT_MS - elapsed : 2000);
  }
  WARN.println("[DEV] SIM not ready after 60 seconds; retry in 30 seconds, no power cycle.");
  g_sim_retry_wait = true;
  g_sim_retry_at = millis();
  set_dev_phase("sim_retry_wait");
  return false;
}

bool ensure_system_ready() {
  if (g_wifi_modem_state_unknown) return false;
  if (g_modem_recovery_wait) {
    if (millis() - g_modem_recovery_wait_at < 60000UL) return false;
    g_modem_recovery_wait = false;
    g_modem_recovery_cycles = 0;
  }
  if (!g_modem_rail_on) gsm_power_on();
  if (!g_status.powered_on) {
    if (!modem_check()) {
      if (g_modem_recovery_cycles < 3) {
        ++g_modem_recovery_cycles;
        INFO.print("[DEV] Actual rail recovery cycle "); INFO.print(g_modem_recovery_cycles);
        INFO.println("/3");
        gsm_power_off();
        gsm_power_on();
      } else {
        g_modem_recovery_wait = true;
        g_modem_recovery_wait_at = millis();
        set_dev_phase("modem_recovery_wait");
        ERR.println("[DEV] Three recovery cycles exhausted; waiting 60 seconds before another AT attempt.");
      }
      return false;
    }
    g_status.powered_on = true;
    g_modem_recovery_cycles = 0;
  }
  if (!g_modem_functionality_ready) {
    g_modem_functionality_ready = prepare_modem_functionality();
    if (!g_modem_functionality_ready) { dev_wait(5000); return false; }
  }
  if (!g_sim_ready) {
    if (g_sim_retry_wait && millis() - g_sim_retry_at < 30000UL) return false;
    g_sim_retry_wait = false;
    g_sim_ready = wait_for_sim_ready();
    if (!g_sim_ready) return false;
  }
  if (!g_status.imei_valid) {
    set_dev_phase("imei");
    g_imei = get_imei();
    g_status.imei_valid = g_imei.length() == 15;
    if (!g_status.imei_valid) { dev_wait(3000); return false; }
  }
  if (!g_wifi_experiment.attempted) run_boot_wifi_experiment();
  if (g_wifi_modem_state_unknown) return false;
  if (!g_status.gprs_connected) {
    set_dev_phase("data_connect");
    g_status.gprs_connected = gprs_on();
    if (!g_status.gprs_connected) { dev_wait(5000); return false; }
  }
  set_dev_phase("ready");
  service_dev_diagnostics(true);
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  IMEI  (AT+CGSN)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @return 15-digit IMEI string, or "" on failure.
 */
String get_imei() {
  String reply;
  if (!gsm_send_at("AT+CGSN", "OK", AT_TIMEOUT, &reply)) {
    DEBUG.println("[IMEI] ERROR");
    return "";
  }
  // Raw reply: \r\nAT+CGSN\r\n\r\n<15 digits>\r\n\r\nOK\r\n
  // Strip echo
  int echo = reply.indexOf("+CGSN: ");
  if (echo != -1) reply = reply.substring(echo + 7);
  // Strip OK
  int ok = reply.lastIndexOf("OK");
  if (ok != -1) reply = reply.substring(0, ok);
  reply.trim();

  DEBUG.print("[IMEI] ");
  DEBUG.println(reply);
  return reply;
}

// ═════════════════════════════════════════════════════════════════════════════
//  GPRS ON  (AT+CGDCONT → AT+XIIC=1)
//  N706 AT Manual §5.2: AT+CGDCONT must be set before AT+XIIC=1
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Bring up GPRS bearer.
 *
 * Per the manual:
 *   1. AT+CGDCONT=1,"IP","<apn>"   — configure PDP context
 *   2. AT+XIIC=1                   — activate PPP link  → OK
 *   3. AT+XIIC?                    → +XIIC: 1,<ip>      — confirm IP
 */
bool parse_xiic_state(const String &value, ModemStateSnapshot &snapshot) {
  int state = 0;
  char ip[40] = "";
  char extra = '\0';
  if (sscanf(value.c_str(), " %d , %39s %c", &state, ip, &extra) != 2
      || (state != 0 && state != 1)) return false;
  const char *cursor = ip;
  bool nonzero = false;
  for (uint8_t octet = 0; octet < 4; ++octet) {
    if (!isdigit((unsigned char)*cursor)) return false;
    char *end = nullptr;
    const long part = strtol(cursor, &end, 10);
    if (part < 0 || part > 255) return false;
    nonzero |= part != 0;
    if ((octet < 3 && *end != '.') || (octet == 3 && *end != '\0')) return false;
    cursor = end + (octet < 3 ? 1 : 0);
  }
  if (state == 1 && !nonzero) return false;
  snapshot.data_known = true;
  snapshot.data_connected = state == 1;
  if (state == 1) strcpy(snapshot.ip, ip);
  else snapshot.ip[0] = '\0';
  return true;
}

bool query_data_connection() {
  g_diagnostics.gprs_ip[0] = '\0';
  String reply;
  if (!gsm_send_at("AT+XIIC?", "OK", 5000, &reply)) return false;
  ModemStateSnapshot snapshot;
  if (!parse_xiic_state(at_response_value(reply, "+XIIC:"), snapshot)
      || !snapshot.data_connected) return false;
  strcpy(g_diagnostics.gprs_ip, snapshot.ip);
  INFO.print("[GPRS] Verified connected IP: "); INFO.println(snapshot.ip);
  return true;
}

bool gprs_on() {
  if (query_data_connection()) {
    INFO.println("[GPRS] Retaining existing verified connection.");
    return true;
  }
  if (diagnostic_timeout_requires_reset()) return false;
  INFO.println("[GPRS] Configuring APN (AT+CGDCONT) ...");

  char cmd[80];
  snprintf(cmd, sizeof(cmd), "AT+CGDCONT=1,\"IP\",\"%s\"", APN);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    diagnostic_timeout_requires_reset();
    ERR.println("[GPRS] ERROR: AT+CGDCONT failed");
    return false;
  }

  // Close any existing PPP link first (ignore errors)
  gsm_send_at("AT+XIIC=0", "OK", AT_TIMEOUT);
  if (diagnostic_timeout_requires_reset()) return false;
  dev_wait(500);

  DEBUG.println("[GPRS] Activating PPP link (AT+XIIC=1) ...");
  const bool activated = gsm_send_at("AT+XIIC=1", "OK", AT_LONG_TIMEOUT);
  mark_data_activity();  // Activation signalling keeps the radio busy; delay the next scan.
  if (!activated) {
    diagnostic_timeout_requires_reset();
    ERR.println("[GPRS] ERROR: AT+XIIC=1 failed");
    return false;
  }
  dev_wait(1000);  // let IP assignment settle

  if (!query_data_connection()) {
    diagnostic_timeout_requires_reset();
    ERR.println("[GPRS] Activation did not produce a connected state and valid IP.");
    return false;
  }
  INFO.println("[GPRS] GPRS UP");
  return true;
}

void verify_transport_recovery() {
  if (g_wifi_modem_state_unknown || g_http_status.reconnect_cnt < 5) return;
  g_http_status.reconnect_cnt = 0;
  set_dev_phase("transport_check");
  INFO.println("[DEV][HTTP] Five transport failures; checking modem and data, not blindly reconnecting.");
  if (!gsm_send_at("AT", "OK", AT_TIMEOUT)) {
    g_status.powered_on = false;
    g_status.gprs_connected = false;
    g_sim_ready = false;
    g_modem_functionality_ready = false;
    g_diagnostics.gprs_ip[0] = '\0';
    set_dev_phase("modem_unresponsive");
    return;
  }
  g_status.gprs_connected = query_data_connection();
  INFO.println(g_status.gprs_connected
    ? "[DEV][HTTP] Data link remains valid; retaining it. Check tunnel/upstream."
    : "[DEV][HTTP] Data link invalid; normal readiness handling will reconnect.");
  set_dev_phase(g_status.gprs_connected ? "ready" : "data_retry");
}


/**
 * Read a CONNECT-prompt response from SerialGSM and then send raw bytes.
 * Used by cert_upload() — the module behaves like a file-upload prompt:
 *   AT+CERTADD=<file_name>,<length>
 *   CONNECT                       ← module is ready for raw bytes
 *   <send exactly <length> bytes>
 *   +CERTADD: <length>,OK         ← success
 *   or
 *   +CERTADD: ERROR / ERROR       ← failure
 */
bool cert_upload(const char *filename, const char *pem_progmem, size_t pem_len) {
  DEBUG.print("[CERT] Uploading ");
  DEBUG.print(filename);
  DEBUG.print(" (");
  DEBUG.print(pem_len);
  DEBUG.println(" bytes) ...");

  char cmd[64];
  snprintf(cmd, sizeof(cmd), "AT+CERTADD=%s,%u", filename, (unsigned)pem_len);

  // Send the command and wait for the CONNECT prompt
  if (!gsm_send_at(cmd, "CONNECT", CERT_UPLOAD_TIMEOUT)) {
    DEBUG.println("[CERT] ERROR: no CONNECT prompt — upload aborted");
    return false;
  }

  // Stream the PEM bytes from PROGMEM directly to the modem UART
  for (size_t i = 0; i < pem_len; i++) {
    char c = pem_progmem[i];
    SerialGSM.write(c);
  }

  // Wait for the final +CERTADD: <len>,OK confirmation
  String reply;
  bool ok = gsm_send_at("", "+CERTADD:", CERT_UPLOAD_TIMEOUT, &reply);

  if (!ok || reply.indexOf("OK") == -1) {
    DEBUG.print("[CERT] ERROR: upload failed — got: ");
    DEBUG.println(reply);
    return false;
  }

  DEBUG.println("[CERT] Upload OK.");
  return true;
}

/**
 * Convenience wrapper to upload the CA cert defined above.
 */
bool cert_upload_ca() {
  size_t len = strlen(ROOT_CA);
  cert_delete(CA_CERT_FILENAME);
  return cert_upload(CA_CERT_FILENAME, ROOT_CA, len);
}

/**
 * Check whether a certificate file already exists on the module.
 * AT+CERTCHECK=<file_name>  →  +CERTCHECK: <file_name>,OK  (exists)
 *                            or +CERTCHECK: ERROR           (does not exist)
 */
bool cert_check(const char *filename) {
  char cmd[64];
  snprintf(cmd, sizeof(cmd), "AT+CERTCHECK=%s", filename);

  String reply;
  gsm_send_at(cmd, "CERTCHECK", AT_TIMEOUT, &reply);

  bool exists = (reply.indexOf("OK") != -1) && (reply.indexOf("ERROR") == -1);
  DEBUG.print("[CERT] ");
  DEBUG.print(filename);
  DEBUG.println(exists ? " — exists" : " — not found");
  return exists;
}

/**
 * Delete a certificate by name, or all certificates if filename is "".
 */
bool cert_delete(const char *filename) {
  char cmd[64];
  if (filename[0] != '\0') {
    snprintf(cmd, sizeof(cmd), "AT+CERTDEL=%s", filename);
  } else {
    snprintf(cmd, sizeof(cmd), "AT+CERTDEL");
  }
  return gsm_send_at(cmd, "OK", AT_TIMEOUT);
}

/**
 * Ensure the CA certificate is present on the module — uploads it only if
 * it is not already there. Call once from setup() before using HTTPS.
 */
bool cert_ensure_ca_present() {
  DEBUG.println("[CERT] Checking for CA certificate on module ...");
  if (cert_check(CA_CERT_FILENAME)) {
    DEBUG.println("[CERT] CA certificate already present — skipping upload.");
    return true;
  }
  DEBUG.println("[CERT] CA certificate not found — uploading now.");
  return cert_upload_ca();
}

/**
 * Configure SSL parameters for HTTPS — points the module at the CA cert
 * uploaded via cert_ensure_ca_present(). Call once after GPRS/cert are up,
 * before the first https_post().
 *
 * Sequence (manual §8.10):
 *   AT+HTTPSCFG="sslversion",<3>     → TLS1.2
 *   AT+HTTPSCFG="authmode",<1>       → server auth only (use 2 for mutual TLS)
 *   AT+HTTPSCFG="cacert",ca_cert.pem → CA cert must already be uploaded
 */
bool https_configure_ssl() {
  DEBUG.println("[HTTPS] Configuring SSL parameters ...");
  char cmd[64];

  snprintf(cmd, sizeof(cmd), "AT+HTTPSCFG=\"sslversion\",%d", HTTPS_SSL_VERSION);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: sslversion config failed");
    return false;
  }

  snprintf(cmd, sizeof(cmd), "AT+HTTPSCFG=\"authmode\",%d", HTTPS_AUTH_MODE);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: authmode config failed");
    return false;
  }

  // Only attach the CA cert if authentication is enabled
  if (HTTPS_AUTH_MODE != 0) {
    snprintf(cmd, sizeof(cmd), "AT+HTTPSCFG=\"cacert\",%s", CA_CERT_FILENAME);
    if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
      DEBUG.println("[HTTPS] ERROR: cacert config failed");
      return false;
    }
  }
  DEBUG.println("[HTTPS] SSL configuration OK.");
  return true;
}

/**
 * Perform an HTTPS POST with a JSON body.
 *
 * Sequence (manual §8.11-8.14):
 *   AT+HTTPSPARA=url,"<host><path>"
 *   AT+HTTPSPARA=port,<port>
 *   AT+HTTPSSETUP                       → OK  (requires AT+XIIC=1 already up)
 *   AT+HTTPSACTION=2,<len>,2            → OK then ">" prompt (2=POST, type 2=json)
 *   <send body bytes>
 *                                       → +HTTPSRECV: <raw response>
 *                                       → +HTTPSCLOSED: HTTPS Link Closed
 *   AT+HTTPSCLOSE                       → OK
 *
 * @return true if the server responded (+HTTPSRECV: received)
 */
bool https_post_v1(const char *json_payload) {
  DEBUG.println("[HTTPS] Starting HTTPS POST ...");

  size_t payload_len = strlen(json_payload);
  char cmd[200];

  // ── 1) Set URL ────────────────────────────────────────────────────────────
  snprintf(cmd, sizeof(cmd),
           "AT+HTTPSPARA=url,\"%s%s\"", HTTPS_SERVER, HTTPS_PATH);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: HTTPSPARA url failed");
    return false;
  }

  // ── 2) Set port ───────────────────────────────────────────────────────────
  snprintf(cmd, sizeof(cmd), "AT+HTTPSPARA=port,%d", HTTPS_PORT);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: HTTPSPARA port failed");
    return false;
  }

  // ── 3) Open HTTPS connection ──────────────────────────────────────────────
  if (!gsm_send_at("AT+HTTPSSETUP", "OK", HTTP_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: HTTPSSETUP failed");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // ── 4) POST — mode=2, length, type=2(json) ────────────────────────────────
  snprintf(cmd, sizeof(cmd), "AT+HTTPSACTION=2,%u,2", (unsigned)payload_len);
  if (!gsm_send_at(cmd, ">", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: HTTPSACTION no > prompt");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // ── 5) Send body ──────────────────────────────────────────────────────────
  DEBUG.print("[HTTPS] Sending body: ");
  DEBUG.println(json_payload);
  SerialGSM.print(json_payload);

  // ── 6) Wait for server response (+HTTPSRECV:) ─────────────────────────────
  String resp;
  bool got_recv = gsm_send_at("", "+HTTPSRECV:", HTTP_TIMEOUT, &resp);

  if (!got_recv) {
    DEBUG.println("[HTTPS] ERROR: no +HTTPSRECV response");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // Collect until +HTTPSCLOSED: URC or timeout
  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPSCLOSED:") != -1) break;
  }
  DEBUG.print("[HTTPS] Response: ");
  DEBUG.println(resp);

  // ── 7) Close HTTPS socket (HTTPSPARA settings are kept per §8.14) ────────
  gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);

  DEBUG.println("[HTTPS] POST complete.");
  return true;
}

bool https_post_location_json(const char *json_payload) {
  DEBUG.println("[HTTPS] Starting telemetry JSON POST ...");

  size_t payload_len = strlen(json_payload);
  char cmd[200];

  snprintf(cmd, sizeof(cmd),
           "AT+HTTPSPARA=url,\"%s%s\"", HTTPS_SERVER, HTTPS_PATH);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: telemetry HTTPSPARA url failed");
    return false;
  }

  snprintf(cmd, sizeof(cmd), "AT+HTTPSPARA=port,%d", HTTPS_PORT);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: telemetry HTTPSPARA port failed");
    return false;
  }

  if (!gsm_send_at("AT+HTTPSSETUP", "OK", HTTP_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: telemetry HTTPSSETUP failed");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  snprintf(cmd, sizeof(cmd), "AT+HTTPSACTION=2,%u,2", (unsigned)payload_len);
  if (!gsm_send_at(cmd, ">", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTPS] ERROR: telemetry HTTPSACTION no > prompt");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  DEBUG.print("[HTTPS] Sending telemetry JSON: ");
  DEBUG.println(json_payload);
  SerialGSM.print(json_payload);

  String resp;
  bool got_recv = gsm_send_at("", "+HTTPSRECV:", HTTP_TIMEOUT, &resp);

  if (!got_recv) {
    DEBUG.println("[HTTPS] ERROR: telemetry no +HTTPSRECV response");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPSCLOSED:") != -1) break;
  }

  DEBUG.print("[HTTPS] Telemetry response: ");
  DEBUG.println(resp);

  gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);

  bool accepted = (resp.indexOf("HTTP/1.1 201") != -1) || (resp.indexOf("HTTP/1.0 201") != -1) || (resp.indexOf(" 201 ") != -1);

  if (!accepted) {
    DEBUG.println("[HTTPS] ERROR: telemetry POST did not return 201");
  }

  return accepted;
}





// ═════════════════════════════════════════════════════════════════════════════
//  HTTP POST
//  N706 AT Manual §8.1–8.4
//
//  Sequence (from manual POST example, §8.3):
//    AT+HTTPPARA=url,"<host>/<path>"
//    AT+HTTPPARA=port,<port>
//    AT+HTTPSETUP               → OK  (or +HTTPSETUP: FAIL)
//    AT+HTTPACTION=2,<len>,2    → OK  then ">" prompt
//    <send body bytes>
//    (server replies via +HTTPRECV: URC)
//    (connection closed via +HTTPCLOSED: HTTP Link Closed URC)
//    AT+HTTPCLOSE               → OK
//
//  POST type codes (§8.3): 0=form-urlencoded, 1=text, 2=json, 3=xml, 4=html
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Perform HTTP POST with a JSON body.
 * @param body_rejected set when the modem refused the declared body length
 *        (immediate ERROR to AT+HTTPACTION), so the caller can retry smaller.
 * @return true if the server replied 201
 */
bool http_post_json(const char *json_payload, bool *body_rejected) {
  if (body_rejected) *body_rejected = false;
  set_dev_phase("http_upload");
  unsigned long started_at = millis();
  DEBUG.println("[HTTP] Starting ingest JSON POST ...");

  size_t payload_len = strlen(json_payload);
  g_http_status.previous_body_bytes = payload_len;
  INFO.print("[HTTP] bodyBytes="); INFO.print(payload_len);
  INFO.print(" bodyLimitBytes="); INFO.println(g_http_status.body_limit);
  char cmd[220];

  if (!gsm_send_at(SERVER_CMD, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA url failed");
    return finish_http_post(false, 0, started_at);
  }

  snprintf(cmd, sizeof(cmd), "AT+HTTPPARA=port,%d", HTTP_PORT);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA port failed");
    return finish_http_post(false, 0, started_at);
  }

  if (!gsm_send_at("AT+HTTPSETUP", "OK", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSETUP failed");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return finish_http_post(false, 0, started_at);
  }

  snprintf(cmd, sizeof(cmd), "AT+HTTPACTION=2,%u,2", (unsigned)payload_len);
  if (!gsm_send_at(cmd, ">", AT_LONG_TIMEOUT)) {
    // An immediate terminal ERROR (not a timeout) after a successful HTTPSETUP is
    // how the N706 refused a 4367-byte body. Sizes already accepted are excluded.
    const bool rejected = !g_last_at_timed_out
      && payload_len > g_http_status.largest_accepted_bytes;
    if (rejected) {
      size_t limit = payload_len > HTTP_MIN_BODY_LIMIT + 1 ? payload_len - 1 : HTTP_MIN_BODY_LIMIT;
      if (limit < g_http_status.body_limit) g_http_status.body_limit = limit;
      ERR.print("[HTTP] ERROR: HTTPACTION refused bodyBytes="); ERR.print(payload_len);
      ERR.print("; bodyLimitBytes now "); ERR.println(g_http_status.body_limit);
    } else {
      DEBUG.println("[HTTP] ERROR: HTTPACTION no > prompt");
    }
    if (body_rejected) *body_rejected = rejected;
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return finish_http_post(false, 0, started_at, rejected);
  }
  if (payload_len > g_http_status.largest_accepted_bytes)
    g_http_status.largest_accepted_bytes = payload_len;

  DEBUG.print("[HTTP] Sending ingest JSON: ");
  DEBUG.println(json_payload);
  SerialGSM.print(json_payload);

  String resp;
  bool got_recv = gsm_send_at("", "+HTTPRECV:", HTTP_TIMEOUT, &resp);

  if (!got_recv) {
    DEBUG.println("[HTTP] ERROR: no +HTTPRECV response");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return finish_http_post(false, 0, started_at);
  }

  uint32_t t0 = millis();
  g_modem_waiting_for = "HTTP response";
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPCLOSED:") != -1) break;
    service_dev_diagnostics();
    delay(1);
  }
  g_modem_waiting_for = nullptr;

  INFO.print("[HTTP] Ingest response: ");
  INFO.println(resp);

  gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);

  bool accepted =
    (resp.indexOf("HTTP/1.1 201") != -1) || (resp.indexOf("HTTP/1.0 201") != -1) || (resp.indexOf(" 201 ") != -1);

  if (!accepted) {
    DEBUG.println("[HTTP] ERROR: ingest POST did not return 201");
  }

  return finish_http_post(accepted, http_response_status_code(resp), started_at);
}

/**
 * Perform HTTP POST with a JSON body.
 * @return true if the server replied (i.e. +HTTPRECV: received)
 */
bool http_post(const char *json_payload) {
  DEBUG.println("[HTTP] Starting HTTP POST ...");

  size_t payload_len = strlen(json_payload);
  char cmd[200];

  // ── 1) Set URL (host + path, no scheme prefix per manual examples) ────────
  //   snprintf(cmd, sizeof(cmd),"AT+HTTPPARA=url,\"%s%s\"", HTTP_SERVER, HTTP_PATH);
  String CMD = SERVER_CMD;
  if (!gsm_send_at(CMD.c_str(), "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA url failed");
    return false;
  }

  // // ── 2) Set port ───────────────────────────────────────────────────────────
  // snprintf(cmd, sizeof(cmd), "AT+HTTPPARA=port,%d", HTTP_PORT);
  // if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
  //     DEBUG.println("[HTTP] ERROR: HTTPPARA port failed");
  //     return false;
  // }

  // ── 3) Open HTTP connection ───────────────────────────────────────────────
  // Success → OK ; Failure → +HTTPSETUP: FAIL  (§8.2)
  if (!gsm_send_at("AT+HTTPSETUP", "OK", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSETUP failed");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);

    return false;
  }
  // ── 4) POST — mode=2, length, type=2(json) ────────────────────────────────
  // After OK the modem outputs ">" and waits for body bytes (§8.3 example)

  snprintf(cmd, sizeof(cmd), "AT+HTTPACTION=2,%d", (unsigned)payload_len + 2);
  if (!gsm_send_at(cmd, ">", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPACTION no > prompt");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // ── 5) Send body ──────────────────────────────────────────────────────────
  DEBUG.print("[HTTP] Sending body: ");
  DEBUG.println(json_payload);

  // ── 6) Wait for server response (+HTTPRECV:) and connection close ─────────
  // The module emits +HTTPRECV: <headers+body> then +HTTPCLOSED: HTTP Link Closed
  String resp;
  gsm_send_at(json_payload, "OK", HTTP_TIMEOUT, &resp);
  if (resp.indexOf("OK") == -1) {

    DEBUG.println("[HTTP] ERROR: no +Ok response");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // Collect until +HTTPCLOSED URC or timeout
  resp = "";
  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPCLOSED:") != -1) break;
  }
  DEBUG.print("[HTTP] Response: ");
  DEBUG.println(resp);

  // ── 7) Close HTTP socket (clears HTTPPARA settings per §8.4) ─────────────
  gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
  DEBUG.println("[HTTP] POST complete.");
  return true;
}


/**
 * Perform HTTP POST with a JSON body.
 * @return true if the server replied (i.e. +HTTPRECV: received)
 */
bool https_post(const char *json_payload) {
  DEBUG.println("[HTTP] Starting HTTP POST ...");

  size_t payload_len = strlen(json_payload);
  char cmd[200];

  // AT+HTTPSCFG=”sslversion”,0
  //   OK
  // Set the SSL version to SSL3.0.


  if (!gsm_send_at("AT+HTTPSCFG?", "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSCFG?  failed");
    return false;
  }
  if (!gsm_send_at("AT+HTTPSCFG=\"sslversion\",3", "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: sslversion  failed");
    return false;
  }

  // AT + HTTPSCFG ="authmode", 0

  if (!gsm_send_at("AT+HTTPSCFG=\"authmode\",0", "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSCFG  failed");
    return false;
  }

  // ── 1) Set URL (host + path, no scheme prefix per manual examples) ────────
  //   snprintf(cmd, sizeof(cmd),"AT+HTTPSPARA=url,\"%s%s\"", HTTP_SERVER, HTTP_PATH);
  String CMD = "AT+HTTPSPARA=url,\"https://admin.stepwhere.in/api/location-store\"";
  if (!gsm_send_at(CMD.c_str(), "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPSARA url failed");
    return false;
  }

  // ── 2) Set port ───────────────────────────────────────────────────────────
  snprintf(cmd, sizeof(cmd), "AT+HTTPSPARA=port,%d", HTTPS_PORT);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA port failed");
    return false;
  }

  // ── 3) Open HTTP connection ───────────────────────────────────────────────
  // Success → OK ; Failure → +HTTPSETUP: FAIL  (§8.2)
  if (!gsm_send_at("AT+HTTPSSETUP", "OK", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSETUP failed");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);

    return false;
  }
  // ── 4) POST — mode=2, length, type=2(json) ────────────────────────────────
  // After OK the modem outputs ">" and waits for body bytes (§8.3 example)

  snprintf(cmd, sizeof(cmd), "AT+HTTPSACTION=2,%d,0", (unsigned)payload_len + 2);
  if (!gsm_send_at(cmd, ">", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPACTION no > prompt");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // ── 5) Send body ──────────────────────────────────────────────────────────
  DEBUG.print("[HTTP] Sending body: ");
  DEBUG.println(json_payload);

  // ── 6) Wait for server response (+HTTPRECV:) and connection close ─────────
  // The module emits +HTTPRECV: <headers+body> then +HTTPCLOSED: HTTP Link Closed
  String resp;
  gsm_send_at(json_payload, "OK", HTTP_TIMEOUT, &resp);
  if (resp.indexOf("OK") == -1) {

    DEBUG.println("[HTTP] ERROR: no +Ok response");
    gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // Collect until +HTTPCLOSED URC or timeout
  resp = "";
  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPSCLOSED:") != -1) break;
  }
  DEBUG.print("[HTTP] Response: ");
  DEBUG.println(resp);

  // ── 7) Close HTTP socket (clears HTTPPARA settings per §8.4) ─────────────
  gsm_send_at("AT+HTTPSCLOSE", "OK", AT_TIMEOUT);
  DEBUG.println("[HTTP] POST complete.");
  return true;
}

void print_res() {
  String resp = "";
  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPCLOSED:") != -1) break;
  }
  DEBUG.print("[HTTP] Response: ");
  DEBUG.println(resp);
}

bool neoway_test(const char *json_payload) {


#if 1
  DEBUG.println("[HTTP] Starting HTTP POST ...");

  size_t payload_len = strlen(json_payload);
  char cmd[200];

  // ── 1) Set URL (host + path, no scheme prefix per manual examples) ────────
  //   snprintf(cmd, sizeof(cmd),"AT+HTTPPARA=url,\"%s%s\"", HTTP_SERVER, HTTP_PATH);
  String CMD = NEOWWAY_SERVER;
  if (!gsm_send_at(CMD.c_str(), "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA url failed");
    return false;
  }

  // // ── 2) Set port ───────────────────────────────────────────────────────────
  snprintf(cmd, sizeof(cmd), "AT+HTTPPARA=port,%d", 80);
  if (!gsm_send_at(cmd, "OK", AT_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPPARA port failed");
    return false;
  }

  // ── 3) Open HTTP connection ───────────────────────────────────────────────
  // Success → OK ; Failure → +HTTPSETUP: FAIL  (§8.2)
  if (!gsm_send_at("AT+HTTPSETUP", "OK", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPSETUP failed");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return false;
  }

  // ── 4) POST — mode=2, length, type=2(json) ────────────────────────────────
  // After OK the modem outputs ">" and waits for body bytes (§8.3 example)

  // snprintf(cmd, sizeof(cmd), "AT+HTTPACTION=2,%d", (unsigned)payload_len+2);
  snprintf(cmd, sizeof(cmd), "AT+HTTPACTION=0");
  if (!gsm_send_at(cmd, ">", AT_LONG_TIMEOUT)) {
    DEBUG.println("[HTTP] ERROR: HTTPACTION no > prompt");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return false;
  }
  /*
  // ── 5) Send body ──────────────────────────────────────────────────────────
  DEBUG.print("[HTTP] Sending body: ");
  DEBUG.println(json_payload);

  // ── 6) Wait for server response (+HTTPRECV:) and connection close ─────────
  // The module emits +HTTPRECV: <headers+body> then +HTTPCLOSED: HTTP Link Closed
  String resp;
  gsm_send_at(json_payload, "OK", HTTP_TIMEOUT, &resp);
  if (resp.indexOf("OK") == -1) {

    DEBUG.println("[HTTP] ERROR: no +Ok response");
    gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
    return false;
  }
*/
  // Collect until +HTTPCLOSED URC or timeout




  String resp = "";
  uint32_t t0 = millis();
  while (millis() - t0 < 5000) {
    while (SerialGSM.available()) resp += (char)SerialGSM.read();
    if (resp.indexOf("+HTTPCLOSED:") != -1) break;
  }
  DEBUG.print("[HTTP] Response: ");
  DEBUG.println(resp);

  // ── 7) Close HTTP socket (clears HTTPPARA settings per §8.4) ─────────────
  gsm_send_at("AT+HTTPCLOSE", "OK", AT_TIMEOUT);
  DEBUG.println("[HTTP] POST complete.");
  return true;
#else

  SerialGSM.println("AT+HTTPPARA=url,\"121.15.200.97/Service1.asmx/GetNote\"");
  print_res();
  SerialGSM.println("AT+HTTPPARA=port,8080");
  print_res();

  SerialGSM.println("AT+HTTPSETUP");
  print_res();

  SerialGSM.println("AT+HTTPACTION=2,25");
  print_res();
  SerialGSM.println("MAC=NEOWAY&DATA=0123456");
  print_res();
#endif
}

// ═════════════════════════════════════════════════════════════════════════════
//  GPS HELPERS
// ═════════════════════════════════════════════════════════════════════════════

bool gps_fix_is_fresh() {
  return false; // This diagnostic build tests radio fallback only.
}

void clear_wifi_observations() {
  g_wifi_count = 0;
  g_wifi_scan.status = "skipped_gps_fix";
  g_wifi_scan.duration_ms = 0;
  g_wifi_scan.ap_count = 0;
  g_wifi_scan.raw[0] = '\0';
  g_wifi_scan.raw_truncated = false;
  g_wifi_scan.error[0] = '\0';
  g_wifi_scan.attempts = 0;
  g_wifi_scan.quiet_known = false;
  g_wifi_scan.quiet_ms = 0;
}

bool normalize_wifi_mac(const char *input, char *output) {
  char hex[12];
  uint8_t count = 0;
  const size_t length = strlen(input);
  if (length != 12 && length != 17) return false;
  for (size_t i = 0; i < length; ++i) {
    if (length == 17 && i % 3 == 2) {
      if (input[i] != ':') return false;
      continue;
    }
    if (!isxdigit((unsigned char)input[i]) || count >= 12) return false;
    hex[count++] = toupper((unsigned char)input[i]);
  }
  if (count != 12) return false;
  for (uint8_t i = 0; i < 6; ++i) {
    output[i * 3] = hex[i * 2];
    output[i * 3 + 1] = hex[i * 2 + 1];
    output[i * 3 + 2] = i == 5 ? '\0' : ':';
  }
  return true;
}

bool parse_wifi_ap_line(const char *line) {
  if (strncmp(line, "+WIFIAPSCAN:", 12) != 0) return false;
  char input_mac[18], mac[18];
  const char *value = line + 12;
  while (*value == ' ' || *value == '\t') ++value;
  const char *comma = strchr(value, ',');
  if (!comma || (size_t)(comma - value) >= sizeof(input_mac)) return false;
  memcpy(input_mac, value, comma - value);
  input_mac[comma - value] = '\0';
  if (!normalize_wifi_mac(input_mac, mac)) return false;
  char *tail;
  errno = 0;
  const long rssi = strtol(comma + 1, &tail, 10);
  if (errno == ERANGE || tail == comma + 1 || *tail != ',' || rssi < -128 || rssi > 0) return false;
  value = tail + 1;
  errno = 0;
  const long channel = strtol(value, &tail, 10);
  if (errno == ERANGE || tail == value || channel < 1 || channel > 14) return false;
  while (*tail == ' ' || *tail == '\t') ++tail;
  if (*tail != '\0') return false;
  if (g_wifi_scan.ap_count < 65535) ++g_wifi_scan.ap_count;
  uint8_t index = g_wifi_count;
  for (uint8_t i = 0; i < g_wifi_count; ++i) {
    if (strcmp(g_wifi_points[i].mac, mac) == 0) {
      if (rssi <= g_wifi_points[i].rssi) return true;
      index = i;
      break;
    }
  }
  if (index == g_wifi_count && g_wifi_count == 16) {
    index = 0;
    for (uint8_t i = 1; i < 16; ++i)
      if (g_wifi_points[i].rssi < g_wifi_points[index].rssi) index = i;
    if (rssi <= g_wifi_points[index].rssi) return true;
  } else if (index == g_wifi_count) {
    ++g_wifi_count;
  }
  strcpy(g_wifi_points[index].mac, mac);
  g_wifi_points[index].rssi = rssi;
  g_wifi_points[index].channel = channel;
  g_wifi_points[index].observed_at = millis();
  return true;
}

bool wifi_scan_power_safe(uint32_t started, uint32_t &last_power_check) {
  if (millis() - last_power_check >= 1000UL) {
    last_power_check = millis();
    const float battery_mv = adc_read_battery_mv_calibrated() * 2.0f;
    if (battery_mv > 0 && battery_mv < BATTERY_LOW_OFF * 1000.0f) {
      ldo_enable(false);
      g_status.reset();
      g_diagnostics.low_battery = true;
      g_wifi_scan.status = "command_failed";
      strcpy(g_wifi_scan.error, "Low battery: scan aborted; reset required");
      g_wifi_scan.duration_ms = millis() - started;
      g_wifi_count = 0;
      g_wifi_modem_state_unknown = true;
      ERR.println("[WIFI] Low battery: modem power removed; reset required.");
      return false;
    }
  }
  return true;
}

void scan_wifi_access_points() {
  set_dev_phase("wifi_scan");
  service_dev_diagnostics();
  g_modem_waiting_for = "AT+WIFIAPSCAN";
  // Read complete lines, not the generic AT helper's short-response path.
  while (SerialGSM.available()) SerialGSM.read();
  DEBUG.println("[WIFI][TTL] >> AT+WIFIAPSCAN (30-second timeout)");
  g_wifi_scan_started_at = millis();
  SerialGSM.print("AT+WIFIAPSCAN\r\n");
  const uint32_t started = g_wifi_scan_started_at;
  uint32_t last_power_check = started;
  char line[192];
  uint16_t line_length = 0, raw_length = 0;
  bool line_overflow = false, invalid_ap = false;
  while (millis() - started < 30000UL) {
    while (millis() - started < 30000UL && SerialGSM.available()) {
      if (!wifi_scan_power_safe(started, last_power_check)) {
        g_modem_waiting_for = nullptr;
        return;
      }
      const char c = (char)SerialGSM.read();
      DEBUG.write(c); // Unabridged TTL, bounded diagnostic copy.
      if (raw_length < sizeof(g_wifi_scan.raw) - 1) {
        g_wifi_scan.raw[raw_length++] = c;
        g_wifi_scan.raw[raw_length] = '\0';
      } else g_wifi_scan.raw_truncated = true;
      if (c == '\r') continue;
      if (c != '\n') {
        if (line_length < sizeof(line) - 1) line[line_length++] = c;
        else line_overflow = true;
        continue;
      }
      line[line_length] = '\0';
      if (!line_overflow) {
        if (strcmp(line, "OK") == 0 || strcmp(line, "ERROR") == 0
            || strncmp(line, "+CME ERROR:", 11) == 0) {
          g_wifi_scan.duration_ms = millis() - started;
          if (strcmp(line, "OK") != 0) {
            g_wifi_count = 0;
            g_wifi_scan.status = "command_failed";
            snprintf(g_wifi_scan.error, sizeof(g_wifi_scan.error), "%s", line);
          } else if (g_wifi_count) g_wifi_scan.status = "success";
          else {
            g_wifi_scan.status = invalid_ap ? "parse_failed" : "no_results";
            if (invalid_ap) strcpy(g_wifi_scan.error, "No valid Wi-Fi observations");
          }
          DEBUG.print("[WIFI][TTL] status="); DEBUG.print(g_wifi_scan.status);
          DEBUG.print(" retainedAPs="); DEBUG.print(g_wifi_count);
          DEBUG.print(" elapsedMs="); DEBUG.println(g_wifi_scan.duration_ms);
          g_modem_waiting_for = nullptr;
          return;
        }
        if (strncmp(line, "+WIFIAPSCAN:", 12) == 0 && !parse_wifi_ap_line(line)) invalid_ap = true;
      } else invalid_ap = true;
      line_length = 0;
      line_overflow = false;
    }
    if (!wifi_scan_power_safe(started, last_power_check)) {
      g_modem_waiting_for = nullptr;
      return;
    }
    service_dev_diagnostics();
    delay(1);
  }
  g_wifi_scan.duration_ms = millis() - started;
  g_wifi_scan.status = "timeout";
  strcpy(g_wifi_scan.error, "Unresolved scan timeout; reset required");
  g_wifi_count = 0;
  g_wifi_modem_state_unknown = true;
  g_modem_waiting_for = nullptr;
  ERR.println("[WIFI] Scan timed out without a terminal reply. All modem commands/uploads paused; reset the board.");
}

void probe_wifi_error_state() {
  if (g_wifi_modem_state_unknown) return;
  if (g_wifi_error_probe_attempted && millis() - g_wifi_error_probe_at < 60000UL) return;
  g_wifi_error_probe_attempted = true;
  g_wifi_error_probe_at = millis();
  set_dev_phase("wifi_error_diagnostics");
  INFO.println("[WIFI][DIAG] Terminal scan failure; capturing modem state (at most once/minute).");
  capture_modem_state(g_wifi_failure_modem_state);
}

bool diagnostic_timeout_requires_reset() {
  if (!g_last_at_timed_out || strcmp(g_wifi_experiment.state, "running") != 0) return false;
  g_wifi_modem_state_unknown = true;
  ERR.println("[WIFI][EXPERIMENT] Unresolved command timeout; no further commands/uploads. Reset required.");
  return true;
}

bool capture_modem_state(ModemStateSnapshot &snapshot) {
  snapshot = ModemStateSnapshot();
  snapshot.captured = true;
  snapshot.captured_at = millis();
  const char *commands[] = {"AT+CFUN?", "AT+CEREG?", "AT+XIIC?"};
  uint32_t last_power_check = millis() - 1000UL;
  for (uint8_t index = 0; index < 3; ++index) {
    if (strcmp(g_wifi_experiment.state, "running") == 0
        && !wifi_scan_power_safe(snapshot.captured_at, last_power_check)) return false;
    String reply;
    bool ok = gsm_send_at(commands[index], "OK", AT_TIMEOUT, &reply);
    if (g_last_at_timed_out) {
      g_wifi_modem_state_unknown = true;
      ERR.println("[WIFI][DIAG] Probe timed out; modem state unknown. Commands/uploads paused; reset required.");
      return false;
    }
    if (!ok) continue; // A terminal error is known completion, not an idle-state guess.
    if (index == 0) {
      const String value = at_response_value(reply, "+CFUN:");
      char extra = '\0';
      int mode = -1;
      if (sscanf(value.c_str(), " %d %c", &mode, &extra) == 1 && mode >= 0 && mode <= 127)
        snapshot.cfun = mode;
    } else if (index == 1) {
      const String value = at_response_value(reply, "+CEREG:");
      int mode = -1, status = -1;
      if (sscanf(value.c_str(), " %d , %d", &mode, &status) == 2
          && mode >= 0 && mode <= 5 && status >= 0 && status <= 10)
        snapshot.registration_status = status;
    } else {
      parse_xiic_state(at_response_value(reply, "+XIIC:"), snapshot);
    }
  }
  return true;
}

void skip_wifi_experiment_stage(WifiExperimentStage &stage, const char *reason) {
  stage.status = "skipped";
  stage.skip_reason = reason;
  INFO.print("[WIFI][EXPERIMENT] stage="); INFO.print(stage.name);
  INFO.print(" skipped reason="); INFO.println(reason);
}

uint32_t diagnostic_battery_mv() {
  return (uint32_t)(adc_read_battery_mv_calibrated() * 2.0f);
}

bool wifi_experiment_quiet_wait(uint32_t duration_ms) {
  const uint32_t started = millis();
  uint32_t last_check = started - 1000UL;
  while (millis() - started < duration_ms) {
    if (!wifi_scan_power_safe(started, last_check)) return false;
    while (millis() - started < duration_ms && SerialGSM.available())
      DEBUG.write((uint8_t)SerialGSM.read());
    service_dev_diagnostics();
    delay(1);
  }
  return true;
}

void run_wifi_experiment_stage(WifiExperimentStage &stage, uint8_t index) {
  clear_cellular_tower_observation();
  clear_wifi_observations();
  stage.status = "running";
  stage.started_at = millis();
  stage.battery_before_mv = diagnostic_battery_mv();
  uint32_t last_check = millis() - 1000UL;
  if (!wifi_scan_power_safe(stage.started_at, last_check)) {
    stage.status = "aborted";
    strcpy(stage.error, g_wifi_scan.error);
    stage.battery_after_mv = diagnostic_battery_mv();
    return;
  }
  set_dev_phase(stage.name);
  INFO.print("[WIFI][EXPERIMENT] START stage="); INFO.println(stage.name);
  if (!capture_modem_state(stage.modem_state)) {
    stage.status = g_diagnostics.low_battery ? "aborted" : "timeout";
    strcpy(stage.error, g_diagnostics.low_battery ? g_wifi_scan.error :
      "Modem-state query timed out; reset required");
    stage.battery_after_mv = diagnostic_battery_mv();
    return;
  }
  if (!stage.modem_state.data_known) {
    skip_wifi_experiment_stage(stage, "data_state_unverified");
  } else if (stage.modem_state.cfun != 1) {
    skip_wifi_experiment_stage(stage, "full_functionality_unverified");
  } else if (index == 0 && stage.modem_state.data_connected) {
    skip_wifi_experiment_stage(stage, "data_already_connected");
  } else if (index != 0 && !stage.modem_state.data_connected) {
    g_status.gprs_connected = false;
    skip_wifi_experiment_stage(stage, "data_not_connected");
  } else {
    uint32_t cell_completed_at = 0;
    if (index >= 2) {
      if (!query_serving_cell_tower()) {
        if (diagnostic_timeout_requires_reset()) {
          stage.status = "timeout";
          strcpy(stage.error, "NETDMSG timed out; reset required");
        } else skip_wifi_experiment_stage(stage, "netdmsg_failed");
        stage.battery_after_mv = diagnostic_battery_mv();
        return;
      }
      cell_completed_at = g_last_at_completed_at;
      if (index == 3 && !wifi_experiment_quiet_wait(1000)) {
        stage.status = "aborted";
        strcpy(stage.error, g_wifi_scan.error);
        stage.battery_after_mv = diagnostic_battery_mv();
        return;
      }
    }
    stage.scan_attempted = true;
    scan_wifi_access_points();
    stage.scan_started_at = g_wifi_scan_started_at;
    stage.duration_ms = g_wifi_scan.duration_ms;
    stage.status = g_wifi_modem_state_unknown && strcmp(g_wifi_scan.status, "timeout") != 0
      ? "aborted" : g_wifi_scan.status;
    stage.observed_aps = g_wifi_scan.ap_count;
    stage.retained_aps = g_wifi_count;
    stage.has_command_gap = index >= 2;
    stage.command_gap_ms = stage.has_command_gap ? stage.scan_started_at - cell_completed_at : 0;
    strncpy(stage.raw, g_wifi_scan.raw, sizeof(stage.raw) - 1);
    stage.raw[sizeof(stage.raw) - 1] = '\0';
    stage.raw_truncated = g_wifi_scan.raw_truncated || strlen(g_wifi_scan.raw) > sizeof(stage.raw) - 1;
    strcpy(stage.error, g_wifi_scan.error);
  }
  stage.battery_after_mv = diagnostic_battery_mv();
  INFO.print("[WIFI][EXPERIMENT] COMPLETE stage="); INFO.print(stage.name);
  INFO.print(" status="); INFO.print(stage.status);
  INFO.print(" observedAPs="); INFO.print(stage.observed_aps);
  INFO.print(" retainedAPs="); INFO.println(stage.retained_aps);
}

void run_boot_wifi_experiment() {
  if (g_wifi_experiment.attempted) return;
  g_wifi_experiment.attempted = true; // Never repeat this matrix after a rail recovery.
  g_wifi_experiment.state = "running";
  INFO.println("[WIFI][EXPERIMENT] Boot comparison starting. GPS disabled; uploads wait until comparison finishes.");
  for (uint8_t index = 0; index < 4; ++index) {
    if (index > 0 && !wifi_experiment_quiet_wait(2000)) break;
    if (index == 1) {
      set_dev_phase("experiment_data_connect");
      g_status.gprs_connected = gprs_on();
      if (!g_status.gprs_connected) {
        if (g_wifi_modem_state_unknown) break;
        for (uint8_t remaining = index; remaining < 4; ++remaining)
          skip_wifi_experiment_stage(g_wifi_experiment.stages[remaining], "data_activation_failed");
        break;
      }
    }
    run_wifi_experiment_stage(g_wifi_experiment.stages[index], index);
    if (g_wifi_modem_state_unknown) break;
  }
  bool skipped = false;
  for (WifiExperimentStage &stage : g_wifi_experiment.stages) {
    if (g_wifi_modem_state_unknown && strcmp(stage.status, "not_started") == 0) {
      stage.status = "aborted";
      strcpy(stage.error, "Earlier unresolved timeout or low battery; reset required");
    }
    if (strcmp(stage.status, "skipped") == 0) skipped = true;
  }
  g_wifi_experiment.state = g_wifi_modem_state_unknown ? "aborted" :
    (skipped ? "completed_with_skips" : "completed");
  g_wifi_awake_window_started_at = millis();
  g_wifi_awake_window_started = true;
  clear_wifi_observations();
  clear_cellular_tower_observation();
  INFO.print("[WIFI][EXPERIMENT] state="); INFO.print(g_wifi_experiment.state);
  INFO.print(" awakeUntilUptimeMs="); INFO.println(g_wifi_awake_window_started_at + WIFI_DIAGNOSTIC_AWAKE_MS);
  // The full matrix (raw replies, modem state) is TTL-only; uploads carry a compact summary.
  print_wifi_experiment_json();
}

// Drains/streams unsolicited modem output without sending commands.
bool wifi_quiet_wait(uint32_t duration_ms, const char *reason) {
  INFO.print("[WIFI][TTL] quiet wait "); INFO.print(duration_ms);
  INFO.print(" ms ("); INFO.print(reason); INFO.println(")");
  set_dev_phase("wifi_quiet_wait");
  return wifi_experiment_quiet_wait(duration_ms);
}

void run_wifi_scan_with_diagnostics() {
  // Scans returned ERROR after ~3 s while LTE was still active from a recent upload
  // or data activation, and succeeded on a quiet connected link. Keep the data
  // session up, but scan only after WIFI_SCAN_QUIET_MS without data activity.
  if (g_data_activity_seen) {
    const uint32_t since = millis() - g_last_data_activity_at;
    if (since < WIFI_SCAN_QUIET_MS
        && !wifi_quiet_wait(WIFI_SCAN_QUIET_MS - since, "recent data activity")) {
      set_dev_phase("modem_state_unknown");
      return;
    }
  }
  for (uint8_t attempt = 1; attempt <= 2; ++attempt) {
    // The scanner does not reset its own result fields; never let a first-attempt
    // ERROR or raw text leak into the retry result.
    clear_wifi_observations();
    const bool quiet_known = g_data_activity_seen;
    const uint32_t quiet_ms = millis() - g_last_data_activity_at;
    scan_wifi_access_points();
    g_wifi_scan.attempts = attempt;
    g_wifi_scan.quiet_known = quiet_known;
    g_wifi_scan.quiet_ms = quiet_known ? quiet_ms : 0;
    INFO.print("[WIFI][TTL] attempt="); INFO.print(attempt);
    INFO.print(" quietMs=");
    if (quiet_known) INFO.println(quiet_ms); else INFO.println("unknown");
    if (g_wifi_modem_state_unknown) { set_dev_phase("modem_state_unknown"); return; }
    // Only a terminal ERROR is retried; timeouts already require a reset.
    if (attempt == 2 || strcmp(g_wifi_scan.status, "command_failed") != 0) break;
    if (!wifi_quiet_wait(WIFI_SCAN_RETRY_DELAY_MS, "retry after scan ERROR")) {
      set_dev_phase("modem_state_unknown");
      return;
    }
  }
  if (strcmp(g_wifi_scan.status, "success") == 0 || strcmp(g_wifi_scan.status, "no_results") == 0) {
    g_wifi_scan_failures = 0;
  } else if (g_wifi_scan_failures < UINT8_MAX) {
    ++g_wifi_scan_failures;
  }
  INFO.print("[WIFI][TTL] consecutiveScanFailures="); INFO.println(g_wifi_scan_failures);
  if (strcmp(g_wifi_scan.status, "command_failed") == 0) probe_wifi_error_state();
  set_dev_phase(g_wifi_modem_state_unknown ? "modem_state_unknown" : "ready");
}

void gps_check_timeout() {
  g_status.is_gps_ready = false; // No GPS no-fix reset in this diagnostic build.
}

/** Preserve the application interface without enabling GPS in the dev experiment. */
void gps_feed(uint32_t duration_ms) {
  (void)duration_ms; // No UART reception, parser work or GPS collection delay.
  g_status.is_gps_ready = false;
  g_loc.current_lat = g_loc.current_lon = 0;
  g_loc.num_satellite = 0;
}

/** Print current fix to debug console */
void print_gps_info() {
  if (g_status.is_gps_ready) {
    INFO.print("[GPS] Lat: ");
    INFO.print(g_loc.current_lat, 6);
    INFO.print("  Lon: ");
    INFO.println(g_loc.current_lon, 6);
    INFO.print("[GPS] Sats: ");
    INFO.println(g_loc.num_satellite);
  } else {
    INFO.println("[GPS] Location: INVALID");
    return;
  }
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[32];
    snprintf(buf, sizeof(buf), "[GPS] UTC %04d-%02d-%02d %02d:%02d:%02d",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    INFO.println(buf);
  }
  /*
  if (gps.speed.isValid()) {
    INFO.print("[GPS] Speed km/h: ");
    INFO.println(gps.speed.kmph(), 1);
  }
  if (gps.altitude.isValid()) {
    INFO.print("[GPS] Alt m: ");
    INFO.println(gps.altitude.meters(), 1);
  }
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[32];
    snprintf(buf, sizeof(buf), "[GPS] UTC %04d-%02d-%02d %02d:%02d:%02d",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    INFO.println(buf);
  }
  INFO.print("[GPS] Sats: ");
  INFO.println(gps.satellites.isValid() ? (int)gps.satellites.value() : -1);
  */
}

// ═════════════════════════════════════════════════════════════════════════════
//  JSON BUILDER
// ═════════════════════════════════════════════════════════════════════════════

void build_json(char *buf, size_t buf_size, const String &imei) {
  double lat = g_loc.current_lat;  //gps.location.isValid() ? gps.location.lat() : 0.0;
  double lon = g_loc.current_lon;  //gps.location.isValid() ? gps.location.lng() : 0.0;
  // double spd = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  // double alt = gps.altitude.isValid() ? gps.altitude.meters() : 0.0;
  int sat = g_loc.num_satellite;  //gps.satellites.isValid() ? (int)gps.satellites.value() : 0;

  snprintf(buf, buf_size,
           "{\"imei\":\"%s\","
           "\"lat\":%.6f,\"lon\":%.6f,"
           /* "\"speed\":%.1f,\"alt\":%.1f,"*/
           "\"sat\":%d,\"valid\":%s}",
           imei.c_str(), lat, lon, /*spd, alt,*/ sat,
           gps.location.isValid() ? "true" : "false");
}

String json_escape(const String &value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); i++) {
    char c = value.charAt(i);
    switch (c) {
      case '"': escaped += "\\\""; break;
      case '\\': escaped += "\\\\"; break;
      case '\b': escaped += "\\b"; break;
      case '\f': escaped += "\\f"; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default:
        if ((uint8_t)c < 0x20) {
          char buf[7];
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          escaped += buf;
        } else {
          escaped += c;
        }
        break;
    }
  }
  return escaped;
}

void append_tenths_json(String &body, int16_t value) {
  if (value % 10 == 0) {
    body += String(value / 10);
  } else {
    body += String(value / 10.0f, 1);
  }
}

void append_json_bool(String &body, bool value) {
  body += value ? "true" : "false";
}

void append_json_nullable_string(String &body, const char *value) {
  if (!value || !value[0]) {
    body += "null";
    return;
  }
  body += '"';
  // Escape incrementally: never allocate a second copy of a long diagnostic reply.
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor; ++cursor) {
    switch (*cursor) {
      case '"': body += "\\\""; break;
      case '\\': body += "\\\\"; break;
      case '\n': body += "\\n"; break;
      case '\r': body += "\\r"; break;
      case '\t': body += "\\t"; break;
      case '\b': body += "\\b"; break;
      case '\f': body += "\\f"; break;
      default:
        if (*cursor < 0x20) {
          char escaped[7];
          snprintf(escaped, sizeof(escaped), "\\u%04x", *cursor);
          body += escaped;
        } else body += (char)*cursor;
    }
  }
  body += '"';
}

size_t diagnostic_escaped_length(const char *value) {
  size_t length = 2;
  for (const unsigned char *cursor = (const unsigned char *)value; *cursor; ++cursor) {
    if (*cursor < 0x20) length += 6; // Conservative for CR/LF and all controls.
    else length += (*cursor == '"' || *cursor == '\\') ? 2 : 1;
  }
  return length;
}

void append_nullable_uint_json(String &body, bool available, uint32_t value) {
  if (available) body += String(value);
  else body += "null";
}

void append_modem_state_json(String &body, const ModemStateSnapshot &snapshot) {
  if (!snapshot.captured) { body += "null"; return; }
  body += "{\"capturedAtUptimeMs\":";
  body += String(snapshot.captured_at);
  body += ",\"cfun\":";
  append_nullable_uint_json(body, snapshot.cfun >= 0, snapshot.cfun);
  body += ",\"registrationStatus\":";
  append_nullable_uint_json(body, snapshot.registration_status >= 0, snapshot.registration_status);
  body += ",\"dataConnected\":";
  if (snapshot.data_known) append_json_bool(body, snapshot.data_connected);
  else body += "null";
  body += ",\"gprsIp\":";
  append_json_nullable_string(body, snapshot.ip);
  body += "}";
}

// Full boot-comparison record (raw replies, modem state, battery). Too large for
// the N706 HTTP body limit alongside telemetry, so it is printed on TTL only.
void append_wifi_experiment_json(String &body) {
  body += ",\"wifiExperiment\":{\"experimentVersion\":1,\"modemRevision\":";
  append_json_nullable_string(body, g_wifi_experiment.modem_revision);
  body += ",\"mcuResetFlags\":";
  body += String(g_mcu_reset_flags);
  body += ",\"state\":";
  append_json_nullable_string(body, g_wifi_experiment.state);
  body += ",\"gpsDisabled\":true,\"sleepSuppressed\":";
  append_json_bool(body, g_wifi_sleep_suppressed);
  body += ",\"awakeUntilUptimeMs\":";
  append_nullable_uint_json(body, g_wifi_awake_window_started,
    g_wifi_awake_window_started_at + WIFI_DIAGNOSTIC_AWAKE_MS);
  body += ",\"stages\":{";
  for (uint8_t index = 0; index < 4; ++index) {
    const WifiExperimentStage &stage = g_wifi_experiment.stages[index];
    if (index) body += ',';
    append_json_nullable_string(body, stage.name);
    body += ":{\"status\":";
    append_json_nullable_string(body, stage.status);
    body += ",\"skipReason\":";
    append_json_nullable_string(body, stage.skip_reason);
    body += ",\"startedAtUptimeMs\":";
    append_nullable_uint_json(body, stage.started_at != 0, stage.started_at);
    body += ",\"scanStartedAtUptimeMs\":";
    append_nullable_uint_json(body, stage.scan_attempted, stage.scan_started_at);
    body += ",\"durationMs\":";
    append_nullable_uint_json(body, stage.scan_attempted, stage.duration_ms);
    body += ",\"observedAccessPointCount\":";
    body += String(stage.observed_aps);
    body += ",\"retainedAccessPointCount\":";
    body += String(stage.retained_aps);
    body += ",\"commandGapMs\":";
    append_nullable_uint_json(body, stage.has_command_gap, stage.command_gap_ms);
    body += ",\"modemState\":";
    append_modem_state_json(body, stage.modem_state);
    body += ",\"batteryBeforeMv\":";
    append_nullable_uint_json(body, stage.battery_before_mv > 0, stage.battery_before_mv);
    body += ",\"batteryAfterMv\":";
    append_nullable_uint_json(body, stage.battery_after_mv > 0, stage.battery_after_mv);
    body += ",\"rawResponse\":";
    append_json_nullable_string(body, stage.raw);
    body += ",\"rawResponseTruncated\":";
    append_json_bool(body, stage.raw_truncated);
    body += ",\"error\":";
    append_json_nullable_string(body, stage.error);
    body += '}';
  }
  body += "}}";
}

void print_wifi_experiment_json() {
  String body;
  if (!body.reserve(3072)) {
    ERR.println("[WIFI][EXPERIMENT] Not enough heap to print the boot comparison.");
    return;
  }
  append_wifi_experiment_json(body);
  // Drop the leading comma so the TTL line is standalone JSON: {"wifiExperiment":{...}}
  INFO.print("[WIFI][EXPERIMENT][JSON] {");
  INFO.print(body.c_str() + 1);
  INFO.println("}");
}

// Upload summary: per-stage outcome only, roughly 0.9 KB. A separate key (not
// wifiExperiment) so backends without the new schema simply strip it.
void append_wifi_experiment_summary_json(String &body) {
  body += ",\"wifiExperimentSummary\":{\"modemRevision\":";
  append_json_nullable_string(body, g_wifi_experiment.modem_revision);
  body += ",\"mcuResetFlags\":";
  body += String(g_mcu_reset_flags);
  body += ",\"state\":";
  append_json_nullable_string(body, g_wifi_experiment.state);
  body += ",\"stages\":{";
  for (uint8_t index = 0; index < 4; ++index) {
    const WifiExperimentStage &stage = g_wifi_experiment.stages[index];
    if (index) body += ',';
    append_json_nullable_string(body, stage.name);
    body += ":{\"status\":";
    append_json_nullable_string(body, stage.status);
    body += ",\"skipReason\":";
    append_json_nullable_string(body, stage.skip_reason);
    body += ",\"durationMs\":";
    append_nullable_uint_json(body, stage.scan_attempted, stage.duration_ms);
    body += ",\"observedAccessPointCount\":";
    body += String(stage.observed_aps);
    body += ",\"retainedAccessPointCount\":";
    body += String(stage.retained_aps);
    body += ",\"commandGapMs\":";
    append_nullable_uint_json(body, stage.has_command_gap, stage.command_gap_ms);
    body += ",\"error\":";
    append_json_nullable_string(body, stage.error);
    body += '}';
  }
  body += "}}";
}

bool wifi_scan_failed() {
  return strcmp(g_wifi_scan.status, "success") != 0
    && strcmp(g_wifi_scan.status, "no_results") != 0
    && strncmp(g_wifi_scan.status, "skipped_", 8) != 0;
}

const char *telemetry_detail_name(TelemetryDetail detail) {
  switch (detail) {
    case TELEMETRY_DETAIL_FULL: return "full";
    case TELEMETRY_DETAIL_COMPACT: return "compact";
    default: return "minimal";
  }
}

const char *charge_status_name(ChargeStatus status) {
  switch (status) {
    case CHARGE_CHARGING: return "charging";
    case CHARGE_COMPLETE: return "complete";
    case CHARGE_ERROR: return "error";
    case CHARGE_IDLE: return "idle";
    default: return "unknown";
  }
}

void append_telemetry_debug_json(String &body, int battery_percent,
                                 int battery_mv, TelemetryDetail detail) {
  // Raw modem text is only useful when a query failed; successful replies are
  // already represented by the parsed cellular/wifi fields.
  const bool full = detail == TELEMETRY_DETAIL_FULL;
  body += ",\"debug\":{";
  body += "\"firmwareVersion\":\"" APP_VERSION "\",\"uptimeMs\":";
  body += String(millis());

  body += ",\"system\":{\"ready\":";
  append_json_bool(body, g_status.ready());
  body += ",\"modemPowered\":";
  append_json_bool(body, g_status.powered_on);
  body += ",\"imeiValid\":";
  append_json_bool(body, g_status.imei_valid);
  body += ",\"gprsConnected\":";
  append_json_bool(body, g_status.gprs_connected);
  body += ",\"gpsReady\":";
  append_json_bool(body, g_status.is_gps_ready);
  body += ",\"accelerometerReady\":";
  append_json_bool(body, step_ready);
  body += "}";

  body += ",\"modem\":{\"gprsIp\":";
  append_json_nullable_string(body, g_status.gprs_connected
    ? g_diagnostics.gprs_ip : nullptr);
  body += "}";

  body += ",\"gps\":{\"locationValid\":";
  append_json_bool(body, gps.location.isValid());
  body += ",\"fixAgeMs\":";
  if (gps.location.isValid()) body += String(gps.location.age());
  else body += "null";
  body += ",\"satellitesValid\":";
  append_json_bool(body, gps.satellites.isValid());
  body += ",\"satellites\":";
  if (gps.satellites.isValid()) body += String(gps.satellites.value());
  else body += "null";
  body += ",\"speedKmph\":";
  if (gps.speed.isValid()) body += String(gps.speed.kmph(), 1);
  else body += "null";
  body += ",\"altitudeMeters\":";
  if (gps.altitude.isValid()) body += String(gps.altitude.meters(), 1);
  else body += "null";
  body += ",\"utc\":";
  if (gps.date.isValid() && gps.time.isValid()) {
    char utc[24];
    snprintf(utc, sizeof(utc), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    append_json_nullable_string(body, utc);
  } else {
    body += "null";
  }
  body += ",\"charactersProcessed\":";
  body += String(gps.charsProcessed());
  body += ",\"sentencesWithFix\":";
  body += String(gps.sentencesWithFix());
  body += ",\"failedChecksum\":";
  body += String(gps.failedChecksum());
  body += "}";

  body += ",\"power\":{\"batteryAdcRaw\":";
  body += String(g_diagnostics.battery_adc_raw);
  body += ",\"vrefAdcRaw\":";
  body += String(g_diagnostics.vref_adc_raw);
  body += ",\"vddaMv\":";
  if (g_diagnostics.vdda_mv) body += String(g_diagnostics.vdda_mv);
  else body += "null";
  body += ",\"batteryVoltageMv\":";
  body += String(battery_mv);
  body += ",\"batteryPercent\":";
  body += String(battery_percent);
  body += ",\"chargeStatus\":\"";
  body += charge_status_name(g_diagnostics.charge_status);
  body += "\",\"lowBattery\":";
  append_json_bool(body, g_diagnostics.low_battery);
  body += "}";

  body += ",\"activity\":{\"stepsThisMinute\":";
  body += String(g_steps.steps_this_min);
  body += ",\"pendingSteps\":";
  body += String(g_steps.step_isr_count);
  body += ",\"totalSteps\":";
  body += String(g_steps.steps_total);
  body += ",\"minuteCounter\":";
  body += String(g_steps.minute_counter);
  body += ",\"active\":";
  append_json_bool(body, g_steps.active);
  body += ",\"sleepMode\":";
  append_json_bool(body, g_steps.sleep_mode_on);
  body += ",\"sleepMinuteCount\":";
  body += String(g_steps.sleep_minute_count);
  body += ",\"lastActiveAgoMs\":";
  body += String(millis() - g_steps.last_active_ms);
  body += "}";

  const bool cell_failed = strcmp(g_diagnostics.cell_query_status, "success") != 0
    && strcmp(g_diagnostics.cell_query_status, "skipped_gps_fix") != 0;
  body += ",\"cellQuery\":{\"status\":\"";
  body += g_diagnostics.cell_query_status;
  body += "\",\"rawResponse\":";
  append_json_nullable_string(body, full && cell_failed ? g_diagnostics.cell_query_raw : nullptr);
  body += ",\"error\":";
  append_json_nullable_string(body, g_diagnostics.cell_query_error);
  body += "}";

  const bool wifi_failed = wifi_scan_failed();
  body += ",\"wifiScan\":{\"status\":\"";
  body += g_wifi_scan.status;
  body += "\",\"durationMs\":";
  if (strncmp(g_wifi_scan.status, "skipped_", 8) == 0) body += "null";
  else body += String(g_wifi_scan.duration_ms);
  body += ",\"accessPointCount\":";
  body += String(g_wifi_scan.ap_count);
  body += ",\"attempts\":";
  body += String(g_wifi_scan.attempts);
  body += ",\"quietMs\":";
  append_nullable_uint_json(body, g_wifi_scan.quiet_known, g_wifi_scan.quiet_ms);
  body += ",\"rawResponse\":";
  append_json_nullable_string(body, full && wifi_failed ? g_wifi_scan.raw : nullptr);
  body += ",\"rawResponseTruncated\":";
  append_json_bool(body, full && wifi_failed && g_wifi_scan.raw_truncated);
  body += ",\"error\":";
  append_json_nullable_string(body, g_wifi_scan.error);
  body += ",\"modemState\":";
  if (full) append_modem_state_json(body, g_wifi_failure_modem_state);
  else body += "null";
  body += "}";

  // Boot comparison summary rides along until one accepted upload has carried it.
  if (full && !g_wifi_experiment.reported && g_wifi_experiment.attempted)
    append_wifi_experiment_summary_json(body);

  body += ",\"http\":{\"previousResult\":\"";
  body += g_http_status.previous_result;
  body += "\",\"previousFailureReason\":";
  append_json_nullable_string(body, g_http_status.previous_failure_reason);
  body += ",\"previousBodyBytes\":";
  append_nullable_uint_json(body, g_http_status.previous_body_bytes > 0,
    g_http_status.previous_body_bytes);
  body += ",\"bodyLimitBytes\":";
  body += String((uint32_t)g_http_status.body_limit);
  body += ",\"payloadDetail\":\"";
  body += telemetry_detail_name(detail);
  body += "\",\"previousStatusCode\":";
  if (g_http_status.previous_status_code) {
    body += String(g_http_status.previous_status_code);
  } else {
    body += "null";
  }
  body += ",\"previousDurationMs\":";
  if (g_http_status.previous_result == nullptr ||
      strcmp(g_http_status.previous_result, "not_attempted") == 0) {
    body += "null";
  } else {
    body += String(g_http_status.previous_duration_ms);
  }
  body += ",\"consecutiveFailures\":";
  body += String(g_http_status.consecutive_failures);
  body += "}}";
}

String build_location_telemetry_json(TelemetryDetail detail) {
  // GPS is explicitly disabled throughout the diagnostic build.
  gps_feed(0);
  if (g_status.is_gps_ready) {
    clear_cellular_tower_observation();
    clear_wifi_observations();
    g_diagnostics.cell_query_status = "skipped_gps_fix";
    g_diagnostics.cell_query_raw[0] = '\0';
    g_diagnostics.cell_query_error[0] = '\0';
  }
  String hardware_id = g_imei;
  hardware_id.trim();
  if (hardware_id.length() == 0) hardware_id = "<NO_DATA>";

  double lat = g_status.is_gps_ready ? g_loc.current_lat : 0.0;
  double lon = g_status.is_gps_ready ? g_loc.current_lon : 0.0;

  String dev_status = g_steps.sleep_mode_on ? "sleep" : "active";

  int battery_percent = g_vdd_mon.battery_level;
  if (battery_percent < 0) battery_percent = 0;
  if (battery_percent > 100) battery_percent = 100;

  int battery_mv = 1;
  if (g_vdd_mon.bat_volt > 0.0f) {
    battery_mv = (int)(g_vdd_mon.bat_volt * 1000.0f + 0.5f);
    if (battery_mv < 1) battery_mv = 1;
  }

  int satellite_count = 0;

  String body;
  // Fixed fields/16 APs/boot summary fit in 6 KiB; reserve diagnostic text exactly
  // once. Stage raw replies are TTL-only and never part of the upload.
  size_t capacity = 6144 + diagnostic_escaped_length(g_wifi_scan.raw)
    + diagnostic_escaped_length(g_wifi_scan.error)
    + diagnostic_escaped_length(g_diagnostics.cell_query_raw)
    + diagnostic_escaped_length(g_diagnostics.cell_query_error)
    + diagnostic_escaped_length(g_wifi_experiment.modem_revision);
  for (const WifiExperimentStage &stage : g_wifi_experiment.stages) {
    capacity += diagnostic_escaped_length(stage.error);
  }
  if (capacity > 16384 || !body.reserve(capacity)) {
    ERR.println("[DEV] Not enough heap for telemetry; upload skipped.");
    return String();
  }
  body += "{";
  body += "\"hardwareIdentifier\":\"";
  body += json_escape(hardware_id);
  body += "\",";
  body += "\"latitude\":";
  body += String(lat, 8);
  body += ",";
  body += "\"longitude\":";
  body += String(lon, 8);
  body += ",";
  body += "\"gpsFixValid\":";
  body += g_status.is_gps_ready ? "true" : "false";
  body += ",";
  if (g_cellular_tower.valid) {
    body += "\"cellular\":{";
    body += "\"radioType\":\"lte\",";
    body += "\"duplexMode\":\"";
    body += g_cellular_tower.duplex_mode;
    body += "\",";
    body += "\"towers\":[{";
    body += "\"role\":\"serving\",";
    body += "\"mobileCountryCode\":";
    body += String(g_cellular_tower.mobile_country_code);
    body += ",\"mobileNetworkCode\":";
    body += String(g_cellular_tower.mobile_network_code);
    body += ",\"trackingAreaCode\":";
    body += String(g_cellular_tower.tracking_area_code);
    body += ",\"cellId\":";
    body += String(g_cellular_tower.cell_id);

    if (g_cellular_tower.has_physical_cell_id) {
      body += ",\"physicalCellId\":";
      body += String(g_cellular_tower.physical_cell_id);
    }
    if (g_cellular_tower.has_band) {
      body += ",\"band\":\"";
      body += json_escape(String(g_cellular_tower.band));
      body += "\"";
    }
    if (g_cellular_tower.has_earfcn) {
      body += ",\"earfcn\":";
      body += String(g_cellular_tower.earfcn);
    }
    if (g_cellular_tower.has_rx_dbm) {
      body += ",\"rxDbm\":";
      body += String(g_cellular_tower.rx_dbm);
    }
    if (g_cellular_tower.has_tx_dbm) {
      body += ",\"txDbm\":";
      body += String(g_cellular_tower.tx_dbm);
    }
    if (g_cellular_tower.has_rsrp) {
      body += ",\"rsrpDbm\":";
      append_tenths_json(body, g_cellular_tower.rsrp_tenths_dbm);
    }
    if (g_cellular_tower.has_rsrq) {
      body += ",\"rsrqDb\":";
      append_tenths_json(body, g_cellular_tower.rsrq_tenths_db);
    }
    if (g_cellular_tower.has_sinr) {
      body += ",\"sinrDb\":";
      append_tenths_json(body, g_cellular_tower.sinr_tenths_db);
    }

    body += "}]},";
  }
  if (g_wifi_count) {
    body += "\"wifi\":{\"accessPoints\":[";
    for (uint8_t i = 0; i < g_wifi_count; ++i) {
      if (i) body += ",";
      body += "{\"macAddress\":\"";
      body += g_wifi_points[i].mac;
      body += "\",\"signalStrengthDbm\":";
      body += String(g_wifi_points[i].rssi);
      body += ",\"channel\":";
      body += String(g_wifi_points[i].channel);
      body += ",\"ageMs\":";
      body += String(millis() - g_wifi_points[i].observed_at);
      body += "}";
    }
    body += "]},";
  }
  body += "\"accuracyMeters\":null,";
  body += "\"batteryPercent\":";
  body += String(battery_percent);
  body += ",";
  body += "\"batteryVoltageMv\":";
  body += String(battery_mv);
  body += ",";
  body += "\"signalStrength\":0,";
  body += "\"satelliteCount\":";
  body += String(satellite_count);
  body += ",";
  body += "\"stepCounter\":";
  body += String(g_steps.steps_total);
  body += ",";
  body += "\"deviceState\":\"";
  body += dev_status;
  body += "\"";
  if (detail != TELEMETRY_DETAIL_MINIMAL)
    append_telemetry_debug_json(body, battery_percent, battery_mv, detail);
  body += "}";
  if (body.length() > capacity) {
    ERR.println("[DEV] Telemetry exceeds bounded payload capacity; upload skipped.");
    return String();
  }
  return body;
}



// One upload cycle: Wi-Fi scan (after radio quiet time), serving-cell query, then
// POST at the largest detail level that fits the modem's HTTP body limit.
void upload_location_telemetry() {
  const bool is_sleep_on = g_steps.sleep_mode_on;
  clear_cellular_tower_observation();
  clear_wifi_observations();
  gps_feed(0);
  if (g_status.is_gps_ready) {
    g_diagnostics.cell_query_status = "skipped_gps_fix";
    g_diagnostics.cell_query_raw[0] = '\0';
    g_diagnostics.cell_query_error[0] = '\0';
    DEBUG.println("[NETDMSG][TTL] GPS fix valid; serving-cell query skipped.");
  } else {
    // Scan first: it then follows the longest quiet period (the upload interval)
    // instead of trailing the previous HTTP request. NETDMSG did not affect scans.
    run_wifi_scan_with_diagnostics();
    if (g_wifi_modem_state_unknown) return;
    // A terminal failure from either query must not discard the other observation.
    query_serving_cell_tower();
  }

  TelemetryDetail detail = TELEMETRY_DETAIL_FULL;
  bool ok = false;
  while (true) {
    String payload = build_location_telemetry_json(detail);
    if (payload.length() == 0) return;  // Builder already logged the heap/size error.
    if (payload.length() > g_http_status.body_limit) {
      INFO.print("[HTTP] detail="); INFO.print(telemetry_detail_name(detail));
      INFO.print(" bodyBytes="); INFO.print(payload.length());
      INFO.print(" exceeds bodyLimitBytes="); INFO.println(g_http_status.body_limit);
      // The location-only body is always attempted: a limit learned from a
      // non-length ERROR must never stop location uploads entirely.
      if (detail != TELEMETRY_DETAIL_MINIMAL) {
        detail = (TelemetryDetail)(detail - 1);
        continue;
      }
    }
    INFO.print("[MAIN] HTTP ingest JSON payload (detail=");
    INFO.print(telemetry_detail_name(detail)); INFO.println("): ");
    INFO.println(payload);
    bool rejected = false;
    ok = http_post_json(payload.c_str(), &rejected);
    // The modem refused this length: retry now with less detail so the location
    // observation still reaches the server in this cycle.
    if (ok || !rejected || detail == TELEMETRY_DETAIL_MINIMAL) break;
    detail = (TelemetryDetail)(detail - 1);
  }

  if (!ok) {
    verify_transport_recovery();
    return;
  }
  if (detail == TELEMETRY_DETAIL_FULL && g_wifi_experiment.attempted)
    g_wifi_experiment.reported = true;
  if (is_sleep_on && g_steps.sleep_mode_on && g_steps.send_sleep_data)
    g_steps.send_sleep_data = false;
}

// =============================================================================
//  ADC HELPERS
// =============================================================================

/**
 * Read PA6 (ADC_IN6) and return the raw 12-bit value (0–4095).
 * Call adc_init() once in setup() before using these.
 */
uint16_t adc_read_battery_raw() {
  return (uint16_t)analogRead(ADC_PIN);
}

/**
 * Read PA6 and convert to millivolts using the supply voltage as reference.
 */
float adc_read_battery_mv() {
  uint16_t raw = adc_read_battery_raw();
  return (raw / 4095.0f) * VREF_MV;
}

/**
 * Read the internal VREF channel.
 * On STM32G071 the internal reference is nominally 1212 mV (typ).
 * Reading it lets you back-calculate the actual VDDA when it drifts.
 *
 * Actual VDDA (mV) = 1212 * 4095 / vref_raw
 */
uint16_t adc_read_vref_raw() {
  return (uint16_t)analogRead(ADC_VREF_CH);
}

float adc_actual_vdda_mv() {
  uint16_t vref_raw = adc_read_vref_raw();
  if (vref_raw == 0) return 0.0f;
  return (1212.0f * 4095.0f) / (float)vref_raw;
}

/**
 * Read PA6 in mV, corrected using the actual VDDA measured via Vref channel.
 * More accurate than assuming a fixed 3.3 V rail.
 */
float adc_read_battery_mv_calibrated() {
  float vdda_mv = adc_actual_vdda_mv();
  uint16_t raw = adc_read_battery_raw();
  return (raw / 4095.0f) * vdda_mv;
}

/**
 * Call once in setup() — sets resolution and pins to analog input mode.
 */
void adc_init() {
  analogReadResolution(ADC_RESOLUTION);
  pinMode(ADC_PIN, INPUT_ANALOG);
  DEBUG.println("[ADC] Initialised — PA6 + Vref channel ready.");
}

/**
 * Print a full ADC snapshot to the debug console.
 */
void adc_print() {
  uint16_t pa6_raw = adc_read_battery_raw();
  uint16_t vref_raw = adc_read_vref_raw();
  float vdda_mv = adc_actual_vdda_mv();
  g_diagnostics.battery_adc_raw = pa6_raw;
  g_diagnostics.vref_adc_raw = vref_raw;
  g_diagnostics.vdda_mv = vdda_mv > 0.0f ? (uint16_t)(vdda_mv + 0.5f) : 0;
  float pa6_mv = (pa6_raw / 4095.0f) * vdda_mv;
  g_vdd_mon.bat_volt = pa6_mv / 1000;
  g_vdd_mon.vdd_volt = vdda_mv / 1000;

  g_vdd_mon.bat_volt = g_vdd_mon.bat_volt * 2.0;

  DEBUG.println("[ADC] ---- ADC Snapshot ----");
  DEBUG.print("[ADC] vBAT  raw  : ");
  DEBUG.println(pa6_raw);
  DEBUG.print("[ADC] vBAT  V   : ");
  DEBUG.println(g_vdd_mon.bat_volt, 2);
  DEBUG.print("[ADC] Vref raw  : ");
  DEBUG.println(vref_raw);
  DEBUG.print("[ADC] VDDA V   : ");
  DEBUG.println(g_vdd_mon.vdd_volt, 2);
  DEBUG.println("[ADC] --------------------");

  if (g_vdd_mon.bat_volt > MIN_BAT_VOLT) {
    g_vdd_mon.battery_level = (g_vdd_mon.bat_volt - MIN_BAT_VOLT) * BAT_RATIO;
    if (g_vdd_mon.battery_level > 100) g_vdd_mon.battery_level = 100;
    if (g_vdd_mon.battery_level < 0) g_vdd_mon.battery_level = 0;
  } else g_vdd_mon.battery_level = 0;
}

// ─── Forward declarations (location / sleep) ──────────────────────────────────
void enter_sleep();
void location_timer_tick();


// =============================================================================
//  SLEEP  — LDO off (cuts GSM + GPS) + STM32 RTC deep sleep
// =============================================================================

/**
 * Full system sleep:
 *   1. Graceful GSM power off (AT+CFUN=0)
 *   2. LDO cut — GSM + GPS lose power
 *   3. STM32 enters deep-sleep; RTC wakes it after SLEEP_DURATION_S seconds
 *   4. On wake: re-init serial ports, power on GSM, ready-loop takes over
 */
void enter_sleep() {
#if 0
    DEBUG.print("[SLEEP] Entering deep sleep for ");
    DEBUG.print(SLEEP_DURATION_S);
    DEBUG.println(" s ...");
    delay(50);   // let UART TX flush

    gsm_power_off();   // AT+CFUN=0 then LDO off

    // Reset flags — everything must reinitialise after wake
    g_status.powered_on     = false;
    g_status.gprs_connected = false;
    g_loc.has_fix           = false;
    g_loc.is_stationary     = false;

    // STM32 RTC-based deep sleep
    LowPower.deepSleep(SLEEP_DURATION_S * 1000);

    // ── Resumes here after RTC wakeup ─────────────────────────────────────────
    SerialDBG.begin(DBG_BAUD);
    SerialGSM.begin(GSM_BAUD);
    delay(200);
    DEBUG.println("\r\n[SLEEP] Woke from RTC sleep — reinitialising ...");

    gsm_power_on();   // LDO on + PWRKEY pulse; ready-loop in loop() handles rest
#endif
}

// =============================================================================
//  LOCATION TIMER TICK  — call once per main loop iteration
// =============================================================================

/**
 * Every CHECK_INTERVAL_MS (1 min):
 *   - Compare current GPS position against last stored reference.
 *   - Moved >= MOVE_THRESHOLD_M  → update reference, reset stationary timer.
 *   - Moved <  MOVE_THRESHOLD_M  → accumulate stationary time;
 *                                   if >= STATIONARY_LIMIT_MS → enter_sleep().
 */
void location_timer_tick() {
  unsigned long now = millis();
  if (now - g_loc.last_check_ms < CHECK_INTERVAL_MS) return;
  g_loc.last_check_ms = now;

  if (!gps.location.isValid()) {
    DEBUG.println("[TIMER] No valid GPS fix — skipping location check.");
    return;
  }

  double cur_lat = gps.location.lat();
  double cur_lon = gps.location.lng();

  if (!g_loc.has_fix) {
    DEBUG.println("[TIMER] First GPS fix stored.");
    g_loc.update_reference(cur_lat, cur_lon);
    return;
  }

  // TinyGPSPlus::distanceBetween() uses Haversine and returns metres
  double dist = TinyGPSPlus::distanceBetween(
    g_loc.last_lat, g_loc.last_lon,
    cur_lat, cur_lon);
  DEBUG.print("[TIMER] Distance from last point: ");
  DEBUG.print(dist, 1);
  DEBUG.println(" m");

  if (dist >= MOVE_THRESHOLD_M) {
    DEBUG.println("[TIMER] Movement detected — resetting stationary timer.");
    g_loc.update_reference(cur_lat, cur_lon);
  } else {
    if (!g_loc.is_stationary) {
      g_loc.is_stationary = true;
      g_loc.stationary_since = now;
      DEBUG.println("[TIMER] Device stationary — started stationary timer.");
    }
    unsigned long stat_ms = now - g_loc.stationary_since;
    DEBUG.print("[TIMER] Stationary for ");
    DEBUG.print(stat_ms / 1000UL);
    DEBUG.println(" s");
  }
}

// =============================================================================
//  STM32 HARDWARE TIMER — fires every STEP_TIMER_INTERVAL_MS (1 minute)
//  Calculates steps/min, resets ISR counter, checks inactivity → sleep
// =============================================================================

HardwareTimer *step_timer = nullptr;

void print_minute_log() {
  if (!g_minute_log_pending) return;
  const uint32_t primask = __get_PRIMASK();
  __disable_irq();
  const MinuteLogSnapshot snapshot = g_minute_log;
  g_minute_log_pending = false;
  __set_PRIMASK(primask);
  INFO.println("+------------------------------+");
  INFO.print("| Minute counter: "); INFO.println(snapshot.minute);
  INFO.print("GSM Status: "); INFO.println(snapshot.connected ? "Connected" : "Disconnected");
  INFO.print("GPS Status: "); INFO.println(snapshot.gps_valid ? "Valid fix" : "No fix");
  INFO.print("Steps in last minute: "); INFO.println(snapshot.steps);
  INFO.println("+------------------------------+");
  INFO.print("[TIMER] Idle time: minute "); INFO.print(snapshot.sleep_minutes);
  INFO.print("/"); INFO.println(IDLE_TIME);
  if (snapshot.evaluated) {
    INFO.print("[TIMER] Evaluation distance m="); INFO.println(snapshot.distance, 1);
    INFO.println(snapshot.flagged_sleep ? "[TIMER] flagging sleep." : "[TIMER] activity detected — updating ref.");
  }
}

// Minute timer callback — mirrors TimerMin() from your original code.
// Atomic snapshot of step_isr_count (noInterrupts guards the 32-bit read on Cortex-M0+).
void oneminute_timer_callback() {
  const uint32_t primask = __get_PRIMASK();
  __disable_irq();
  uint32_t cnt = g_steps.step_isr_count;
  g_steps.step_isr_count = 0;
  wake_count = 0;
  __set_PRIMASK(primask);

  // ── Steps per minute ──────────────────────────────────────────────────────
  g_steps.steps_this_min = cnt;
  g_steps.steps_total += cnt;
  g_steps.previous_steps = g_steps.steps_total;  // save baseline for next window

  g_steps.minute_counter++;
  if (g_steps.minute_counter > 10000) g_steps.minute_counter = 0;

  g_minute_log.steps = cnt;
  g_minute_log.minute = g_steps.minute_counter;
  g_minute_log.connected = g_status.gprs_connected;
  g_minute_log.gps_valid = g_status.is_gps_ready;
  g_minute_log.evaluated = false;
  g_minute_log.flagged_sleep = false;
  g_minute_log.distance = 0;

  if (g_wifi_sleep_suppressed) {
    g_steps.sleep_minute_count = 0;
    g_minute_log.sleep_minutes = 0;
    g_minute_log_pending = true;
    return; // Activity totals still advance; only inactivity shutdown is suppressed.
  }

  if (!g_steps.sleep_mode_on) {
    g_steps.sleep_minute_count++;
    g_minute_log.sleep_minutes = g_steps.sleep_minute_count;
    if (g_steps.sleep_minute_count >= IDLE_TIME) {
      // Time to evaluate
      bool no_steps = (cnt == 0);
      // Compare current position against position stored at sleep entry
      double dist = 0.0;
      bool has_gps = g_status.is_gps_ready;
      if (has_gps) {
        dist = TinyGPSPlus::distanceBetween(
          g_steps.sleep_ref_lat, g_steps.sleep_ref_lon,
          g_loc.current_lat, g_loc.current_lon);
      }
      bool no_movement = !has_gps || (dist < WAKE_MIN_DISTANCE_M);
      g_minute_log.evaluated = true;
      g_minute_log.distance = dist;
      if (no_movement && no_steps) {
        // Neither steps nor meaningful GPS movement since last sleep — sleep again
        g_minute_log.flagged_sleep = true;
        g_steps.sleep_mode_on = true;
        g_steps.send_sleep_data = true;
        g_steps.sleep_minute_count = 0;
        g_steps.start_safe_shut_down = true;
        g_steps.sleep_ref_lat = g_loc.current_lat;
        g_steps.sleep_ref_lon = g_loc.current_lon;
        wake_count = 0;

      } else {
        if (has_gps) {
          // Update sleep ref so next window measures from here
          g_steps.sleep_ref_lat = g_loc.current_lat;
          g_steps.sleep_ref_lon = g_loc.current_lon;
        }
      }
    }
  } else {
    g_minute_log.sleep_minutes = g_steps.sleep_minute_count;
  }
  g_minute_log_pending = true;
}

void oneminute_timer_init() {
  // TIM16 is a free 16-bit timer on STM32G071; HardwareTimer picks a free one automatically
  step_timer = new HardwareTimer(TIM16);
  step_timer->setOverflow(STEP_TIMER_INTERVAL_MS * 1000UL, MICROSEC_FORMAT);
  step_timer->attachInterrupt(oneminute_timer_callback);
  step_timer->resume();
  DEBUG.println("[TIMER] one minute timer started (1 min interval).");
}

bool step_ready = false;
byte checkLIS2DS12() {
  byte error;
  dev_i2c.beginTransmission(LIS2DS12_ADDRESS);
  error = dev_i2c.endTransmission();
  if (error == 0) {
    DEBUG.println("LIS2DS12 found at 0x1D");
    step_ready = true;
  } else {
    DEBUG.println("LIS2DS12 not found !!!");
    step_ready = false;
  }
  return error;
}

void configureLIS2DS12() {
  // Initialize the LIS2DS12 accelerometer
  writeRegister(LIS2DS12_REG_CTRL1, 0x60);  // Enable accelerometer, 14Bits, 400Hz output data, +/-2g full scale
  writeRegister(LIS2DS12_FUNC_CTRL, 0x01);  // Enable Bit1(significant motion)|Bit0(Step counter)
  writeRegister(LIS2DS12_REG_CTRL2, 0x00);
  writeRegister(LIS2DS12_REG_CTRL3, 0x38);  // Enable tap detection on X, Y, Z axis
  writeRegister(LIS2DS12_REG_CTRL4, 0x08);  // Double-tap interrupt driven to INT1 pin
  writeRegister(LIS2DS12_REG_CTRL5, 0x0C);  // Significant motion interrupt driven to INT2 pin

  writeRegister(LIS2DS12_TAP_6D_THS, 0x0C);   // Set tap threshold
  writeRegister(LIS2DS12_REG_INT_DUR, 0x7F);  // Set duration, quiet and shock time windows
  writeRegister(LIS2DS12_WAKE_UP_THS, 0x80);  //Single & double-tap enabled (SINGLE_DOUBLE_TAP = 1)

  // Enable click/double-click detection (optional)
  //writeRegister(0x38, 0x40); // Enable interrupt generation on click or double click
  //writeRegister(0x39, 0x0A); // Set threshold for click detection
}

void writeRegister(byte reg, byte value) {
  dev_i2c.beginTransmission(LIS2DS12_ADDRESS);
  dev_i2c.write(reg);
  dev_i2c.write(value);
  dev_i2c.endTransmission();
}

void readAccelerometerData(int16_t &x, int16_t &y, int16_t &z) {
  dev_i2c.beginTransmission(LIS2DS12_ADDRESS);
  dev_i2c.write(LIS2DS12_REG_OUT_X_L | 0x80);  // Auto-increment register address
  dev_i2c.endTransmission(false);
  dev_i2c.requestFrom(LIS2DS12_ADDRESS, 6);
  //while (dev_i2c.available() < 6);
  x = dev_i2c.read() | (dev_i2c.read() << 8);
  y = dev_i2c.read() | (dev_i2c.read() << 8);
  z = dev_i2c.read() | (dev_i2c.read() << 8);
  //* 0.061 for 2G
}

void LIS2DS12_INT1_ISR() {
  //DEBUG.println("Double Tap Detected");
}

// isr_step_detected
// volatile uint32_t wake_count = 0;
void LIS2DS12_INT2_ISR() {
  // DEBUG.println("Step Detected");
  g_steps.step_isr_count++;
  wake_count++;
  if (g_steps.sleep_mode_on && wake_count >= MIN_STEPS) {
    g_steps.sleep_mode_on = false;
    g_steps.send_sleep_data = false;
    g_steps.last_active_ms = millis();
    g_steps.sleep_minute_count = 0;
    wake_count = 0;
    // loop() sees sleep_mode_on = false and skips enter_sleep()
  }
  g_steps.last_active_ms = millis();
  g_steps.active = true;
}

void lis2ds_init() {
  pinMode(LIS2DS12_SA0, OUTPUT);
  pinMode(LIS2DS12_INT1, INPUT_PULLUP);
  pinMode(LIS2DS12_INT2, INPUT_PULLUP);
  digitalWrite(LIS2DS12_SA0, HIGH);  //0x1D

  dev_i2c.begin();
  configureLIS2DS12();
  checkLIS2DS12();

  attachInterrupt(digitalPinToInterrupt(LIS2DS12_INT1), LIS2DS12_INT1_ISR, FALLING);
  attachInterrupt(digitalPinToInterrupt(LIS2DS12_INT2), LIS2DS12_INT2_ISR, FALLING);
}

//=============================================================================

ChargeStatus getChargeStatusRaw() {
  bool chrg = digitalRead(CHRG_PIN);
  bool stdby = digitalRead(STDBY_PIN);

  /*
     * TP4056 outputs are open-drain and active LOW.
     *
     * CHRG  = LOW  -> charging
     * STDBY = LOW  -> charging complete
     *
     * HIGH means high impedance, provided the pull-up is present.
     */

  if (chrg == LOW && stdby == HIGH) {
    return CHARGE_CHARGING;
  }

  if (chrg == HIGH && stdby == LOW) {
    return CHARGE_COMPLETE;
  }

  if (chrg == HIGH && stdby == HIGH) {
    return CHARGE_IDLE;
  }

  return CHARGE_ERROR;
}

ChargeStatus getChargeStatus() {
  static ChargeStatus lastStable = CHARGE_ERROR;
  static ChargeStatus lastRaw = CHARGE_ERROR;
  static unsigned long lastChangeTime = 0;

  ChargeStatus raw = getChargeStatusRaw();

  if (raw != lastRaw) {
    lastRaw = raw;
    lastChangeTime = millis();
  }

  if (millis() - lastChangeTime > 50) {  // 50ms debounce
    lastStable = raw;
  }
  return lastStable;
}

void printChargeStatus() {
  static ChargeStatus previousStatus = CHARGE_UNKNOWN;
  ChargeStatus status = getChargeStatus();
  g_diagnostics.charge_status = status;
    // Nothing changed
    if (status == previousStatus)
      return;
    previousStatus = status;


  switch (status) {

    case CHARGE_CHARGING:
      {
        is_charging = true;
        DEBUG.println("[Battery] : CHARGING");
        break;
      }

    case CHARGE_COMPLETE:
      {
        is_charging = false;
        DEBUG.println("[Battery] : CHARGE COMPLETE");
        break;
      }
    case CHARGE_IDLE:
      {
        is_charging = false;
        DEBUG.println("[Battery] : IDLE / NO CHARGE");
        break;
      }
    case CHARGE_ERROR:
      is_charging = false;
      DEBUG.println("[Battery] : ERROR / INVALID STATUS");
      break;

    default:
      DEBUG.println("[Battery] : UNKNOWN");
      break;
  }
}

bool battery_powerProtection() {
  float batteryVoltage = g_vdd_mon.bat_volt;
  static bool prev_bat_low_status = false;
  bool bat_low_status = prev_bat_low_status; // Preserve hysteresis between 3.4 and 3.7 V.

  /*
     * Battery critically low.
     */
  if (batteryVoltage < BATTERY_LOW_OFF) {
    bat_low_status = true;
  }
  /*
     * Battery is OK.
     */
  else if (batteryVoltage >= BATTERY_LOW_ON) {
    bat_low_status = false;
  }
  // Nothing changed
  g_diagnostics.low_battery = bat_low_status;
  DEBUG.println(bat_low_status ? "[BATTERY] : LOW " : "[BATTERY] : OK");
  if (bat_low_status == prev_bat_low_status)
    return bat_low_status;

  if (bat_low_status)
    ldo_enable(false);

  prev_bat_low_status = bat_low_status;
  return bat_low_status;
}

// No Charging Thing is available
volatile bool chargeStatusChanged = false;

void chargeStatusISR() {
  chargeStatusChanged = true;
}

/*
void BMS_ISR() {
  if (digitalRead(CHRG_PIN) == LOW) {
    DEBUG.println("ISR Charging On");
    DEBUG.println("System Reboot...");
    delay(5);
    HAL_NVIC_SystemReset();
  } else {
    DEBUG.println("ISR Charging Off");
    DEBUG.println("System Reboot...");
    delay(5);
    HAL_NVIC_SystemReset();
  }
  delay(50);
}
*/

//=============================================================================


// ═════════════════════════════════════════════════════════════════════════════
//  SETUP
// ═════════════════════════════════════════════════════════════════════════════

void setup() {
  // Capture reset causes before clearing them; PWRRST combines POR and BOR.
  g_mcu_reset_flags = RCC->CSR;
  pinMode(GSM_PWRKEY, OUTPUT);
  digitalWrite(GSM_PWRKEY, HIGH);
  pinMode(LDO_EN, OUTPUT);
  digitalWrite(LDO_EN, LOW);
  SerialDBG.begin(DBG_BAUD);
  delay(50);
  INFO.println("[DEV][BOOT] Integrated Wi-Fi/cellular telemetry: " APP_VERSION);
  INFO.print("[DEV][BOOT] resetFlags=0x"); INFO.println(g_mcu_reset_flags, HEX);
  if (g_mcu_reset_flags & RCC_CSR_PWRRSTF) INFO.println("[DEV][RESET] power-on/brownout (combined flag)");
  if (g_mcu_reset_flags & RCC_CSR_PINRSTF) INFO.println("[DEV][RESET] reset pin");
  if (g_mcu_reset_flags & RCC_CSR_SFTRSTF) INFO.println("[DEV][RESET] software");
  if (g_mcu_reset_flags & RCC_CSR_IWDGRSTF) INFO.println("[DEV][RESET] independent watchdog");
  if (g_mcu_reset_flags & RCC_CSR_WWDGRSTF) INFO.println("[DEV][RESET] window watchdog");
  if (gpsreset_magic == GPS_RESET_MAGIC) {
    gpsreset_magic = 0;
    INFO.println("[DEV][RESET] explicit GPS no-fix reset");
  }
  __HAL_RCC_CLEAR_RESET_FLAGS();
  set_dev_phase("adc_init");
  adc_init();
  g_adc_initialized = true;
  pinMode(CHRG_PIN, INPUT_PULLUP);
  pinMode(STDBY_PIN, INPUT_PULLUP);
  printChargeStatus();
  adc_print();
  service_dev_diagnostics(true);
  set_dev_phase("initial_rail_off");
  dev_wait(2000); // Discharge the shared rail before a fresh PWRKEY pulse.
  SerialGSM.begin(GSM_BAUD);
  gsm_power_on();
  set_dev_phase("accelerometer_init");
  lis2ds_init();
  g_steps.last_active_ms = millis();
  oneminute_timer_init();
  ensure_system_ready();
  g_status.print();
  INFO.println("[DEV][BOOT] Initialization pass complete; readiness/recovery continues in loop.");
}

// ═════════════════════════════════════════════════════════════════════════════
//  LOOP  — collect GPS for 25 s, then POST
// ═════════════════════════════════════════════════════════════════════════════

void loop() {
  service_dev_diagnostics();
  printChargeStatus();
  adc_print();
  // if (is_charging && (!g_steps.send_sleep_data)) {
  //   DEBUG.println("[BATTERY] : CHARGE ON");
  //   delay(5000);
  //   if (g_status.powered_on == true) {
  //     INFO.println("[MAIN] Shutdown (GSM OFF)");
  //     gsm_power_off();
  //     delay(2000);
  //     g_status.reset();
  //   }
  //   return;
  // }

  if (battery_powerProtection() && (!g_steps.send_sleep_data)) {
    if (g_status.powered_on == true) {
      INFO.println("[MAIN] Shutdown ldo (GSM /GPS OFF)");
     // gsm_power_off();
      ldo_enable(0);
      delay(2000);
      g_status.reset();
    }
    dev_wait(5000);
    return;
  }

  if (g_wifi_modem_state_unknown) {
    // Do not even run the TTL cell probe or the normal reconnect path in this state.
    ERR.println("[DEV] Modem state unknown; all modem commands/uploads paused. Reset the board.");
    set_dev_phase("modem_state_unknown");
    dev_wait(5000);
    return;
  }
  if (handle_cell_probe_console()) return;

  if (!g_steps.sleep_mode_on || g_steps.send_sleep_data) {
    if (!g_status.ready() || !g_sim_ready) {
      if (!ensure_system_ready()) {
        dev_wait(1000);
        return;
      }
      INFO.println("[MAIN] System ready — resuming normal operation.");
    }

    gps_feed(1000);
    gps_check_timeout();
    print_gps_info();
    // location_timer_tick();
    // adc_print();

    // char json[256];
    // build_json(json, sizeof(json), g_imei);
    // INFO.print("[MAIN] Payload: ");
    // INFO.println(json);
    // String http_payload = "latitude=" + String(current_lat, 8) + "&longitude=" + String(current_lng, 8) + "&device_name=" + device_id + "&location=" + String(bat_volt, 2) + "V," + String(battery_level) + "%," + String(stepCountTotal) + "," + String(num_sat);  //+ String(battery_level) + "%,"
    // DEBUG.println(http_payload);

    if (millis() - g_http_status.last_send > HTTP_REQ_DELAY) {
      if (g_status.ready()) {
        // current_lat = 28.61393912;
        // current_lng = 77.20902313;
        // String http_payload = "latitude=" + String( g_loc.current_lat, 8) + "&longitude=" + String( g_loc.current_lon, 8) + "&device_name=" + g_imei + "&location=" + String(g_vdd_mon.bat_volt, 2) + "V," + String(g_vdd_mon.battery_level) + "%," + String(g_steps.steps_total) + "," + String( g_loc.num_satellite);//+","+ String(g_steps.sleep_mode_on);// + "%,"
        // INFO.println(http_payload);
        // static uint8_t reconnect = 0;
        // bool ok = http_post(http_payload.c_str());
        // bool ok = https_post_v1(http_payload.c_str());
        // bool ok = neoway_test(NEOWAY_DATA);
        upload_location_telemetry();
        // The interval starts after the upload, so it doubles as radio quiet time
        // before the next cycle's Wi-Fi scan.
        g_http_status.last_send = millis();
      }
    }
  } else {
    if (g_steps.start_safe_shut_down && !g_steps.send_sleep_data) {
      // ldo_enable(0);
      INFO.println("[MAIN] Shutdown (GSM OFF)");
      gsm_power_off();
      delay(2000);
      g_status.reset();
      // g_steps.sleep_mode_on = false;
      g_steps.send_sleep_data = false;
      g_steps.start_safe_shut_down = false;
    }
    gps_feed(1000);
    gps_check_timeout();
    __WFI();
  }
  dev_wait(1000);
}
