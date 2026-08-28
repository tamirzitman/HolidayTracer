# Open questions

Short list now — most of what was here got answered by moving decisions into the spreadsheet.

---

### Q1. How many years should the seed script write?
The one-off script fills the `Holidays` tab with every candidate date, `include = FALSE`, for you
to mark up. **Currently assumed: ten years.** More is harmless — it's a tab you can sort and
filter. When it runs out, the app says so instead of guessing, and you re-run the script.

Related: should the seed include **every Friday night** as rows, so Shabbat is available to switch
on later without re-seeding? It's ~520 rows over ten years — nothing for a spreadsheet, but it
makes the tab longer to scan. **Currently assumed: no, holidays and eves only.**

---

### Q2. How many families in the dropdown?
Under about fifteen it's a plain list. Beyond that it wants grouping or a search field. Nothing
structural — just the shape of one control.

---

### Q3. History: yours only, or everyone's?
The log holds every family's answers. Should the history screen show **only your own** past
holidays, or the whole family's? **Currently assumed: only your own.**

---

### Q4. Who does a blocked newcomer ask?
When someone signs in and their family isn't in `Households`, they see
<span dir="rtl">"המשפחה שלכם עדיין לא ברשימה — בקשו להוסיף אתכם"</span>. Should that message name
a person, or show a phone number to contact? **Currently assumed: generic wording, no name.**

---

## Answered — kept here so the reasoning isn't lost

- **Which holidays count?** → Not a code decision. Every candidate date is seeded into the
  `Holidays` tab and you flip `include` on the ones that matter for a family meal.
- **Shabbat too?** → Same answer: add rows if you want them. Nothing in the app changes.
- **Duplicate families?** → Impossible now. The app cannot create a household; only you add rows.
- **One tab per year, or one forever?** → One `Answers` tab forever, with a `hebrew_year` column
  to sort and filter by.
- **Flag contradictions?** → Yes, both ways: a quiet line in the app, and a `Conflicts` tab in the
  sheet that the app rewrites after each answer.
