import { applySetCookies } from "better-auth/cookies";

export function getSetCookieValues(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

export function buildRequestHeadersFromSetCookie(
  requestHeaders: Headers,
  responseHeaders: Headers,
): Headers {
  const headers = new Headers(requestHeaders);
  const setCookieValues = getSetCookieValues(responseHeaders);

  if (setCookieValues.length > 0) {
    applySetCookies(headers, setCookieValues);
  }

  return headers;
}

export function getCookieNamesFromCookieHeader(headers: Headers): string[] {
  const cookie = headers.get("cookie") ?? "";

  return cookie
    .split(";")
    .map((part) => part.trim().split("=")[0])
    .filter(Boolean);
}

export function getCookieNamesFromSetCookieHeader(headers: Headers): string[] {
  return getSetCookieValues(headers)
    .map((value) => value.split("=")[0]?.trim())
    .filter(Boolean);
}
