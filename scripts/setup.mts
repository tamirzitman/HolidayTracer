/**
 * Bootstraps and checks the real Google Sheet.
 *
 *   npm run setup
 *
 * Verifies the credentials, creates any missing tabs, writes their header rows,
 * and reports exactly what is still needed. Safe to run repeatedly — it never
 * overwrites data.
 */
import { readFileSync } from 'node:fs';
import { google } from 'googleapis';

loadEnv();

const { HEADERS, TABS } = await import('../src/lib/types.ts');

// Derived from the schema rather than listed here, so a new tab can never be
// forgotten: adding one to HEADERS is enough.
const TAB_HEADERS = Object.fromEntries(
  Object.entries(TABS).map(([key, title]) => [title, HEADERS[key as keyof typeof HEADERS]]),
) as Record<string, readonly string[]>;

function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      // `key in process.env` — not truthiness: an explicitly empty value is a choice.
      if (!(key in process.env)) process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

function fail(message: string, hint?: string): never {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

const spreadsheetId = process.env.SHEET_ID;
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!spreadsheetId) fail('SHEET_ID is not set', 'Copy .env.example to .env.local and fill it in.');
if (!email) fail('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
if (!key) fail('GOOGLE_PRIVATE_KEY is not set');
if (!process.env.SESSION_SECRET) {
  console.warn('! SESSION_SECRET is not set — fine for local use, required in production');
}

const auth = new google.auth.JWT({
  email,
  key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

let meta;
try {
  meta = await sheets.spreadsheets.get({ spreadsheetId });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(
    (error as { status?: number; code?: number | string })?.status ??
      (error as { code?: number | string })?.code ??
      0,
  );

  // Credential problems first: they surface as invalid_grant, whose text
  // contains "account not found" and would otherwise look like a missing sheet.
  if (/invalid_grant|unauthorized_client|Invalid JWT|invalid_client/i.test(message)) {
    fail(
      'Google rejected the service-account credentials.',
      'Check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY against the downloaded JSON key. ' +
        'The private key must keep its \\n line breaks and stay in quotes.',
    );
  }
  if (/API has not been used|SERVICE_DISABLED|accessNotConfigured/i.test(message)) {
    fail(
      'The Google Sheets API is not enabled for this project.',
      'Enable it in Google Cloud, wait a minute, then run this again.',
    );
  }
  if (status === 403 || /permission|forbidden/i.test(message)) {
    fail(
      'The service account cannot open that sheet.',
      `Share the sheet with ${email} as an Editor, then run this again.`,
    );
  }
  if (status === 404 || /requested entity was not found/i.test(message)) {
    fail(
      'No sheet with that SHEET_ID.',
      'Copy the id out of the sheet URL, the part between /d/ and /edit.',
    );
  }
  fail(message);
}

console.log(`✓ opened "${meta.data.properties?.title}"`);

const present = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''));
const missing = Object.keys(TAB_HEADERS).filter((tab) => !present.has(tab));

if (missing.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });
  console.log(`✓ created missing tabs: ${missing.join(', ')}`);
}

// Write a header row only where the tab is completely empty. A tab whose first
// row is data would have that row read back as the header and swallowed.
for (const [tab, headers] of Object.entries(TAB_HEADERS)) {
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A1:Z1` });
  if ((existing.data.values ?? []).length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[...headers]] },
    });
    console.log(`✓ wrote headers on ${tab}`);
  }
}

// ── what still needs a human ──────────────────────────────────────────────────
// Columns are read by header name: this file is edited by hand, and the schema
// has changed more than once.
async function readTab(tab: string): Promise<{ get: (row: string[], name: string) => string; body: string[][] }> {
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:Z` })).data.values ?? [];
  const header = (rows[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  return {
    body: rows.slice(1).map((r) => r.map((c) => String(c ?? ''))),
    get: (row, name) => {
      const i = header.indexOf(name);
      return i === -1 ? '' : (row[i] ?? '').trim();
    },
  };
}

const isTrue = (v: string) => ['true', '1', 'yes', 'כן'].includes(v.toLowerCase());

const households = await readTab('Households');
const holidays = await readTab('Holidays');
const connections = await readTab('Connections');

const activeHouseholds = households.body.filter((r) => isTrue(households.get(r, 'active')));
const includedHolidays = holidays.body.filter((r) => isTrue(holidays.get(r, 'include')));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const upcoming = includedHolidays.filter((r) => holidays.get(r, 'date') >= today);
const links = new Set(
  connections.body
    .filter((r) => (connections.get(r, 'action') || 'add') === 'add')
    .map((r) => `${connections.get(r, 'household_id')}→${connections.get(r, 'connected_to')}`),
);

console.log('\n— state —');
console.log(`  families:           ${activeHouseholds.length} active of ${households.body.length}`);
console.log(`  connections:        ${links.size} one-way links`);
console.log(`  holiday candidates: ${holidays.body.length}`);
console.log(`  marked include:     ${includedHolidays.length} (${upcoming.length} still upcoming)`);

const todo: string[] = [];
if (households.body.length === 0) todo.push('Add your families to the Households tab.');
if (holidays.body.length === 0) todo.push('Run: npm run seed:holidays');
if (holidays.body.length > 0 && upcoming.length === 0) {
  todo.push('Set include=TRUE on the holidays your family gathers for — none upcoming are marked.');
}
if (activeHouseholds.length > 1 && links.size === 0) {
  todo.push('No connections yet — run: npm run connect-all');
}

if (todo.length === 0) {
  console.log('\n✓ ready. Deploy it, or run: npm run dev');
} else {
  console.log('\nstill to do:');
  for (const item of todo) console.log(`  • ${item}`);
}
