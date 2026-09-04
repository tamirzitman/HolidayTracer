/**
 * A small mark of what the holiday actually is.
 *
 * The sheet has the last word: an `emoji` cell on the row is used as typed, so a
 * mark can be changed without a deploy and a family's own occasion can carry
 * whatever it likes. This map is only what to draw when that cell is empty,
 * which is every seeded row until somebody edits one.
 */
const BY_KIND: Record<string, string> = {
  // Three consecutive days: an eve, the day itself, then the second eve. The
  // marks follow that shape rather than repeating.
  erev_rosh_hashana: '🍎',
  rosh_hashana: '🍯',
  rosh_hashana_ii: '🍎',
  erev_yom_kippur: '🕊️',
  yom_kippur: '🕊️',
  erev_sukkot: '🌿',
  sukkot_i: '🌿',
  shmini_atzeret: '📜',
  simchat_torah: '📜',
  chanukah_1_candle: '🕎',
  tu_bishvat: '🌳',
  erev_purim: '🎭',
  purim: '🎭',
  erev_pesach: '🍷',
  pesach_i: '🍷',
  pesach_vii: '🌊',
  lag_baomer: '🔥',
  yom_haatzma_ut: '🇮🇱',
  erev_shavuot: '🌾',
  shavuot: '🌾',
};

/** What the code knows for a holiday kind, before the sheet is consulted. */
export function emojiForKind(holidayKey: string): string {
  return BY_KIND[holidayKey.replace(/_\d{4}$/, '')] ?? '✨';
}

/** The mark to draw: what the sheet says, or what the kind suggests. */
export function holidayEmoji(holiday: { key: string; emoji?: string }): string {
  return holiday.emoji?.trim() || emojiForKind(holiday.key);
}
