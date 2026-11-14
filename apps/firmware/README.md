# Stepwhere Firmware

This workspace contains the STM32G071CB firmware for the Stepwhere tracker.

## Build

From the repository root, run:

```bash
pnpm --filter @stepwhere/firmware build
```

The first build downloads the pinned Arduino CLI, STM32duino core, and required
libraries. All downloaded tools, caches, staged source, intermediate files, and
outputs stay under the ignored `apps/firmware/.builds` directory.

On Apple silicon, the build automatically replaces Arduino's x86-only `ctags`
with the bundled native ARM64 build. Rosetta is not required. Provenance,
license, corresponding source, and reproduction instructions are under
`tools/darwin-arm64`.

## Artifacts

Successful builds write only the final outputs to `.builds/artifacts`:

```text
stepwhere.ino.bin
stepwhere.ino.elf
stepwhere.ino.hex
stepwhere.ino.map
```

The other variants write to their own folder under `.builds/artifacts`:
`capture`, `dev`, `accel-test`, `wifi-experiment-final` and `experiment-wifi`.

When flashing the BIN manually with STM32CubeProgrammer, use address
`0x08000000`. The HEX file already contains address information.

Set `ARDUINO_CLI=/path/to/arduino-cli` to use an existing CLI, or set
`ARDUINO_CLI_VERSION` to override the default version used by the bootstrapper.

## Production firmware

`stepwhere.ino` is the production tracker firmware (`APP_VERSION` `v2.0`). It
was rebuilt from the last shipped v1.2 and keeps its step, sleep and battery
behaviour. It posts to `http://ingest.stepwhere.in/location`.

### Location

GPS is used when it has a fresh fix: more than three satellites, and under
five seconds old. Without one, each upload carries:

- `cellular`: the LTE serving cell from `AT+NETDMSG`, queried on every no-fix
  upload.
- `wifi`: up to 16 of the strongest access points from `AT+WIFIAPSCAN`. A scan
  runs at most once a minute, matching the server's fastest lookup interval.
  The result is reused with an honest `ageMs` for up to two minutes.

Scans wait until 12 s after the last data activity, because the N706 returns
`ERROR` while LTE is busy. A terminal `ERROR` is retried once after 5 s. A
30-second scan timeout power-cycles the modem rail and readiness recovers on its
own, unlike the Wi-Fi experiment final build, which waits for a manual reset. No-fix uploads send
`0,0` with `gpsFixValid: false`; the server ignores those coordinates.

Uploads run every 8 s (`HTTP_REQ_DELAY`), measured from the end of the previous
upload. A cycle that waits for a Wi-Fi scan takes longer. The payload never
contains a `debug` block.

### Modem recovery

- AT gets 30 s and the SIM gets 60 s; an unresponsive modem is rail-cycled up
  to three times, then retried after 60 s.
- A sleeping modem (`AT+CFUN=0`) is restored with `CFUN=1` without a power
  cycle.
- Data readiness requires `+XIIC: 1` with a valid IP, and a verified link is
  retained. Six failed activations trigger a rail cycle.
- HTTP errors with a status code (such as 404) do not reconnect. Five transport
  failures in a row re-verify AT and the data link.
- The v1.2 GPS no-fix MCU reboot is gone: a missing fix is normal indoors, and
  the reboot cleared the step counter. Instead, a GPS that sends no NMEA at all
  for 2 minutes gets one rail cycle, at most every 30 minutes.

### Power

- Boot powers the modem whatever the battery reads, as v1.2 did.
- The battery is checked between operations in `loop()`, never inside a modem
  power-up or command, where load sag would read low. Below 3.40 V the
  modem/GPS rail is cut; it stays cut until the battery reads 3.70 V (v1.2).
- The modem and GPS UARTs run only while the rail is on, and their pins float
  while it is off, so idle-high TX lines cannot back-power the unpowered
  modules.
- Start-up follows the wifi-experiment build that brings the modem up
  reliably: the accelerometer is initialised after the PWRKEY pulse, `AT+CMEE=2`
  is sent after `ATE0`, and the GPS UART starts only once the SIM reports READY
  (the G7A is powered with the rail and acquires satellites meanwhile). A SIM
  failure logs the modem's last `AT+CPIN?` reply.

