#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARDUINO_CLI_VERSION="${ARDUINO_CLI_VERSION:-1.5.1}"
ARDUINO_CLI="${ARDUINO_CLI:-}"
BUILD_ROOT="${APP_DIR}/.builds"
VARIANT="${1:-main}"
SKETCH_ROOT="${BUILD_ROOT}/sketch"
EXTRA_DEFINES=""
# STM32duino board part number. Variants that run on the Rev11 board override it.
BOARD_PNUM="AGAFIA_SG0"
case "${VARIANT}" in
  main)
    SKETCH_NAME="stepwhere"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts"
    EXPORT_DIR="${BUILD_ROOT}/output"
    WORK_DIR="${BUILD_ROOT}/work"
    ;;
  capture)
    # Production firmware that also streams raw accelerometer samples over TTL.
    SKETCH_NAME="stepwhere"
    SKETCH_ROOT="${BUILD_ROOT}/sketch-capture"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/capture"
    EXPORT_DIR="${BUILD_ROOT}/output-capture"
    WORK_DIR="${BUILD_ROOT}/work-capture"
    EXTRA_DEFINES="-DSTEPWHERE_ACCEL_CAPTURE=1"
    ;;
  dev)
    # Production firmware pointed at the development ingest tunnel.
    SKETCH_NAME="stepwhere.dev"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/dev"
    EXPORT_DIR="${BUILD_ROOT}/output-dev"
    WORK_DIR="${BUILD_ROOT}/work-dev"
    ;;
  accel-test)
    # Accelerometer debug: supply, bus and step-counting checks; modem and GPS stay off.
    SKETCH_NAME="stepwhere.accel-test"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/accel-test"
    EXPORT_DIR="${BUILD_ROOT}/output-accel-test"
    WORK_DIR="${BUILD_ROOT}/work-accel-test"
    # Long ADC sampling to read the sensor rail through R26 on PA1.
    EXTRA_DEFINES="-DADC_SAMPLINGTIME=ADC_SAMPLETIME_160CYCLES_5"
    ;;
  wifi-experiment-final)
    SKETCH_NAME="stepwhere.wifi-experiment-final"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/wifi-experiment-final"
    EXPORT_DIR="${BUILD_ROOT}/output-wifi-experiment-final"
    WORK_DIR="${BUILD_ROOT}/work-wifi-experiment-final"
    ;;
  experiment-wifi)
    SKETCH_NAME="stepwhere.experiment-wifi"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/experiment-wifi"
    EXPORT_DIR="${BUILD_ROOT}/output-experiment-wifi"
    WORK_DIR="${BUILD_ROOT}/work-experiment-wifi"
    ;;
  qa)
    SKETCH_NAME="stepwhere.qa"
    ARTIFACTS_DIR="${BUILD_ROOT}/artifacts/qa"
    EXPORT_DIR="${BUILD_ROOT}/output-qa"
    WORK_DIR="${BUILD_ROOT}/work-qa"
    # Rev11 boards carry an STM32G070CBT6. Same target as the production firmware
    # v2.2.0 (Smartshoe24/Stepwhere-Firmware main), which was tested on them.
    BOARD_PNUM="GENERIC_G070CBTX"
    ;;
  *)
    echo "Unknown firmware variant: ${VARIANT} (expected main, capture, dev, accel-test, wifi-experiment-final, experiment-wifi or qa)." >&2
    exit 1
    ;;
esac
SKETCH_DIR="${SKETCH_ROOT}/${SKETCH_NAME}"
# Extra compiler defines, e.g. FIRMWARE_DEFINES="-DSTEPWHERE_LOG_LEVEL=4".
EXTRA_DEFINES="${EXTRA_DEFINES} ${FIRMWARE_DEFINES:-}"
NATIVE_CTAGS="${APP_DIR}/tools/darwin-arm64/ctags"
NATIVE_CTAGS_SHA256="986781b08ac7ee98286a3d4f148a638e2b0b202f99d6600ab230c93cd594af4b"

cd "${APP_DIR}"

OS="$(uname -s)"
ARCH="$(uname -m)"

install_native_macos_ctags() {
  local installed_ctags="${BUILD_ROOT}/arduino-data/packages/builtin/tools/ctags/5.8-arduino11/ctags"
  local actual_sha256

  if [[ ! -f "${NATIVE_CTAGS}" ]]; then
    echo "Bundled macOS ARM64 ctags is missing: ${NATIVE_CTAGS}" >&2
    echo "Restore the tracked firmware tool and run the build again." >&2
    exit 1
  fi

  if [[ ! -x "${NATIVE_CTAGS}" ]]; then
    echo "Bundled macOS ARM64 ctags is not executable: ${NATIVE_CTAGS}" >&2
    exit 1
  fi

  actual_sha256="$(/usr/bin/shasum -a 256 "${NATIVE_CTAGS}" | /usr/bin/awk '{print $1}')"
  if [[ "${actual_sha256}" != "${NATIVE_CTAGS_SHA256}" ]]; then
    echo "Bundled macOS ARM64 ctags failed checksum validation." >&2
    echo "Expected: ${NATIVE_CTAGS_SHA256}" >&2
    echo "Actual:   ${actual_sha256}" >&2
    exit 1
  fi

  if ! /usr/bin/file "${NATIVE_CTAGS}" | /usr/bin/grep -q 'Mach-O 64-bit executable arm64'; then
    echo "Bundled ctags is not a macOS ARM64 executable: ${NATIVE_CTAGS}" >&2
    exit 1
  fi

  if ! /usr/bin/codesign --verify "${NATIVE_CTAGS}" >/dev/null 2>&1; then
    echo "Bundled macOS ARM64 ctags failed code-signature validation." >&2
    exit 1
  fi

  if ! "${NATIVE_CTAGS}" --version >/dev/null 2>&1; then
    echo "Bundled macOS ARM64 ctags could not be started." >&2
    exit 1
  fi

  if [[ ! -f "${installed_ctags}" ]]; then
    echo "Arduino CLI did not install its expected ctags tool: ${installed_ctags}" >&2
    exit 1
  fi

  cp "${NATIVE_CTAGS}" "${installed_ctags}"
  chmod +x "${installed_ctags}"

  if ! "${installed_ctags}" --version >/dev/null 2>&1; then
    echo "Native ctags replacement could not be started after installation." >&2
    exit 1
  fi

  echo "Using bundled macOS ARM64 ctags ${NATIVE_CTAGS_SHA256}."
}

