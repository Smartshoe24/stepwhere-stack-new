/**
 * Stepwhere N706 bench firmware. No GPS, telemetry, or HTTP upload.
 * USART1 PB6 TX / PB7 RX: 115200-baud TTL command console.
 * USART2 PA2 TX / PA3 RX: 115200-baud N706 modem.
 */

#include <Arduino.h>
#include <HardwareSerial.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

HardwareSerial SerialGSM(PA3, PA2);
HardwareSerial SerialDBG(PB7, PB6);

constexpr uint32_t BAUD = 115200;
constexpr uint32_t AT_TIMEOUT_MS = 5000;
constexpr uint32_t NRSP_TIMEOUT_MS = 15000;
constexpr uint32_t WIFI_SCAN_TIMEOUT_MS = 30000;
constexpr uint32_t NETWORK_TIMEOUT_MS = 60000;
constexpr uint32_t CELL_SCAN_TIMEOUT_MS = 300000;
constexpr uint32_t HEALTH_INTERVAL_MS = 5000;
constexpr uint32_t BATTERY_CUTOFF_MV = 3400;
constexpr uint32_t VREF_CAL_MV = 1212;
constexpr uint16_t ADC_MAX = 4095;
constexpr size_t LINE_CAPACITY = 192;

bool modemPowered = false;
bool modemUartStarted = false;
bool modemReady = false;
bool dataConnected = false;
bool modemStateUnknown = false;
bool bootInProgress = true;
bool modemBusy = false;
const char *bootPhase = "initializing";
const char *activeCommand = nullptr;
uint32_t lastHealthMs = 0;
char dataIp[48] = "";

enum class AtResult { Ok, Error, ParseError, Timeout, Busy, LowBattery };
enum class ReplyMode { Normal, Location, WifiScan, WifiLocation };

struct LocationObservation {
  bool valid = false;
  bool accuracyKnown = false;
  double latitude = 0;
  double longitude = 0;
  double accuracyMeters = 0;
  uint32_t durationMs = 0;
  char error[48] = "";
};

void poll_console();
void print_health();
void maybe_print_health();

uint32_t battery_mv() {
  const uint16_t vrefRaw = analogRead(AVREF);
  const uint16_t batteryRaw = analogRead(PB10);
  if (vrefRaw == 0) return 0;
  // Match the main firmware's Vref calibration and 2:1 VBAT divider.
  const uint32_t vddaMv = (VREF_CAL_MV * ADC_MAX) / vrefRaw;
  return (2UL * batteryRaw * vddaMv) / ADC_MAX;
}

void print_battery() {
  const uint32_t mv = battery_mv();
  SerialDBG.print("[DEV][POWER] VBAT=");
  SerialDBG.print(mv);
  SerialDBG.println(" mV");
}

bool battery_safe() {
  const uint32_t mv = battery_mv();
  if (mv >= BATTERY_CUTOFF_MV) return true;

  digitalWrite(PA10, LOW);
  modemPowered = false;
  modemReady = false;
  dataConnected = false;
  modemStateUnknown = true;
  bootPhase = "battery_low";
  SerialDBG.print("[DEV][POWER] VBAT=");
  SerialDBG.print(mv);
  SerialDBG.println(" mV: modem power cut. Charge and reset the board.");
  return false;
}

void show_help() {
  SerialDBG.println("[DEV] Commands (type one and press Enter):");
  SerialDBG.println("[DEV] HELP           Show this list");
  SerialDBG.println("[DEV] STATUS         Show readiness, data link, and battery");
  SerialDBG.println("[DEV] SERVING        NETDMSG, NETMSG, CEREG? (serving ECI)");
  SerialDBG.println("[DEV] NEIGHBORS      MYCELLINFO, NRSP (raw scan; no inferred ECI)");
  SerialDBG.println("[DEV] ENGINEERING    Probe NWENG support and ncell response");
  SerialDBG.println("[DEV] NWENG_DIRECT   Query NWENG ncell without the test command");
  SerialDBG.println("[DEV] WIFI_SCAN      Scan nearby Wi-Fi APs (raw modem response)");
  SerialDBG.println("[DEV] RADIO_SNAPSHOT Serving, neighbors, Wi-Fi, serving (raw MapQuest inputs)");
  SerialDBG.println("[DEV] WIFI_LOCATE    Fresh scan, connect data, then N706 Wi-Fi location");
  SerialDBG.println("[DEV] POSITION_COMPARE Fresh Wi-Fi then cell location; separate results");
  SerialDBG.println("[DEV] NETUP          Connect data using APN internet");
  SerialDBG.println("[DEV] LOCATE_SINGLE  N706 single-base-station location");
  SerialDBG.println("[DEV] LOCATE         N706 multiple-base-station location");
  SerialDBG.println("[DEV] Only these named commands are accepted; no raw AT passthrough.");
}

void set_boot_phase(const char *phase) {
  bootPhase = phase;
  SerialDBG.print("[DEV][BOOT] phase=");
  SerialDBG.println(phase);
}

