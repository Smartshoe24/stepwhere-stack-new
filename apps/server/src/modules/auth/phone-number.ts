import { badRequest } from "../../shared/errors";

export function normalizePhoneNumber(phoneNumber: string) {
  const normalized = phoneNumber.trim();

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw badRequest("Enter a valid phone number.");
  }

  return normalized;
}
