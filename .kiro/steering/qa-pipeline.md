---
inclusion: always
---
# QA pipeline (handoff, updated 2026-11-16)

## Stages
registered → qa_firmware → board_tests → production_firmware → functional_tests →
assembled → final_test → **ready_to_ship** → shipped → delivered.

## QA firmware (`apps/firmware/stepwhere.qa.ino`, now **qa-0.7.4**)
Flashed by cable through the Bench (ST-LINK), not over OTA (no bootloader, no
OTA client). Merging to `main` builds it and uploads it to the Bench (Firmware
Build workflow). Tests run once at boot and report `@QA {...}` lines over TTL
(USART1 PB6/PB7, 115200).

Order: power, imu, flash, (radio power-on), modem, sim, gsm, wifi, cell, data,
steps, gps, **netloc** (last, ~5 min), then the results upload. Whole run ~9 min.
- `steps` = LIS2DH12 built-in self-test (no motion, default). Real step counting
  is tested in the Final test (owner moves the shoe over the table; admin shows the
  step counter rise, target 10, display only).
- `netloc` = 10 uploads to ingest, 30 s apart, each with a fresh Wi-Fi scan, the
  serving cell, GPS if any, and the `qa` block; passes with ≥ 8 accepted (HTTP 201).
- qa-0.7.1: the radios stay off only for a **real** low battery; a broken reading
  fails `power` but the rest runs.
- qa-0.7.2: independent watchdog (16 s); the test that hung is stored in TAMP
  BKP0R and reported failed after the restart.
- qa-0.7.3: `gsm` uses RSRP from `AT+NETDMSG` when LTE gives `AT+CSQ` 99,99
  (pass ≥ −110 dBm); `wifi` waits 12 s of radio quiet after registration and
  retries up to 3 times on ERROR. Confirmed on the bench board 2026-11-16.
- qa-0.7.4: **board tests without TTL.** The `qa` block carries
  `"s":"<8 hex, random per boot>","run":N,"results":{"power":"pass",…}` (netloc
  "running" during its uploads). After netloc, one more upload (no Wi-Fi) carries
  the final statuses, `"errors":{…}` (≤ 60 chars each) and `"done":true`, up to 3
  tries. Boot counter for the session in TAMP BKP1R.

Without TTL the board must have a working modem and data link; a modem fault is
only visible with TTL.

## Server (`apps/server/src/modules/qa-units/qa-test-log.*`, `qa-functional.*`, `qa-tests.service.ts`)
Upload from a device **not bound to a child**:
- QA unit before `ready_to_ship`, not scrapped → **201**, stored in
  `qa_unit_reports` (test log, kept forever), never in a child.
- No QA unit for the IMEI → added to devices, and to QA units when the upload has
  a chip UID (`qa.uid`, or `fw.uid` from production firmware ≥ 2.2.1). Guards: IMEI
  TAC in `QA_AUTO_REGISTER_TACS`, ≤ 30 per hour, **never while bound to a child**.
  A device bound **before** (binding ended) is added only from QA firmware uploads
  (`qa` block); production firmware never sends it (`autoRegisterAllowedForBindings`).
- Uploads with the `qa` block get ≤ 10 Google lookups per unit, ≥ 30 s apart; first
  position sets `qa_units.network_located_at` ("Wi-Fi/GSM location: Passed").
- `qa.results` (qa-0.7.4) → `recordUploadedRun`: one `qa_test_runs` row per
  (unit, `network_session`, run number), no station; `done` finishes it and sets
  the Board tests verdict like a TTL run. Ignored when a TTL run of the same chip
  started in the last 15 min (TTL wins). Bench automation does not act on it.
- Otherwise 404 as before. Bound devices: normal ingest.
Admin API: `GET /v1/admin/qa/units/{unitId}/test-log`.

## Admin (`apps/admin/src/features/qa-units`)
Unit page: Board tests tab (runs; "sent over the network (no TTL)" for upload
runs), Test log tab (lookups n/10, map, uploads with GPS vs Wi-Fi/GSM and "From
GPS" distance), Motion IC row, Final test steps panel. Units list: Motion IC
column. Stage counts: QA overview page. The map needs `VITE_GOOGLE_MAPS_API_KEY`
in the Infisical "admin" project and an admin rebuild (not set as of 2026-11-16).

## Bench results
- Bench board 1 (IMEI 869938082392680, chip 0051006C…3739), qa-0.7.3: all pass
  except power (PB10 saturated) and imu (no I2C answer): board faults, see
  Stepwhere-Firmware `docs/handoff/BOARD_REV11_BENCH.md`. Test log: 10/10
  Wi-Fi/GSM positions, Passed.
- Board 2 (chip 00510045…3739), qa-0.7.3: power PASS (4.05 V), imu FAIL (same
  as board 1, so check the sensor area on the design/assembly), modem FAIL (no
  answer to AT while the GPS on the same rail works: modem supply, PWRKEY path or
  IC1 level shifter). Early restarts were the battery wires moving.
