/**
 * Stepwhere tracker — accelerometer debug firmware
 * STM32G071CB + LIS2DH12. The modem and GPS stay switched off.
 *
 * Diagnoses the LIS2DH12 and prints plain-language verdicts:
 *   1. Supply: VDDA and battery, and the sensor's own rail measured on PA1.
 *      PA1 reaches SA0 through R26, and SA0 has an internal pull-up to the
 *      sensor's VDD_IO, so with PA1 undriven its ADC reads that rail.
 *   2. Back-powering: drives PA1 high, releases it and records how the rail
 *      decays. A rail that sinks back down is not fed by its own supply.
 *   3. Bus: I2C line levels and pull-ups, software I2C scans on normal and
 *      swapped pins, hardware scans with SA0 undriven, high and low.
 *   4. Once found: production configuration (25 Hz, ±8 g, FIFO stream),
 *      register dump and the sensor's built-in self-test.
 *   5. Every second: samples, FIFO overruns, I2C errors, X/Y/Z, |a| range,
 *      pedometer state and steps, and why motion bursts were rejected.
 *
 * PA1 is left undriven by default so the MCU cannot power the sensor
 * through SA0.
 *
 * TTL commands (115200): d = full diagnosis, p = cycle PA1 undriven/high/low,
 * s = self-test, r = raw samples on/off, z = zero counters, h = help.
 *
 * Pin Mapping:
 *   DEBUG      : PB6 / PB7   (USART1, 115200 baud TTL)
 *   ACCEL      : I2C SDA PA12 / SCL PA11, SA0 PA1 (via R26), INT2 PB4
 *   LDO_EN     : PA10        (modem + GPS rail, held off)
 *   GSM PWRKEY : PB13        (held idle high)
 */

#include <Wire.h>
#include <HardwareSerial.h>
#include <stdarg.h>

#include "src/pedometer.h"

#define APP_VERSION "accel-debug v2"

// The ADC must sample long enough to read PA1 through R26 and the sensor's
// internal pull-up; scripts/build-arduino.sh sets this for this variant.
#ifndef ADC_SAMPLINGTIME
#error "Build with: pnpm build:accel-test (sets ADC_SAMPLINGTIME)"
#endif

// ─── Pins ─────────────────────────────────────────────────────────────────────
#define GSM_PWRKEY PB13
#define LDO_EN PA10
#define GSM_RX PA3
#define GSM_TX PA2
#define GPS_RX PB9
#define GPS_TX PB8
#define I2C_SDA PA12
#define I2C_SCL PA11
#define ACCEL_SA0 PA1
#define ACCEL_INT2 PB4

#define ADC_PIN PB10
#define ADC_VREF_CH AVREF
#define ADC_RESOLUTION 12

// ─── LIS2DH12 ─────────────────────────────────────────────────────────────────
#define LIS2DH12_VDD_MIN_MV 1710
#define ACCEL_REG_WHO_AM_I 0x0F
#define LIS2DH12_WHO_AM_I 0x33
#define LIS2DH12_TEMP_CFG 0x1F
#define LIS2DH12_CTRL_REG1 0x20
#define LIS2DH12_CTRL_REG2 0x21
#define LIS2DH12_CTRL_REG3 0x22
#define LIS2DH12_CTRL_REG4 0x23
#define LIS2DH12_CTRL_REG5 0x24
#define LIS2DH12_CTRL_REG6 0x25
#define LIS2DH12_STATUS_REG 0x27
#define LIS2DH12_OUT_X_L 0x28
#define LIS2DH12_FIFO_CTRL 0x2E
#define LIS2DH12_FIFO_SRC 0x2F
#define LIS2DH12_ODR_25HZ_XYZ 0x37   // CTRL_REG1: 25 Hz, normal mode, X/Y/Z on
#define LIS2DH12_BDU_8G 0xA0         // CTRL_REG4: block data update, ±8 g
#define LIS2DH12_FIFO_ENABLE 0x40    // CTRL_REG5
#define LIS2DH12_FIFO_STREAM 0x80    // FIFO_CTRL: stream mode
#define ACCEL_POLL_INTERVAL_MS 200UL
#define RESCAN_INTERVAL_MS 10000UL

HardwareSerial SerialDBG(PB7, PB6);  // USART1 — Debug console
TwoWire dev_i2c(I2C_SDA, I2C_SCL);
stepwhere::ShoePedometer g_pedometer;

