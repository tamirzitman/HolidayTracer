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
  append(tab: string, row: string[]): Promise<void>;
  replace(tab: string, rows: string[][]): Promise<void>;
};

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
      return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? '')));
    },
    async append(tab, row) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A:Z`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
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
    async append(tab, row) {
      const data = await load();
      (data[tab] ??= []).push(row);
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
    store = id ? googleStore(id) : localStore();
  }
  return store;
}

export function usingLocalSheet(): boolean {
  return !process.env.SHEET_ID;
}
