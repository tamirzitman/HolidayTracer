# HolidayTracer

A one-screen web app for a family. For each holiday it asks:

> **<span dir="rtl">איפה אתם בחג?</span>** — <span dir="rtl">אני מארח</span>, or
> <span dir="rtl">מתארח אצל</span> + a family picked from a dropdown.

Sign in with a phone number and a name — no password, no email, no code, and no invite needed —
remembered in a browser cookie so you only ever type it once. You start with nobody on your list,
and every family you add brings the families it knows along as suggestions. **A Google Sheet is the entire database**, and everything is
managed by hand in it. Hebrew, right-to-left.

Three screens on a tab bar — the question, **המעגלים** (your families, and invites), and
**היסטוריה** (what happened, and correcting it) — plus **המועדים שלנו**, reached from the household
menu at the top. An occasion is a date this family gathers on and others don't; it goes out to your
circle unless you narrow it, and only the families it reaches are asked about it.

The household name sits at the top of every screen and opens a small menu: your occasions, a plain
**share of the app** for a friend who just likes the idea — no invite, no connection — and the way
out.

Answering steps through the whole year: swipe sideways, or use the arrows, to reach any holiday from
the next one up to that same holiday a year later.

See [docs/PLAN.md](docs/PLAN.md) for the design, [docs/GROWTH.md](docs/GROWTH.md) for how it reaches
families beyond your own, and [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) for what's still
undecided.

---

## Try it locally, without a Google Sheet

With no `SHEET_ID` set the app reads and writes `.dev-sheet.json` instead of a real sheet, so you
can see the whole thing working before creating anything in Google.

```bash
npm install
npm run seed:holidays          # fills the Holidays tab with candidate dates
npm run fixtures               # sample families, so the dropdown isn't empty
```

Then open `.dev-sheet.json`, find a holiday in the `Holidays` tab and set its `include` column to
`TRUE` — that's the same edit you'll make in the real sheet. Now:

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

## A place to try things

Sign-in is a phone number and nothing else, so trying a scenario end to end means
being several people — and doing it against the real record would put invented
families into it. Both are config, not code:

**A scratch sheet, and a second deployment.** Make a second Google Sheet, share it
with the same service account, then run `npm run setup` and `npm run seed:holidays`
against it. On Vercel, import the repo a second time as its own project with
`SHEET_ID` pointed at that sheet and `PLAYGROUND=1` — see
[docs/GOING-LIVE.md](docs/GOING-LIVE.md). Both projects track the same branch, so
one push updates both. The scratch URL carries a standing red strip —
<span dir="rtl">סביבת ניסיון</span> — so the two can never be confused, and being a
different origin it keeps its own cookie.

**Several people at once, on one phone.** Every browser has its own cookie jar, so
Chrome, a Chrome incognito tab, Safari and Firefox are four households side by
side. Within one browser, **יציאה** on the families screen switches who you are.
Numbers are never verified, so `050-000-0001` and friends work as well as real ones.

**Back to the start.** `PLAYGROUND=1 npm run reset` restores the scratch sheet to a
fixed cast — a family with two people, one with a single person, one nobody has
joined, and a suggestion waiting to be taken up — and prints the numbers to sign in
with. It refuses to run without `PLAYGROUND=1`, so it cannot empty the real sheet.

---

## Setting up the real thing

### 1. The spreadsheet
Run `npm run setup` and the tabs are created for you: `Holidays`, `Households`, `People`,
`Answers`, `Conflicts`, `Connections`, `Invites`. Only the first two need anything typed into them.

`Households` — the families.

| household_id | name | active |
|---|---|---|
| hh_parents | אבא ואמא | TRUE |

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

Every tab is **append-only**: an answer, a connection, an invite, a conflict, a family's own
occasion. Nothing is ever edited or deleted in place — correcting the record means a newer row, and
the newest row for a key wins. That is what makes two people answering at the same moment safe, and
it means the sheet doubles as its own history.

The one exception is `npm run align`, a maintenance command you run by hand: it adds any newly
introduced column name to a tab's header row, leaving every data row untouched.

## Layout

```
src/app/          the four screens (question, families, history, occasions) and the server actions
src/lib/          sheet access, the domain layer, phone normalization, the session cookie
src/components/   the forms and the tab bar
scripts/          setup, the holiday seeder, header alignment, and local dev fixtures
tests/smoke.mjs   end-to-end check of every flow above
```
