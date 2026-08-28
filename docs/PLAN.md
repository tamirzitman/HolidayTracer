# HolidayTracer — Product & Technical Plan

> Status: **plan / not yet implemented**. Everything here reflects decisions confirmed with Tamir
> on 2026-08-28. Anything not confirmed lives in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) — nothing
> in this document is invented; where an assumption was unavoidable it is marked **[ASSUMPTION]**.

---

## 1. What this is

A small, mobile-friendly web app for an extended Jewish-Israeli family to answer three questions:

1. **Who is hosting the holiday meal this time?**
2. **Who is actually coming — and who is at a different family this year?**
3. **What happened last time?** (who hosted Sukkot last year, where we ate, whose turn it is now)

It is *not* an accommodation/sleepover tracker. The unit of interest is **the holiday meal**.

### Confirmed decisions

| Question | Decision |
|---|---|
| Core concept | Holiday **meals**: who hosted, who attended, who went to another family |
| Holidays | **Jewish holidays**, **Israel** schedule (one day of yom tov, one seder) |
| Family model | **Households** are the unit; households are grouped into family circles |
| Platform | **Web app, mobile-friendly** (installable PWA), Hebrew UI, **RTL** |
| Meal granularity | **One main meal auto-created per holiday**; extra meal slots added only when needed |
| Direction | **Both** — plan the upcoming holiday, and the same record becomes the history |
| Accounts | **Everyone logs in and RSVPs themselves** (with a delegate mechanism, §4.3) |
| Fairness | **Suggest the next host** based on history — always a suggestion, never enforced |
| Extra per-meal data | **None.** Keep it simple: host, place, time, who came. No menus, photos, dietary notes |

---

## 2. The family model (the heart of the design)

The clarification that shapes everything: this is **not** "my family vs. my sister's husband's
family". It is *one household at a time*, joined into circles, extending outward as far as the
family actually reaches — parents, parents' siblings, your brother, your brother's wife's family,
and so on.

```
Member ──belongs to──> Household ──belongs to (many)──> Circle
                            │
                            └──hosts──> Gathering (a holiday meal in a Circle)
```

### 2.1 Household (משק בית)
The atom. "תמיר ורעיה", "אבא ואמא", "אחי ואשתו". Has a name, an optional city/address, a
`can_host` flag, and members. A household — not a person — is what gets counted for hosting
rotation, and what shows up as a row in the attendance list.

### 2.2 Member (בן משפחה)
A person inside a household. Adults typically have a login; children usually don't and are just
counted. A member's `is_adult` flag decides whether they can RSVP and act for the household.

### 2.3 Circle (מעגל משפחתי)
A set of households that celebrate holidays *together*. **A household can belong to several
circles** — this is the whole extension mechanism, and it is what makes the app dynamic without
any special cases:

- **Circle A — "המשפחה של תמיר"**: parents' household, yours, your brother's, your sister's.
- **Circle B — "משפחת בעלה של אחותי"**: her in-laws + your sister's household.
- **Circle C — "האחים והאחיות של אבא"**: parents' household + uncles/aunts households.

Your sister's household sits in A and B. Your parents' household sits in A and C. Nobody had to
model "in-laws" as a special concept — it is just another circle.

**Visibility rule:** you see a circle's gatherings only if your household is in that circle.
Across circles you see *one* derived fact and nothing more: **"taken"** — if your sister's
household is confirmed for a Circle B seder, Circle A shows her as *"אצל משפחה אחרת"* without
exposing where, who is hosting there, or anything else about Circle B.

That single cross-circle signal is what the request called *"dependencies between families"*.

### 2.4 Roles
- **Circle admin** — creates gatherings, adds/removes households, invites people. The person who
  creates a circle is its first admin. See open question Q4 on how strict this should be.
- **Household adult** — RSVPs for themselves, may RSVP on behalf of their household, may
  volunteer their household to host.

---

## 3. Holidays and meals

### 3.1 Holiday generation
Hebrew-calendar holidays are **computed, never hand-entered**, using the `@hebcal/core` npm
package (pure JS, offline, no API key), configured with the **Israel** schedule. For each Hebrew
year the app generates the relevant holidays with their Gregorian dates and Hebrew dates.

### 3.2 Gathering (סעודה) — the central record
When a circle is active for a holiday, the app auto-creates **one main meal** — for most holidays
the evening meal (`erev`). Extra slots (`day_1_lunch`, `second_seder`, a free-text slot) are added
manually **only** when the family actually splits a holiday across two hosts.

A gathering holds:

| Field | Notes |
|---|---|
| circle | which circle this meal belongs to |
| holiday + slot | e.g. "פסח 5787" + "ליל הסדר" |
| date, start time | date defaults from the Hebrew calendar; time is optional |
| host household | **nullable** — "עדיין לא נקבע" is a first-class, visible state |
| location | defaults to the host household's home; overridable free text (e.g. a hotel or a rented place) |
| status | `proposed` → `confirmed` → `past` (auto once the date passes) / `cancelled` |

**No host is a feature, not a gap.** The most useful screen in this app is "פסח בעוד 3 שבועות —
עדיין לא נקבע מי מארח, 4 מתוך 7 בתים ענו".

### 3.3 RSVP / attendance
One row per **member** per gathering, aggregated to a household summary. Statuses:

- `attending` — בא
- `not_attending` — לא בא
- `elsewhere` — אצל משפחה אחרת *(the cross-circle case; may be set automatically, §2.3)*
- `maybe` — אולי
- `no_answer` — default, and what the "who hasn't answered" nudge is built on