void print_health() {
  SerialDBG.print("[DEV][HEALTH] uptimeMs=");
  SerialDBG.print(millis());
  SerialDBG.print(" phase=");
  SerialDBG.print(bootPhase);
  SerialDBG.print(" batteryMv=");
  SerialDBG.print(battery_mv());
  SerialDBG.print(" modemReady=");
  SerialDBG.print(modemReady ? "yes" : "no");
  SerialDBG.print(" dataConnected=");
  SerialDBG.print(dataConnected ? "yes" : "no");
  SerialDBG.print(" waitingFor=");
  SerialDBG.print(activeCommand ? activeCommand : "none");
  SerialDBG.print(" stateUnknown=");
  SerialDBG.println(modemStateUnknown ? "yes" : "no");
}

void maybe_print_health() {
  if (millis() - lastHealthMs < HEALTH_INTERVAL_MS) return;
  lastHealthMs = millis();
  print_health();
}

bool wait_with_console(uint32_t durationMs) {
  const uint32_t startedAt = millis();
  uint32_t lastBatteryCheck = startedAt;
  while (millis() - startedAt < durationMs) {
    poll_console();
    maybe_print_health();
    if (modemPowered && millis() - lastBatteryCheck >= 1000) {
      lastBatteryCheck = millis();
      if (!battery_safe()) return false;
    }
    delay(1);
  }
  return true;
}

bool starts_with(const char *line, const char *prefix) {
  return strncmp(line, prefix, strlen(prefix)) == 0;
}

void read_data_ip(const char *line) {
  if (!starts_with(line, "+XIIC:")) return;

  const char *state = line + strlen("+XIIC:");
  while (*state == ' ') state++;
  const char *comma = strchr(state, ',');
  if (!comma || *state != '1') return;

  const char *ip = comma + 1;
  while (*ip == ' ') ip++;
  size_t length = strcspn(ip, " \r\n");
  if (length == 0 || length >= sizeof(dataIp)) return;
  memcpy(dataIp, ip, length);
  dataIp[length] = '\0';
  dataConnected = strcmp(dataIp, "0.0.0.0") != 0;
}

void set_location_error(LocationObservation *observation, const char *error) {
  if (!observation) return;
  strncpy(observation->error, error, sizeof(observation->error) - 1);
  observation->error[sizeof(observation->error) - 1] = '\0';
}

bool parse_location_number(const char *json, const char *key, double &value) {
  const char *field = strstr(json, key);
  if (!field) return false;
  field += strlen(key);
  while (*field == ' ' || *field == '\t') field++;
  if (*field != ':') return false;
  field++;
  while (*field == ' ' || *field == '\t') field++;
  char *end = nullptr;
  value = strtod(field, &end);
  if (end == field || !isfinite(value)) return false;
  while (*end == ' ' || *end == '\t') end++;
  return *end == ',' || *end == '}';
}

bool parse_location_json(const char *json, LocationObservation &observation) {
  size_t length = strlen(json);
  while (length && (json[length - 1] == ' ' || json[length - 1] == '\t')) length--;
  if (*json != '{' || length < 2 || json[length - 1] != '}'
      || !strstr(json, "\"location\"")) return false;
  double latitude = 0;
  double longitude = 0;
  if (!parse_location_number(json, "\"lat\"", latitude)
      || !parse_location_number(json, "\"lng\"", longitude)
      || latitude < -90 || latitude > 90
      || longitude < -180 || longitude > 180) return false;

  double accuracy = 0;
  const bool hasAccuracy = strstr(json, "\"accuracy\"") != nullptr;
  if (hasAccuracy && (!parse_location_number(json, "\"accuracy\"", accuracy)
                      || accuracy < 0)) return false;

  observation.valid = true;
  observation.latitude = latitude;
  observation.longitude = longitude;
  observation.accuracyKnown = hasAccuracy && accuracy > 0;
  observation.accuracyMeters = accuracy;
  return true;
}

void print_location_coordinates(const LocationObservation &observation,
                                const char *label) {
  SerialDBG.print(label);
  SerialDBG.print(" lat=");
  SerialDBG.print(observation.latitude, 8);
  SerialDBG.print(" lng=");
  SerialDBG.print(observation.longitude, 8);
  SerialDBG.print(" accuracyMeters=");
  if (observation.accuracyKnown) SerialDBG.println(observation.accuracyMeters, 1);
  else SerialDBG.println("null");
}

