import { describe, expect, it } from "vitest";

import {
  buildRequestHeadersFromSetCookie,
  getCookieNamesFromCookieHeader,
  getCookieNamesFromSetCookieHeader,
} from "./auth-cookie-headers";

describe("auth cookie headers", () => {
  it("converts set-cookie response headers into a request cookie header", () => {
    const requestHeaders = new Headers({
      cookie: "existing=1",
    });
    const responseHeaders = new Headers();

    responseHeaders.append("set-cookie", "session_token=abc123; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "session_data=xyz789; Path=/; HttpOnly");

    const headers = buildRequestHeadersFromSetCookie(requestHeaders, responseHeaders);

    expect(headers.get("cookie")).toContain("existing=1");
    expect(headers.get("cookie")).toContain("session_token=abc123");
    expect(headers.get("cookie")).toContain("session_data=xyz789");
  });

  it("lists cookie names without exposing cookie values", () => {
    const requestHeaders = new Headers({
      cookie: "existing=1; session_token=abc123",
    });
    const responseHeaders = new Headers();

    responseHeaders.append("set-cookie", "session_token=abc123; Path=/; HttpOnly");
    responseHeaders.append("set-cookie", "session_data=xyz789; Path=/; HttpOnly");

    expect(getCookieNamesFromCookieHeader(requestHeaders)).toEqual([
      "existing",
      "session_token",
    ]);
    expect(getCookieNamesFromSetCookieHeader(responseHeaders)).toEqual([
      "session_token",
      "session_data",
    ]);
  });
});
