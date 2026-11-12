export function getSessionTokenFromCookie(cookie: string | null) {
  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(";")) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const rawName = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1);
    const normalizedName = rawName.replace(/^__Secure-/, "");

    if (
      !normalizedName.endsWith(".session_token")
      && !normalizedName.endsWith("-session_token")
      && normalizedName !== "session_token"
    ) {
      continue;
    }

    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}