AtResult send_at(const char *command, uint32_t timeoutMs,
                 ReplyMode mode = ReplyMode::Normal,
                 uint16_t *wifiApCount = nullptr,
                 LocationObservation *location = nullptr) {
  if (!battery_safe()) return AtResult::LowBattery;

  // Idle URCs are not part of the next command's response.
  while (SerialGSM.available()) {
    SerialDBG.write((uint8_t)SerialGSM.read());
  }

  SerialDBG.print("[DEV][AT] >> ");
  SerialDBG.println(command);
  SerialGSM.print(command);
  SerialGSM.print("\r\n");

  char line[LINE_CAPACITY] = "";
  size_t lineLength = 0;
  bool lineOverflow = false;
  bool locationPayloadSeen = false;
  bool locationPayloadInvalid = false;
  LocationObservation parsedLocation;
  const char *locationPrefix = mode == ReplyMode::Location ? "+CIPGSMLOC:"
    : mode == ReplyMode::WifiLocation ? "+WIFIGSMLOC:" : nullptr;
  const char *locationLabel = mode == ReplyMode::WifiLocation
    ? "[DEV][WIFI_LOCATE]" : "[DEV][LOCATION]";
  uint32_t bytesReceived = 0;
  const uint32_t startedAt = millis();
  uint32_t lastBatteryCheck = startedAt;

  while (millis() - startedAt < timeoutMs) {
    while (SerialGSM.available()) {
      const char c = (char)SerialGSM.read();
      SerialDBG.write((uint8_t)c);
      bytesReceived++;

      if (c == '\n') {
        line[lineLength] = '\0';
        // Always stream the raw line, but never claim an oversized JSON result
        // as a coordinate we could not validate.
        if (lineOverflow && locationPrefix && starts_with(line, locationPrefix)) {
          const char *detail = line + strlen(locationPrefix);
          while (*detail == ' ') detail++;
          if (*detail == '{') locationPayloadInvalid = true;
        }
        if (lineOverflow && mode == ReplyMode::WifiLocation && line[0] == '{') {
          locationPayloadInvalid = true;
        }
        if (mode == ReplyMode::WifiScan && starts_with(line, "+WIFIAPSCAN:")
            && wifiApCount && *wifiApCount < 65535U) {
          (*wifiApCount)++;
        }
        if (!lineOverflow) {
          read_data_ip(line);

          if (strcmp(line, "ERROR") == 0 || starts_with(line, "+CME ERROR:")
              || starts_with(line, "+CMS ERROR:")) {
            set_location_error(location, line);
            SerialDBG.print("[DEV][AT] ERROR ");
            SerialDBG.print(command);
            SerialDBG.print(" elapsedMs=");
            SerialDBG.println(millis() - startedAt);
            return AtResult::Error;
          }

          if (locationPrefix && starts_with(line, locationPrefix)) {
            const char *detail = line + strlen(locationPrefix);
            while (*detail == ' ') detail++;
            if (*detail == '{') {
              if (parse_location_json(detail, parsedLocation)) locationPayloadSeen = true;
              else locationPayloadInvalid = true;
            } else if (strcmp(detail, "OK") == 0) {
              SerialDBG.print(locationLabel);
              const bool valid = locationPayloadSeen && !locationPayloadInvalid;
              SerialDBG.print(valid
                ? " COMPLETE elapsedMs=" : " OK without coordinates elapsedMs=");
              SerialDBG.println(millis() - startedAt);
              if (!valid) {
                set_location_error(location, locationPayloadInvalid
                  ? "invalid_or_oversized_coordinates" : "no_coordinates");
                return AtResult::ParseError;
              }
              print_location_coordinates(parsedLocation, locationLabel);
              if (location) *location = parsedLocation;
              return AtResult::Ok;
            } else if (strcmp(detail, "LINK NOT FREE") == 0) {
              set_location_error(location, detail);
              SerialDBG.print(locationLabel);
              SerialDBG.print(" BUSY elapsedMs=");
              SerialDBG.println(millis() - startedAt);
              return AtResult::Busy;
            } else if (strcmp(detail, "TIMEOUT") == 0) {
              set_location_error(location, detail);
              SerialDBG.print(locationLabel);
              SerialDBG.print(" TIMEOUT elapsedMs=");
              SerialDBG.println(millis() - startedAt);
              return AtResult::Timeout;
            } else if (strstr(detail, "FAIL")
                       || strcmp(detail, "ERROR") == 0
                       || strcmp(detail, "GPRS DISCONNECTION") == 0) {
              if (!location || location->error[0] == '\0') set_location_error(location, detail);
              SerialDBG.print(locationLabel);
              SerialDBG.print(" FAILED result=");
              SerialDBG.print(detail);
              SerialDBG.print(" elapsedMs=");
              SerialDBG.println(millis() - startedAt);
              return AtResult::Error;
            } else if (*detail >= '0' && *detail <= '9') {
              set_location_error(location, detail);
              SerialDBG.print(locationLabel);
              SerialDBG.print(" providerStatus=");
              SerialDBG.println(detail);
            }
          }

          if (mode == ReplyMode::WifiLocation && line[0] == '{') {
            if (parse_location_json(line, parsedLocation)) locationPayloadSeen = true;
            else locationPayloadInvalid = true;
          }
          if (mode == ReplyMode::WifiLocation && line[0] >= '0' && line[0] <= '9') {
            set_location_error(location, line);
            SerialDBG.print(locationLabel);
            SerialDBG.print(" providerStatus=");
            SerialDBG.println(line);
          }

          if (strcmp(line, "OK") == 0) {
            if (locationPrefix) {
              SerialDBG.print(locationLabel);
              SerialDBG.println(" Request accepted; waiting for location result ...");
            } else {
              SerialDBG.print("[DEV][AT] OK ");
              SerialDBG.print(command);
              SerialDBG.print(" bytes=");
              SerialDBG.print(bytesReceived);
              SerialDBG.print(" elapsedMs=");
              SerialDBG.println(millis() - startedAt);
              return AtResult::Ok;
            }
          }
        }
        lineLength = 0;
        lineOverflow = false;
      } else if (c != '\r' && !lineOverflow) {
        if (lineLength + 1 < sizeof(line)) line[lineLength++] = c;
        else lineOverflow = true;  // Still stream the entire raw line to TTL.
      }
    }

    if (millis() - lastBatteryCheck >= 1000) {
      lastBatteryCheck = millis();
      if (!battery_safe()) return AtResult::LowBattery;
    }
    poll_console();
    // The raw modem response may contain a long JSON-like line. Avoid putting
    // a health marker in the middle of that line while still reporting waits.
    if (lineLength == 0) maybe_print_health();
    delay(1);
  }

  SerialDBG.print("[DEV][AT] TIMEOUT ");
  SerialDBG.print(command);
  SerialDBG.print(" bytes=");
  SerialDBG.print(bytesReceived);
  SerialDBG.print(" elapsedMs=");
  SerialDBG.println(millis() - startedAt);
  return AtResult::Timeout;
}

