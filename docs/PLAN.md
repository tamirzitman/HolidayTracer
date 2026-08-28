# HolidayTracer — Plan

> Status: **plan / not yet implemented**. Reflects decisions confirmed with Tamir on 2026-08-28.
> Open items are in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md). Nothing here is invented; unavoidable
> assumptions are marked **[ASSUMPTION]**.
>
> This replaces an earlier, much larger plan (circles, RSVPs per person, hosting rotation,
> attendance statuses). That version was deliberately scrapped as over-built — it is still in git
> history if any of it is ever wanted back.

---

## 1. The whole app, in one screen

The app asks **one question** per holiday:

> ### <span dir="rtl">איפה אתם בחג?</span>

And accepts exactly **two answers**:

| Answer | What the user does |
|---|---|
| <span dir="rtl">**אני מארח**</span> | One tap. Nothing else is asked. |
| <span dir="rtl">**מתארח אצל…**</span> | Types a phone number. |

That's it. No RSVP lists, no menus, no attendance states, no rotation logic, no "maybe".

**Phone numbers are the identity of a household.** You don't pick a person from a directory — you
type the number you'd call. A household can own several numbers: Dad's number and Mom's number
both resolve to the same household, so it doesn't matter which one you type.

### Confirmed decisions

| | |
|---|---|
| The question | One per holiday: hosting, or a guest at a phone number |
| Identity | Phone number → household. One household can hold several numbers |
| Sign-up | Phone + name. **No SMS code** — zero friction, zero cost |
| Unknown numbers | Registered on first login. A number typed before that is held until it is |
| Visibility | **Only what touches you** — who is coming to you, and where you are going |
| History | Yes — one extra screen, "where were we last Sukkot" |
| Holidays | Jewish holidays, Israel schedule |
| Interface | Hebrew, right-to-left, mobile web |

---

## 2. Data model

Four tables. That is the entire application.

```
households (id, name, created_at)
people     (id, household_id, phone UNIQUE, name, created_at)
holidays   (id, key, name_he, date, hebrew_year)
answers    (id, holiday_id, household_id, kind, host_household_id?, host_phone_raw?,
            answered_by_person_id, updated_at)
```

- `answers.kind` is `hosting` or `guest` — the only two values in the app.
- **One answer per household per holiday** (unique on `holiday_id, household_id`). Whoever in the
  household answers last, sets it; `answered_by_person_id` records who, so it's never a mystery.
- `host_household_id` is filled when the typed number is known. `host_phone_raw` holds the number
  as typed when it isn't yet (§3.2).
- `holidays` rows are generated from `@hebcal/core` (Israel schedule), never typed by hand.

**Phone normalization** is the one piece of fiddly code: `054-123-4567`, `0541234567` and
`+972541234567` are the same number and must store identically. Normalize to E.164 on write and on
lookup. **[ASSUMPTION: Israeli numbers by default; a leading `0` is replaced with `+972`.]**

---

## 3. The three flows

### 3.1 Signing up
Two fields: **phone** and **name**. If the phone isn't known, it's registered on the spot, and a
household is created for it. Nothing is sent to anyone; no code, no password, no email.

Joining an existing household works **both ways** (confirmed):

- **She claims it** — at sign-up: *"מישהו ממשק הבית שלי כבר רשום"* + their number → she is attached
  to that household.
- **He adds her** — Dad opens his household and adds Mom's number in advance. When she signs up
  with it, she lands in his household automatically.

### 3.2 A number nobody has registered
You answer *"מתארח אצל 050-1234567"* and that number has never opened the app. The answer is
**recorded as typed** and held as a pending destination. Nothing is texted to that number.

When someone eventually signs up with it, their household is created and every pending answer
pointing at that number is linked to it. The history connects itself retroactively — the family
can start using the app before everyone has joined.

### 3.3 What you see
Visibility is **only what touches you**:

- **If you're hosting** — the households that said they're coming to you, as they answer. Name and
  phone number, nothing more. This list *is* the reward for answering.
- **If you're a guest** — the household you named, so you can see you got the right one.
- **Never** — where your cousin is going, or who is at anyone else's table.

---

## 4. Screens

Three, plus sign-up.

1. **<span dir="rtl">החג</span>** — the holiday name and date, the question, two buttons. Once
   answered: your answer, changeable, and (if hosting) the list of who's coming.
2. **<span dir="rtl">היסטוריה</span>** — one line per past holiday: *"סוכות תשפ״ו — היינו אצל אבא
   ואמא"* / *"פסח תשפ״ו — אירחנו"*.
3. **<span dir="rtl">משק הבית</span>** — your name and number, your household's name, the other
   numbers in it, and a field to add one.

---

## 5. Stack

Smaller than the previous plan, because the app is smaller.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server actions do all data access; the phone gets almost no JavaScript |
| Interface | **Tailwind**, logical properties, `dir="rtl"` | RTL native, not mirrored |
| Database | **Postgres** (Neon or Supabase free tier) + **Drizzle** | Four tables; either host is fine, this uses it purely as a database |
| Session | Signed cookie (`jose`), no Supabase Auth | Auth here is "this phone is registered" — an auth provider would be more machinery than the whole app |
| Calendar | **`@hebcal/core`** | Israel-schedule holidays for any year, offline, no API key |
| Hosting | **Vercel** free tier, installable to the home screen | Nothing to operate |

**Known trade-off, accepted:** with no SMS verification, anyone who knows a family member's number
can sign in as them. This is a closed family app and the cost of a code (money per message, and a
step your parents have to get past) was judged higher than the risk. Worth revisiting only if the
app ever leaves the family.

---

## 6. Order of build

| Phase | Scope |
|---|---|
| **1** | Schema, holiday generation, sign-up (phone + name, both join paths), the one question, "who's coming to you" |
| **2** | History screen; linking pending numbers when someone signs up |
| **3** | Hebrew polish, home-screen install, a "share my answer to WhatsApp" button |

Phase 1 is the whole product. Phases 2 and 3 are small.

---

## 7. Not building
- Attendance lists, per-person RSVPs, maybe/undecided states.
- Hosting rotation, fairness suggestions, statistics.
- Family circles and multi-group privacy.
- Menus, photos, dietary notes, addresses, times.
- Invitations or notifications sent to phone numbers.
