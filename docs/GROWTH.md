# Growing HolidayTracer

> Plan, not built. Decisions confirmed with the owner on 2026-08-28. Estimates are marked as such.

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

**The case this exists for:** an uncle's wife's family links to the uncle. The uncle sees both
circles; you see only your own. Nobody has to be in a list they don't belong in, and no one has to look
past names that mean nothing to them.

### Three ways a family reaches your list

| | |
|---|---|
| **Invite link** | A shortcut, not a gate — see below. You send a link; opening it creates their household and the connection to you in one step. **This removes the one person who kept the sheet as a bottleneck** — nobody needs a row added to the sheet by hand |
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
Hundreds of unrelated families means hundreds of strangers' phone numbers in **one file the owner
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

- **There is no hiding.** It was built one-sided, then dropped as unnecessary machinery. A family
  you connect to stays in your list.
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
- **המשפחות שלי** — the list, and a reusable invite link.
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
  join. It is shown as **עוד לא נרשמו לאפליקציה** until a number is attached.
- **A number already known never creates a second household** — it connects to the existing one.
- **Nothing is inherited automatically.** Adding a family connects only you. Other people reach
  them by ticking them at the join screen or taking up the suggestion below — both are somebody's
  decision, never a side effect of yours.

### Signing up needs nobody's permission

Registration was invite-only, and being turned away by an app you were trying to use is the wrong
first impression — the more so when the person turning you away is your own family and the fix is a
link somebody has to remember to send. So an invite is now a shortcut rather than a gate: it
introduces two families in one step, offers the inviter's family to claim, and offers their circle
to start from. Without one you register the same way and arrive with nobody on your list.

An empty list is honest but useless, so the way out of it is the point: **each family you add brings
the families it knows along as suggestions.** Adding one — by picking a contact, or by typing a
number, since the contact picker only exists in Chrome on Android — is enough to bootstrap the rest
through the מוצע להוספה list. A typed number the app already knows joins that family rather than
making a copy of it.

The question screen says so directly: with nobody on the list, "מתארחים אצל…" would open an empty
dropdown, so it reads **הוספת המשפחות שלנו** instead.

### Circles overlap, but the join screen is not where you sort that out

Circles are not independent lists: a brother's is most of yours, a parent's can be all of it, an
uncle's about half. So arriving connected only to the family that invited you means arriving with
almost nothing — and the first attempt at fixing that put the inviter's whole circle on the join
screen as a ticked checklist.

**That was the wrong screen.** It asked the least-informed person, at the least-informed moment, to
judge families they had not seen, on a page reached by tapping a link in WhatsApp. Counting the
rest of the form, joining meant six decisions before seeing anything.

The job belongs to the suggestions below, which do it better: in context, after they are in, each
family named on its own row with the evidence for it. A newcomer's circle is just the inviter, so
the "two families must vouch" floor drops to one and the inviter's entire circle is waiting there,
one tap each — or **הוספת כולן** for the parent-invites-child case where all of it applies.

Joining now asks three things: your name in two halves, and what your family is called. Claiming a
family somebody already added is one line away, for the rarer case that needs it.

### A link cannot quietly put somebody on your list

Invite links travel. They get pasted into family WhatsApp groups and forwarded
on, and the person who opens one is not always the person it was meant for — a
friend taps it out of curiosity and would have landed inside somebody's circle
without ever choosing to. Three things keep that from happening:

- **It asks.** Opening a link never connects anything by itself. A newcomer gets
  two answers of equal weight — join them, or just register — and somebody
  already in the app gets the same question before anything is written.
- **It expires.** Fourteen days: longer than an invitation stays interesting,
  short enough that last year's link in a group is dead.
- **A dead link is a way in, not a wall.** An expired or unknown token falls back
  to the ordinary sign-up, with a line saying why nobody is being introduced.
  Telling somebody who wanted the app that their link is invalid helps nobody.

### Sharing the app without sharing your circle

The invite link is a connection: opening it puts two families on each other's lists. That is wrong
for the friend who merely likes the idea, so the household menu carries a second, plainer thing —
the address and a sentence, no token, introducing nobody to anybody.

### Families your families know, and you don't

The checklist covers the first minute; it does not cover the drift afterwards, when your uncle adds
two families and nothing tells you. The families screen carries a quiet **מוצע להוספה** list:
households that sit in the circles of families you are connected to but not in yours, ordered by
how many of your families know each one. That count *is* the overlap, measured rather than asked
for, and it is read straight off `Connections` — nobody does anything to keep it current.

**Two families have to vouch.** One family's acquaintance is theirs, not yours, and offering it
turns the list into noise. The exception is a circle too small to reach two: somebody who has just
added their first family would otherwise get nothing back, and that first suggestion is what starts
them off. A suggestion turned down is turned down for good — the families you have decided against
are exactly the ones your families will keep vouching for.

### Contacts
Families can be picked out of the phone's address book: numbers already in the app are connected
on the spot, and the rest come back as a WhatsApp invite addressed to that person. Nothing from the
address book is stored. **Chrome on Android only** — the Contact Picker API does not exist in
Safari on iOS or on desktop, so the button is behind a feature check.

### History: counts, and correcting it
The history screen shows three counts — hosted, visited, total. Three numbers are not a chart: no
axes, no colour encoding, text tokens only.

Every past holiday is listed, **including ones nobody answered**, so a gap can be filled in later.
Editing appends a newer row rather than overwriting: the same mechanism as changing today's answer,
pointed at a date that has passed, so nothing is ever lost and the counts follow the correction.

Still to come: the reminder before a holiday, push, and deleting the `Conflicts` tab in favour of
computing conflicts on read.