AtResult execute_at(const char *command, uint32_t timeoutMs,
                    ReplyMode mode = ReplyMode::Normal,
                    uint16_t *wifiApCount = nullptr,
                    LocationObservation *location = nullptr) {
  modemBusy = true;
  activeCommand = command;
  const AtResult result = send_at(command, timeoutMs, mode, wifiApCount, location);
  activeCommand = nullptr;
  modemBusy = false;
  return result;
}

AtResult run_at_result(const char *command, uint32_t timeoutMs,
                       ReplyMode mode = ReplyMode::Normal,
                       uint16_t *wifiApCount = nullptr,
                       LocationObservation *location = nullptr) {
  if (location) *location = LocationObservation{};
  const uint32_t startedAt = millis();
  const AtResult result = execute_at(command, timeoutMs, mode, wifiApCount, location);
  if (location) location->durationMs = millis() - startedAt;
  if (result == AtResult::Timeout || result == AtResult::Busy) {
    modemStateUnknown = true;
    SerialDBG.println("[DEV] Modem state unknown after timeout or busy result. Reset the board before more probes.");
  }
  return result;
}

bool run_at(const char *command, uint32_t timeoutMs,
            ReplyMode mode = ReplyMode::Normal,
            uint16_t *wifiApCount = nullptr) {
  return run_at_result(command, timeoutMs, mode, wifiApCount) == AtResult::Ok;
}

void print_status() {
  print_health();
  if (dataConnected) {
    SerialDBG.print("[DEV] dataIp=");
    SerialDBG.println(dataIp);
  }
}

void boot_modem() {
  set_boot_phase("battery_check");
  if (!battery_safe()) return;

  // Follow the working main firmware: power rail first, then modem UART,
  // then a second LDO settle and the PWRKEY pulse.
  set_boot_phase("ldo_on");
  digitalWrite(PA10, HIGH);
  modemPowered = true;
  if (!wait_with_console(600)) return;

  set_boot_phase("modem_uart");
  SerialGSM.begin(BAUD);
  modemUartStarted = true;

  set_boot_phase("pwrkey_prepare");
  digitalWrite(PA10, HIGH);
  if (!wait_with_console(600)) return;

  digitalWrite(PB13, HIGH);
  if (!wait_with_console(100)) return;
  set_boot_phase("pwrkey_low");
  digitalWrite(PB13, LOW);
  if (!wait_with_console(1200)) {
    digitalWrite(PB13, HIGH);
    return;
  }
  digitalWrite(PB13, HIGH);
  SerialDBG.println("[DEV] N706 power key pulsed. Waiting for boot ...");
  set_boot_phase("modem_boot_wait");
  if (!wait_with_console(3000)) return;

  for (uint8_t attempt = 1; attempt <= 5; attempt++) {
    set_boot_phase("modem_at_check");
    SerialDBG.print("[DEV] Modem check attempt ");
    SerialDBG.println(attempt);
    const AtResult result = execute_at("AT", AT_TIMEOUT_MS);
    if (result == AtResult::Ok) {
      modemReady = true;
      break;
    }
    if (result == AtResult::LowBattery) return;
    if (attempt < 5 && !wait_with_console(1000)) return;
  }

  if (!modemReady) {
    modemStateUnknown = true;
    set_boot_phase("modem_failed");
    SerialDBG.println("[DEV] Modem did not answer. Check power and wiring, then reset the board.");
    return;
  }

  SerialDBG.println("[DEV] Modem ready.");
  set_boot_phase("modem_revision");
  if (!run_at("AT+GMR", AT_TIMEOUT_MS) || modemStateUnknown) return;
  set_boot_phase("sim_status");
  run_at("AT+CPIN?", AT_TIMEOUT_MS);
}

