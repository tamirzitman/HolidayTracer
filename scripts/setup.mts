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

const TAB_HEADERS: Record<string, string[]> = {
  Holidays: ['holiday_key', 'name_he', 'type', 'date', 'hebrew_date', 'hebrew_year', 'include'],
  Households: ['household_id', 'name', 'phone', 'active'],
  People: ['phone', 'name', 'household_id'],
  Answers: [
    'timestamp', 'hebrew_year', 'holiday_key', 'holiday_name', 'by_phone',
    'household_id', 'household_name', 'kind', 'host_household_id', 'host_household_name',
  ],
  Conflicts: ['holiday_name', 'household', 'said', 'host', 'but_host_said', 'detected_at'],
};

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
      if (!process.env[key]) process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
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
      requestBody: { values: [headers] },
    });
    console.log(`✓ wrote headers on ${tab}`);
  }
}

// ── what still needs a human ──────────────────────────────────────────────────
const read = async (tab: string) =>
  ((await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:Z` })).data.values ?? []).slice(1);

const households = await read('Households');
const holidays = await read('Holidays');
const activeHouseholds = households.filter((r) => String(r[3]).toUpperCase() === 'TRUE');
const includedHolidays = holidays.filter((r) => String(r[6]).toUpperCase() === 'TRUE');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const upcoming = includedHolidays.filter((r) => String(r[3]) >= today);

console.log('\n— state —');
console.log(`  families:           ${activeHouseholds.length} active of ${households.length}`);
console.log(`  holiday candidates: ${holidays.length}`);
console.log(`  marked include:     ${includedHolidays.length} (${upcoming.length} still upcoming)`);

const todo: string[] = [];
if (households.length === 0) todo.push('Add your families to the Households tab (household_id, name, phone, active=TRUE).');
if (holidays.length === 0) todo.push('Run: npm run seed:holidays -- --years 10');
if (holidays.length > 0 && upcoming.length === 0) {
  todo.push('Set include=TRUE on the holidays your family gathers for — none upcoming are marked, so the app has nothing to ask about.');
}

if (todo.length === 0) {
  console.log('\n✓ ready. Deploy it, or run: npm run dev');
} else {
  console.log('\nstill to do:');
  for (const item of todo) console.log(`  • ${item}`);
}
