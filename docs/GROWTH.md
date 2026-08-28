# Growing HolidayTracer

> Plan, not built. Decisions confirmed with Tamir on 2026-08-28. Estimates are marked as such.

Today there is **one global list**: everyone who registers sees all eleven families. That is fine
for eleven and useless for three hundred — nobody should scroll past families they have never met.

---

## 1. The change: every household has its own circle

A new tab, `Connections`, holds pairs of households that can see each other.

| household_a | household_b | created_at |
|---|---|---|
| `1` | `2` | 2026-08-28T20:00:00Z |

One row means one mutual link. The dropdown for household `1` becomes *"every household I have a
row with"*, instead of *"every household in the sheet"*.

**Tamir's own example:** his uncle's wife's family links to the uncle. The uncle sees both circles;
Tamir sees only his own. Nobody has to be in a list they don't belong in, and no one has to look
past names that mean nothing to them.

### Three ways a family reaches your list

| | |
|---|---|
| **Invite link** | How a *new* family joins at all. You send a link; opening it creates their household and the connection to you in one step. **This replaces Tamir as the bottleneck** — nobody needs a row added to the sheet by hand |
| **Add by phone** | How you connect to a family *already in the app*. You type a number you would call anyway; if it belongs to a registered household, the two link. No approval, no admin |
| **Remove** | One tap on the family list. See open question Q1 on whether that is one-sided or mutual |

**Connections are never inherited.** Your brother inviting you links the two of you and nothing
more — you do not suddenly see his in-laws. That is the whole point of circles, and it is why
there are no "families you might know" suggestions: they would leak who is connected to whom.

---

## 2. Why anyone would open it again

All four were chosen. Ranked by value for the work:

| | Value | Work | Notes |
|---|---|---|---|
| **Who has already answered in my circle** | Highest | Small | A short list: who is hosting, who hasn't said. You learn something you didn't know, every time you open it |
| **Stats — how often we hosted** | Medium | Small | Derived from the log. Note this was cut from the original plan on purpose; it is back by request |
| **Reminder before a holiday** | High | Medium | Needs a scheduled job. Vercel's free tier includes cron |
| **Push when someone marks they're coming to you** | Highest | **Large** | Needs a service worker, VAPID keys, stored subscriptions, and everyone installing the app to their home screen. iOS only allows push for installed PWAs |

**A suggestion worth deciding on:** show the circle's answers **only once you have answered**. It
turns answering into the price of finding out, which is the strongest incentive available and costs
nothing to build. It is also mildly coercive — see Q2.

---

## 3. Where Google Sheets breaks

Staying on Sheets was the call: fine, and worth knowing the order in which it will hurt.

### 3.1 Concurrent writes — fixed ✅
`rewriteConflicts` used to clear the whole `Conflicts` tab and write it again, so two families
answering at the same moment could erase each other's rows — and erev chag is exactly when everyone
answers at once.

Deleting the tab would have been the smaller fix, but seeing contradictions in the sheet was asked
for. So the tab became an **event log** instead, like `Answers` and `Connections`: a contradiction
appends `open`, settling it appends `resolved`, and the newest row for a holiday + household + host
is its state. Rows are only ever added, so nothing can be erased by someone else's write, and each
answer appends only what actually changed.

**No tab is rewritten anywhere in the app any more.** Every write is an append.

### 3.2 Reading the whole log to answer one question
Every page load fetches every tab, including all answers ever. **[ESTIMATE:** 300 households × 7
holidays × ~1.5 answers ≈ 3,000 rows a year, about 20,000 cells — nowhere near the 10-million-cell
limit, but a payload that grows forever.**]** The fix when it hurts: read only the current year.

### 3.3 API quota on the night everyone answers
Google allows **[ESTIMATE: ~300 read requests per minute per project]**. Each cold serverless
instance does one batched read, cached 20 seconds. A hundred people answering in the same ten
minutes is comfortable; a thousand is not.

### 3.4 Privacy, which is not a technical limit
Hundreds of unrelated families means hundreds of strangers' phone numbers in **one file Tamir
owns**. That is the real reason to move to a database eventually — not row counts.

### When to move
At the first quota error, or when unrelated families outnumber relatives. Not before.

---

## 4. Order of work

| Phase | Scope |
|---|---|
| **A — circles** | `Connections` tab; dropdown limited to connections; "המשפחות שלי" screen with add-by-phone and remove; invite links; migration linking today's eleven households to each other so nothing changes for them |
| **B — the reason to return** | Who has answered in my circle; hosting stats on the history screen; delete the `Conflicts` tab and compute conflicts on read |
| **C — reaching out** | Reminder before a holiday via cron; push notifications last, since they cost the most and depend on everyone installing the app |

Phase A is the whole idea. B is small and makes it worth opening. C is where the effort is.

---

## 5. Decided

- **Hiding is one-sided.** You stop seeing them; they still see you. Nobody is cut off without
  knowing. *(Assumed, not explicitly confirmed — say so if you want it mutual.)*
- **Answers are hidden until you answer.** Knowing where everyone is, is the reward for saying
  where you are.
- **Invite links are reusable.** One link can go in the family WhatsApp group and bring in several
  households.
- **The eleven existing families are all linked to each other**, so nothing changed for anyone
  already using it.
- **You can only answer for a family in your circle.** Connect first, then answer.

## 6. Built in phase A

- `Connections` and `Invites` tabs, both append-only.
- The dropdown holds only your circle.
- **המשפחות שלי** — the list, with hide, add-by-phone, and a reusable invite link.
- **Joining is by invitation only.** An unknown number with no invite is told to ask for a link;
  nobody waits on the sheet's owner.
- **איפה כולם** — where everyone in your circle is, revealed once you have answered.

### Adding a family at the moment you need one
Under the dropdown, **"לא מוצאים? הוסיפו משפחה"** — for erev chag, when the host simply isn't
listed and leaving the screen to invite them is not going to happen.

- **With a number** (picked from contacts, or typed): the household and a person row are created.
  Nothing is "pending" — when that number later signs in, they are simply already in, in the right
  family, connected to whoever added them. There is no claiming step to build.
- **With a name only:** the household works and can be answered for, but nobody from it can ever
  join. It is shown as **טרם הצטרפו** until a number is attached.
- **A number already known never creates a second household** — it connects to the existing one.
- **Nothing is inherited.** Only the person who added them is connected; anyone else adds them
  themselves, and using the same number lands on the same household.

### Contacts
Families can be picked out of the phone's address book: numbers already in the app are connected
on the spot, and the rest come back as a WhatsApp invite addressed to that person. Nothing from the
address book is stored. **Chrome on Android only** — the Contact Picker API does not exist in
Safari on iOS or on desktop, so the button is behind a feature check.

### History: counts, and correcting it
The history screen shows three counts — hosted, visited, total — plus who you ended up with most
often. Three numbers are not a chart: no axes, no colour encoding, text tokens only.

Every past holiday is listed, **including ones nobody answered**, so a gap can be filled in later.
Editing appends a newer row rather than overwriting: the same mechanism as changing today's answer,
pointed at a date that has passed, so nothing is ever lost and the counts follow the correction.

Still to come: the reminder before a holiday, push, and deleting the `Conflicts` tab in favour of
computing conflicts on read.