void run_serving() {
  SerialDBG.println("[DEV][SERVING] Serving-cell identifiers only. ECI is NETDMSG CELL_ID.");
  run_at("AT+NETDMSG", AT_TIMEOUT_MS);
  if (modemStateUnknown) return;
  run_at("AT+NETMSG", AT_TIMEOUT_MS);
  if (modemStateUnknown) return;
  run_at("AT+CEREG?", AT_TIMEOUT_MS);
}

void run_neighbors() {
  SerialDBG.println("[DEV][NEIGHBORS] Raw scan. PCI/EARFCN are NOT LTE ECI.");
  SerialDBG.println("[DEV][NEIGHBORS] MYCELLINFO may take five minutes; do not send another command.");
  run_at("AT+MYCELLINFO", CELL_SCAN_TIMEOUT_MS);
  if (modemStateUnknown) return;
  run_at("AT+NRSP", NRSP_TIMEOUT_MS);
}

void run_engineering() {
  SerialDBG.println("[DEV][ENGINEERING] NWENG is an N58 candidate, not documented for N706.");
  if (run_at("AT+NWENG=?", AT_TIMEOUT_MS)) {
    run_at("AT+NWENG=\"ncell\"", AT_TIMEOUT_MS);
  } else if (!modemStateUnknown) {
    SerialDBG.println("[DEV][ENGINEERING] Unsupported or failed; ncell query skipped.");
  }
}

void run_nweng_direct() {
  SerialDBG.println("[DEV][NWENG_DIRECT] Querying ncell directly; PCI/EARFCN are not ECI.");
  run_at("AT+NWENG=\"ncell\"", AT_TIMEOUT_MS);
}

void run_wifi_scan() {
  SerialDBG.println("[DEV][WIFI_SCAN] Scanning access points; complete raw response follows.");
  run_at("AT+WIFIAPSCAN", WIFI_SCAN_TIMEOUT_MS);
}

void run_radio_snapshot() {
  const uint32_t startedAt = millis();
  SerialDBG.print("[DEV][RADIO_SNAPSHOT] START uptimeMs=");
  SerialDBG.println(startedAt);
  SerialDBG.println("[DEV][RADIO_SNAPSHOT] Raw MapQuest inputs only; no location request or data connection.");

  SerialDBG.println("[DEV][RADIO_SNAPSHOT] 1/4 serving_before: full ECI and radio measurements");
  if (!run_at("AT+NETDMSG", AT_TIMEOUT_MS)) {
    SerialDBG.println("[DEV][RADIO_SNAPSHOT] INCOMPLETE at serving_before.");
    return;
  }

  SerialDBG.println("[DEV][RADIO_SNAPSHOT] 2/4 neighbors: raw PCI/EARFCN scan; may take five minutes");
  if (!run_at("AT+MYCELLINFO", CELL_SCAN_TIMEOUT_MS)) {
    SerialDBG.println("[DEV][RADIO_SNAPSHOT] INCOMPLETE at neighbors.");
    return;
  }

  SerialDBG.println("[DEV][RADIO_SNAPSHOT] 3/4 wifi: raw AP MAC/RSSI scan");
  uint16_t wifiApCount = 0;
  if (!run_at("AT+WIFIAPSCAN", WIFI_SCAN_TIMEOUT_MS,
              ReplyMode::WifiScan, &wifiApCount)) {
    SerialDBG.println("[DEV][RADIO_SNAPSHOT] INCOMPLETE at wifi.");
    return;
  }
  SerialDBG.print("[DEV][RADIO_SNAPSHOT] Wi-Fi access points observed=");
  SerialDBG.println(wifiApCount);

  SerialDBG.println("[DEV][RADIO_SNAPSHOT] 4/4 serving_after: check for a serving-cell change");
  if (!run_at("AT+NETDMSG", AT_TIMEOUT_MS)) {
    SerialDBG.println("[DEV][RADIO_SNAPSHOT] INCOMPLETE at serving_after.");
    return;
  }

  SerialDBG.print("[DEV][RADIO_SNAPSHOT] COMPLETE elapsedMs=");
  SerialDBG.println(millis() - startedAt);
  SerialDBG.println("[DEV][RADIO_SNAPSHOT] Compare both serving replies. PCI is not ECI; do not assume scan entry 0 is serving.");
}