### Accelerometer and steps

The chip is identified at boot by `WHO_AM_I`, so one image runs on both boards:

| Chip | Address | Steps |
| --- | --- | --- |
| LIS2DH12 (`0x33`) | `0x19`, or `0x18` | Software shoe pedometer, `src/pedometer.h` |
| LIS2DS12 (`0x43`) | `0x1D`, or `0x1E` | Hardware step counter on INT2, v1.2 configuration |

The LIS2DH12 runs at 25 Hz, ±8 g, with the FIFO in stream mode. The firmware
drains the FIFO every 200 ms from a background service that also runs inside
every modem wait. That matters because the 32-sample FIFO holds only 1.28 s of
data. Overruns are reported in the minute log.

The pedometer splits the shoe's motion into stance (foot flat) and swing.
Each accepted swing is one stride of that foot, which counts as two steps.
Steps are only committed after four evenly spaced strides; the strides that
confirmed a bout are then back-filled. This filters taps, bumps, vehicle
vibration and shaking, but walks shorter than four strides are not counted.

Two more step-counter changes from v1.2:

- Steps are added to `stepCounter` as soon as they are detected, rather than at
  the minute boundary.
- The total is kept in `.noinit` RAM with a checksum, so it survives software,
  watchdog and reset-pin restarts. It is still lost on power removal.

The pedometer constants in `kShoePedometerConfig` are starting values. **They
have not yet been tuned on a real shoe.**

### Tuning the pedometer

```bash
pnpm --filter @stepwhere/firmware build:capture
```

Flash `.builds/artifacts/capture/stepwhere.ino.bin`. This image is production
firmware that also prints every sample as `A,x,y,z` (mg) and each committed
step batch as `S,n`. Record labelled sessions with the TTL connected:

```bash
tio -b 115200 /dev/cu.usbserial-0001 --log --log-file walk-100-steps.log
```

Record walks with a hand-counted number of steps, plus running, stairs, and
false-positive cases: sitting with foot taps, car or bike rides, the shoe being
carried. Then replay each log against the current constants:

```bash
pnpm --filter @stepwhere/firmware test
.builds/host/replay_capture walk-100-steps.log
```

Adjust `kShoePedometerConfig`, then replay every log again until the counts
match.

### Host tests

```bash
pnpm --filter @stepwhere/firmware test
```

This compiles `src/` with the host compiler, using AddressSanitizer and
UndefinedBehaviorSanitizer, and runs `test/host_tests.cpp`. The suite covers
the pedometer on synthetic shoe signals, the `+NETDMSG` and `+WIFIAPSCAN`
parsers, and MAC normalisation. The synthetic signals check the detector's
logic, not its real-world accuracy.

### TTL log

Connect a 3.3 V adapter to PB6 (TX) and PB7 (RX) at 115200 baud. Production
logs at `INFO`. For AT traffic and full payloads, build a debug image:

```bash
FIRMWARE_DEFINES="-DSTEPWHERE_LOG_LEVEL=4" pnpm --filter @stepwhere/firmware build
```

This overwrites the normal artifacts, so rebuild without it before shipping.

| Prefix | Meaning |
| --- | --- |
| `[BOOT]` | Version, reset cause, battery |
| `[ACCEL]` | Detected chip, FIFO overruns |
| `[STEPS]` | Step counter restored after a reset |
| `[MODEM]` | Power, SIM, IMEI, data IP, recovery reasons |
| `[GPS]` | Fix acquired or lost |
| `[WIFI]` / `[CELL]` | Scan results, serving cell, rejections |
| `[UPLOAD]` / `[HTTP]` | Location source, steps, size, HTTP result and duration |
| `[MIN]` | Per-minute steps, totals, GPS/modem/sleep state, battery |
| `[SLEEP]` / `[BATTERY]` | Sleep transitions, low battery, charger state |

## Development firmware

`stepwhere.dev.ino` is the production firmware with one change: it posts to
the Pinggy development tunnel
(`http://npafhgmeij.a.pinggy.link/v1/telemetry/location`) instead of
`ingest.stepwhere.in`. Keep it identical to `stepwhere.ino` apart from
`SERVER_CMD`, and copy production changes across when they land. Build it with:

```bash
pnpm --filter @stepwhere/firmware build:dev
```

