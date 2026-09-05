/**
 * Copies one spreadsheet's contents over another, tab for tab.
 *
 * The use for it is putting the real record into the scratch sheet, so that
 * trying something out happens against the families and the history that
 * actually exist rather than against invented ones. It goes one way on purpose:
 * the source is only read.
 *
 *   npm run copy-sheet                  # what it would do, and to which sheet
 *   npm run copy-sheet -- --apply       # do it
 *   npm run copy-sheet -- --to <id>     # somewhere other than the scratch sheet
 *   npm run copy-sheet -- --from <id>   # from somewhere other than SHEET_ID
 *
 * The target's contents are dumped to a file first. It is a scratch sheet and
 * this is a scratch backup — enough to put a row back by hand, not a policy.
 */
import { writeFileSync } from 'node:fs';
import { google } from 'googleapis';

const { HEADERS, TABS } = await import('../src/lib/types.ts');

/**
 * The scratch sheet — "TST-holidaytracer". Named here so that copying the real
 * record into it is one command with nothing to remember; an id is not a
 * credential, and reaching this sheet still needs the service account's key.
 */
const PLAYGROUND = '1W1ZYpf0sIVdmyhoWnPMkzCRNsxuj5bUPz87erL2bBJo';

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const from = arg('from') ?? process.env.SHEET_ID ?? '';
const to = arg('to') ?? PLAYGROUND;
const apply = process.argv.includes('--apply');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!from) fail('No source. Set SHEET_ID in .env.local, or pass --from <id>.');
if (from === to) fail('Source and target are the same sheet.');
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) fail('No service account. Is .env.local loaded?');

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const titleOf = async (id: string): Promise<string> =>
  (await sheets.spreadsheets.get({ spreadsheetId: id })).data.properties?.title ?? '(untitled)';

const [fromTitle, toTitle] = await Promise.all([titleOf(from), titleOf(to)]);
console.log(`from  ${fromTitle}  (${from})`);
console.log(`to    ${toTitle}  (${to})\n`);

// Every tab the app knows about. A tab nobody reads is not worth copying, and
// one the target has that the source does not is left alone rather than wiped.
const tabs = Object.values(TABS) as string[];

const source: Record<string, string[][]> = {};
for (const tab of tabs) {
  const got = await sheets.spreadsheets.values
    .get({ spreadsheetId: from, range: `${tab}!A:Z` })
    .catch(() => undefined);
  source[tab] = got?.data.values ?? [];
  console.log(`  ${tab}: ${Math.max(0, source[tab].length - 1)} rows`);
}

if (!apply) {
  console.log('\nDry run. Add --apply to overwrite the target with all of the above.');
  process.exit(0);
}

// The target as it stands, kept where it can be read back. Overwriting a whole
// sheet with no copy of what was there is the kind of thing that is only ever
// regretted once.
const backup: Record<string, string[][]> = {};
const present = new Set(
  ((await sheets.spreadsheets.get({ spreadsheetId: to })).data.sheets ?? []).map(
    (s) => s.properties?.title ?? '',
  ),
);
for (const tab of present) {
  const got = await sheets.spreadsheets.values
    .get({ spreadsheetId: to, range: `${tab}!A:Z` })
    .catch(() => undefined);
  backup[tab] = got?.data.values ?? [];
}
const backupFile = `.sheet-backup-${to.slice(0, 8)}-${Date.now()}.json`;
writeFileSync(backupFile, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
console.log(`\n✓ target's contents saved to ${backupFile}`);

const missing = tabs.filter((tab) => !present.has(tab));
if (missing.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: to,
    requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  console.log(`✓ created missing tabs: ${missing.join(', ')}`);
}

for (const tab of tabs) {
  const rows = source[tab];
  await sheets.spreadsheets.values.clear({ spreadsheetId: to, range: `${tab}!A:Z` });
  // An empty source tab still gets its header, or the first row written later
  // would be read back as the header and swallowed.
  const key = (Object.keys(TABS) as (keyof typeof TABS)[]).find((k) => TABS[k] === tab)!;
  const values = rows.length > 0 ? rows : [[...HEADERS[key]]];
  await sheets.spreadsheets.values.update({
    spreadsheetId: to,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  console.log(`✓ ${tab}: ${values.length - 1} rows`);
}

const spare = [...present].filter((tab) => !tabs.includes(tab));
if (spare.length > 0) {
  console.log(`\nleft alone (the app reads none of these): ${spare.join(', ')}`);
}
console.log(`\n✓ "${fromTitle}" copied into "${toTitle}".`);
