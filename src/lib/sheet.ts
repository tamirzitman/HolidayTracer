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
  /**
   * Several rows in one call. Google takes a whole block per request, and the
   * difference is not a nicety: putting a family into a circle writes one row
   * per family already in it, and one request each turned a tap into a wait
   * long enough that people thought the app had hung.
   */
  appendAll(tab: string, rows: string[][]): Promise<void>;
  replace(tab: string, rows: string[][]): Promise<void>;
  /**
   * Makes a tab if the spreadsheet has not got one. True when it had to. The
   * local file grows tabs as they are written to; Google refuses a range on a
   * sheet that does not exist, so a new tab has to be asked for.
   */
  ensureTab(tab: string): Promise<boolean>;
};

const asStrings = (values: unknown[][] | undefined): string[][] =>
  (values ?? []).map((row) => row.map((cell) => String(cell ?? '')));

/**
 * How many times the store has been asked for something, by kind.
 *
 * Here because the cost of a screen is round trips to Google and nothing else,
 * and that cost is invisible from the code: a loop that writes one row per
 * family reads exactly like a loop that writes them all at once. Putting a
 * family into a circle once cost about forty of these, one after another, and
 * nothing said so until somebody sat waiting. `npm run perf-circle` reads these
 * and fails if the count starts growing with the size of the circle again.
 */
const calls = { read: 0, readMany: 0, append: 0, appendAll: 0 };
export const storeCalls = (): Readonly<typeof calls> => ({ ...calls });
export const resetStoreCalls = (): void => {
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) calls[key] = 0;
};

/** The same store, keeping a tally. Wrapped once rather than counted inside
 *  each method, so a store can never grow a method that forgets to count. */
function counted(store: SheetStore): SheetStore {
  return {
    read: (tab) => ((calls.read += 1), store.read(tab)),
    readMany: (tabs) => ((calls.readMany += 1), store.readMany(tabs)),
    append: (tab, row) => ((calls.append += 1), store.append(tab, row)),
    appendAll: (tab, rows) => ((calls.appendAll += 1), store.appendAll(tab, rows)),
    replace: (tab, rows) => store.replace(tab, rows),
    ensureTab: (tab) => store.ensureTab(tab),
  };
}

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
      const out: Record<string, string[][]> = {};
      try {
        const res = await sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges: tabs.map((tab) => `${tab}!A:Z`),
          valueRenderOption: 'UNFORMATTED_VALUE',
        });
        (res.data.valueRanges ?? []).forEach((range, i) => {
          out[tabs[i]] = asStrings(range.values ?? undefined);
        });
        return out;
      } catch {
        // One range Google cannot parse fails the whole batch, and a tab that
        // does not exist is exactly that — so a spreadsheet missing a tab the
        // code has learned about since would go dark rather than come up with
        // that one tab empty. Ask for them one at a time instead.
        await Promise.all(
          tabs.map(async (tab) => {
            out[tab] = await this.read(tab).catch(() => []);
          }),
        );
        return out;
      }
    },
    async ensureTab(tab) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const has = (meta.data.sheets ?? []).some((s) => s.properties?.title === tab);
      if (has) return false;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
      return true;
    },
    async append(tab, row) {
      await this.appendAll(tab, [row]);
    },
    async appendAll(tab, rows) {
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
      await this.appendAll(tab, [row]);
    },
    async appendAll(tab, rows) {
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
    // The file grows a tab the moment something is written to it, so there is
    // never one to make.
    async ensureTab() {
      return false;
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
    store = counted(id ? googleStore(id) : localStore());
  }
  return store;
}

export function usingLocalSheet(): boolean {
  return !process.env.SHEET_ID;
}