Flash `.builds/artifacts/dev/stepwhere.dev.ino.bin` at `0x08000000`. The tunnel
must reach a local backend; see the end-to-end bench setup below.

## Accelerometer debug firmware

`stepwhere.accel-test.ino` diagnoses the LIS2DH12 and the shoe pedometer on
their own and prints `[VERDICT]` lines in plain language; the modem and GPS
rail stays off. Build and flash it with:

```bash
pnpm --filter @stepwhere/firmware build:accel-test
```

Flash `.builds/artifacts/accel-test/stepwhere.accel-test.ino.bin` at
`0x08000000` and open the TTL at 115200. At boot it runs a full diagnosis:

- `[POWER]` VDDA, battery and the sensor's own rail. PA1 reaches SA0 through
  R26 and SA0 has an internal pull-up to the sensor's VDD_IO, so with PA1
  undriven its ADC reads that rail (the build sets a long ADC sampling time
  for this). The LIS2DH12 needs 1.71–3.6 V.
- `[RAIL]` drives PA1 high, releases it and records the rail over a second. A
  rail that rises with PA1 and sinks back is being back-powered through SA0,
  not fed by its supply. PA1 is otherwise left undriven so the MCU never
  powers the sensor this way.
- `[BUS]` I2C line levels and pull-ups; `[SCAN]` software I2C over every
  address on the normal and swapped pins, then hardware probes of 0x18/0x19
  with PA1 undriven, high and low.
- Once found: the production configuration (25 Hz, ±8 g, FIFO stream), a
  register dump and the built-in `[SELFTEST]`.

Then every second a `[1S]` line: while the sensor is missing, the live rail
voltage and line levels; once running, samples read (25 expected), FIFO
overruns, I2C errors, `CTRL_REG1`, mean X/Y/Z in mg, the |a| range, the
pedometer state and steps, followed by why motion bursts were rejected
(`shaking`, `weak`, `short`, `too_close`, `streak_breaks`). The pedometer only
counts after four evenly spaced strides with a still foot between them, so
shaking the board in a hand is rejected as `shaking`. TTL commands: `d` full
diagnosis, `p` cycle PA1 undriven/high/low, `s` self-test, `r` raw `A,x,y,z`
samples, `z` zero counters, `h` help.

## Wi-Fi experiment final firmware

`stepwhere.wifi-experiment-final.ino` was previously `stepwhere.dev.ino`.
It is the integrated Wi-Fi/cellular diagnostic build that the production
fallback came from, kept unchanged. It is based on the v1.2 tracker firmware and retains
steps, battery protection, HTTP telemetry, and the structured `debug` snapshot.
This diagnostic build disables GPS UART reception/processing and the no-fix reset.
Build it with:

```bash
pnpm --filter @stepwhere/firmware build:wifi-experiment-final
```

Flash `.builds/artifacts/wifi-experiment-final/stepwhere.wifi-experiment-final.ino.bin`
at `0x08000000`. Expect `[DEV][BOOT] Integrated Wi-Fi/cellular telemetry: v1.3-dev-wifi-quiet`.
This variant uploads automatically; do not send the bench experiment commands.
It still accepts the optional `CELLPROBE` diagnostic, which streams the raw
`AT+GMR`, `AT+NRSP` and `AT+MYCELLINFO` replies; `AT+MYCELLINFO` can take up to
five minutes.

Each upload cycle runs a fresh Wi-Fi scan first, then `AT+NETDMSG`, then the POST.
Uploads start 15 seconds after the previous one finished (`HTTP_REQ_DELAY`).
The data session stays up throughout. Scans returned `ERROR` after about 3 s while
LTE was busy (network attach, data activation, or the previous upload) and
succeeded on a quiet connected link. Each scan therefore waits until
`WIFI_SCAN_QUIET_MS` (12 s) has passed since the last HTTP attempt or data
activation. A terminal `ERROR` is retried once after a 5-second quiet wait.
`debug.wifiScan.attempts` and `quietMs` (time since data activity when the final
scan started, null when unknown) record this. APs are never reused from an older
upload. GPS diagnostics remain unavailable,
coordinates are `0,0`, `gpsFixValid` is false, and `satelliteCount` is zero.
Scans normalize and deduplicate MACs, retaining the strongest sixteen APs
without a sensitivity cutoff. Zero usable APs omit `wifi`. TTL streams the
complete scan reply. `debug.wifiScan` reports status, duration, observed AP-line
count and errors; its raw reply (up to 1024 characters) is uploaded only when the
scan failed. `debug.gps.fixAgeMs` remains null in this build.

