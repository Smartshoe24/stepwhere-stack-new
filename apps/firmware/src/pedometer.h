#pragma once

// Shoe-mounted software pedometer for accelerometers without a hardware step
// engine (LIS2DH12). Pure C++ with no Arduino dependencies so the host tests in
// test/ exercise exactly the code that runs on the tracker.
//
// The tracker rides on one shoe, so it only feels its own foot. Each stride of
// that foot is a burst of motion (toe-off, swing, heel strike) between two
// stance phases where the foot is flat and the sensor reads gravity alone. One
// accepted burst is one stride, which is two steps.
//
// Like the LIS2DS12 hardware counter, strides are only committed after a short
// run of evenly spaced ones; the run is then back-filled. This rejects taps,
// bumps and single shuffles at the cost of not counting very short walks.

#include <stdint.h>

namespace stepwhere {

struct PedometerConfig {
  uint16_t sample_period_ms;
  uint16_t still_threshold_mg;      // |a| - g below this is stance
  uint8_t still_min_samples;        // stance must last this long to end a burst
  uint16_t motion_threshold_mg;     // |a| - g above this (after stance) starts a burst
  uint16_t burst_peak_min_mg;       // weakest swing accepted as a stride
  uint16_t burst_min_ms;
  uint16_t burst_max_ms;            // longer bursts are shaking, not strides
  uint16_t stride_min_interval_ms;  // closer bursts are part of the same stride
  uint16_t stride_max_interval_ms;  // longer gaps end a walking bout
  uint8_t confirm_strides;          // strides in a row before any are counted
  uint8_t steps_per_stride;
};

// Starting values for a 25 Hz, ±8 g stream. Tune them against TTL captures
// from the capture build (see README) before relying on step accuracy.
constexpr PedometerConfig kShoePedometerConfig = {
  40,    // sample_period_ms
  250,   // still_threshold_mg
  3,     // still_min_samples
  400,   // motion_threshold_mg
  800,   // burst_peak_min_mg
  160,   // burst_min_ms
  1500,  // burst_max_ms
  400,   // stride_min_interval_ms
  2500,  // stride_max_interval_ms
  4,     // confirm_strides
  2,     // steps_per_stride
};

// Why bursts were accepted or rejected, for the accelerometer test firmware.
// Counting never changes what the pedometer decides.
struct PedometerStats {
  uint32_t bursts;         // motion that started after a stance
  uint32_t too_long;       // no stance within burst_max_ms: shaking or carrying
  uint32_t too_weak;       // peak below burst_peak_min_mg
  uint32_t too_short;      // shorter than burst_min_ms
  uint32_t too_close;      // within stride_min_interval_ms of the previous stride
  uint32_t strides;        // accepted strides, counted or still unconfirmed
  uint32_t streak_breaks;  // gap past stride_max_interval_ms restarted the run
};

inline uint32_t isqrt32(uint32_t value) {
  uint32_t result = 0;
  uint32_t bit = 1UL << 30;
  while (bit > value) bit >>= 2;
  while (bit != 0) {
    if (value >= result + bit) {
      value -= result + bit;
      result = (result >> 1) + bit;
    } else {
      result >>= 1;
    }
    bit >>= 2;
  }
  return result;
}

class ShoePedometer {
 public:
  explicit ShoePedometer(const PedometerConfig &config = kShoePedometerConfig)
    : config_(config) {
    reset();
  }

  void reset() {
    now_ms_ = 0;
    gravity_q8_ = 1000L << 8;
    in_burst_ = false;
    burst_start_ms_ = 0;
    burst_peak_mg_ = 0;
    still_run_ = 0;
    last_still_run_ = 0;
    have_stride_ = false;
    last_stride_ms_ = 0;
    streak_ = 0;
    confirmed_ = false;
    stats_ = PedometerStats();
  }