### 3.4 History
A past gathering *is* the history record — nothing separate to fill in. That gives, for free:
"מי אירח את סוכות בשנה שעברה", "כמה פעמים אירחנו ב-3 השנים האחרונות", "איפה היינו בראש השנה 5786".

Past holidays can also be **backfilled** — creating a gathering with a past date and filling in
the host is explicitly supported, so the family can seed a few years of history on day one.

---

## 4. Key behaviours

### 4.1 Next-host suggestion (fairness)
Per circle, per holiday, the app ranks candidate households and suggests one:

1. Only households that `can_host` and are not `not_attending`/`elsewhere` are candidates.
2. Rank by **longest time since last hosting this specific holiday** (so Passover rotates
   independently of Sukkot).
3. Tie-break by **fewest total hosts** in the circle over the last N years **[ASSUMPTION: N = 3]**.
4. Show the reasoning in one line: *"הצעה: אצל ההורים — אירחו לאחרונה פסח בשנת 5784"*.

It is a suggestion with a "בחר בית אחר" button next to it. Never automatic, never binding.

### 4.2 The upcoming-holiday screen
The home screen is one card for the next holiday: name, Hebrew + Gregorian date, days remaining,
host (or "טרם נקבע" with the suggestion), your own RSVP as two big buttons, and a compact
who's-in/who's-out/who-hasn't-answered summary.

### 4.3 Making it usable by parents and less-technical members
Everyone gets a login, but the app must not stall on the person who never opens it:

- **Delegate RSVP** — any adult in a household may answer for another member of that household,
  and the record shows *"נענה על ידי תמיר"* so nothing is silently faked.
- **Circle admin fallback** — an admin can set any household's status, same visible attribution.
- Login should be the lowest-friction option available (see open question Q3).

---

## 5. Technical plan

### 5.1 Stack (recommendation)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One deployable for UI + API; server components keep the client small on phones |
| UI | **Tailwind CSS + shadcn/ui** | RTL via `dir="rtl"` and logical properties (`ms-`/`me-`), not mirrored hacks |
| Hebrew calendar | **`@hebcal/core`** | Computes Israel-schedule holidays offline for any year; no API dependency |
| DB + Auth | **Supabase (Postgres + Auth + RLS)** | Free tier fits a family app; **Row-Level Security enforces the circle-visibility rule in the database**, not just in the UI |
| Hosting | **Vercel** free tier | Zero-ops, preview deploys |
| i18n | `next-intl`, single `he` locale to start | All strings in one file, so English can be added later without a rewrite |
| Delivery | **PWA** (installable, add-to-home-screen) | Meets "web app, mobile-friendly" and leaves the door open to push notifications later |

Alternative if you'd rather not depend on Supabase: Neon Postgres + Drizzle ORM + Auth.js, with
the same schema and visibility rules enforced in an application-level policy layer instead of RLS.

### 5.2 Schema sketch

```
users        (id, email/phone, display_name, created_at)
members      (id, household_id, user_id?, name, is_adult)
households   (id, name, city?, address?, can_host, created_at)
circles      (id, name, created_by, created_at)
circle_households (circle_id, household_id, role: admin|member)   -- many-to-many = the extension mechanism
holidays     (id, hebrew_year, key, name_he, start_date, hebrew_date, israel_schedule)
gatherings   (id, circle_id, holiday_id, slot, date, start_time?, host_household_id?, location_override?, status)
attendance   (gathering_id, member_id, status, answered_by_user_id, answered_at, note?)
```

Derived, not stored: hosting counts, "last hosted", the next-host suggestion, and the
cross-circle "taken" flag — all computed from `gatherings` + `attendance` so history can be
corrected without recomputing caches.

### 5.3 Screens (Hebrew, RTL, mobile-first)
1. **בית** — next holiday card + quick RSVP.
2. **סעודה** — gathering detail: host, place, time, per-household attendance, "מי עוד לא ענה", set/volunteer host.
3. **היסטוריה** — timeline of past holidays, per-household hosting stats.
4. **המשפחה** — households, members, circles, invite link.
5. **הגדרות** — profile, notifications, circle admin tools.

---

## 6. Delivery phases

| Phase | Scope | Why this order |
|---|---|---|
| **0 — Foundation** | Repo, Next.js + Tailwind RTL shell, Supabase project, schema + RLS, auth, seed one circle | Nothing is demoable, but every later phase depends on the visibility rules being right from the start |
| **1 — MVP** | Households & members, **one** circle, generated holidays, one main meal per holiday, set host, RSVP, upcoming screen | The smallest thing the internal family can actually use for the next holiday |
| **2 — Memory** | History timeline, backfill past holidays, hosting stats, **next-host suggestion**, extra meal slots | Turns it from a poll into the thing that answers "whose turn is it" |
| **3 — Extension** | Multiple circles, households in several circles, cross-circle "אצל משפחה אחרת", invite links | The parents'-siblings and brother's-wife's-family circles come online here |
| **4 — Polish** | Reminders/notifications, PWA install, calendar (.ics) export, backfill of older years | Only worth doing once the family is actually using it |

Phase 1 is deliberately single-circle: the schema is multi-circle from day one, but the UI
doesn't pay the complexity cost until phase 3.

---

## 7. Non-goals (explicitly out of scope)
- Sleepover / accommodation / spare-bed tracking — confirmed not needed.
- Menus, "who brings what", photos, dietary restrictions — confirmed: keep it simple.
- Group chat. WhatsApp already exists; this app links out to it at most.
- A public product for other families. This is built for one family (see Q8).