### HTTP body size

The N706 rejected `AT+HTTPACTION=2,4367,2` with an immediate `ERROR` (no `>`
prompt), so a large debug payload silently blocked every upload. Each cycle now
builds the largest payload that fits `bodyLimitBytes` (starting at 4096):

| `payloadDetail` | Contents |
| --- | --- |
| `full` | Debug block, raw modem text and modem state for failed queries only, and `wifiExperimentSummary` until one upload carrying it is accepted |
| `compact` | Debug block without raw text, modem state or the boot summary |
| minimal | Location, cellular and Wi-Fi fields only, no `debug` |

An immediate `ERROR` to `HTTPACTION` for a length above any accepted size lowers
the limit to that length minus one (never below 2048). The same cycle then retries
with less detail, so the location observation still reaches the server.
`debug.http` reports `previousFailureReason: "payload_rejected"`,
`previousBodyBytes`, `bodyLimitBytes` and the `payloadDetail` sent. Typical sizes
with 16 APs: minimal about 1.9 KB, compact about 3.2 KB, full about 4 KB. The
learned limit resets at MCU boot. Rejections do not count towards the
five-failure transport check.

A terminal scan error permits cellular-only telemetry. A 30-second scan timeout
without a terminal response pauses **all** further modem commands/uploads and
requires a board reset. Low battery during scanning removes modem power and
also requires a reset. Inactivity shutdown is suppressed during the comparison
and for 30 minutes afterwards. Normal five-minute inactivity evaluation then
restarts; GPS remains disabled, including after wake-up. The suppression does
not override battery protection or the unresolved-timeout safeguard.

### Automatic boot comparison (no TTL commands required)

After AT/SIM/IMEI readiness, but before normal uploads, this build runs one matrix
per MCU boot. It does not repeat it after modem rail recovery:

| Stage | Condition |
| --- | --- |
| `disconnected` | Verified inactive data, scan before any serving-cell query |
| `connected_before_cell` | Verified IP, scan before any serving-cell query |
| `connected_after_cell` | Serving-cell query followed by scan with no intentional delay |
| `connected_after_cell_quiet` | Serving-cell query followed by a one-second quiet wait and scan |

All stages use the existing scanner, with a two-second settling interval between
stages. State queries (`CFUN?`, `CEREG?`, `XIIC?`) precede each stage. Quiet waits
drain/stream unsolicited replies without sending AT commands. An already-active
data connection skips the disconnected baseline rather than forcing a disconnect.
Failed data activation skips the connected stages; a failed serving-cell query
skips its dependent scan. Terminal scan errors allow the next stage. An unresolved
timeout or low-battery cutoff aborts the matrix and requires reset.

The full matrix record is printed once on TTL when the comparison finishes, as
`[WIFI][EXPERIMENT][JSON] {"wifiExperiment":{...}}`. It contains status, skip
reason, scan time/duration, AP counts, actual serving-command-to-scan gap, parsed
modem state, battery readings and up to 256 raw-response bytes per stage, with a
truncation flag. It also identifies the modem revision, reset flags, experiment
state, GPS disablement and `awakeUntilUptimeMs`/`sleepSuppressed`. It is no longer
uploaded because it pushed the body past the modem limit. Uploads instead carry
`debug.wifiExperimentSummary` (about 0.85 KB: modem revision, reset flags, state,
and per-stage status, skip reason, duration, AP counts, command gap and error).
It is sent until one full-detail upload carrying it is accepted.
Boot observations are cleared before normal uploads; they never become stale
location inputs. The optional `debug.wifiScan.modemState` (full detail only) is
the last post-failure probe, with `capturedAtUptimeMs` so an older sample cannot
look like a new probe. Diagnostic storage is fixed-size. JSON is escaped
incrementally and reserved once, with a 16 KiB upper allocation bound; allocation
failure skips the upload with a TTL error rather than sending malformed JSON.

