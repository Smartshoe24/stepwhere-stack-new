function normalizedPhoneDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

export function isMeaningfulParentName(
  displayName: string | null | undefined,
  phoneNumber: string | null | undefined,
) {
  const trimmedName = displayName?.trim() ?? "";

  if (!trimmedName || /^\+\d+$/.test(trimmedName)) {
    return false;
  }

  const phoneDigits = normalizedPhoneDigits(phoneNumber);
  const nameDigits = normalizedPhoneDigits(trimmedName);
  const containsOnlyPhoneCharacters = /^[+\d\s().-]+$/.test(trimmedName);

  return !(
    phoneDigits.length > 0 &&
    containsOnlyPhoneCharacters &&
    nameDigits === phoneDigits
  );
}

export function getParentNameInputValue(
  displayName: string | null | undefined,
  phoneNumber: string | null | undefined,
) {
  return isMeaningfulParentName(displayName, phoneNumber)
    ? (displayName ?? "")
    : "";
}
