---
inclusion: always
---
# QA pipeline (handoff, 2026-11-15)

## Stages
registered → qa_firmware → board_tests → production_firmware → functional_tests →
assembled → final_test → **ready_to_ship** → shipped → delivered.

## QA firmware (`apps/firmware/stepwhere.qa.ino`, now **qa-0.7.2**)
Flashed by cable through the Bench (ST-LINK), not over OTA (no bootloader, no
OTA client). Merging to `main` builds it and uploads it to the Bench (Firmware
Build workflow). Tests run once at boot and report `@QA {...}` lines over TTL
(USART1 PB6/PB7, 115200); without TTL only the uploads reach the server.

Order: power, imu, flash, (radio power-on), modem, sim, gsm, wifi, cell, data,
steps, gps, **netloc** (last, ~5 min). Whole run ~8–9 min.
- `steps` = LIS2DH12 built-in self-test (no motion, default). Real step counting
  is tested in the Final test (owner moves the shoe over the table; admin shows the
  step counter rise, target 10, display only).
- `netloc` = 10 uploads to ingest, 30 s apart, each with a fresh Wi-Fi scan, the
  serving cell, GPS if any, and `"qa":{"uid":"<chip UID>","fw":"qa-0.7.x"}`;
  passes with ≥ 8 accepted (HTTP 201).
- qa-0.7.1: the radios stay off only for a **real** low battery; a broken reading
  fails `power` but the rest runs.
- qa-0.7.2: independent watchdog (16 s); the test that hung is stored in TAMP
  BKP0R and reported failed after the restart.

**Open, proposed qa-0.7.3 (not approved yet):**
- `gsm` falsely fails on LTE: `AT+CSQ` returns 99,99. Use RSRP from `AT+NETDMSG`
  when CSQ is 99, pass at ≥ −110 dBm.
- `wifi` falsely fails: the first `AT+WIFIAPSCAN` returns ERROR right after
  registration. Retry after ~12 s quiet (as the production firmware does).

## Server (`apps/server/src/modules/qa-units/qa-test-log.*`, `qa-functional.*`)
Upload from a device **not bound to a child**:
- QA unit before `ready_to_ship`, not scrapped → **201**, stored in
  `qa_unit_reports` (test log, kept forever), never in a child.
- Never-seen board → added to devices, and to QA units when the upload has a chip
  UID (`qa.uid`, or `fw.uid` from production firmware ≥ 2.2.1). Guards: IMEI TAC
  in `QA_AUTO_REGISTER_TACS`, never bound to a child, ≤ 30 per hour.
- Uploads with the `qa` block get ≤ 10 Google lookups per unit, ≥ 30 s apart; first
  position sets `qa_units.network_located_at` ("Wi-Fi/GSM location: Passed").
- Otherwise 404 as before. Bound devices: normal ingest.
Admin API: `GET /v1/admin/qa/units/{unitId}/test-log`.

## Admin (`apps/admin/src/features/qa-units`)
Unit page: Test log tab (lookups n/10, map, uploads with GPS vs Wi-Fi/GSM and
"From GPS" distance), Motion IC row, Final test steps panel. Units list: Motion IC
column. Stage counts: QA overview page.

## First bench result (2026-11-15, qa-0.7.2, bench board IMEI 869938082392680)
netloc PASS 10/10 accepted, 5–9 Wi-Fi + cell each. FAIL: power (board fault, PB10
saturated), imu (board fault, no I2C answer), gsm and wifi (firmware test issues
above). Board faults: Stepwhere-Firmware `docs/handoff/BOARD_REV11_BENCH.md`.
Still to check: the unit's Test log shows Wi-Fi/GSM positions (not yet confirmed).
