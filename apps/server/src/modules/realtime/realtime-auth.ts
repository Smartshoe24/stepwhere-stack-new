export function buildRealtimeAuthHeaders(rawHeaders: Headers, token?: string) {
  const headers = new Headers(rawHeaders);

  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}
