export function buildFamilyInviteDeepLink(token: string) {
  return `stepwhere://onboarding/join-family?token=${encodeURIComponent(token)}`;
}

export function extractJoinToken(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("token")?.trim() || null;
  } catch {
    return trimmed;
  }
}