  // Feeds one sample (milli-g per axis) and returns the steps it commits.
  // Time comes from the sample count, so batches read from a FIFO and replayed
  // captures behave the same as live data.
  uint16_t update(int16_t x_mg, int16_t y_mg, int16_t z_mg) {
    now_ms_ += config_.sample_period_ms;
    const uint32_t x = x_mg < 0 ? -(int32_t)x_mg : x_mg;
    const uint32_t y = y_mg < 0 ? -(int32_t)y_mg : y_mg;
    const uint32_t z = z_mg < 0 ? -(int32_t)z_mg : z_mg;
    const int32_t magnitude = (int32_t)isqrt32(x * x + y * y + z * z);
    int32_t deviation = magnitude - (gravity_q8_ >> 8);
    if (deviation < 0) deviation = -deviation;
    const bool still = deviation < config_.still_threshold_mg;

    if (still) {
      if (still_run_ < 255) ++still_run_;
      // Track sensor offset and scale error from stance samples only.
      gravity_q8_ += (((int32_t)magnitude << 8) - gravity_q8_) >> 6;
    } else {
      still_run_ = 0;
    }

    if (!in_burst_) {
      if (deviation > config_.motion_threshold_mg && last_still_run_ >= config_.still_min_samples) {
        in_burst_ = true;
        ++stats_.bursts;
        burst_start_ms_ = now_ms_;
        burst_peak_mg_ = (uint16_t)deviation;
      }
      last_still_run_ = still_run_;
      return 0;
    }

    last_still_run_ = still_run_;
    if (deviation > burst_peak_mg_) burst_peak_mg_ = deviation > 65535 ? 65535 : (uint16_t)deviation;

    if (now_ms_ - burst_start_ms_ > config_.burst_max_ms) {
      // Continuous motion with no stance: shaking, a vehicle or a long fidget.
      in_burst_ = false;
      confirmed_ = false;
      streak_ = 0;
      ++stats_.too_long;
      return 0;
    }

    if (still_run_ < config_.still_min_samples) return 0;

    in_burst_ = false;
    const uint32_t stance_started_ms =
      now_ms_ - (uint32_t)(config_.still_min_samples - 1) * config_.sample_period_ms;
    // Bursts past burst_max_ms were already abandoned above.
    const uint32_t duration_ms = stance_started_ms - burst_start_ms_;
    if (burst_peak_mg_ < config_.burst_peak_min_mg) {
      ++stats_.too_weak;
      return 0;
    }
    if (duration_ms < config_.burst_min_ms) {
      ++stats_.too_short;
      return 0;
    }
    return accept_stride(burst_start_ms_);
  }

  bool walking() const { return confirmed_; }
  bool in_burst() const { return in_burst_; }
  uint8_t streak() const { return streak_; }
  int32_t gravity_mg() const { return gravity_q8_ >> 8; }
  const PedometerStats &stats() const { return stats_; }

 private:
  uint16_t accept_stride(uint32_t stride_ms) {
    if (have_stride_) {
      const uint32_t interval_ms = stride_ms - last_stride_ms_;
      if (interval_ms < config_.stride_min_interval_ms) {
        ++stats_.too_close;
        return 0;
      }
      if (interval_ms > config_.stride_max_interval_ms) {
        streak_ = 0;
        confirmed_ = false;
        ++stats_.streak_breaks;
      }
    }
    have_stride_ = true;
    ++stats_.strides;
    last_stride_ms_ = stride_ms;
    if (streak_ < 255) ++streak_;

    if (confirmed_) return config_.steps_per_stride;
    if (streak_ < config_.confirm_strides) return 0;
    confirmed_ = true;
    return (uint16_t)streak_ * config_.steps_per_stride;
  }

  PedometerConfig config_;
  uint32_t now_ms_;
  int32_t gravity_q8_;
  bool in_burst_;
  uint32_t burst_start_ms_;
  uint16_t burst_peak_mg_;
  uint8_t still_run_;
  uint8_t last_still_run_;
  bool have_stride_;
  uint32_t last_stride_ms_;
  uint8_t streak_;
  bool confirmed_;
  PedometerStats stats_;
};

}  // namespace stepwhere