Start the updated development backend before flashing, reset the board and inspect
the prettified `telemetry.ingest` payload; no operator commands are necessary.
The first upload is delayed by the comparison. A timeout that prohibits modem
commands may also prevent diagnostic upload, so that case remains TTL/reset-only.
Repeat five cold boots on the same board, antenna, supply and location. Compare
the boot matrix with scans under recurring HTTP workload throughout the awake
window. One pattern is a hypothesis, not proof of radio behavior or a hardware fix.

### Startup and modem stability diagnostics

This variant starts TTL before ADC/peripheral setup, prints `[DEV][PHASE]`
checkpoints, and emits `[DEV][HEALTH]` every five seconds during initialization,
recovery and modem waits. Health includes phase elapsed time, a current battery
measurement, AT/SIM/data readiness, the outstanding command and unknown-state
status. Reset logs identify software, pin and watchdog causes; the hardware
power flag is explicitly labelled **power-on/brownout**, not proof of a brownout.
An inherited explicit GPS-reset marker is still identified at boot, but this
diagnostic image never initiates a GPS no-fix reset.

Startup holds the shared rail off for two seconds before applying the existing
power-key sequence. A recovery cycle actually removes GSM/GPS power and
invalidates old readiness and radio observations, without enabling GPS UART
reception or erasing the boot comparison.
AT responsiveness gets 30 seconds and SIM readiness gets 60 seconds. A SIM
timeout waits 30 seconds before retrying without toggling PWRKEY. Three rail
recovery cycles for an unresponsive modem are followed by a 60-second wait.
These recovery paths do not add MCU resets. `CFUN=0/4` is restored to `CFUN=1`;
GPRS readiness requires `XIIC` state 1 and a valid nonzero IP. Existing valid
data connections are retained.

`CMEE=2` is attempted once per modem rail cycle; unsupported behavior is logged
without blocking startup. Terminal Wi-Fi errors trigger raw `CFUN?`, `CEREG?`
and `XIIC?` diagnostics at most once a minute. A diagnostic/probe timeout stops
additional commands and requires a reset, rather than guessing modem readiness.
Application-level HTTP errors such as 404 do not reconnect GPRS. Five consecutive
transport failures trigger AT/IP verification, retaining a verified data link.
The payload's total HTTP failure count remains separate from this recovery count.
Minute-timer logs are emitted in foreground execution, not from the interrupt.

Before promoting changes to main, capture 20 cold starts and five reset-button
starts with TTL connected **before** power. Repeat cold starts with the TTL
adapter detached, checking that it does not back-power the board. Measure MCU
and modem rails during startup; an ADC snapshot cannot rule out brief dips.
Use the preserved experiment to compare five `WIFI_SCAN` runs, spaced by at
least 30 seconds, before and after `NETUP`, at the same location and supply.
Then compare this build's scan successes, terminal errors and failure counts.
Confirm a 404 does not produce data reconnects and a healthy bound-device upload
returns 201. Startup fixes and repeated scans are not a guarantee of hardware or
modem-service reliability. Main and experiment sources/artifacts remain unchanged.

### End-to-end bench setup

1. Apply the local migration: `pnpm --filter @stepwhere/server db:migrate:local`.
   Its default database is local Postgres on port 5433; do not point it at production.
2. Start the updated backend on port 8223 with `NODE_ENV=development`,
   `DEVICE_INGEST_AUTH_DISABLED=true`, `CELL_GEOLOCATION_ENABLED=true` and
   a server-side `GOOGLE_GEOLOCATION_API_KEY` authorized for Geolocation.
   With working Infisical credentials:

   ```bash
   PORT=8223 DEVICE_INGEST_AUTH_DISABLED=true pnpm --filter @stepwhere/server dev:local-db
   ```

   Confirm the effective injected configuration; Infisical may override shell values.
3. Confirm the device has an active child binding in that **local** database.
   Start the Pinggy tunnel to port 8223 with `pnpm --filter @stepwhere/dev-tunnel dev`
   (setup in `apps/dev-tunnel/.env.example`). Root `pnpm dev` also starts it, but
   runs the server against the hosted dev database instead. Then verify:

   ```bash
   curl -i --max-time 15 http://npafhgmeij.a.pinggy.link/health
   ```

   Require a direct HTTP 200, without an HTTPS redirect, before flashing.
