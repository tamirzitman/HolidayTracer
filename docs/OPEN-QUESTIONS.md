# Open questions

Things that are **not decided** and that I did not want to invent. Ordered by how much they
change the build. Q1 is the only one that could reshape the plan; the rest can be answered as we
reach the phase that needs them.

---

### Q1. Does this cover **Shabbat dinners**, or only holidays? 🔴 *blocks phase 1*
"Holiday" so far means yom tov. But Friday-night dinner is the same question every single week —
who hosts, who's at the other side of the family. If Shabbat is in scope, the app needs a
recurring weekly gathering and a very low-friction RSVP (one tap, and probably a "same as usual"
default), which is a different rhythm from 6 holidays a year. It's a small change now and a large
one later.

**Options:** holidays only · holidays + Shabbat · holidays now, Shabbat in phase 2.

---

### Q2. Which holidays exactly get a meal auto-created? 🔴 *blocks phase 1*
The Hebrew calendar gives many days; the family probably gathers for a few. My starting guess,
to be corrected:

- ראש השנה (ערב) · ערב יום כיפור (סעודה מפסקת) · סוכות (ערב) · שמחת תורה · **ליל הסדר** · שביעי של פסח · שבועות

Unclear whether these belong: חנוכה, פורים (סעודת פורים), ל"ג בעומר, יום העצמאות (מנגל), ט"ו בשבט,
family birthdays / yahrzeits.

---

### Q3. How do people sign in?
Google sign-in is easiest to build; **phone + SMS code** is what an Israeli parent will find
easiest to use, but SMS costs money per message and needs a provider. Email magic-link is free and
in the middle. Which matters more — build simplicity or your parents getting in without help?

---

### Q4. Who is allowed to create a gathering and set the host?
Only circle admins, or any adult in the circle? A family may not want a formal hierarchy at all —
but with no restriction, two people can set two different hosts for the same meal.
**Suggested default:** anyone can *propose*, an admin *confirms*. Confirm or override.

---

### Q5. How do reminders reach people?
The family lives on WhatsApp, but the WhatsApp Business API is not free and not simple for a
family app. Realistic options:
1. **A "copy summary to WhatsApp" button** — the app writes the message, a human pastes it into
   the family group. Free, works today, zero infrastructure. *My recommendation.*
2. Email reminders — free, but people don't read email.
3. Web push — free, works on installed PWAs (Android, and iOS 16.4+ once added to the home
   screen), but everyone must install the app and grant permission.

---

### Q6. Do children get accounts?
Right now the plan says adults log in, children are counted via their household. At what age does
a child become a member with a login — or do teenagers just use their parents' household entry?

---

### Q7. What is the actual scale?
Roughly how many households and people in the first circle, and how many circles do you expect
overall? It doesn't change the stack (any of these is small), but it changes whether the
attendance screen is a simple list or needs grouping and search.

---

### Q8. Is this only ever for your family?
If it stays private, we can hard-code Israel/Hebrew and skip a lot of configuration. If there's
any chance other families use it one day, a few things (locale, Israel-vs-Diaspora schedule,
sign-up flow) should be settings from the start rather than retrofitted. The plan currently
assumes **private, one family**.

---

### Q9. "Nobody hosts" — how should that look?
E.g. the whole family goes to a hotel for Passover, or a restaurant. The plan supports it via a
location override with no host household — but should a hotel year count against anyone's hosting
rotation? Currently it counts as *nobody hosted*.

---

### Q10. Editing history
Once a holiday has passed, who can correct the record — anyone, or admins only? And should there
be a visible "edited by" note?

---

### Q11. Hebrew dates in the UI
Show Hebrew dates alongside Gregorian everywhere (י״ד בניסן תשפ״ז), only on holiday titles, or not
at all? The plan currently shows both on the holiday card.
