/**
 * The colours a circle can be.
 *
 * Eight, because a family has a handful of sides and a palette nobody can tell
 * apart is worse than no colours. Each is a mid-tone that holds up on both the
 * light ground and the dark one, and none of them is the brand's wine — that
 * colour already means "you can tap this", and a dot that borrows it reads as a
 * button.
 *
 * A colour is never the only thing saying which circle a dot belongs to: every
 * dot carries the circle's name as its title, because a ring of coloured dots
 * is unreadable to anyone who cannot tell the hues apart.
 */
export const CIRCLE_COLORS = [
  { key: 'teal', hex: '#0f8f86', label: 'טורקיז' },
  { key: 'blue', hex: '#2f6fd0', label: 'כחול' },
  { key: 'violet', hex: '#7b5cd6', label: 'סגול' },
  { key: 'pink', hex: '#d1477f', label: 'ורוד' },
  { key: 'amber', hex: '#c07a12', label: 'כתום' },
  { key: 'green', hex: '#3f8f3a', label: 'ירוק' },
  { key: 'slate', hex: '#5b6b7d', label: 'אפור־כחול' },
  { key: 'rust', hex: '#b1592c', label: 'חלודה' },
] as const;

export type CircleColor = (typeof CIRCLE_COLORS)[number]['key'];

/** The hex for a stored key, falling back rather than rendering nothing. */
export const colorOf = (key: string): string =>
  CIRCLE_COLORS.find((c) => c.key === key)?.hex ?? CIRCLE_COLORS[0].hex;

export const colorName = (key: string): string =>
  CIRCLE_COLORS.find((c) => c.key === key)?.label ?? CIRCLE_COLORS[0].label;

/**
 * The first colour this household is not already using. Two circles the same
 * colour defeats the point, and picking one by hand before the circle even
 * exists is a question nobody wants asked — so it is chosen, and changed later
 * by whoever cares.
 */
export function nextColor(taken: string[]): CircleColor {
  const free = CIRCLE_COLORS.find((c) => !taken.includes(c.key));
  return (free ?? CIRCLE_COLORS[taken.length % CIRCLE_COLORS.length]).key;
}
