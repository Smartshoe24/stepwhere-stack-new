# Tracker OTA releases: fallback copy (baked into the image at /srv/firmware)

Devices fetch `http://ingest.stepwhere.in/fw/<path>` (see `src/firmware.ts`).
Since v2.2.0 the proxy reads these files from the firmware S3 bucket behind
CloudFront (`FIRMWARE_UPSTREAM_URL`, set in the Dockerfile). Releases are
published there by Smartshoe24/Stepwhere-Firmware `.github/workflows/release.yml`
when a `v*` tag is pushed and approved (docs/RELEASING.md in that repo).

This directory is used only when `FIRMWARE_UPSTREAM_URL` is empty. It holds
the bench-test releases up to 2.1.7 (tests/ota_real_test in the firmware repo).
Only these paths are served; this README is not.

    manifest.json                     newest release (written last)
    devices/<hardwareIdentifier>.json optional per-device override
    releases/<x.y.z>/stepwhere.ota    signed image
