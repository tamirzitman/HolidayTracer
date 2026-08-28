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
| Signing in | **Phone number + name.** No password, no email, no SMS code |
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
| phone | name | household_id |
|---|---|---|
| +972501234567 | <span dir="rtl">אבא</span> | `hh_parents` |
| +972501119999 | <span dir="rtl">אמא</span> | `hh_parents` |

This is what turns a phone number into a household. Both parents' numbers point at the same
`household_id` — that is how one household holds several people. The `Households` tab's own `phone`
column is just the number shown beside the family's name in the app, so you can call them.

### `Answers` — the log
| timestamp | holiday_key | holiday_name | by_phone | household_id | household_name | kind | host_household_id | host_household_name |
|---|---|---|---|---|---|---|---|---|
| 2026-09-01T19:04Z | `rosh_hashana_5787` | <span dir="rtl">ראש השנה</span> | +972521234567 | `hh_tamir` | <span dir="rtl">תמיר ורעיה</span> | `guest` | `hh_parents` | <span dir="rtl">אבא ואמא</span> |
| 2026-09-01T20:12Z | `rosh_hashana_5787` | <span dir="rtl">ראש השנה</span> | +972501234567 | `hh_parents` | <span dir="rtl">אבא ואמא</span> | `hosting` | | |

**Append-only.** Changing your answer writes a new row; **the newest row for a given
holiday + household wins**. Nothing is ever overwritten, so a mis-tap can't destroy history and
the sheet doubles as an audit trail.

Names are written alongside ids deliberately — the sheet stays readable without a single lookup
formula.

---

## 3. How it's wired

```
  Family member's phone
          │  phone number + name
          ▼
  Next.js app on Vercel  ──── service account ────►  Google Sheet
  (the only UI)                 (read + append)        (the database)
                                                            ▲
                                                            │ you, by hand
                                                      management & cleanup
```

### Signing in — phone and name, nothing else
1. Type your **phone number**.
2. **Known number** → you're straight in, as your household.
3. **New number** → type your **name**, then answer *<span dir="rtl">"איזו משפחה אתם?"</span>* with
   the same dropdown everyone uses:
   - **Your family is already there** (a spouse registered it) → you join that household.
   - **It isn't** → a new household is created, named after you.

**You type your number once, ever.** It is kept in a **browser cookie**, so every visit after the
first opens straight on the question — no sign-in screen, no re-typing. The cookie is signed so it
can't be edited by hand, and it holds nothing but the phone number. Clearing browser data, or
opening the app on a different phone, means typing the number again — that's the only way back in,
and it's two taps.

No password, no email, no verification code. Registration is the app's own job — the only case
where the app writes anything to the sheet other than an answer.

**A new family appears in everyone's dropdown immediately.** Nothing waits on approval. The
`active` column exists as a manual off-switch for you, not a gate for them.

**The trade-off, accepted deliberately:** with no verification code, anyone who opens the app can
enter any phone number and act as that household. Keep the URL unlisted and inside the family. The
cost of a code — money per message, and a step your parents must get past — was judged higher than
the risk for a closed family app.

### Everything else
| | |
|---|---|
| Sheet access | A **service account** (a robot Google account) holds the credentials. You share the sheet with its address once, as Editor. **Family members never get access to the sheet itself** |
| Holiday dates | Computed with **`@hebcal/core`**, Israel schedule, offline, no API key |
| Session | A **signed browser cookie** holding the phone number, long-lived so nobody signs in twice. No auth provider — "this number is registered" is less machinery than any library would add |
| Management | You, in the sheet: fixing a name, merging duplicate households, correcting a phone number, editing an old answer |

### Why not Google Apps Script?
It looked ideal — free hosting from Google, direct sheet access, no service account. It was
rejected because running the script as the visitor would require giving every family member edit
access to the spreadsheet, which defeats "management is yours alone"; and running it as its owner
makes the whole app a single shared identity with no clean way to hold a per-person session.

### Stack
| | |
|---|---|
| App | **Next.js + TypeScript** on **Vercel free tier** |
| Interface | **Tailwind**, `dir="rtl"`, logical properties |
| Sheet access | **`googleapis`** with a service account key in an environment variable |
| Holidays | **`@hebcal/core`** |

No database, no ORM, no migrations, no auth provider, no admin panel.

## 4. Screens

Two. There is nothing else.

1. **<span dir="rtl">החג</span>** — the holiday and its date, the question, the two buttons, and
   the household dropdown. After answering: your answer in one line (with the host's phone shown
   next to the name, so you can call them), and a link to change it. If you're hosting, the
   households that said they're coming to you.
2. **<span dir="rtl">היסטוריה</span>** — one line per past holiday:
   *<span dir="rtl">"סוכות תשפ״ו — היינו אצל אבא ואמא"</span>*. Read straight from the log.

Sign-in is one field — your phone number — and, the first time only, your name and your family.
There is no third screen, because everything a third screen would do is done in the spreadsheet.

---

## 5. Order of build

| Phase | Scope |
|---|---|
| **1** | Sheet template + service account, phone sign-in and first-time registration, holiday computation, the question with the dropdown, appending an answer |
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
- **The app creates a household only at registration** — when a new number signs up and says their
  family isn't in the list. It never creates one any other way: if you want to add a family who
  hasn't registered, you add the row yourself.
- **Duplicates are yours to merge.** Because anyone can create a household instantly, you may end
  up with both <span dir="rtl">"אבא ואמא"</span> and <span dir="rtl">"הורים"</span>. Fixing that is a
  manual merge in the sheet — the accepted cost of nobody waiting on approval.

## 7. Not building
Admin screens · per-person RSVPs and attendance states · hosting rotation and statistics · family
circles · menus, photos, times, addresses · invitations or notifications · a database.
