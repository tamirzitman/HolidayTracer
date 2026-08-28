# HolidayTracer

A one-screen web app for a family. For each holiday it asks:

> **<span dir="rtl">איפה אתם בחג?</span>** — <span dir="rtl">אני מארח</span>, or
> <span dir="rtl">מתארח אצל</span> + a family picked from a dropdown.

Sign in with a phone number and a name — no password, no email, no code — remembered in a browser
cookie so you only ever type it once. **A Google Sheet is the entire database**, and everything is
managed by hand in it. Hebrew, right-to-left.

**Phase 1 is built.** See [docs/PLAN.md](docs/PLAN.md) for the design and
[docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) for what's still undecided.

---

## Try it locally, without a Google Sheet

With no `SHEET_ID` set the app reads and writes `.dev-sheet.json` instead of a real sheet, so you
can see the whole thing working before creating anything in Google.

```bash
npm install
npm run seed:holidays          # fills the Holidays tab with candidate dates
npm run fixtures               # sample families, so the dropdown isn't empty
```

Then open `.dev-sheet.json`, find a holiday in the `Holidays` tab and change its last column from
`FALSE` to `TRUE` — that's the same edit you'll make in the real sheet. Now:

```bash
SESSION_SECRET=dev npm run dev
```

Sign in with any phone number. The first one you use is unknown, so it will ask for your name and
which family you are.

To run the end-to-end check (needs a production build running on port 3111):

```bash
npm run build
SESSION_SECRET=test npm start -- --port 3111 &
npm run test:smoke
```

---

## Setting up the real thing

### 1. The spreadsheet
Create a Google Sheet with five tabs named exactly `Holidays`, `Households`, `People`, `Answers`,
`Conflicts`. Only the first two need anything typed into them — the app writes headers for the rest
the first time it needs them.

`Households` — the dropdown. **This tab is yours alone; the app never adds to it.**

| household_id | name | phone | active |
|---|---|---|---|
| hh_parents | אבא ואמא | +972501234567 | TRUE |

`People` — which number belongs to which family. The app appends here when somebody registers, and
you can add rows yourself.

| phone | name | household_id |
|---|---|---|
| +972501234567 | אבא | hh_parents |

Columns are matched **by header name**, so you can reorder or add columns without breaking anything.

### 2. The service account
1. In Google Cloud, create a project and enable the **Google Sheets API**.
2. Create a **service account** and download a JSON key.
3. **Share the sheet** with the service account's email address, as an **Editor**.

Family members never get access to the sheet — only the robot account and you.

### 3. Configure and fill the holidays
Copy `.env.example` to `.env.local` and fill in `SHEET_ID`, the two service-account values, and any
long random string for `SESSION_SECRET`. Then:

```bash
npm run seed:holidays -- --years 10
```

This writes every candidate date — <span dir="rtl">חג</span>, <span dir="rtl">ערב חג</span>,
<span dir="rtl">מועד</span> — into the `Holidays` tab with `include = FALSE`. **Go through the tab
and set `TRUE` on the dates your family actually gathers for.** That decision lives in the
spreadsheet; the app has no calendar logic of its own.

Re-running the seed is safe: rows you've edited keep their `include` value, and rows you added by
hand are left alone. Add `--dry` to see what it would do without writing.

### 4. Deploy
Any Node host works. On Vercel, set the same four environment variables in the project settings and
deploy — nothing else is needed, because there is nothing else to run.

---

## What the app is allowed to write

Three things only: a `People` row when somebody registers, an `Answers` row per answer, and (in
phase 2) the `Conflicts` tab. It never creates a family, never edits an existing row, and never
touches `Holidays`.

## Layout

```
src/app/          the two screens and the server actions
src/lib/          sheet access, the domain layer, phone normalization, the session cookie
src/components/   the three forms
scripts/          the one-off holiday seeder, and local dev fixtures
tests/smoke.mjs   end-to-end check of every flow above
```
