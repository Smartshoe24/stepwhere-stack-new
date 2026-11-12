#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${APP_DIR}/.builds/host"
CXX="${CXX:-c++}"
FLAGS=(-std=c++17 -O1 -Wall -Wextra -Werror -fsanitize=address,undefined)

mkdir -p "${OUT_DIR}"
"${CXX}" "${FLAGS[@]}" "${APP_DIR}/test/host_tests.cpp" -o "${OUT_DIR}/host_tests"
"${CXX}" "${FLAGS[@]}" "${APP_DIR}/test/replay_capture.cpp" -o "${OUT_DIR}/replay_capture"
"${OUT_DIR}/host_tests"