4. Measure actual supply voltage, use stable bench power and a 3.3 V TTL adapter.
   Open the console before resetting the flashed dev image:

   ```bash
   tio -b 115200 --input-mode line --local-echo /dev/cu.usbserial-0001
   ```

5. Observe boot, full `[MAIN] HTTP ingest JSON payload`, scan diagnostics and
   HTTP 201. The prettified server `telemetry.ingest` log includes all of `debug`.
   `[network-geolocation]` logs show the filtered request and outcome, without keys.
   New successful fallback events have source `network`, GPS disconnected, and
   the admin badge **Network estimate**; debug is not stored or broadcast.

Exercise combined cell/Wi-Fi, cell-only,
Wi-Fi-only (two eligible APs), one eligible BSSID plus cell, filtered MACs,
terminal scan errors and unresolved timeouts. Reset after a timeout. The
backend keeps one Google request per eligible upload with `considerIp: false`;
there is no second cell-only retry in that upload. Local-admin/multicast,
zero/broadcast, reserved `00:00:5E` MACs and unsupported RSSI are filtered.
One eligible BSSID is included with cell data, but Google does not guarantee
using it; Wi-Fi-only requires at least two distinct eligible BSSIDs. Provider
failure leaves ingestion successful and does not fabricate a position.
Development retries every eligible upload (and can incur substantial usage);
production cadence and simulator overrides remain unchanged.

## Isolated N706 experiment firmware

Build the TTL-only bench firmware without changing the normal `build` target:

```bash
pnpm --filter @stepwhere/firmware build:experiment-wifi
```

Its `.bin`, `.elf`, `.hex`, and `.map` files are saved under
`.builds/artifacts/experiment-wifi/stepwhere.experiment-wifi.ino.*`.
The old bench sketch was preserved byte-for-byte under this new name.
The other variants' artifacts stay in their own paths.
Each variant has its own sketch, work and output directories; building any
variant preserves the others' artifacts. Flash the experiment BIN at
`0x08000000`, or flash its HEX file.
It does not run GPS, send telemetry, or contact the Stepwhere ingest server.

Use a **3.3 V TTL** adapter with adapter RX connected to PB6 (device TX),
adapter TX connected to PB7 (device RX), and a common ground. For example:

```bash
tio -b 115200 --input-mode line --local-echo /dev/cu.usbserial-0001
```

Open `tio` before resetting or power-cycling the board. The dev firmware prints
`[DEV][BOOT]` checkpoints from console startup through modem readiness, then
prints `[DEV][HEALTH]` about every five seconds, including during a long scan.
`HELP` and `STATUS` work even while the modem is starting or has failed. If no
boot checkpoint appears after a reset, verify the flashed dev image and address
and compare against the working main firmware on the same TTL connection;
modem command changes cannot fix an MCU that never reaches its debug console.

Type one command and press Enter. The console accepts `HELP`, `STATUS`,
`SERVING`, `NEIGHBORS`, `ENGINEERING`, `NWENG_DIRECT`, `WIFI_SCAN`,
`RADIO_SNAPSHOT`, `WIFI_LOCATE`, `POSITION_COMPARE`, `NETUP`,
`LOCATE_SINGLE`, and `LOCATE`.
It does not forward arbitrary AT commands. Use `SERVING`, `NEIGHBORS`, then
`SERVING` again to compare the registered cell before and after the scan.
`NEIGHBORS` streams the complete `AT+MYCELLINFO` response and may take up to
five minutes. `ENGINEERING` checks whether this particular N706 firmware
supports the N58-only `AT+NWENG` command; `ERROR` is a valid finding.
`NWENG_DIRECT` sends `AT+NWENG="ncell"` without requiring the `AT+NWENG=?`
test command to succeed. `WIFI_SCAN` sends `AT+WIFIAPSCAN` and streams every
raw access-point line (MAC, signal strength, and channel when available).
Neither command assumes support on this module build. Save the complete reply,
including `ERROR`, empty results, or timeouts, before inferring any capability.

