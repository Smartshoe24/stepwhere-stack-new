export type ErrorCode =
  | "BILLING_DISABLED"
  | "BILLING_CONFLICT"
  | "SUBSCRIPTION_REQUIRED"
  | "EARLY_CHECKOUT_UNAVAILABLE"
  | "BILLING_QUOTE_EXPIRED"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "PREVIEW_ACCESS_REQUIRED"
  | "ONBOARDING_REQUIRED"
  | "ALREADY_IN_FAMILY"
  | "INVALID_JOIN_CODE"
  | "INVITE_ALREADY_USED"
  | "FAMILY_MEMBER_LIMIT_REACHED"
  | "FAMILY_HAS_CHILDREN"
  | "FAMILY_HAS_MEMBERS"
  | "DEVICE_AUTH_FAILED"
  | "DEVICE_NOT_ACTIVE"
  | "DEVICE_BINDING_NOT_FOUND"
  | "CHILD_NOT_FOUND"
  | "PLAN_NOT_FOUND"
  | "SUBSCRIPTION_NOT_FOUND"
  | "GEOFENCE_NOT_FOUND"
  | "LOCATION_UNAVAILABLE"
  | "LOCATION_STALE"
  | "SHARE_LINK_NOT_FOUND"
  | "SHARE_LINK_EXPIRED"
  | "SHARE_LINK_UNAVAILABLE"
  | "RATE_LIMITED"
  // Device reservation outcomes. These were all flattened into CONFLICT, which
  // forced the client to branch on English prose and made "expired" and
  // "already consumed by a successful create" indistinguishable.
  | "RESERVATION_EXPIRED"
  | "RESERVATION_ALREADY_CONSUMED"
  | "RESERVATION_HELD_BY_ANOTHER_USER"
  | "DEVICE_BOUND_ELSEWHERE"
  | "DEVICE_NOT_CLAIMABLE"
  | "DEVICE_BLOCKED"
  | "CHILD_ALREADY_HAS_DEVICE"
  | "ACCOUNT_DELETION_PENDING"
  | "ACCOUNT_DELETION_FINALIZING"
  | "ACCOUNT_DELETION_CODE_INVALID"
  | "ACCOUNT_DELETION_CHALLENGE_EXPIRED";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return Boolean(
    error
      && typeof error === "object"
      && "status" in error
      && "code" in error
      && "message" in error,
  );
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Unauthorized", details?: unknown) {
  return new AppError(401, "UNAUTHORIZED", message, details);
}

export function forbidden(message = "Forbidden", details?: unknown) {
  return new AppError(403, "FORBIDDEN", message, details);
}

export function notFound(code: Extract<ErrorCode, "NOT_FOUND" | "CHILD_NOT_FOUND" | "PLAN_NOT_FOUND" | "SUBSCRIPTION_NOT_FOUND" | "GEOFENCE_NOT_FOUND" | "SHARE_LINK_NOT_FOUND">, message: string, details?: unknown) {
  return new AppError(404, code, message, details);
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, "CONFLICT", message, details);
}

/**
 * 409 with a specific code. Prefer this over `conflict` for anything a client
 * needs to branch on — a bare CONFLICT leaves the message as the only
 * discriminator, and copy edits then silently change client behaviour.
 *
 * Deliberately 409 and never 401: the mobile api-client routes every 401 to a
 * global handler that signs the user out, which would tear down a flow
 * mid-recovery.
 */
export function typedConflict(
  code: Extract<
    ErrorCode,
    | "RESERVATION_EXPIRED"
    | "RESERVATION_ALREADY_CONSUMED"
    | "RESERVATION_HELD_BY_ANOTHER_USER"
    | "DEVICE_BOUND_ELSEWHERE"
    | "DEVICE_NOT_CLAIMABLE"
    | "DEVICE_BLOCKED"
    | "CHILD_ALREADY_HAS_DEVICE"
  >,
  message: string,
  details?: unknown,
) {
  return new AppError(409, code, message, details);
}

export function gone(
  code: Extract<ErrorCode, "SHARE_LINK_EXPIRED" | "SHARE_LINK_UNAVAILABLE">,
  message: string,
  details?: unknown,
) {
  return new AppError(410, code, message, details);
}
