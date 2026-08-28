# HolidayTracer — Plan

> Status: **phase 1 is built** — see the repository root and [README](../README.md) for how to run
> it. Phases 2 and 3 are still plan. Reflects decisions confirmed with Tamir on 2026-08-28.
> Remaining items are in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md). Unavoidable assumptions are
> marked **[ASSUMPTION]**.
>
> Fourth version. Earlier drafts (family circles with per-person RSVPs; a Postgres app with typed
> phone numbers; Google sign-in) are in git history.

---

## 1. What it is

A one-screen web app that asks, each holiday:

> ### <span dir="rtl">איפה אתם בחג?</span>

Two answers, both by **tapping — never typing**:

| Answer | What the user does |
|---|---|
| <span dir="rtl">**אני מארח**</span> | One tap. Done. |
| <span dir="rtl">**מתארח אצל…**</span> | Picks a family **by name** from a dropdown. |

**A Google Sheet is the entire data store**, and **everything is managed by hand in it** — which
families exist, who belongs to which, which dates count as a holiday worth gathering for. The app
has **no admin screens at all**.

The app is deliberately dumb: it reads the sheet, shows a question, and appends the answer.

### Confirmed decisions

| | |
|---|---|
| The question | One per holiday: hosting, or a guest at another family |
| Choosing a host | **Dropdown of family names.** No typing, no phone entry |
| Data store | **Google Sheets** — the single source of truth |
| Holidays | **A tab you fill in once**, holding only the holidays you gather for |
| Families | **Manually managed by you.** The app never creates one |
| Signing in | **Phone number + name.** No password, no email, no SMS code |
| Session | Remembered in a **signed browser cookie** — you type your number once, ever |
| Answers | **One tab, forever**, append-only, ids only, Gregorian years |
| Contradictions | Flagged **both in the app and in the sheet** |
| Hosting | Free tier |
| Interface | Hebrew, right-to-left, mobile web |

---

## 2. The spreadsheet

Five tabs. **Every fact is stored once.** Names live in `Households`, phone numbers live in
`People`, and everything else references them by id — so correcting a name or a number is one edit,
not a hunt through the log. Years are **Gregorian**: 2026, not 5786.

### `Holidays` — only what you gather for
| holiday_key | name_he | type | date | hebrew_date | year | include |
|---|---|---|---|---|---|---|
| `erev_rosh_hashana_2026` | <span dir="rtl">ערב ראש השנה</span> | <span dir="rtl">ערב חג</span> | 2026-09-11 | <span dir="rtl">כ״ט אלול תשפ״ו</span> | 2026 | TRUE |

The seed writes **only the kinds of holiday your family actually gathers for** — seven kinds over
ten years is seventy rows, not two hundred. `npm run seed:holidays -- --list-kinds` shows what can
be asked for; `--kinds` changes the set. `include` stays as an off-switch for a single occurrence.

The app has **no calendar logic**. `@hebcal/core` runs in the seed script only.

### `Households` — the dropdown
| household_id | name | contact_person_id | active |
|---|---|---|---|
| `hh_parents` | <span dir="rtl">אבא ואמא</span> | `p_1` | TRUE |

No phone column: the number to call comes from the contact person's row in `People`.
**Only you add rows here** — the app cannot create a family, so duplicates are impossible.

### `People` — a phone number, stored once
| person_id | phone | name | household_id |
|---|---|---|---|
| `p_1` | +972501234567 | <span dir="rtl">אבא</span> | `hh_parents` |

Several people in one household point at the same `household_id`. Ids are `p_1`, `p_2`, … and the
app allocates the next one when somebody registers.

### `Answers` — the log, one tab forever
| timestamp | year | holiday_key | household_id | kind | host_household_id | by_person_id |
|---|---|---|---|---|---|---|
| 2026-08-28T16:21:39Z | 2026 | `erev_rosh_hashana_2026` | `hh_tamir` | `guest` | `hh_ofer` | `p_1` |

Ids only — no names, no phone numbers. **Append-only:** changing an answer writes a new row and the
newest row for a holiday + household wins, so a mis-tap can't destroy history.

### `Conflicts` — written by the app
| holiday_key | household_id | host_household_id | host_kind | host_host_household_id | detected_at |
|---|---|---|---|---|---|

Somebody is a guest at a family whose own newest answer isn't `hosting`. Derived, not a log: the
app rewrites it whenever it would change, so **never edit it by hand**.

A host who simply hasn't answered yet is not a conflict — that's an unanswered question.

