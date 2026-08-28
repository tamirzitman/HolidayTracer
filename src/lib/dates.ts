const WEEKDAY = new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'UTC' });

/** 2026-09-11 → "יום שישי · 11.9.2026" — the day of the week is what people plan around. */
export function formatDayAndDate(date: string): string {
  const [y, m, d] = date.split('-');
  const day = WEEKDAY.format(new Date(`${date}T00:00:00Z`));
  return `${day} · ${Number(d)}.${Number(m)}.${y}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
}
