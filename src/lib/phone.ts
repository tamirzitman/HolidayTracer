/**
 * Israeli numbers are written half a dozen ways — 054-123-4567, 0541234567,
 * +972541234567 — and all of them have to land on the same row in the sheet.
 * Everything is stored in E.164.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let national: string;
  if (digits.startsWith('+972')) national = digits.slice(4);
  else if (digits.startsWith('972')) national = digits.slice(3);
  else if (digits.startsWith('+')) return digits.length >= 8 ? digits : null;
  else national = digits;

  national = national.replace(/^0+/, '');
  if (national.length < 8 || national.length > 9) return null;
  if (!/^\d+$/.test(national)) return null;

  return `+972${national}`;
}

/** 0541234567 — how an Israeli reads their own number back. */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+972')) return e164;
  const national = `0${e164.slice(4)}`;
  if (national.length === 10) return `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
  if (national.length === 9) return `${national.slice(0, 2)}-${national.slice(2, 5)}-${national.slice(5)}`;
  return national;
}
