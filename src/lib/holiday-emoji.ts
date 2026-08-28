/** A small mark of what the holiday actually is, keyed on the holiday kind. */
const BY_KIND: Record<string, string> = {
  erev_rosh_hashana: '🍎',
  rosh_hashana: '🍯',
  rosh_hashana_ii: '🍯',
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

export function holidayEmoji(holidayKey: string): string {
  return BY_KIND[holidayKey.replace(/_\d{4}$/, '')] ?? '✨';
}