void say(const char *format, ...) {
  char line[220];
  va_list args;
  va_start(args, format);
  vsnprintf(line, sizeof(line), format, args);
  va_end(args);
  SerialDBG.println(line);
}

// =============================================================================
//  SOFTWARE I2C — independent of the I2C peripheral and its pin mapping
// =============================================================================

class SoftI2C {
 public:
  SoftI2C(uint32_t sda, uint32_t scl) : sda_(sda), scl_(scl) {}

  void begin() {
    digitalWrite(sda_, HIGH);
    digitalWrite(scl_, HIGH);
    pinMode(sda_, OUTPUT_OPEN_DRAIN);
    pinMode(scl_, OUTPUT_OPEN_DRAIN);
    digitalWrite(sda_, HIGH);
    digitalWrite(scl_, HIGH);
    delayMicroseconds(20);
  }

  void end() {
    pinMode(sda_, INPUT);
    pinMode(scl_, INPUT);
  }

  bool start() {
    if (!digitalRead(sda_) || !digitalRead(scl_)) return false;
    sda(false);
    half();
    scl(false);
    half();
    return true;
  }

  void restart() {
    sda(true);
    half();
    scl(true);
    half();
    sda(false);
    half();
    scl(false);
    half();
  }

  void stop() {
    sda(false);
    half();
    scl(true);
    half();
    sda(true);
    half();
  }

  bool write(uint8_t value) {
    for (int8_t bit = 7; bit >= 0; --bit) {
      sda((value >> bit) & 1);
      half();
      scl(true);
      half();
      scl(false);
    }
    sda(true);
    half();
    scl(true);
    half();
    const bool ack = !digitalRead(sda_);
    scl(false);
    half();
    return ack;
  }

  uint8_t read_nack() {
    uint8_t value = 0;
    sda(true);
    for (uint8_t i = 0; i < 8; ++i) {
      half();
      scl(true);
      half();
      value = (value << 1) | (digitalRead(sda_) ? 1 : 0);
      scl(false);
    }
    half();
    scl(true);  // NACK: SDA stays released
    half();
    scl(false);
    half();
    return value;
  }

  bool probe(uint8_t address) {
    if (!start()) return false;
    const bool ack = write(address << 1);
    stop();
    return ack;
  }

  bool read_register(uint8_t address, uint8_t reg, uint8_t &value) {
    if (!start()) return false;
    bool ok = write(address << 1) && write(reg);
    if (ok) {
      restart();
      ok = write((address << 1) | 1);
      if (ok) value = read_nack();
    }
    stop();
    return ok;
  }

 private:
  void sda(bool high) { digitalWrite(sda_, high ? HIGH : LOW); }
  void scl(bool high) { digitalWrite(scl_, high ? HIGH : LOW); }
  static void half() { delayMicroseconds(5); }  // ~100 kHz

  uint32_t sda_;
  uint32_t scl_;
};

// =============================================================================
//  HARDWARE I2C HELPERS
// =============================================================================

uint8_t g_accel_address = 0;
bool g_accel_ready = false;
bool g_i2c_started = false;  // TwoWire::end() faults if begin() never ran

bool accel_write(uint8_t reg, uint8_t value) {
  dev_i2c.beginTransmission(g_accel_address);
  dev_i2c.write(reg);
  dev_i2c.write(value);
  return dev_i2c.endTransmission() == 0;
}

bool accel_read(uint8_t address, uint8_t reg, uint8_t *data, uint8_t length) {
  dev_i2c.beginTransmission(address);
  dev_i2c.write(length > 1 ? (reg | 0x80) : reg);  // MSB set = auto-increment
  if (dev_i2c.endTransmission(false) != 0) return false;
  if (dev_i2c.requestFrom(address, length) != length) return false;
  for (uint8_t i = 0; i < length; ++i) data[i] = dev_i2c.read();
  return true;
}

void i2c_start() {
  if (g_i2c_started) return;
  dev_i2c.begin();
  g_i2c_started = true;
  delay(5);
}

void i2c_stop() {
  if (!g_i2c_started) return;
  dev_i2c.end();
  g_i2c_started = false;
}

const char *i2c_result_name(uint8_t code) {
  switch (code) {
    case 0: return "ACK";
    case 2: return "NACK";
    case 4: return "bus error";
    case 5: return "timeout";
    default: return "error";
  }
}

// =============================================================================
//  ANALOG MEASUREMENTS
// =============================================================================

