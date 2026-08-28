# HolidayTracer — Plan

> Status: **plan / not yet implemented**. Reflects decisions confirmed with Tamir on 2026-08-28.
> Open items are in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md). Assumptions I had to make are marked
> **[ASSUMPTION]**.
>
> Third version. Earlier drafts (family circles and per-person RSVPs; then a Postgres app where you
> typed phone numbers) are in git history. Both were over-built.

---

## 1. What it is

A one-screen web app that asks, each holiday:

> ### <span dir="rtl">איפה אתם בחג?</span>

Two answers, both by **tapping — never typing**:

| Answer | What the user does |
|---|---|
| <span dir="rtl">**אני מארח**</span> | One tap. Done. |
| <span dir="rtl">**מתארח אצל…**</span> | Picks a household **by name** from a dropdown. |

Names, not numbers. The phone number lives behind the name in the spreadsheet — the app resolves
it; nobody ever types one.

**There is no database.** A **Google Sheet is the entire data store**, and all management —
adding a household, fixing a name, correcting a phone number, editing history — happens by hand in
that sheet. The app writes to it and reads from it. Nothing else.

That means the app has **no admin screens at all**. No "add household", no "manage members", no
settings. If something needs changing, you open the sheet.

### Confirmed decisions

| | |
|---|---|
| The question | One per holiday: hosting, or a guest at another household |
| Choosing a host | **Dropdown of household names.** No typing, no phone entry |
| Data store | **Google Sheets** — the single source of truth |
| Management | **Manual, in the sheet.** The app has no admin UI |
| Identity | **Google sign-in**, matched to an email column in the sheet |
| Answers format | **A log** — one appended row per answer, nothing overwritten |
| Holidays | **Computed automatically**, Israel schedule |
| Hosting | Free tier |
| Interface | Hebrew, right-to-left, mobile web |

---

## 2. The spreadsheet

Three tabs. This *is* the schema.

### `Households`
| household_id | name | phone | active |
|---|---|---|---|
| `hh_parents` | <span dir="rtl">אבא ואמא</span> | +972501234567 | TRUE |
| `hh_tamir` | <span dir="rtl">תמיר ורעיה</span> | +972521234567 | TRUE |

The dropdown in the app is built from this tab — every row with `active = TRUE`. Adding a family
to the app means **adding a row here**, nothing more.

### `People`
| email | name | household_id |
|---|---|---|
| `dad@gmail.com` | <span dir="rtl">אבא</span> | `hh_parents` |
| `mom@gmail.com` | <span dir="rtl">אמא</span> | `hh_parents` |

This is what turns a Google sign-in into a household. Both parents' emails point at the same
`household_id`, which is how one household holds several people — the same idea as the earlier
plan's several phone numbers, moved into a column.

### `Answers` — the log
| timestamp | holiday_key | holiday_name | by_email | household_id | household_name | kind | host_household_id | host_household_name |
|---|---|---|---|---|---|---|---|---|
| 2026-09-01T19:04Z | `rosh_hashana_5787` | <span dir="rtl">ראש השנה</span> | `tamir@…` | `hh_tamir` | <span dir="rtl">תמיר ורעיה</span> | `guest` | `hh_parents` | <span dir="rtl">אבא ואמא</span> |
| 2026-09-01T20:12Z | `rosh_hashana_5787` | <span dir="rtl">ראש השנה</span> | `dad@…` | `hh_parents` | <span dir="rtl">אבא ואמא</span> | `hosting` | | |

**Append-only.** Changing your answer writes a new row; **the newest row for a given
holiday + household wins**. Nothing is ever overwritten, so a mis-tap can't destroy history and
the sheet doubles as an audit trail.

Names are written alongside ids deliberately — the sheet stays readable without a single lookup
formula.

---

## 3. How it's wired

```
  Family member's phone
          │  Google sign-in
          ▼
  Next.js app on Vercel  ──── service account ────►  Google Sheet
  (the only UI)                 (read + append)        (the database)
                                                            ▲
                                                            │ you, by hand
                                                       management
```

- **Google sign-in** identifies the visitor. Their email is looked up in `People` → their
  household. An email that isn't in the sheet gets a polite dead end:
  *<span dir="rtl">"עדיין לא הוספת לרשימה"</span>* — because adding people is manual, by design.
- **A service account** (a robot Google account) holds the sheet credentials. You share the sheet
  with its address once, as Editor. Family members never need access to the sheet itself —
  they only ever see the app.
- **Holiday dates** are computed with `@hebcal/core` (Israel schedule, offline, no API key). The
  app always knows what the next holiday is without anything being maintained.

### Why not Google Apps Script?
It looked ideal — free hosting from Google, direct sheet access, no service account. It was
rejected on identity: a script deployed to run as its owner **cannot reliably read a visitor's
email for consumer Gmail accounts**, and deploying it to run as the visitor would require giving
every family member edit access to the spreadsheet — which defeats "management is yours alone".

### Stack
| | |
|---|---|
| App | **Next.js + TypeScript** on **Vercel free tier** |
| Interface | **Tailwind**, `dir="rtl"`, logical properties |
| Sign-in | **Google OAuth** (Auth.js), restricted to emails present in `People` |
| Sheet access | **`googleapis`** with a service account key in an environment variable |
| Holidays | **`@hebcal/core`** |

No database, no ORM, no migrations, no admin panel.

---

## 4. Screens

Two. There is nothing else.

1. **<span dir="rtl">החג</span>** — the holiday and its date, the question, the two buttons, and
   the household dropdown. After answering: your answer in one line (with the host's phone shown
   next to the name, so you can call them), and a link to change it. If you're hosting, the
   households that said they're coming to you.
2. **<span dir="rtl">היסטוריה</span>** — one line per past holiday:
   *<span dir="rtl">"סוכות תשפ״ו — היינו אצל אבא ואמא"</span>*. Read straight from the log.

Sign-in is a single Google button. There is no third screen, because everything a third screen
would do is done in the spreadsheet.

---

## 5. Order of build

| Phase | Scope |
|---|---|
| **1** | Sheet template + service account, Google sign-in and email→household lookup, holiday computation, the question with the dropdown, appending an answer |
| **2** | "Who's coming to you", the history screen |
| **3** | Hebrew polish, home-screen install, a share-to-WhatsApp line |

Phase 1 is the product. It is realistically a weekend.

---

## 6. Things worth knowing

- **Reading the whole log on each page load is fine** at family scale (hundreds of rows for many
  years). If it ever isn't, the fix is caching, not a database. **[ASSUMPTION: fewer than ~50
  households.]**
- **Everything is visible to whoever holds the sheet** — that's you. The app still shows each
  person only what touches them, but the sheet has no privacy layer and isn't meant to.
- **The app can never create a household.** If someone answers "we're at the Cohens" and the
  Cohens aren't a row in `Households`, they simply aren't in the dropdown. You add the row.

## 7. Not building
Admin screens · per-person RSVPs and attendance states · hosting rotation and statistics · family
circles · menus, photos, times, addresses · invitations or notifications · a database.
