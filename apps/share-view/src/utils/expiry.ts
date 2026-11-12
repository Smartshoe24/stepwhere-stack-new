export function getShareTokenFromPathname(pathname: string) {
  const match = pathname.match(/^\/s\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function formatExpiryCountdown(expiresAt: string, nowMs: number) {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;

  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min left`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} hr left`;
  }

  return `${hours} hr ${minutes} min left`;
}

export function formatLastUpdated(value: string | null) {
  if (!value) {
    return "Waiting for first update";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Waiting for first update";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