uint32_t vdda_mv() {
  analogRead(ADC_VREF_CH);  // first conversion after a channel switch is discarded
  uint32_t sum = 0;
  for (uint8_t i = 0; i < 8; ++i) sum += analogRead(ADC_VREF_CH);
  if (sum == 0) return 0;
  return (1212UL * 4095UL * 8UL) / sum;
}

uint32_t battery_mv(uint32_t vdda) {
  analogRead(ADC_PIN);
  uint32_t sum = 0;
  for (uint8_t i = 0; i < 8; ++i) sum += analogRead(ADC_PIN);
  return (sum * vdda * 2UL) / (8UL * 4095UL);  // 1:2 divider
}

// PA1 voltage; only meaningful while PA1 is undriven (analog mode).
uint32_t pa1_mv(uint32_t vdda, uint8_t samples = 8) {
  analogRead(ACCEL_SA0);
  uint32_t sum = 0;
  for (uint8_t i = 0; i < samples; ++i) sum += analogRead(ACCEL_SA0);
  return (sum * vdda) / ((uint32_t)samples * 4095UL);
}

// =============================================================================
//  SA0 / PA1 DRIVE
// =============================================================================

enum Sa0Mode : uint8_t { SA0_UNDRIVEN, SA0_HIGH, SA0_LOW };
Sa0Mode g_sa0 = SA0_UNDRIVEN;

const char *sa0_name(uint8_t mode) {
  switch (mode) {
    case SA0_HIGH: return "PA1 high";
    case SA0_LOW: return "PA1 low";
    default: return "PA1 undriven";
  }
}

void set_sa0(uint8_t mode) {
  g_sa0 = (Sa0Mode)mode;
  if (mode == SA0_UNDRIVEN) {
    pinMode(ACCEL_SA0, INPUT_ANALOG);
  } else {
    pinMode(ACCEL_SA0, OUTPUT);
    digitalWrite(ACCEL_SA0, mode == SA0_HIGH ? HIGH : LOW);
  }
}

// =============================================================================
//  DIAGNOSIS
// =============================================================================

struct Diagnosis {
  uint32_t vdda = 0;
  uint32_t battery = 0;
  uint32_t rail = 0;          // sensor VDD_IO estimate, PA1 undriven, settled
  uint32_t rail_after_drive = 0;
  uint32_t rail_after_1s = 0;
  bool sda_high = false;
  bool scl_high = false;
  bool pullups = false;
  uint8_t soft_devices = 0;
  uint8_t soft_swapped_devices = 0;
  bool ack[3] = {false, false, false};  // per Sa0Mode, any of 0x18/0x19
} g_diag;

void check_lines() {
  i2c_stop();
  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  delay(2);
  g_diag.sda_high = digitalRead(I2C_SDA);
  g_diag.scl_high = digitalRead(I2C_SCL);
  pinMode(I2C_SDA, INPUT_PULLDOWN);
  pinMode(I2C_SCL, INPUT_PULLDOWN);
  delay(2);
  g_diag.pullups = digitalRead(I2C_SDA) && digitalRead(I2C_SCL);
  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  say("[BUS] SDA=%d SCL=%d idle; against internal pull-down %s.", g_diag.sda_high, g_diag.scl_high,
      g_diag.pullups ? "both stay high (external pull-ups present)" : "a line drops (pull-up missing or unpowered)");
  if (!g_diag.sda_high && g_diag.scl_high) {
    say("[BUS] SDA held low; clocking SCL 9 times to release a stuck device.");
    pinMode(I2C_SCL, OUTPUT_OPEN_DRAIN);
    for (uint8_t i = 0; i < 9 && !digitalRead(I2C_SDA); ++i) {
      digitalWrite(I2C_SCL, LOW);
      delayMicroseconds(5);
      digitalWrite(I2C_SCL, HIGH);
      delayMicroseconds(5);
    }
    pinMode(I2C_SCL, INPUT);
    say("[BUS] After recovery: SDA=%d SCL=%d", digitalRead(I2C_SDA), digitalRead(I2C_SCL));
  }
}

uint8_t soft_scan(uint32_t sda, uint32_t scl, const char *label) {
  i2c_stop();
  SoftI2C bus(sda, scl);
  bus.begin();
  uint8_t found = 0;
  for (uint8_t address = 0x08; address <= 0x77; ++address) {
    if (!bus.probe(address)) continue;
    ++found;
    uint8_t who = 0;
    const bool read = bus.read_register(address, ACCEL_REG_WHO_AM_I, who);
    say("[SCAN] %s: 0x%02X answered, WHO_AM_I=%s0x%02X%s", label, address, read ? "" : "(read failed) ", who,
        who == LIS2DH12_WHO_AM_I ? " (LIS2DH12)" : "");
  }
  bus.end();
  if (!found) say("[SCAN] %s: no device answered at any address.", label);
  return found;
}

