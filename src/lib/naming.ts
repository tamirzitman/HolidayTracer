/**
 * What the two things being named actually are, said where they are named.
 *
 * "משפחה" is the word this app uses on every screen, and it is the word people
 * hear loosest. It has meant three different things to three people typing into
 * the same box: a household ("רמי ורינת"), one person in it ("גל"), and a whole
 * side of a family ("המשפחה של גל") — and the third is a circle, not a family,
 * so it arrives as a household nobody can ever be a guest at.
 *
 * None of that is recoverable from the data afterwards: a household named for
 * one person looks exactly like a household named properly. It has to be said
 * at the moment of typing, which is the only moment anybody is thinking about
 * it — and said as the contrast, because either half alone is what people
 * already assumed they were doing.
 */

/** Under any box that names a household. */
export const HOUSEHOLD_HINT =
  'משק בית אחד — מי שגרים יחד. לא שם של אדם אחד, ולא שם של צד במשפחה — זה מעגל.';

/** Under the box that names a circle — the other half of the same contrast. */
export const CIRCLE_HINT =
  'קבוצה של כמה משקי בית, למשל «צד אבא» או «המשפחה של גל».';
