export type Freshness = 'live' | 'recent' | 'stale' | 'offline'

/** live < 1 min · recent < 15 min · stale < 24 h · offline beyond that (or never). */
export function getFreshness(
  value: Date | string | null | undefined,
  now = Date.now()
): Freshness {
  if (!value) return 'offline'
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(time)) return 'offline'
  const age = Math.max(0, now - time)
  if (age < 60_000) return 'live'
  if (age < 15 * 60_000) return 'recent'
  if (age < 24 * 60 * 60_000) return 'stale'
  return 'offline'
}
