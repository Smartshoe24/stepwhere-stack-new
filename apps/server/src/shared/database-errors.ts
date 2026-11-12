type ErrorRecord = Record<string, unknown>;

const POSTGRES_TIMEOUT_CODES = new Set(["55P03", "57014"]);

export function isPostgresTimeoutError(error: unknown): boolean {
  let current = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as ErrorRecord;

    if (typeof record.code === "string" && POSTGRES_TIMEOUT_CODES.has(record.code)) {
      return true;
    }

    current = record.cause;
  }

  return false;
}