void run_wifi_location() {
  if (dataConnected) {
    SerialDBG.println("[DEV][WIFI_LOCATE] Data is already connected; reset the board before this ordered test.");
    return;
  }

  // The modem may have retained a data link across an MCU reset. Query it
  // before scanning so this experiment never claims a fresh dial-up falsely.
  dataIp[0] = '\0';
  if (!run_at("AT+XIIC?", AT_TIMEOUT_MS)) return;
  if (dataConnected) {
    SerialDBG.println("[DEV][WIFI_LOCATE] Data is already connected; reset the board before this ordered test.");
    return;
  }

  SerialDBG.println("[DEV][WIFI_LOCATE] Starting Wi-Fi scan before data connection.");
  uint16_t wifiApCount = 0;
  if (!run_at("AT+WIFIAPSCAN", WIFI_SCAN_TIMEOUT_MS,
              ReplyMode::WifiScan, &wifiApCount)) return;

  SerialDBG.print("[DEV][WIFI_LOCATE] Access points observed=");
  SerialDBG.println(wifiApCount);
  if (wifiApCount == 0) {
    SerialDBG.println("[DEV][WIFI_LOCATE] No access points found; positioning skipped.");
    return;
  }

  SerialDBG.println("[DEV][WIFI_LOCATE] Configuring APN internet and connecting data after the scan.");
  if (!run_at("AT+CGDCONT=1,\"IP\",\"internet\"", AT_TIMEOUT_MS)) return;
  if (!run_at("AT+XIIC=1", NETWORK_TIMEOUT_MS)) return;
  dataConnected = false;
  dataIp[0] = '\0';
  if (!run_at("AT+XIIC?", AT_TIMEOUT_MS)) return;
  if (!dataConnected) {
    SerialDBG.println("[DEV][WIFI_LOCATE] No usable IP in XIIC response; positioning skipped.");
    return;
  }
  SerialDBG.print("[DEV][WIFI_LOCATE] Data link ready, IP=");
  SerialDBG.println(dataIp);

  SerialDBG.println("[DEV][WIFI_LOCATE] Requesting Neoway Wi-Fi position; this is not a Google lookup.");
  run_at("AT+WIFIGSMLOC=1", NETWORK_TIMEOUT_MS, ReplyMode::WifiLocation);
}

const char *location_result_status(AtResult result) {
  switch (result) {
    case AtResult::Ok: return "success";
    case AtResult::ParseError: return "parse_failed";
    case AtResult::Timeout: return "timeout";
    case AtResult::Busy: return "busy";
    case AtResult::LowBattery: return "low_battery";
    default: return "service_failed";
  }
}

void print_position_result(const char *method, const char *status,
                           const LocationObservation &observation,
                           bool attempted) {
  SerialDBG.print("[DEV][POSITION_COMPARE] ");
  SerialDBG.print(method);
  SerialDBG.print(" status=");
  SerialDBG.print(status);
  SerialDBG.print(" latitude=");
  if (observation.valid) SerialDBG.print(observation.latitude, 8);
  else SerialDBG.print("null");
  SerialDBG.print(" longitude=");
  if (observation.valid) SerialDBG.print(observation.longitude, 8);
  else SerialDBG.print("null");
  SerialDBG.print(" accuracyMeters=");
  if (observation.valid && observation.accuracyKnown) {
    SerialDBG.print(observation.accuracyMeters, 1);
  } else {
    SerialDBG.print("null");
  }
  SerialDBG.print(" error=");
  if (observation.error[0]) SerialDBG.print(observation.error);
  else SerialDBG.print("null");
  SerialDBG.print(" elapsedMs=");
  if (attempted) SerialDBG.println(observation.durationMs);
  else SerialDBG.println("null");
}

