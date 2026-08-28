# Open questions

Not decided, and not guessed. Short list — the app is small now.

---

### Q1. Which holidays does the app ask about? 🔴 *blocks phase 1*
The Hebrew calendar has many days; the family gathers on a few. My starting guess, to be corrected:

<div dir="rtl">

ראש השנה · ערב יום כיפור · סוכות · שמחת תורה · ליל הסדר · שביעי של פסח · שבועות

</div>

Unclear: חנוכה, פורים, יום העצמאות, ל״ג בעומר.

---

### Q2. Friday-night Shabbat too, or holidays only? 🔴 *blocks phase 1*
The question — *"where are you this time"* — fits Shabbat perfectly, and it's the same question 52
times a year instead of 7. The app is now simple enough that this is a genuinely small addition,
but it changes the main screen from "the next holiday" to "this coming Shabbat, and the next
holiday". Cheap now, annoying to retrofit.

---

### Q3. Who names a household, and what's it called?
When Dad signs up first, his household needs a name for others to recognise in the "who's coming"
list. Options: he types one at sign-up (<span dir="rtl">"הורים"</span>), or it defaults to his own
name and can be edited later. **Currently assumed: defaults to the first member's name, editable.**

---

### Q4. Two people in one household give different answers.
Mom says *"we're hosting"*, Dad says *"we're at Tamir's"*. The plan says **last answer wins**, and
shows who answered it. Is that right, or should the app warn the second person that their household
already answered?

---

### Q5. Should the app flag a contradiction?
You say you're at your parents'; your parents say they're at your brother's. The app knows both
facts and could show you one line: <span dir="rtl">"שים לב — הם ענו שהם מתארחים"</span>. It's the
one thing that stops the app from being quietly wrong — but it is also a feature beyond the single
question. **In or out?**

---

### Q6. One holiday at a time, or a list?
Does the main screen show only the next holiday, or the next few so people can answer early?
**Currently assumed: the next one only.**

---

### Q7. Can an answer be changed after the holiday has passed?
For fixing history. **Currently assumed: yes, freely — it's a family app, not an audit log.**

---

### Q8. Non-Israeli phone numbers?
Normalization assumes Israeli numbers (a leading `0` becomes `+972`). Is anyone in the family
abroad, or is Israel-only safe to hard-code?
