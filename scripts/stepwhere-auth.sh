#!/usr/bin/env sh

if [ -n "${ZSH_EVAL_CONTEXT:-}" ]; then
  case "$ZSH_EVAL_CONTEXT" in
    *:file)
      echo "Source this file before using the helpers: source scripts/stepwhere-auth.sh" >&2
      return 1 2>/dev/null || exit 1
      ;;
  esac
elif [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  echo "Source this file before using the helpers: source scripts/stepwhere-auth.sh" >&2
  exit 1
fi

STEPWHERE_API_URL="${STEPWHERE_API_URL:-http://localhost:3001}"
STEPWHERE_COOKIE_JAR="${STEPWHERE_COOKIE_JAR:-/tmp/stepwhere-auth.cookies}"
export STEPWHERE_API_URL STEPWHERE_COOKIE_JAR

# Local OTP flow:
# sw_auth_request_otp +919876543210
# read OTP from server logs
# sw_auth_verify_otp +919876543210 123456
# sw_auth_session

sw_refresh_cookie_header() {
  if [ ! -f "$STEPWHERE_COOKIE_JAR" ]; then
    export STEPWHERE_COOKIE=""
    return 0
  fi

  export STEPWHERE_COOKIE="$(
    awk 'BEGIN { first = 1 } !/^#/ && NF >= 7 { if (!first) printf "; "; printf "%s=%s", $6, $7; first = 0 }' "$STEPWHERE_COOKIE_JAR"
  )"
}

sw_auth_request_otp() {
  if [ -z "${1:-}" ]; then
    echo "usage: sw_auth_request_otp PHONE" >&2
    return 1
  fi

  curl -sS \
    -X POST \
    -H "content-type: application/json" \
    "$STEPWHERE_API_URL/api/auth/phone-number/send-otp" \
    -d "{\"phoneNumber\":\"$1\"}"
  echo
}

sw_auth_verify_otp() {
  if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
    echo "usage: sw_auth_verify_otp PHONE CODE" >&2
    return 1
  fi

  curl -sS \
    -X POST \
    -H "content-type: application/json" \
    -c "$STEPWHERE_COOKIE_JAR" \
    "$STEPWHERE_API_URL/api/auth/phone-number/verify" \
    -d "{\"phoneNumber\":\"$1\",\"code\":\"$2\"}"
  echo

  sw_refresh_cookie_header
}

sw_auth_session() {
  sw_refresh_cookie_header

  if [ -n "${STEPWHERE_COOKIE:-}" ]; then
    curl -sS \
      -H "cookie: $STEPWHERE_COOKIE" \
      "$STEPWHERE_API_URL/api/auth/session"
  else
    curl -sS "$STEPWHERE_API_URL/api/auth/session"
  fi
  echo
}

sw_auth_sign_out() {
  sw_refresh_cookie_header

  if [ -n "${STEPWHERE_COOKIE:-}" ]; then
    curl -sS \
      -X POST \
      -H "cookie: $STEPWHERE_COOKIE" \
      -b "$STEPWHERE_COOKIE_JAR" \
      -c "$STEPWHERE_COOKIE_JAR" \
      "$STEPWHERE_API_URL/api/auth/sign-out"
  else
    curl -sS -X POST "$STEPWHERE_API_URL/api/auth/sign-out"
  fi
  echo

  rm -f "$STEPWHERE_COOKIE_JAR"
  export STEPWHERE_COOKIE=""
}

sw_api() {
  if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
    echo "usage: sw_api METHOD PATH [JSON_BODY]" >&2
    return 1
  fi

  sw_refresh_cookie_header

  method="$1"
  path="$2"
  body="${3:-}"

  if [ -n "$STEPWHERE_COOKIE" ]; then
    if [ -n "$body" ]; then
      curl -sS \
        -X "$method" \
        -H "content-type: application/json" \
        -H "cookie: $STEPWHERE_COOKIE" \
        "$STEPWHERE_API_URL$path" \
        -d "$body"
    else
      curl -sS \
        -X "$method" \
        -H "cookie: $STEPWHERE_COOKIE" \
        "$STEPWHERE_API_URL$path"
    fi
  elif [ -n "$body" ]; then
    curl -sS \
      -X "$method" \
      -H "content-type: application/json" \
      "$STEPWHERE_API_URL$path" \
      -d "$body"
  else
    curl -sS \
      -X "$method" \
      "$STEPWHERE_API_URL$path"
  fi
  echo
}