// Probes 0x18/0x19 with the hardware peripheral; returns the best address or 0.
uint8_t hw_probe(bool verbose) {
  i2c_start();
  uint8_t candidate = 0;
  for (uint8_t address = 0x18; address <= 0x19; ++address) {
    dev_i2c.beginTransmission(address);
    const uint8_t result = dev_i2c.endTransmission();
    uint8_t who = 0;
    const bool read = result == 0 && accel_read(address, ACCEL_REG_WHO_AM_I, &who, 1);
    if (verbose) {
      if (result != 0) say("[SCAN] hw %s: 0x%02X %s", sa0_name(g_sa0), address, i2c_result_name(result));
      else say("[SCAN] hw %s: 0x%02X ACK, WHO_AM_I=%s0x%02X%s", sa0_name(g_sa0), address, read ? "" : "(read failed) ",
               who, who == LIS2DH12_WHO_AM_I ? " = LIS2DH12" : " (not 0x33: different or clone chip)");
    }
    if (result == 0 && (!candidate || who == LIS2DH12_WHO_AM_I)) candidate = address;
  }
  return candidate;
}

void rail_drive_test() {
  set_sa0(SA0_UNDRIVEN);
  delay(300);
  const uint32_t before = pa1_mv(g_diag.vdda);
  set_sa0(SA0_HIGH);
  delay(300);
  set_sa0(SA0_UNDRIVEN);
  const uint32_t marks_ms[] = {0, 5, 20, 100, 300, 1000};
  uint32_t values[6];
  const uint32_t released = millis();
  for (uint8_t i = 0; i < 6; ++i) {
    while (millis() - released < marks_ms[i]) {}
    values[i] = pa1_mv(g_diag.vdda, 2);
  }
  g_diag.rail_after_drive = values[0];
  g_diag.rail_after_1s = values[5];
  say("[RAIL] PA1 driven high for 300 ms, then released. Rail on PA1 (mV): before=%lu  0ms=%lu 5ms=%lu 20ms=%lu "
      "100ms=%lu 300ms=%lu 1s=%lu", before, values[0], values[1], values[2], values[3], values[4], values[5]);
}

void print_verdicts() {
  const Diagnosis &d = g_diag;
  say("[VERDICT] ---------------------------------------------------------------");
  say("[VERDICT] MCU supply VDDA=%lu mV, battery=%lu mV.", d.vdda, d.battery);
  if (d.rail < 300) {
    say("[VERDICT] Sensor rail reads %lu mV on PA1: the sensor is UNPOWERED, or its SA0 pad is not soldered.", d.rail);
  } else if (d.rail < LIS2DH12_VDD_MIN_MV) {
    say("[VERDICT] Sensor rail ~%lu mV is BELOW the LIS2DH12 minimum of 1710 mV: it cannot run.", d.rail);
  } else if (d.rail + 300 < d.vdda) {
    say("[VERDICT] Sensor rail ~%lu mV is in range but well below VDDA (%lu mV): its feed (R9/R8) is not a "
        "direct 3.3 V supply.", d.rail, d.vdda);
  } else {
    say("[VERDICT] Sensor rail ~%lu mV matches VDDA: supply looks good.", d.rail);
  }
  if (d.rail_after_drive > d.rail + 300) {
    say("[VERDICT] Driving PA1 high lifted the rail to %lu mV and it sank to %lu mV after release: the MCU was "
        "back-powering the sensor through SA0 (R26). Readings taken with PA1 high are not the real supply.",
        d.rail_after_drive, d.rail_after_1s);
  }
  if (!d.pullups) say("[VERDICT] I2C pull-ups missing or unpowered (R10 SDA, R23 SCL).");
  const bool any_ack = d.ack[SA0_UNDRIVEN] || d.ack[SA0_HIGH] || d.ack[SA0_LOW];
  if (any_ack) {
    say("[VERDICT] Sensor answers on I2C (undriven:%s high:%s low:%s).", d.ack[SA0_UNDRIVEN] ? "yes" : "no",
        d.ack[SA0_HIGH] ? "yes" : "no", d.ack[SA0_LOW] ? "yes" : "no");
  } else if (d.soft_devices || d.soft_swapped_devices) {
    say("[VERDICT] Something answers on the bus but not at 0x18/0x19: see [SCAN] lines for the address and ID.");
  } else if (d.rail >= LIS2DH12_VDD_MIN_MV && d.rail + 300 >= d.vdda) {
    say("[VERDICT] Supply is good but nothing answers at any address: suspect IC7 itself (soldering or part).");
  } else {
    say("[VERDICT] Nothing answers at any address, consistent with the supply problem above. Fix the supply first.");
  }
  say("[VERDICT] ---------------------------------------------------------------");
}