For one MapQuest-input capture, send `RADIO_SNAPSHOT` once. It streams the raw
replies for `AT+NETDMSG` (serving cell before), `AT+MYCELLINFO` (neighbor
EARFCN/PCI scan), `AT+WIFIAPSCAN` (AP MAC/RSSI scan), and `AT+NETDMSG` again
(serving cell after), with stage and completion markers. It makes no location
request and needs no data connection. Save the full log and compare the two
serving replies before using the observations together. Do not treat PCI as an
ECI or assume `MYCELLINFO` entry `0` is the serving cell. A failed step ends
the snapshot early; after a timeout, reset before another modem command.

For the ordered Wi-Fi test, reset the board and send only `WIFI_LOCATE`; do not
run `NETUP` first. `WIFI_LOCATE` checks that data is disconnected, runs a fresh
`AT+WIFIAPSCAN`, prints the detected access-point count, configures the
`internet` APN, activates and verifies the data connection, then requests
`AT+WIFIGSMLOC=1` if at least one AP was found. If data is already connected,
reset the board before trying the ordered test again; the command will not
disconnect it. It waits for the later location result rather than treating the
immediate `OK` as a fix. Save the raw scan, dial-up, and positioning responses,
including coordinates, accuracy, provider error, or timeout. A reported
accuracy of `0.0` is unknown, not an exact fix. If Wi-Fi positioning fails,
run `LOCATE_SINGLE` on the same connection, then repeat the ordered test after
a reset where several APs are visible. Wi-Fi MACs are not filtered using
Google's rules for this separate Neoway positioning experiment.

Run `NETUP` before `LOCATE_SINGLE` or `LOCATE` when no data connection is active.

To compare the modem's two native positioning services in one run, reset the
board and send only `POSITION_COMPARE`. It checks for a disconnected modem,
scans Wi-Fi, configures the `internet` APN, and verifies a data IP. With at
least one AP it tries `AT+WIFIGSMLOC=1`, then tries the default `AT+CIPGSMLOC`
on the same connection. A failed or empty scan skips only the Wi-Fi request;
an explicit Wi-Fi service failure still allows the cell request. A timeout,
busy link, or low-battery shutdown stops further modem commands and requires
a reset. The raw replies remain visible, followed by separate bounded Wi-Fi
and cell summaries with status, coordinates or `null`, accuracy or `null`,
error, and elapsed time. An immediate `OK` is not a position; a successful
coordinate needs a valid response followed by the final completion marker.
Accuracy `0.0` is reported as unknown. If Wi-Fi repeatedly fails while cell
positioning succeeds, save the full log and `AT+GMR` revision for Neoway;
this experiment does not alter normal telemetry or call a cloud API directly.

`LOCATE_SINGLE` requests the modem's
default base-station location, and `LOCATE` requests its multiple-base-station
location via `AT+CIPGSMLOC=1`. These use the modem's own network location
service, which may return provider errors or no position. Save the raw TTL
reply, elapsed time, coordinates, and accuracy for comparison against a known
bench location. Neither command reveals neighboring LTE ECIs to Google's API.

The dev firmware stops powering the modem if measured VBAT is below 3.4 V.
After an AT timeout it refuses further modem commands because a scan may still
be running; charge/check power and reset the board before retrying. Keep the
device on stable bench power, do not issue another command during a scan, and
reflash the normal `stepwhere.ino` binary when experiments are complete.

## QA firmware (board tests)

`stepwhere.qa.ino` is the first QA firmware route: it tests a bare board's
hardware and reports every result over the debug UART, where the admin Bench
records it on the unit. (The second route, business logic with debug logs, is
still to come.) Build it with:

```bash
pnpm --filter @stepwhere/firmware build:qa
```

(macOS or Linux.) From any computer, including Windows, use GitHub instead:
**Actions → Firmware Build → Run workflow**, pick the branch and `qa`, then
download the files under **Artifacts** on the finished run. The same workflow
builds the QA firmware on every pull request that changes `apps/firmware/`.

The QA build targets **Generic G070CBTx** (`pnum=GENERIC_G070CBTX`): Rev11 boards
carry an STM32G070CBT6, and this is the target the production firmware v2.2.0
in `Smartshoe24/Stepwhere-Firmware` was tested with. Artifacts land in
`.builds/artifacts/qa/stepwhere.qa.ino.*`. On the Bench,
upload the BIN or HEX with channel **QA firmware**, open the serial console,
then flash: the tests start as soon as the board boots and take about three
minutes plus the time the operator takes for the step test.

