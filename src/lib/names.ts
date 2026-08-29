/**
 * How a family's name is built, in one place, so every form that creates a
 * household produces the same shape: first names then surname.
 *
 *   ('דנה ויוסי', 'כהן') → "דנה ויוסי כהן"
 *
 * Either half may be missing — a family known only by a surname, or the
 * hand-written rows in the sheet that read "אבא ואמא" — so the parts are
 * simply joined and the empty ones dropped.
 */
export const familyName = (firstNames: string, surname: string): string =>
  [firstNames.trim(), surname.trim()].filter(Boolean).join(' ');