bool lis2dh12_configure() {
  bool ok = true;
  ok &= accel_write(LIS2DH12_CTRL_REG1, 0x00);  // power down while configuring
  ok &= accel_write(LIS2DH12_CTRL_REG2, 0x00);  // no high-pass: the pedometer needs gravity
  ok &= accel_write(LIS2DH12_CTRL_REG3, 0x00);  // FIFO is polled, no interrupts
  ok &= accel_write(LIS2DH12_CTRL_REG4, LIS2DH12_BDU_8G);
  ok &= accel_write(LIS2DH12_CTRL_REG5, LIS2DH12_FIFO_ENABLE);
  ok &= accel_write(LIS2DH12_CTRL_REG6, 0x00);
  ok &= accel_write(LIS2DH12_FIFO_CTRL, 0x00);  // bypass clears the FIFO
  ok &= accel_write(LIS2DH12_FIFO_CTRL, LIS2DH12_FIFO_STREAM);
  ok &= accel_write(LIS2DH12_CTRL_REG1, LIS2DH12_ODR_25HZ_XYZ);
  uint8_t ctrl1 = 0;
  const bool readback = accel_read(g_accel_address, LIS2DH12_CTRL_REG1, &ctrl1, 1);
  say("[ACCEL] Configure writes %s, CTRL_REG1 readback %s0x%02X (want 0x37)", ok ? "ACKed" : "FAILED",
      readback ? "" : "(read failed) ", ctrl1);
  return ok && readback && ctrl1 == LIS2DH12_ODR_25HZ_XYZ;
}

void dump_registers() {
  const uint8_t regs[] = {
    ACCEL_REG_WHO_AM_I, LIS2DH12_TEMP_CFG, LIS2DH12_CTRL_REG1, LIS2DH12_CTRL_REG2,
    LIS2DH12_CTRL_REG3, LIS2DH12_CTRL_REG4, LIS2DH12_CTRL_REG5, LIS2DH12_CTRL_REG6,
    LIS2DH12_STATUS_REG, LIS2DH12_FIFO_CTRL, LIS2DH12_FIFO_SRC,
  };
  char line[200];
  int used = snprintf(line, sizeof(line), "[REG]");
  for (uint8_t reg : regs) {
    uint8_t value = 0;
    const bool ok = accel_read(g_accel_address, reg, &value, 1);
    used += snprintf(line + used, sizeof(line) - used, ok ? " %02X=%02X" : " %02X=??", reg, value);
  }
  SerialDBG.println(line);
  say("[REG] Expected: 0F=33 20=37 23=A0 24=40 2E=80 (2F counts FIFO samples)");
}

// Mean of n direct output reads at ±2 g normal mode, in mg; false on I2C error.
bool average_output_mg(uint8_t n, int32_t out[3]) {
  int32_t sum[3] = {0, 0, 0};
  for (uint8_t i = 0; i < n; ++i) {
    const uint32_t started = millis();
    uint8_t status = 0;
    do {
      if (!accel_read(g_accel_address, LIS2DH12_STATUS_REG, &status, 1)) return false;
      if (millis() - started > 200) return false;
    } while (!(status & 0x08));  // ZYXDA: new X/Y/Z sample
    uint8_t raw[6];
    if (!accel_read(g_accel_address, LIS2DH12_OUT_X_L, raw, sizeof(raw))) return false;
    for (uint8_t axis = 0; axis < 3; ++axis) {
      // 10-bit left-justified; ±2 g normal mode is 4 mg per digit.
      sum[axis] += ((int16_t)(raw[2 * axis] | (raw[2 * axis + 1] << 8)) >> 6) * 4;
    }
  }
  for (uint8_t axis = 0; axis < 3; ++axis) out[axis] = sum[axis] / n;
  return true;
}

