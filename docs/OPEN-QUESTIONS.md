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

### Q4. Duplicate households will happen. How much do you care?
Anyone can create a household the moment they register, with no approval. Two people from the same
family registering separately produce two households —
<span dir="rtl">"אבא ואמא"</span> and <span dir="rtl">"הורים"</span> — and both sit in everyone's
dropdown until you merge them by hand in the sheet.

That's the accepted price of nobody waiting on you. The question is only whether the app should
help a little: showing the existing list prominently at registration
(<span dir="rtl">"אולי המשפחה שלכם כבר כאן?"</span>) costs nothing and prevents most of it.
**Currently assumed: yes, show the list first, and create only if they don't pick one.**

---

### Q5. What is a household called when it creates itself?
A new number registers as <span dir="rtl">"אמא"</span> and no family exists yet. The household is
named after her — but <span dir="rtl">"אמא"</span> is a name only *you* would use; in everyone
else's dropdown it should probably read <span dir="rtl">"אבא ואמא"</span> or
<span dir="rtl">"הורים"</span>.

Should the app ask for the **family name** separately at registration
(<span dir="rtl">"איך המשפחה שלכם תופיע לאחרים?"</span>), or just use the person's name and let you
fix it in the sheet? **Currently assumed: ask — it is one extra field, once, and it saves cleanup.**

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