| Test | Pass when |
|---|---|
| `power` | Battery 3400–4400 mV and the ADC not saturated (raw < 4090); VDDA 3.0–3.6 V from the factory VREFINT calibration; charger CHRG/STDBY (PB14/PB15) not both low |
| `imu` | The accelerometer is found by `WHO_AM_I` (LIS2DH12 `0x33` at 0x19/0x18, or LIS2DS12 `0x43` at 0x1D/0x1E) and reads about 1 g at rest |
| `flash` | The W25Q128 memory chip (IC8, SPI1, /CS PC6) answers `9Fh` with JEDEC ID `EF 40 18`, then its reserved test sector `0xFFF000` (`EXT_SELFTEST_ADDR`, outside every OTA slot and the motion log) erases, takes one written page, reads it back and erases again. Nothing else is touched |
| `modem` | N706 answers `AT` after the power key; IMEI read (also printed as `[IMEI] …`) |
| `sim` | `AT+CPIN?` is `READY` within 15 s; ICCID read |
| `gsm` | Registered on LTE (`AT+CEREG?` 1 or 5) within **60 s** of the power key, and CSQ ≥ **10** |
| `wifi` | `AT+WIFIAPSCAN` sees at least one access point |
| `cell` | `AT+NETDMSG` parses as a valid LTE serving cell |
| `data` | `AT+XIIC` brings up a data IP within 60 s of the power key (APN `QA_APN`, default `internet`) |
| `steps` | **Motion self-test** (default): the LIS2DH12's built-in self-test, so no one has to touch the board. Each axis must move 68–1440 mg (datasheet table 4: 17–360 digits at ±2 g normal mode). On a LIS2DS12, or with `-DQA_STEP_SWING_TEST=1`, the swing test runs instead: after **Start**, 10 steps within 60 s while the operator walks or swings the board |
| `gps` | Valid NMEA within 5 s of GPS power-on. A fix (4+ satellites), satellites in view and HDOP are **information only**: it looks for a fix until 3 min after power-on |

Each run power-cycles the modem and GPS rail first, so the GSM and GPS clocks
start from a real power-on. A test whose prerequisite failed is reported as
skipped with the reason. The limits are constants at the top of the sketch and
travel with every result, so changing one never rewrites old results.

The step test waits for the operator: it prompts "Pick up the board, then
press Start" and counts only after `QA GO` (the Bench's **Start** button). With
30 boards on a bench, each is walked when the operator gets to its slot. If
nobody presses Start within 10 minutes the test is skipped, which leaves the
unit untested rather than failed; `QA RUN steps` tries again.

On a LIS2DH12 board the step test runs the same shoe pedometer as the main
firmware, on the same 25 Hz FIFO stream. That pedometer counts one stride (two
steps) per burst of motion and only accepts a burst that starts from a still
moment, as a foot does in stance, so 10 steps means about five heel-to-toe
swings with a short pause between them. Steady shaking without pauses is
rejected (`tooLong` in the result data), as in the shoe. The result also
reports the pedometer's burst, stride and reject counts to help diagnose a
failure.

Console commands (the Bench's **Run board tests**, **Start** and **Retry**
buttons type these): `QA RUN`, `QA RUN <test>` (also runs what it needs, e.g.
`power` before `gps`), `QA GO`, `QA ABORT`, `QA STATUS`, `QA HELP`.

Results are single lines starting with `@QA `, defined in
`packages/types/src/qa-tests.ts`:

```text
@QA {"v":1,"e":"run","run":1,"uid":"005500313434510231303739","fw":"qa-0.1.0","tests":["power",…,"gps"]}
@QA {"v":1,"e":"test","run":1,"uid":"…","id":"gsm","status":"pass","ms":8120,"data":{"registerMs":8120,"limitMs":15000,"csq":20,"rssiDbm":-73}}
@QA {"v":1,"e":"done","run":1,"uid":"…","passed":9,"failed":1,"skipped":0,"ms":431220}
```

The `uid` is the STM32 chip UID in the same format STM32CubeProgrammer reads,
so results attach to the right unit even when the board was flashed elsewhere.
A unit's Board tests stage combines its runs: retrying one test replaces only
that test's result.
