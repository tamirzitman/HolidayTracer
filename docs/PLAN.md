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
| Holidays | **A tab you fill in once.** You define what counts as חג / מועד / ערב חג |
| Families | **Manually managed by you.** The app never creates one |
| Signing in | **Phone number + name.** No password, no email, no SMS code |
| Session | Remembered in a **signed browser cookie** — you type your number once, ever |
| Answers | **One tab, forever**, append-only, carrying the Hebrew year so it sorts by year |
| Contradictions | Flagged **both in the app and in the sheet** |
| Hosting | Free tier |
| Interface | Hebrew, right-to-left, mobile web |

---

## 2. The spreadsheet

Five tabs. This *is* the schema.

### `Holidays` — filled in once, by you
The app has **no calendar logic whatsoever**. It does not know what Passover is. It reads this tab.

| holiday_key | name_he | type | date | hebrew_year | include |
|---|---|---|---|---|---|
| `rosh_hashana_eve_5787` | <span dir="rtl">ערב ראש השנה</span> | <span dir="rtl">ערב חג</span> | 2026-09-11 | 5787 | TRUE |
| `yom_kippur_eve_5787` | <span dir="rtl">ערב יום כיפור</span> | <span dir="rtl">ערב חג</span> | 2026-09-20 | 5787 | FALSE |
| `seder_5787` | <span dir="rtl">ליל הסדר</span> | <span dir="rtl">חג</span> | 2027-04-21 | 5787 | TRUE |

**`include` is the whole point.** Every candidate date is seeded once; you flip `TRUE` on the ones
that actually matter for a family meal and leave the rest `FALSE`. That is how
*<span dir="rtl">מה נחשב חג, מועד או ערב חג שמעניין אותנו לאירוח משפחתי</span>* gets decided —
by you, in the sheet, not by me in code.

The seeding is a **one-off script**, run once by hand, that uses `@hebcal/core` to write out every
holiday and eve for the next several years with `include = FALSE`.
**[ASSUMPTION: ten years, Israel schedule.]** After that it is a plain tab you edit like any other
— add a row, delete a row, rename one. Adding Friday nights, birthdays or anything else is just
adding rows; nothing in the app needs to change.

`@hebcal/core` is therefore a **build-time tool, not a runtime dependency**. The deployed app has
no calendar library in it.

### `Households` — the dropdown
| household_id | name | phone | active |
|---|---|---|---|
| `hh_parents` | <span dir="rtl">אבא ואמא</span> | +972501234567 | TRUE |
| `hh_tamir` | <span dir="rtl">תמיר ורעיה</span> | +972521234567 | TRUE |

Every row with `active = TRUE` is an option in the app. **Only you add rows here.** That is what
makes duplicates impossible — the app has no way to create a family.

### `People` — phone number → family
| phone | name | household_id |
|---|---|---|
| +972501234567 | <span dir="rtl">אבא</span> | `hh_parents` |
| +972501119999 | <span dir="rtl">אמא</span> | `hh_parents` |

Both parents' numbers point at the same `household_id` — that is how one family holds several
people. The app appends a row here when somebody registers (§3), and never touches it otherwise.

### `Answers` — the log, one tab forever
| timestamp | hebrew_year | holiday_key | holiday_name | by_phone | household_id | household_name | kind | host_household_id | host_household_name |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-01T19:04Z | 5787 | `rosh_hashana_eve_5787` | <span dir="rtl">ערב ראש השנה</span> | +972521234567 | `hh_tamir` | <span dir="rtl">תמיר ורעיה</span> | `guest` | `hh_parents` | <span dir="rtl">אבא ואמא</span> |
| 2026-09-01T20:12Z | 5787 | `rosh_hashana_eve_5787` | <span dir="rtl">ערב ראש השנה</span> | +972501234567 | `hh_parents` | <span dir="rtl">אבא ואמא</span> | `hosting` | | |

**One tab, all years, never split.** `hebrew_year` is a column so you can sort or filter by year
without the data living in separate places.

**Append-only.** Changing an answer writes a new row; the **newest row for a given holiday +
household wins**. Nothing is overwritten, so a mis-tap can't destroy history and the sheet doubles
as a record of who said what, when.

Names sit next to ids deliberately — the sheet reads correctly on its own, no lookup formulas.

### `Conflicts` — written by the app
| holiday_name | household | said | host | but_host_said | detected_at |
|---|---|---|---|---|---|
| <span dir="rtl">ערב ראש השנה</span> | <span dir="rtl">תמיר ורעיה</span> | <span dir="rtl">מתארחים</span> | <span dir="rtl">אבא ואמא</span> | <span dir="rtl">מתארחים אצל אח ואשתו</span> | 2026-09-02T08:31Z |

You said you're going to a family that says it isn't hosting. The app shows the person one quiet
line — *<span dir="rtl">"שימו לב — הם ענו שהם מתארחים"</span>* — with no notification and no
action demanded, **and records it here so you can see it in the sheet**.

This tab is **derived, not a log**: the app clears and rewrites it after every answer, so it always
reflects the current state. It is the one tab you should never edit by hand — anything typed there
disappears on the next answer.

**Detection rule:** for each holiday, an answer of `guest` at household *H* is a conflict when
*H*'s own newest answer for that holiday is **not** `hosting`. A host who simply hasn't answered
yet is not a conflict — that's just an unanswered question.

---

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
