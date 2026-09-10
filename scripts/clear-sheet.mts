/**
 * Empties a spreadsheet back to its header rows, for starting over.
 *
 * The holidays and their dates are left alone: they are the calendar rather
 * than anybody's record, and seeding them again is a separate errand nobody
 * wants after every reset. Pass --holidays to clear those too.
 *
 *   npm run clear-sheet                 # what it would clear, and where
 *   npm run clear-sheet -- --apply      # do it
 *   npm run clear-sheet -- --to <id>    # somewhere other than the scratch sheet
 *
 * It refuses to touch the sheet in SHEET_ID — that is the real record, and
 * "clear everything" is not something to aim at it by accident. The target's
 * contents are dumped to a file first either way.
 */
import { writeFileSync } from 'node:fs';
import { google } from 'googleapis';

const { HEADERS, TABS } = await import('../src/lib/types.ts');

/** The scratch sheet — "TST-holidaytracer". */
const PLAYGROUND = '1W1ZYpf0sIVdmyhoWnPMkzCRNsxuj5bUPz87erL2bBJo';

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const to = arg('to') ?? PLAYGROUND;
const apply = process.argv.includes('--apply');
const alsoHolidays = process.argv.includes('--holidays');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) fail('No service account. Is .env.local loaded?');
if (to === process.env.SHEET_ID) {
  fail('That is the sheet in SHEET_ID — the real record. Pass --to <id> for a scratch sheet.');
}

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: to });
console.log(`clearing  ${meta.data.properties?.title}  (${to})\n`);

// The calendar is both tabs: what the holidays are, and when they fall. Wiping
// one and keeping the other leaves dates belonging to nothing.
const calendar: string[] = [TABS.holidays, TABS.dates];
const keys = (Object.keys(TABS) as (keyof typeof TABS)[]).filter(
  (key) => alsoHolidays || !calendar.includes(TABS[key]),
);

const backup: Record<string, string[][]> = {};
for (const key of Object.keys(TABS) as (keyof typeof TABS)[]) {
  const tab = TABS[key];
  const got = await sheets.spreadsheets.values
    .get({ spreadsheetId: to, range: `${tab}!A:Z` })
    .catch(() => undefined);
  backup[tab] = got?.data.values ?? [];
  const rows = Math.max(0, backup[tab].length - 1);
  const kept = keys.some((k) => TABS[k] === tab) ? `${rows} rows → 0` : `${rows} rows kept`;
  console.log(`  ${tab}: ${kept}`);
}

if (!apply) {
  console.log('\nDry run. Add --apply to clear the tabs above.');
  process.exit(0);
}

const backupFile = `.sheet-backup-${to.slice(0, 8)}-${Date.now()}.json`;
writeFileSync(backupFile, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
console.log(`\n✓ contents saved to ${backupFile}`);

for (const key of keys) {
  const tab = TABS[key];
  await sheets.spreadsheets.values.clear({ spreadsheetId: to, range: `${tab}!A:Z` });
  // The header goes straight back: a tab whose first row is data would have
  // that row read as the header and swallowed.
  await sheets.spreadsheets.values.update({
    spreadsheetId: to,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...HEADERS[key]]] },
  });
  console.log(`✓ ${tab}: headers only`);
}

console.log(`\n✓ "${meta.data.properties?.title}" is empty and ready.`);
