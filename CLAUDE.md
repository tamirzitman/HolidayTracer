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
npm run build           # then restart the test server before the suite
npm run test:smoke      # ~230 browser checks, ~14 min, needs the build above
```

The smoke suite runs against a production build on port 3111 with local fixture
data (`npm run fixtures`), never against a real sheet. Rebuilding while that
server is running swaps chunks underneath it — kill it, build, start it again.

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
