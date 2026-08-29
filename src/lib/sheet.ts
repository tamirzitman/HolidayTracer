import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

/**
 * Everything the app needs from the spreadsheet. Two implementations: the real
 * Google Sheet, and a local JSON file used when no credentials are configured
 * so the app can be run before the sheet exists.
 */
export type SheetStore = {
  read(tab: string): Promise<string[][]>;
  /** Every tab in one request. Five round trips to Google is the difference between fast and slow. */
  readMany(tabs: string[]): Promise<Record<string, string[][]>>;
  append(tab: string, row: string[]): Promise<void>;
  /** Several rows in one request. Ten families moved is one round trip, not ten. */
  appendMany(tab: string, rows: string[][]): Promise<void>;
  replace(tab: string, rows: string[][]): Promise<void>;
};

const asStrings = (values: unknown[][] | undefined): string[][] =>
  (values ?? []).map((row) => row.map((cell) => String(cell ?? '')));

function googleStore(spreadsheetId: string): SheetStore {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  return {
    async read(tab) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A:Z`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      return asStrings(res.data.values ?? undefined);
    },
    async readMany(tabs) {
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: tabs.map((tab) => `${tab}!A:Z`),
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      const out: Record<string, string[][]> = {};
      (res.data.valueRanges ?? []).forEach((range, i) => {
        out[tabs[i]] = asStrings(range.values ?? undefined);
      });
      return out;
    },
    async append(tab, row) {
      await this.appendMany(tab, [row]);
    },
    async appendMany(tab, rows) {
      if (rows.length === 0) return;
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
    },
    async replace(tab, rows) {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:Z` });
      if (rows.length === 0) return;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    },
  };
}

/** Development stand-in: the same tabs, kept in one JSON file. */
function localStore(): SheetStore {
  const file = path.join(process.cwd(), '.dev-sheet.json');

  async function load(): Promise<Record<string, string[][]>> {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return {};
    }
  }

  async function save(data: Record<string, string[][]>): Promise<void> {
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  return {
    async read(tab) {
      return (await load())[tab] ?? [];
    },
    async readMany(tabs) {
      const data = await load();
      return Object.fromEntries(tabs.map((tab) => [tab, data[tab] ?? []]));
    },
    async append(tab, row) {
      await this.appendMany(tab, [row]);
    },
    async appendMany(tab, rows) {
      if (rows.length === 0) return;
      const data = await load();
      (data[tab] ??= []).push(...rows);
      await save(data);
    },
    async replace(tab, rows) {
      const data = await load();
      data[tab] = rows;
      await save(data);
    },
  };
}

let store: SheetStore | undefined;

export function sheetStore(): SheetStore {
  if (!store) {
    const id = process.env.SHEET_ID;
    // Falling back to a local file is right on a laptop and wrong on a
    // deployment: the filesystem there is empty and read-only, so the app would
    // come up looking merely empty rather than misconfigured. Missing SHEET_ID
    // on Vercel is a mistake, and it should say so.
    if (!id && process.env.VERCEL) {
      throw new Error(
        'SHEET_ID is not set for this deployment. Vercel scopes variables per ' +
          'environment — check that Preview has one of its own.',
      );
    }
    store = id ? googleStore(id) : localStore();
  }
  return store;
}

export function usingLocalSheet(): boolean {
  return !process.env.SHEET_ID;
}
