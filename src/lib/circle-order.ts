import { CIRCLE_COLORS } from './circle-colors';

/**
 * The order families are listed in, wherever the whole list appears.
 *
 * Families in several circles come first, because they are the ones a colour
 * alone cannot place — then everyone in one circle, gathered by which, and
 * families in none at the end. Within a group the order is by name.
 *
 * The point is that the same combination of colours always sits together. A
 * list sorted only by name scatters them, and a column of dots in no order is
 * decoration rather than information.
 */
export type Tagged = { id: string; name: string };

const paletteIndex = (color: string): number => {
  const at = CIRCLE_COLORS.findIndex((c) => c.key === color);
  return at === -1 ? CIRCLE_COLORS.length : at;
};

/**
 * What a household's circles sort as: how many, then which — the colours in
 * palette order, so groups appear in the palette's order rather than in
 * whatever order the circles happen to have been made.
 */
function groupKey(tags: { color: string }[]): string {
  return tags
    .map((t) => paletteIndex(t.color))
    .sort((a, b) => a - b)
    .map((i) => String(i).padStart(2, '0'))
    .join('-');
}

/** Sorts a list of households into that order, leaving the input untouched. */
export function byCircle<T extends Tagged>(
  items: T[],
  tags: Record<string, { color: string }[]>,
): T[] {
  return [...items].sort((a, b) => {
    const mine = tags[a.id] ?? [];
    const theirs = tags[b.id] ?? [];
    // More circles first: a family on two sides of the family is the one worth
    // seeing before the rest.
    if (mine.length !== theirs.length) return theirs.length - mine.length;
    const key = groupKey(mine).localeCompare(groupKey(theirs));
    if (key !== 0) return key;
    return a.name.localeCompare(b.name, 'he');
  });
}
