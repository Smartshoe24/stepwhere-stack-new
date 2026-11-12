#!/usr/bin/env sh
set -eu

ROOT_DIR="${STEPWHERE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"

FOUND="$(
  find \
    "$ROOT_DIR/apps/mobile/android/app/build" \
    "$ROOT_DIR/apps/mobile/modules/stepwhere-theme-transition" \
    "$ROOT_DIR/node_modules/stepwhere-theme-transition" \
    -type f \( -name '*.dex' -o -name '*.jar' -o -name '*.class' -o -name '*.aar' \) \
    -print0 2>/dev/null \
    | xargs -0 -n 1 sh -c 'strings "$0" 2>/dev/null | rg -q "AnyTypeProvider|Lexpo/modules/kotlin/types/AnyTypeProvider" && echo "$0"' \
    || true
)"

if [ -n "$FOUND" ]; then
  printf '%s\n' "Android bytecode references removed Expo SDK class AnyTypeProvider:"
  printf '%s\n' "$FOUND"
  exit 1
fi

printf '%s\n' "Android bytecode check passed: AnyTypeProvider was not found."
