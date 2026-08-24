export function isValidPin(
  value: unknown,
  minDigits: number,
  maxDigits: number,
): boolean {
  if (typeof value !== "string" || !value) {
    return false;
  }

  if (value.length < minDigits || value.length > maxDigits) {
    return false;
  }

  return /^\d+$/.test(value);
}