### Speed
The whole spreadsheet is fetched in **one batched request** and held in memory for twenty seconds,
cleared by any write. Five separate round trips to Google was most of the wait after pressing a
button: a page load went from seconds to about 25ms once warm.

## 3. Signing in

1. Type your **phone number**.
2. **Known number** → straight in, as your family.
3. **New number** → type your **name**, then pick your family from the dropdown.
   - **It's there** → a row is appended to `People` and you're in.
   - **It isn't there** → you can't finish. The app says
     *<span dir="rtl">"המשפחה שלכם עדיין לא ברשימה — בקשו להוסיף אתכם"</span>*.

That last case is deliberate: families come from the sheet, so there are **no duplicates, ever**.
The cost is that a genuinely new family is blocked until you add a row — which is the trade you
chose, and correct while the family is being set up.

**You type your number once, ever.** It's kept in a **signed browser cookie**, so every later visit
opens straight on the question — no sign-in screen, no re-typing. The cookie holds nothing but the
number and can't be edited by hand. Clearing browser data or switching phone means typing it
again; that's the only way back in, and it's two taps.

**The trade-off, accepted deliberately:** with no verification code, anyone who opens the app can
enter any registered phone number and act as that family. Keep the link unlisted and inside the
family. The cost of a code — money per message, and a step your parents must get past — was judged
higher than the risk.

### What the app is allowed to write
Only three things: a **`People` row** at registration, an **`Answers` row** per answer, and the
**`Conflicts` tab**. It never creates a family, never edits an existing row, never touches
`Holidays`.

---

## 4. Screens

Two, plus one field for your phone number.

1. **<span dir="rtl">החג</span>** — the next holiday from the sheet and its date, the question, two
   buttons, the dropdown. After answering: your answer in one line with the family's number beside
   it, a link to change it, the quiet contradiction line if there is one, and — if you're hosting —
   who said they're coming.
2. **<span dir="rtl">היסטוריה</span>** — one line per past holiday:
   *<span dir="rtl">"סוכות תשפ״ו — היינו אצל אבא ואמא"</span>*. Read straight from the log.

**Which holiday is "next"** is simply the earliest row in `Holidays` with `include = TRUE` and a
date not yet passed. If the tab runs out of future rows, the app says so plainly rather than
guessing — that's your cue to seed more years.

---

## 5. How it's wired

```
  Family member's phone
          │  phone number, kept in a cookie
          ▼
  Next.js app on Vercel  ──── service account ────►  Google Sheet
  (the only UI)                (read + append)         (the database)
                                                            ▲
                                                            │ you, by hand
                                                    families · people · holidays
```

| | |
|---|---|
| App | **Next.js + TypeScript** on **Vercel free tier** |
| Interface | **Tailwind**, `dir="rtl"`, logical properties |
| Sheet access | **`googleapis`** with a service account key in an environment variable. You share the sheet with the robot address once, as Editor — **family members never get access to the sheet** |
| Session | A signed cookie holding the phone number |
| Seeding | A one-off local script using **`@hebcal/core`** to fill the `Holidays` tab |

No database, no ORM, no migrations, no auth provider, no admin panel, no calendar logic at runtime.

### Why not Google Apps Script?
Free hosting from Google and direct sheet access made it tempting. Rejected because running the
script as the visitor would require giving **every family member edit access to the spreadsheet**,
defeating the point of management being yours alone; and running it as its owner makes the whole
app one shared identity, with no clean way to hold a per-person session.

---

## 6. Order of build

| Phase | Scope |
|---|---|
| **1** ✅ | Sheet template + seed script + service account; phone sign-in and registration; reading the next holiday; the question with its dropdown; appending an answer |
| **2** | "Who's coming to you", the conflict line and the `Conflicts` tab, the history screen |
| **3** | Hebrew polish, home-screen install, a share-to-WhatsApp line |

---

## 7. Things worth knowing
- **Reading the whole log on each page load is fine** at family scale. If it ever isn't, the fix is
  caching, not a database. **[ASSUMPTION: fewer than ~50 families.]**
- **The sheet has no privacy layer** and isn't meant to. The app shows each person only what
  touches them; the sheet shows you everything.
- **Google Sheets API quotas** are per-minute and generous; a family app will never approach them.

## 8. Not building
Admin screens · per-person RSVPs and attendance states · hosting rotation and statistics · family
circles · menus, photos, times, addresses · invitations or notifications · a database · any
calendar logic inside the app.