// Built-in self-test: an internal force moves the proof mass; the output must
// shift. Limits are the LIS2DH12 normal-mode range of 17-360 digits at ±2 g.
void self_test() {
  if (!g_accel_address) {
    say("[SELFTEST] No sensor to test.");
    return;
  }
  bool ok = true;
  ok &= accel_write(LIS2DH12_CTRL_REG1, 0x00);
  ok &= accel_write(LIS2DH12_FIFO_CTRL, 0x00);
  ok &= accel_write(LIS2DH12_CTRL_REG5, 0x00);
  ok &= accel_write(LIS2DH12_CTRL_REG4, 0x80);  // BDU, ±2 g, normal mode
  ok &= accel_write(LIS2DH12_CTRL_REG1, 0x47);  // 50 Hz, X/Y/Z
  delay(100);
  int32_t base[3], test[3];
  ok = ok && average_output_mg(1, base) && average_output_mg(5, base);
  ok &= accel_write(LIS2DH12_CTRL_REG4, 0x82);  // self-test 0
  delay(100);
  ok = ok && average_output_mg(1, test) && average_output_mg(5, test);
  accel_write(LIS2DH12_CTRL_REG4, 0x80);
  if (!ok) {
    say("[SELFTEST] I2C error during self-test.");
  } else {
    bool pass = true;
    int32_t delta[3];
    for (uint8_t axis = 0; axis < 3; ++axis) {
      delta[axis] = test[axis] - base[axis];
      const int32_t magnitude = delta[axis] < 0 ? -delta[axis] : delta[axis];
      if (magnitude < 17 * 4 || magnitude > 360 * 4) pass = false;
    }
    say("[SELFTEST] Output shift X=%ld Y=%ld Z=%ld mg (each must be 68..1440 mg): %s", delta[0], delta[1], delta[2],
        pass ? "PASS, the sensing element works" : "FAIL, the sensing element does not respond correctly");
  }
  g_accel_ready = lis2dh12_configure();
}

void full_diagnosis() {
  say("[DIAG] Full diagnosis (modem and GPS rail off).");
  g_accel_ready = false;
  g_accel_address = 0;

  set_sa0(SA0_UNDRIVEN);
  delay(300);
  g_diag.vdda = vdda_mv();
  g_diag.battery = battery_mv(g_diag.vdda);
  g_diag.rail = pa1_mv(g_diag.vdda, 16);
  say("[POWER] VDDA=%lu mV battery=%lu mV sensor rail on PA1 (undriven)=%lu mV (LIS2DH12 needs 1710..3600)",
      g_diag.vdda, g_diag.battery, g_diag.rail);
  rail_drive_test();

  check_lines();
  g_diag.soft_devices = soft_scan(I2C_SDA, I2C_SCL, "soft SDA=PA12 SCL=PA11");
  g_diag.soft_swapped_devices = soft_scan(I2C_SCL, I2C_SDA, "soft swapped SDA=PA11 SCL=PA12");

  uint8_t found = 0;
  Sa0Mode found_mode = SA0_UNDRIVEN;
  const Sa0Mode modes[] = {SA0_UNDRIVEN, SA0_HIGH, SA0_LOW};
  for (Sa0Mode mode : modes) {
    set_sa0(mode);
    delay(20);
    const uint8_t address = hw_probe(true);
    g_diag.ack[mode] = address != 0;
    if (address && !found) {
      found = address;
      found_mode = mode;
    }
  }
  set_sa0(found ? found_mode : SA0_UNDRIVEN);
  print_verdicts();

  if (!found) {
    say("[DIAG] Live rail and bus status every second; quick rescan every %lu s; 'd' repeats this.",
        RESCAN_INTERVAL_MS / 1000);
    i2c_stop();
    return;
  }
  i2c_start();
  g_accel_address = found;
  say("[ACCEL] Using 0x%02X with %s.", g_accel_address, sa0_name(g_sa0));
  g_accel_ready = lis2dh12_configure();
  dump_registers();
  self_test();
  say(g_accel_ready ? "[ACCEL] Ready: 25 Hz, +/-8 g, FIFO stream, polled every 200 ms."
                    : "[ACCEL] Configuration did not stick.");
}

// Quiet periodic retry while the sensor is missing; reports only changes.
void quick_rescan() {
  const uint8_t address = hw_probe(false);
  if (address) {
    say("[SCAN] Sensor now answers at 0x%02X; running the full diagnosis.", address);
    full_diagnosis();
  } else {
    i2c_stop();
  }
}

