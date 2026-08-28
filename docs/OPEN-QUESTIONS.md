# Open questions

Not decided, and not guessed.

---

### Q1. Which holidays does the app ask about? 🔴 *blocks phase 1*
Dates are computed automatically, but **which** holidays get asked is still a list I need. My
starting guess, to be corrected:

<div dir="rtl">

ראש השנה · ערב יום כיפור · סוכות · שמחת תורה · ליל הסדר · שביעי של פסח · שבועות

</div>

Unclear: חנוכה, פורים, יום העצמאות, ל״ג בעומר.

---

### Q2. Friday-night Shabbat too, or holidays only? 🔴 *blocks phase 1*
*"Where are you this time"* fits Shabbat exactly, and it's the same question 52 times a year
instead of 7. Cheap to include now; it changes the main screen from *the next holiday* to
*this coming Shabbat, and the next holiday*.

---

### Q3. Should the app flag a contradiction? *(asked before, still open)*
You answer that you're at your parents'; your parents answer that they're at your brother's. The
log holds both, so the app could show you one line:
<span dir="rtl">"שים לב — הם ענו שהם מתארחים"</span>.

It's the one thing that stops the app from being quietly wrong — but it is a feature beyond the
single question. **In or out?**

---

### Q4. Adding a person is now manual. Is that acceptable?
Google sign-in plus manual management means a new family member **cannot let themselves in**: they
sign in, aren't found in `People`, and see "ask to be added". Somebody — you — must paste their
Gmail address into the sheet first.

That is the direct consequence of "all management is manual", and it's fine if you expect to set
the family up once. Worth confirming you're happy being the gatekeeper.

---

### Q5. Do people know their own Gmail address?
The whole identity model rests on every adult having a Google account and signing in with it.
Fine for most, occasionally a real obstacle for a parent who only ever uses WhatsApp. If that's a
risk, the fallback is picking your own name from a second dropdown, with no sign-in at all.

---

### Q6. How many households will be in the dropdown?
Under ~15 it's a plain list. Beyond that it wants grouping or a search field. Doesn't change
anything structural — just the shape of one control.

---

### Q7. Should the history screen show everyone, or only you?
The log holds every household's answers, and the sheet is yours to read anyway. Should the app's
history screen show **only your own** past holidays, or the whole family's?
**Currently assumed: only your own.**

---

### Q8. One sheet forever, or one per year?
A single `Answers` tab that grows indefinitely is simplest and never breaks. A tab per Hebrew year
is tidier to read by hand. **Currently assumed: one tab, forever.**