void run_position_compare() {
  const uint32_t startedAt = millis();
  const char *setupStatus = "ok";
  const char *wifiStatus = "not_run";
  const char *cellStatus = "not_run";
  LocationObservation wifiLocation;
  LocationObservation cellLocation;
  bool wifiAttempted = false;
  bool cellAttempted = false;
  uint16_t wifiApCount = 0;

  SerialDBG.println("[DEV][POSITION_COMPARE] START; separate native Wi-Fi and cell positions.");
  do {
    if (dataConnected) {
      setupStatus = "already_connected";
      SerialDBG.println("[DEV][POSITION_COMPARE] Data is already connected; reset the board before this ordered test.");
      break;
    }

    // The modem can retain a data link after an MCU reset. Check its real
    // state before claiming that the scan precedes dial-up.
    dataConnected = false;
    dataIp[0] = '\0';
    if (run_at_result("AT+XIIC?", AT_TIMEOUT_MS) != AtResult::Ok) {
      setupStatus = "data_check_failed";
      break;
    }
    if (dataConnected) {
      setupStatus = "already_connected";
      SerialDBG.println("[DEV][POSITION_COMPARE] Data is already connected; reset the board before this ordered test.");
      break;
    }

    SerialDBG.println("[DEV][POSITION_COMPARE] Scanning Wi-Fi before data dial-up.");
    const AtResult scanResult = run_at_result("AT+WIFIAPSCAN", WIFI_SCAN_TIMEOUT_MS,
                                             ReplyMode::WifiScan, &wifiApCount);
    if (scanResult != AtResult::Ok) {
      wifiStatus = scanResult == AtResult::Timeout ? "scan_timeout"
        : scanResult == AtResult::LowBattery ? "low_battery" : "scan_failed";
      set_location_error(&wifiLocation, scanResult == AtResult::Timeout
        ? "AT+WIFIAPSCAN timed out" : "AT+WIFIAPSCAN failed");
      if (modemStateUnknown) {
        setupStatus = "modem_state_unknown";
        break;
      }
      SerialDBG.println("[DEV][POSITION_COMPARE] Wi-Fi scan failed; cell positioning will still be attempted.");
    } else {
      SerialDBG.print("[DEV][POSITION_COMPARE] Wi-Fi access points observed=");
      SerialDBG.println(wifiApCount);
      if (wifiApCount == 0) {
        wifiStatus = "no_aps";
        SerialDBG.println("[DEV][POSITION_COMPARE] No APs; skipping Wi-Fi positioning.");
      }
    }

    SerialDBG.println("[DEV][POSITION_COMPARE] Configuring APN internet and activating data.");
    if (run_at_result("AT+CGDCONT=1,\"IP\",\"internet\"", AT_TIMEOUT_MS)
        != AtResult::Ok) {
      setupStatus = "apn_failed";
      break;
    }
    if (run_at_result("AT+XIIC=1", NETWORK_TIMEOUT_MS) != AtResult::Ok) {
      setupStatus = "dial_up_failed";
      break;
    }
    dataConnected = false;
    dataIp[0] = '\0';
    if (run_at_result("AT+XIIC?", AT_TIMEOUT_MS) != AtResult::Ok || !dataConnected) {
      setupStatus = "ip_verification_failed";
      SerialDBG.println("[DEV][POSITION_COMPARE] No verified data IP; neither location service will run.");
      break;
    }
    SerialDBG.print("[DEV][POSITION_COMPARE] Data link ready, IP=");
    SerialDBG.println(dataIp);

    if (scanResult == AtResult::Ok && wifiApCount > 0) {
      wifiAttempted = true;
      const AtResult wifiResult = run_at_result("AT+WIFIGSMLOC=1", NETWORK_TIMEOUT_MS,
                                                ReplyMode::WifiLocation, nullptr,
                                                &wifiLocation);
      wifiStatus = location_result_status(wifiResult);
      if (modemStateUnknown) {
        setupStatus = "modem_state_unknown";
        SerialDBG.println("[DEV][POSITION_COMPARE] Wi-Fi result left modem state unknown; cell positioning skipped.");
        break;
      }
    }

    // A terminal Wi-Fi failure is safe to follow with cell positioning, but
    // do not silently reconnect if the original data link disappeared.
    dataConnected = false;
    dataIp[0] = '\0';
    if (run_at_result("AT+XIIC?", AT_TIMEOUT_MS) != AtResult::Ok || !dataConnected) {
      setupStatus = "connection_lost";
      SerialDBG.println("[DEV][POSITION_COMPARE] Data link unavailable; cell positioning skipped.");
      break;
    }

    SerialDBG.println("[DEV][POSITION_COMPARE] Requesting default cell-based position on the same data link.");
    cellAttempted = true;
    cellStatus = location_result_status(run_at_result("AT+CIPGSMLOC", NETWORK_TIMEOUT_MS,
                                                    ReplyMode::Location, nullptr,
                                                    &cellLocation));
    if (modemStateUnknown) setupStatus = "modem_state_unknown";
  } while (false);

  SerialDBG.print("[DEV][POSITION_COMPARE] setup=");
  SerialDBG.print(setupStatus);
  SerialDBG.print(" wifiAps=");
  SerialDBG.println(wifiApCount);
  print_position_result("wifi", wifiStatus, wifiLocation, wifiAttempted);
  print_position_result("cell", cellStatus, cellLocation, cellAttempted);
  SerialDBG.print("[DEV][POSITION_COMPARE] END elapsedMs=");
  SerialDBG.println(millis() - startedAt);
}

void run_netup() {
  dataConnected = false;
  dataIp[0] = '\0';
  if (run_at("AT+XIIC?", AT_TIMEOUT_MS) && dataConnected) {
    SerialDBG.println("[DEV][NETUP] Data link already connected.");
    return;
  }
  if (modemStateUnknown) return;

  if (!run_at("AT+CGDCONT=1,\"IP\",\"internet\"", AT_TIMEOUT_MS)) return;
  if (!run_at("AT+XIIC=1", NETWORK_TIMEOUT_MS)) return;
  dataConnected = false;
  dataIp[0] = '\0';
  if (!run_at("AT+XIIC?", AT_TIMEOUT_MS)) return;
  SerialDBG.println(dataConnected
    ? "[DEV][NETUP] Data link ready."
    : "[DEV][NETUP] No usable IP in XIIC response; location tests remain disabled.");
}

