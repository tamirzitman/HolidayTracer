# Going live

Three things need your Google account and can only be done by you. Everything else is a command.
Budget about twenty minutes.

---

## 1. Create the sheet — 1 minute

Make a new Google Sheet. Call it anything. **Copy its id** from the address bar: the long string
between `/d/` and `/edit`.

```
https://docs.google.com/spreadsheets/d/1AbCd...XyZ/edit
                                       └──── this ────┘
```

You don't need to create any tabs or type any headers — `npm run setup` does that.

---

## 2. Create a service account — about 10 minutes

This is a robot Google account that lets the app read and write your sheet. Your family never
touches it.

1. Go to <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library**, search for **Google Sheets API**, press **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Give it a name; skip
   the optional permission steps.
4. Open the service account, go to **Keys → Add key → Create new key → JSON**. A file downloads.
5. Open that file. You need two values from it: `client_email` and `private_key`.
6. **Back in your sheet: Share → paste the `client_email` → give it Editor → Send.**

Step 6 is the one people forget. Without it the app can see nothing.

---

## 3. Fill in the configuration — 2 minutes

```bash
cp .env.example .env.local
```

Open `.env.local` and set four values:

| | |
|---|---|
| `SHEET_ID` | the id from step 1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key — **keep the quotes and the `\n`s exactly as they appear** |
| `SESSION_SECRET` | any long random string; `openssl rand -base64 32` will do |

Then:

```bash
npm run setup
```

It opens the sheet, creates the five tabs, writes their headers, and tells you exactly what's
wrong if anything is. Safe to run as many times as you like — it never overwrites data.

---

## 4. Fill the sheet — the part that's actually yours

### The families
In the **Households** tab, one row per family:

| household_id | name | phone | active |
|---|---|---|---|
| `hh_parents` | אבא ואמא | +972501234567 | TRUE |
| `hh_tamir` | תמיר ורעיה | +972521234567 | TRUE |

`household_id` is any short id you like, as long as it's unique. `name` is what everyone sees in
the dropdown, so use the name the family is actually known by. `phone` is shown next to the name so
people can call them.

**This tab is yours alone — the app never adds to it.** That's what makes duplicates impossible.

### The holidays
```bash
npm run seed:holidays -- --years 10
```

This writes **only the kinds of holiday your family gathers for** — the set is at the top of
`scripts/seed-holidays.mts`, or pass `--kinds`. Seven kinds over ten years is seventy rows.

- `npm run seed:holidays -- --list-kinds` shows everything available.
- `npm run mark -- --on purim` switches a kind on across every year, `--off` removes one.

Re-running the seed is safe: your edits survive, and so do rows you add by hand.

Run `npm run setup` once more — it will confirm you have families and at least one upcoming holiday.

**After a version that adds a column**, run `npm run align` once against the live sheet (`--dry`
first to see what it would do). It adds the new column name to the header row of whichever tab
needs it and leaves every data row untouched. It is safe to run twice, and does nothing when the
sheet is already up to date.

---

## 5. Deploy to Vercel — 5 minutes

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import `tamirzitman/HolidayTracer`. Vercel detects Next.js on its own — change nothing.
3. Before deploying, open **Environment Variables** and add the same four values from `.env.local`.
   For `GOOGLE_PRIVATE_KEY`, paste the key exactly as it is in the JSON file.
4. **Deploy.**

You get a URL like `holidaytracer.vercel.app`. Open it, sign in with your own number, and answer.

### A second deployment pointed at a scratch sheet

**A second Vercel project, not a preview environment.** Preview deployments only exist for branches
that are not the production branch, and this repo has one branch, which is the production branch —
so there is nothing for preview variables to apply to. Two projects on the same repo is simpler
anyway: both track the same branch, so one push updates both and the playground can never be
running older code than the real thing.

Import the repo again at <https://vercel.com/new>, name it something like `holidaytracer-test`, and
give it five variables on **all** environments:

| Name | Value |
|---|---|
| `SHEET_ID` | the scratch sheet's id |
| `PLAYGROUND` | `1` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the same as the real project |
| `GOOGLE_PRIVATE_KEY` | the same as the real project |
| `SESSION_SECRET` | any long random string |

`PLAYGROUND` puts a standing <span dir="rtl">סביבת ניסיון</span> strip across the top, so the two
URLs can never be mistaken for each other. The scratch sheet needs the same service account shared
with it as an Editor, and its own `npm run setup` and `npm run seed:holidays`.

A deployment with no `SHEET_ID` refuses to start rather than falling back to a local file and coming
up looking merely empty.

### Then send the family the link
Ask everyone to open it on their phone and use **Add to Home Screen** — it then behaves like an app
and they never sign in again.

Anyone whose number isn't in `People` yet will be asked for their name and their family, and can
only pick a family you've already put in `Households`. If somebody's family is missing, add the row
and tell them to try again.

---

## Later

- **A number typed wrong?** Fix it in the `People` tab.
- **A family changed its name?** Fix it in `Households`; the dropdown follows.
- **Wrong answer recorded last year?** Edit the row in `Answers`. It's just a spreadsheet.
- **Ran out of holidays?** The app says so plainly. Re-run the seed with more years.
- **Never edit the `Conflicts` tab** — the app rewrites it after every answer, so anything typed
  there is lost.