// =============================================================================
//  PER-SECOND STATISTICS
// =============================================================================

struct SecondStats {
  uint16_t samples = 0;
  uint16_t overruns = 0;
  uint16_t i2c_errors = 0;
  int32_t sum_x = 0, sum_y = 0, sum_z = 0;
  uint32_t min_mag = UINT32_MAX;
  uint32_t max_mag = 0;
  uint16_t steps = 0;
} g_second;

uint32_t g_total_steps = 0;
uint32_t g_last_poll = 0;
uint32_t g_last_second = 0;
uint32_t g_last_rescan = 0;
uint32_t g_seconds = 0;
bool g_raw = false;

void poll_fifo() {
  uint8_t fifo_src = 0;
  if (!accel_read(g_accel_address, LIS2DH12_FIFO_SRC, &fifo_src, 1)) {
    g_second.i2c_errors++;
    return;
  }
  uint8_t samples = fifo_src & 0x1F;
  if (fifo_src & 0x40) {  // overrun: the FIFO is full and older samples were lost
    samples = 32;
    g_second.overruns++;
  }
  for (uint8_t i = 0; i < samples; ++i) {
    uint8_t raw[6];
    if (!accel_read(g_accel_address, LIS2DH12_OUT_X_L, raw, sizeof(raw))) {
      g_second.i2c_errors++;
      break;
    }
    // Left-justified output; at ±8 g one LSB of the 16-bit word is 0.25 mg.
    const int16_t x = (int16_t)(raw[0] | (raw[1] << 8)) >> 2;
    const int16_t y = (int16_t)(raw[2] | (raw[3] << 8)) >> 2;
    const int16_t z = (int16_t)(raw[4] | (raw[5] << 8)) >> 2;
    if (g_raw) say("A,%d,%d,%d", x, y, z);

    const uint32_t ax = x < 0 ? -(int32_t)x : x;
    const uint32_t ay = y < 0 ? -(int32_t)y : y;
    const uint32_t az = z < 0 ? -(int32_t)z : z;
    const uint32_t magnitude = stepwhere::isqrt32(ax * ax + ay * ay + az * az);
    if (magnitude < g_second.min_mag) g_second.min_mag = magnitude;
    if (magnitude > g_second.max_mag) g_second.max_mag = magnitude;
    g_second.sum_x += x;
    g_second.sum_y += y;
    g_second.sum_z += z;
    g_second.samples++;

    const uint16_t steps = g_pedometer.update(x, y, z);
    if (steps) {
      g_second.steps += steps;
      g_total_steps += steps;
      say("[STEP] +%u (total %lu)", steps, g_total_steps);
    }
  }
}

void report_second() {
  g_seconds++;
  const uint32_t vdda = vdda_mv();
  if (!g_accel_ready) {
    const uint32_t rail = g_sa0 == SA0_UNDRIVEN ? pa1_mv(vdda) : 0;
    i2c_stop();
    pinMode(I2C_SDA, INPUT);
    pinMode(I2C_SCL, INPUT);
    char rail_text[24];
    if (g_sa0 == SA0_UNDRIVEN) snprintf(rail_text, sizeof(rail_text), "%lu mV", rail);
    else snprintf(rail_text, sizeof(rail_text), "n/a (%s)", sa0_name(g_sa0));
    say("[1S] t=%lus accel=NOT FOUND | sensor rail %s %s | VDDA %lu mV | SDA=%d SCL=%d", g_seconds, rail_text,
        g_sa0 == SA0_UNDRIVEN ? (rail < LIS2DH12_VDD_MIN_MV ? "(TOO LOW)" : "(ok)") : "", vdda,
        digitalRead(I2C_SDA), digitalRead(I2C_SCL));
    return;
  }
  uint8_t ctrl1 = 0;
  const bool ctrl_ok = accel_read(g_accel_address, LIS2DH12_CTRL_REG1, &ctrl1, 1);
  const uint16_t n = g_second.samples;
  const stepwhere::PedometerStats &ped = g_pedometer.stats();
  char line[240];
  snprintf(line, sizeof(line),
           "[1S] t=%lus n=%u ovr=%u err=%u ctrl1=%s%02X | x=%ld y=%ld z=%ld mg"
           " | |a|=%lu..%lu g=%ld | %s streak=%u %s | steps +%u total=%lu",
           g_seconds, n, g_second.overruns, g_second.i2c_errors, ctrl_ok ? "" : "?", ctrl1,
           n ? g_second.sum_x / n : 0L, n ? g_second.sum_y / n : 0L, n ? g_second.sum_z / n : 0L,
           n ? g_second.min_mag : 0UL, g_second.max_mag, g_pedometer.gravity_mg(),
           g_pedometer.in_burst() ? "burst" : "still", g_pedometer.streak(),
           g_pedometer.walking() ? "WALKING" : "-", g_second.steps, g_total_steps);
  SerialDBG.println(line);
  say("     bursts=%lu strides=%lu rejected: shaking=%lu weak=%lu short=%lu too_close=%lu streak_breaks=%lu",
      ped.bursts, ped.strides, ped.too_long, ped.too_weak, ped.too_short, ped.too_close, ped.streak_breaks);
  if (ctrl_ok && ctrl1 != LIS2DH12_ODR_25HZ_XYZ) {
    say("[ACCEL] CTRL_REG1 changed to 0x%02X (sensor reset or brown-out?); reconfiguring.", ctrl1);
    g_accel_ready = lis2dh12_configure();
  }
  if (n == 0) say("[ACCEL] No samples this second.");
  g_second = SecondStats();
}