if [[ -z "${ARDUINO_CLI}" ]]; then
  if command -v arduino-cli >/dev/null 2>&1; then
    ARDUINO_CLI="$(command -v arduino-cli)"
  else
    TOOLS_DIR="${BUILD_ROOT}/tools/arduino-cli-${ARDUINO_CLI_VERSION}"
    ARDUINO_CLI="${TOOLS_DIR}/arduino-cli"

    if [[ ! -x "${ARDUINO_CLI}" ]]; then
      case "${OS}:${ARCH}" in
        Darwin:arm64)
          ARCHIVE="arduino-cli_${ARDUINO_CLI_VERSION}_macOS_ARM64.tar.gz"
          ;;
        Darwin:x86_64)
          ARCHIVE="arduino-cli_${ARDUINO_CLI_VERSION}_macOS_64bit.tar.gz"
          ;;
        Linux:x86_64)
          ARCHIVE="arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz"
          ;;
        Linux:aarch64|Linux:arm64)
          ARCHIVE="arduino-cli_${ARDUINO_CLI_VERSION}_Linux_ARM64.tar.gz"
          ;;
        *)
          echo "Unsupported platform for automatic arduino-cli install: ${OS} ${ARCH}" >&2
          echo "Install arduino-cli manually or set ARDUINO_CLI=/path/to/arduino-cli." >&2
          exit 1
          ;;
      esac

      URL="https://github.com/arduino/arduino-cli/releases/download/v${ARDUINO_CLI_VERSION}/${ARCHIVE}"
      mkdir -p "${TOOLS_DIR}"
      curl -fL "${URL}" -o "${TOOLS_DIR}/${ARCHIVE}"
      tar -xzf "${TOOLS_DIR}/${ARCHIVE}" -C "${TOOLS_DIR}"
      chmod +x "${ARDUINO_CLI}"
    fi
  fi
fi

mkdir -p "${ARTIFACTS_DIR}" "${EXPORT_DIR}" "${SKETCH_DIR}" "${WORK_DIR}"
find "${EXPORT_DIR}" -mindepth 1 -maxdepth 1 -delete
cp "${APP_DIR}/${SKETCH_NAME}.ino" "${SKETCH_DIR}/${SKETCH_NAME}.ino"
rm -rf "${SKETCH_DIR}/src" "${SKETCH_DIR}/build_opt.h"
if [[ "${SKETCH_NAME}" == "stepwhere" || "${SKETCH_NAME}" == "stepwhere.dev" || "${SKETCH_NAME}" == "stepwhere.accel-test" ]]; then
  # Shared pure-logic headers and core build options (UART buffer sizes).
  cp -R "${APP_DIR}/src" "${SKETCH_DIR}/src"
  cp "${APP_DIR}/stepwhere.build_opt.h" "${SKETCH_DIR}/build_opt.h"
elif [[ "${SKETCH_NAME}" == "stepwhere.qa" ]]; then
  # The QA step test runs the same shoe pedometer as the main firmware.
  cp -R "${APP_DIR}/src" "${SKETCH_DIR}/src"
fi

"${ARDUINO_CLI}" --config-file arduino-cli.yaml core update-index

if [[ "${OS}:${ARCH}" == "Darwin:arm64" ]]; then
  install_native_macos_ctags
fi

"${ARDUINO_CLI}" --config-file arduino-cli.yaml core install STMicroelectronics:stm32@2.12.0

if [[ "${VARIANT}" != "experiment-wifi" ]]; then
  "${ARDUINO_CLI}" --config-file arduino-cli.yaml lib install TinyGPSPlus@1.0.3
  "${ARDUINO_CLI}" --config-file arduino-cli.yaml lib install STM32_TimerInterrupt@1.3.0
fi

"${ARDUINO_CLI}" \
  --config-file arduino-cli.yaml \
  compile \
  --clean \
  --fqbn "STMicroelectronics:stm32:GenG0:pnum=${BOARD_PNUM}" \
  --build-path "${WORK_DIR}" \
  --output-dir "${EXPORT_DIR}" \
  --build-property compiler.cpp.extra_flags="-DDEBUG_EN ${EXTRA_DEFINES}" \
  "${SKETCH_DIR}"

for extension in bin elf hex map; do
  output="${EXPORT_DIR}/${SKETCH_NAME}.ino.${extension}"
  if [[ ! -f "${output}" ]]; then
    echo "Expected build output was not produced: ${output}" >&2
    exit 1
  fi
done

cp "${EXPORT_DIR}/${SKETCH_NAME}.ino."{bin,elf,hex,map} "${ARTIFACTS_DIR}/"

echo "Firmware artifacts:"
printf '  %s\n' "${ARTIFACTS_DIR}/${SKETCH_NAME}.ino."{bin,elf,hex,map}
