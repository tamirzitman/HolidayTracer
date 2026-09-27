# HolidayTracer

A Hebrew, right-to-left app for one question: who is hosting which holiday meal,
and who is going where. Next.js App Router, React, Tailwind. Google Sheets is
the entire datastore — there is no database.

## The version number

`package.json` holds it, and it is the only place to edit it. `next.config.ts`
inlines it at build time and the footer shows it to every person using the app,
so it is a claim being made on screen: *this is the version you are looking at.*

**Bump it in the same commit as any change under `src/`.** Which part:

| | when |
|---|---|
| **major** | the app works differently enough that somebody would have to relearn it |
| **minor** | something new they can do |
| **patch** | the same app, fixed or tidied |

`npm run version-check` says whether the version still covers what is in `src/`.
It compares against the commit that last changed the version, so it catches the
change that shipped without one.

## Before pushing

```
npm run version-check   # the number still describes the code
npm run typecheck
npm run perf-circle     # joining a circle still costs the same at any size
npm run check-leaving   # leaving a circle still undoes what joining it did
npm run check-merging   # merging two households still carries all of both
npm run build           # then restart the test server before the suite
npm run test:smoke      # ~250 browser checks, ~14 min, needs the build above
```

The smoke suite runs against a production build on port 3111 with local fixture
data (`npm run fixtures`), never against a real sheet. Rebuilding while that
server is running swaps chunks underneath it — kill it, build, start it again.

## Where a change goes, and when

Two deployments, two branches:

| branch | deployment | sheet |
|---|---|---|
| `playground` | holidaytracer-test — red סביבת ניסיון strip | a scratch sheet |
| `claude/holiday-vacancy-tracker-plan-axvtmx` | production — the families | the real one |

The order, every time:

1. **Bring production in first.** Other sessions push to the production branch
   too, so merge it into your branch before anything else — otherwise the
   playground runs your change *without* fixes the families already have, and
   the version on screen goes backwards.
2. **Straight to the playground**, as soon as it builds and typechecks — before
   the long smoke suite. It is there to be tried by hand right away:
   `git push origin HEAD:playground`
3. **Then the full list under "Before pushing"**, smoke suite included.
4. **Only when all of it passes, to production:**
   `git push origin HEAD:claude/holiday-vacancy-tracker-plan-axvtmx`

Both pushes should be fast-forwards once step 1 is done. If either is not, stop
and ask — never force-push over what somebody is trying or what the families use.

## One look, one language

People use this on a phone, in the middle of a holiday, without being taught.
There is no hover to find out what is pressable, so the shape has to say it —
and the same thing has to look and read the same on every screen.

- **Pressable is a pill with a border or a fill**, in brand (or danger, or
  WhatsApp) colour. Use the constants in `src/components/ui.tsx` —
  `primaryButton`, `secondaryButton`, `hostButton`, `quietButton`,
  `mutedButton`, `miniButton`, `chipButton`, `dangerButton`, `optionChip` —
  never a class string written out again in a component. A new kind of button
  gets a constant there first.
- **Information is never a pill and never has a border.** A status on a row is
  a `Tag` (square-ish corners, a soft wash); a date is `DatePill`; anything else
  is text, with a mark in front of it if it needs one.
- **Back, and closing something that opened in place, is `BackButton`** — the
  arrow — never a word. Something that opens in place carries a `ChevronIcon`.
- **The same words for the same act.** Past holidays are spoken of in the past
  tense (אירחו, היו אצל, לא הגיעו); upcoming ones in the present. Answering for
  another family is always "…בשבילם". Before naming a new button, look for the
  word the app already uses for that act and use it.

When a change adds something to a screen, check it against this list; when it
finds something that already breaks it, fix it in the same change or say so.

## Things that bite

- **The sheet is append-only.** Every tab only grows; the newest row for a key
  wins. Nothing is ever edited or deleted in place, which is what makes a bad
  write survivable.
- **Columns are read and written by header name, never by position.** The real
  sheet grew a column nobody expected once, and everything written by position
  landed one column over from then on.
- **A household id is never reused.** Deleting switches a row to `active=FALSE`
  and keeps it, because connections, answers and circle rows still name that id.
  `npm run check-sheet` looks for ids named by rows that have no household.
- **Circles are the only way families find each other.** Being in one puts you
  on everybody else's list; there is no other mechanism.
- **Write rows in one call, never in a loop.** Every screen's cost is round
  trips to Google and nothing else, and a write also empties the memo — so a
  loop that writes a row per family re-reads the whole spreadsheet between each
  one. `appendRows` takes them all at once. Putting a family into a circle of 24
  was 122 round trips this way; it is 4. `npm run perf-circle` fails if that
  starts scaling again.
- **Two rows for one family are merged, never deleted.** `mergeHouseholds`
  carries the people, circles, connections, answers, links and own dates across
  and then switches the old row off. An answer moves only if it is still that
  household's *latest* word, because a row appended now lands at the end of the
  tab and wins — re-pointing an older one would quietly change what a family
  said. Where both rows answered the same holiday, the later one stands.
- **There are real families using this.** Nothing here is a scratch project:
  changes go out to people mid-holiday, and the sheet holds their phone numbers
  and where they are eating.