void print_help() {
  say("[HELP] d = full diagnosis | p = cycle PA1 undriven/high/low | s = self-test | r = raw A,x,y,z on/off"
      " | z = zero counters | h = help");
}

void handle_commands() {
  while (SerialDBG.available()) {
    switch (SerialDBG.read()) {
      case 'd':
      case 'i':
        full_diagnosis();
        break;
      case 'p': {
        const Sa0Mode next = g_sa0 == SA0_UNDRIVEN ? SA0_HIGH : (g_sa0 == SA0_HIGH ? SA0_LOW : SA0_UNDRIVEN);
        set_sa0(next);
        say("[CMD] %s. Measure C4/C5 now; the [1S] line shows the rail only while PA1 is undriven.", sa0_name(next));
        break;
      }
      case 's':
        self_test();
        break;
      case 'r':
        g_raw = !g_raw;
        say("[CMD] Raw samples %s.", g_raw ? "on" : "off");
        break;
      case 'z':
        g_total_steps = 0;
        g_pedometer.reset();
        say("[CMD] Counters zeroed.");
        break;
      case 'h':
        print_help();
        break;
      default:
        break;
    }
  }
}

// =============================================================================
//  SETUP / LOOP
// =============================================================================

void setup() {
  const uint32_t reset_flags = RCC->CSR;
  __HAL_RCC_CLEAR_RESET_FLAGS();

  // Modem and GPS stay off; their UART pins float so nothing back-powers them.
  pinMode(GSM_PWRKEY, OUTPUT);
  digitalWrite(GSM_PWRKEY, HIGH);
  pinMode(LDO_EN, OUTPUT);
  digitalWrite(LDO_EN, LOW);
  pinMode(GSM_TX, INPUT_ANALOG);
  pinMode(GSM_RX, INPUT_ANALOG);
  pinMode(GPS_TX, INPUT_ANALOG);
  pinMode(GPS_RX, INPUT_ANALOG);
  pinMode(ACCEL_INT2, INPUT);
  set_sa0(SA0_UNDRIVEN);  // never back-power the sensor through SA0

  SerialDBG.begin(115200);
  delay(50);
  say("");
  say("[BOOT] Stepwhere " APP_VERSION " (modem and GPS off)");
  say("[BOOT] Reset flags 0x%08lX%s%s%s", reset_flags, (reset_flags & RCC_CSR_PWRRSTF) ? " power-on/brownout" : "",
      (reset_flags & RCC_CSR_PINRSTF) ? " reset-pin" : "", (reset_flags & RCC_CSR_IWDGRSTF) ? " watchdog" : "");

  analogReadResolution(ADC_RESOLUTION);
  pinMode(ADC_PIN, INPUT_ANALOG);
  print_help();

  full_diagnosis();
  g_last_second = g_last_poll = g_last_rescan = millis();
}

void loop() {
  handle_commands();
  const uint32_t now = millis();

  if (g_accel_ready && now - g_last_poll >= ACCEL_POLL_INTERVAL_MS) {
    g_last_poll = now;
    poll_fifo();
  }
  if (!g_accel_ready && now - g_last_rescan >= RESCAN_INTERVAL_MS) {
    g_last_rescan = now;
    quick_rescan();
  }
  if (now - g_last_second >= 1000) {
    g_last_second += 1000;
    report_second();
  }
}