void run_location(bool multiple) {
  if (!dataConnected) {
    SerialDBG.println("[DEV][LOCATION] Run NETUP first and confirm an IP address.");
    return;
  }
  SerialDBG.println(multiple
    ? "[DEV][LOCATION] Multiple-base-station request; coordinates are not tower ECIs."
    : "[DEV][LOCATION] Default/single-base-station request; coordinates are not tower ECIs.");
  run_at(multiple ? "AT+CIPGSMLOC=1" : "AT+CIPGSMLOC",
         NETWORK_TIMEOUT_MS, ReplyMode::Location);
}

void dispatch(const char *command) {
  if (strcmp(command, "HELP") == 0) {
    show_help();
    return;
  }
  if (strcmp(command, "STATUS") == 0) {
    print_status();
    return;
  }
  if (modemBusy) {
    SerialDBG.print("[DEV] Modem busy with ");
    SerialDBG.println(activeCommand ? activeCommand : "an AT command");
    return;
  }
  if (bootInProgress) {
    SerialDBG.print("[DEV] Boot still in progress: ");
    SerialDBG.println(bootPhase);
    return;
  }
  if (!modemReady || modemStateUnknown || !modemPowered) {
    SerialDBG.println("[DEV] Modem unavailable. Check STATUS and reset the board after fixing power/wiring.");
    return;
  }

  if (strcmp(command, "SERVING") == 0) run_serving();
  else if (strcmp(command, "NEIGHBORS") == 0) run_neighbors();
  else if (strcmp(command, "ENGINEERING") == 0) run_engineering();
  else if (strcmp(command, "NWENG_DIRECT") == 0) run_nweng_direct();
  else if (strcmp(command, "WIFI_SCAN") == 0) run_wifi_scan();
  else if (strcmp(command, "RADIO_SNAPSHOT") == 0) run_radio_snapshot();
  else if (strcmp(command, "WIFI_LOCATE") == 0) run_wifi_location();
  else if (strcmp(command, "POSITION_COMPARE") == 0) run_position_compare();
  else if (strcmp(command, "NETUP") == 0) run_netup();
  else if (strcmp(command, "LOCATE_SINGLE") == 0) run_location(false);
  else if (strcmp(command, "LOCATE") == 0) run_location(true);
  else {
    SerialDBG.println("[DEV] Unknown command. Type HELP.");
    return;
  }

  // Ignore commands typed while a long modem operation was in progress.
  while (SerialDBG.available()) SerialDBG.read();
  SerialDBG.println(modemStateUnknown
    ? "[DEV] Command ended with unknown modem state. Reset before more probes."
    : "[DEV] Command finished. Ready for the next command.");
}

void poll_console() {
  static char input[32] = "";
  static size_t inputLength = 0;
  static bool inputOverflow = false;

  while (SerialDBG.available()) {
    const char c = (char)SerialDBG.read();
    if (c == '\r' || c == '\n') {
      if (!inputLength && !inputOverflow) continue;
      input[inputLength] = '\0';
      char completed[sizeof(input)];
      memcpy(completed, input, inputLength + 1);
      const bool wasOverflow = inputOverflow;
      inputLength = 0;
      inputOverflow = false;
      if (wasOverflow) SerialDBG.println("[DEV] Command too long. Type HELP.");
      else dispatch(completed);
    } else if (!inputOverflow) {
      if (inputLength + 1 < sizeof(input)) input[inputLength++] = c;
      else inputOverflow = true;
    }
  }
}

void setup() {
  pinMode(PB13, OUTPUT);
  digitalWrite(PB13, HIGH);
  pinMode(PA10, OUTPUT);
  digitalWrite(PA10, LOW);
  analogReadResolution(12);
  pinMode(PB10, INPUT_ANALOG);

  SerialDBG.begin(BAUD);
  delay(200);
  SerialDBG.println("[DEV][BOOT] Stepwhere N706 cell-ID experiment firmware");
  set_boot_phase("console_ready");
  show_help();
  print_battery();
  boot_modem();
  bootInProgress = false;
  if (modemReady && !modemStateUnknown) set_boot_phase("ready");
  else if (strcmp(bootPhase, "battery_low") != 0
           && strcmp(bootPhase, "modem_failed") != 0) set_boot_phase("failed");
  SerialDBG.println("[DEV][BOOT] Startup complete; TTL health reports every five seconds.");
  print_status();
}

void loop() {
  static uint32_t lastBatteryCheck = 0;

  if (modemPowered && millis() - lastBatteryCheck >= 1000) {
    lastBatteryCheck = millis();
    battery_safe();
  }

  poll_console();
  maybe_print_health();

  // Preserve unsolicited modem output when no command owns the modem UART.
  if (modemUartStarted) {
    while (SerialGSM.available()) SerialDBG.write((uint8_t)SerialGSM.read());
  }
  delay(1);
}
