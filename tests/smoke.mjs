/**
 * End-to-end smoke test, against a real browser.
 *
 *   npm run seed:holidays        # once, if .dev-sheet.json has no Holidays
 *   npm run build && SESSION_SECRET=test npm start -- --port 3111
 *   npm run test:smoke
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Start from known fixtures: a half-finished earlier run would otherwise leave
// answers behind and the first assertion would fail for the wrong reason.
execFileSync(process.execPath, ['scripts/dev-fixtures.mjs'], { stdio: 'ignore' });

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3111';
const SHEET = '.dev-sheet.json';
const DAD = '050-123-4567';
const NEWCOMER = `05${String(Date.now()).slice(-8)}`;

const sheet = () => JSON.parse(readFileSync(SHEET, 'utf8'));
const rows = (tab) => (sheet()[tab] ?? []).slice(1);

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const open = async () => (await browser.newContext({ viewport: { width: 390, height: 820 } })).newPage();

// ── an unknown number cannot let itself in ───────────────────────────────────
// ── signing up needs nobody's permission ─────────────────────────────────────
const stranger = await open();
await stranger.goto(BASE);
await stranger.fill('input[name=phone]', '058-777-1234');
await stranger.click('button[type=submit]');
await stranger.waitForSelector('input[name=firstNames]');
check('an unknown number is asked who it is, not turned away',
  await stranger.isVisible('input[name=firstNames]'));
check('and is offered a way back if it was a typo',
  await stranger.isVisible('text=זה לא המספר שלי'));

await stranger.fill('input[name=name]', 'רן');
await stranger.fill('input[name=firstNames]', 'רן ומיכל');
await stranger.fill('input[name=surname]', 'ברק');
await stranger.click('form button[type=submit]');
await stranger.waitForSelector('text=איפה אתם בחג?');
check('registering with no invite works', rows('Households').some((r) => r[1] === 'רן ומיכל ברק'));

// Nobody on the list yet: the guest button would open an empty dropdown.
const cold = await stranger.$$eval('main button', (els) => els.map((e) => e.textContent.trim()));
check(`an empty circle points at filling it (${cold.join(', ')})`,
  cold.includes('הוספת המשפחות שלנו'));

await stranger.click('text=הוספת המשפחות שלנו');
await stranger.click('text=לא מוצאים? הוסיפו משפחה');
await stranger.waitForSelector('input[name=familyPhone]');
check('a number can be typed, not only picked from contacts',
  await stranger.isVisible('input[name=familyPhone]'));

// Typing a number the app already knows joins that family rather than a copy.
const beforeCold = rows('Households').length;
await stranger.fill('input[name=familyFirstNames]', 'אבא ואמא');
await stranger.fill('input[name=familyPhone]', DAD);
await stranger.click('form:has(input[name=familyFirstNames]) button[type=submit]');
await stranger.waitForTimeout(1800);
check('a typed number that is known makes no second household',
  rows('Households').length === beforeCold);

await stranger.goto(BASE);
await stranger.click('text=מתארחים אצל…');
await stranger.waitForSelector('select[name=hostHouseholdId]');
const coldSees = await stranger.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`and they are on the list (${coldSees.join(', ')})`, coldSees.includes('אבא ואמא'));

await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=המעגלים שלי');
const coldSuggested = await stranger.$$eval('section:has-text("מוצע להוספה") li', (els) =>
  els.map((e) => e.innerText.split('\n')[0].trim()),
);
check(`one family added brings the rest as suggestions (${coldSuggested.length})`,
  coldSuggested.length >= 2);
await stranger.close();

// ── the circle is hidden until you answer ────────────────────────────────────
const dad = await open();
await dad.goto(BASE);
await dad.fill('input[name=phone]', DAD);
await dad.click('button[type=submit]');
await dad.waitForSelector('text=איפה אתם בחג?');
check('a known number goes straight to the question', await dad.isVisible('text=איפה אתם בחג?'));
// Saturday is "שבת", with no "יום" in front of it.
check('the holiday carries its weekday', /(יום \S+|שבת) · \d/.test(await dad.innerText('header')));
check('nobody else is shown before you answer', !(await dad.isVisible('text=איפה כולם')));

await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=איפה כולם');
check('answering reveals where everyone is', await dad.isVisible('text=איפה כולם'));
check('and the circle lists the other families', await dad.isVisible('text=טמיר ואפיק'));

// ── invite a family that is not in the app at all ────────────────────────────
await dad.click('nav >> text=המעגלים');
await dad.waitForURL('**/families');
check('the tab bar reaches the circles screen', await dad.isVisible('text=המעגלים שלי'));
const beforeInvite = rows('Invites').length;
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=שליחה בוואטסאפ');
check('an invite link is created', rows('Invites').length === beforeInvite + 1);
check('the invite is a family invite', rows('Invites').at(-1)[2] === 'family');
const token = rows('Invites').at(-1)[0];

const newcomer = await open();
await newcomer.goto(`${BASE}/join/${token}`);
await newcomer.fill('input[name=phone]', NEWCOMER);
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('input[name=firstNames]');
check('the invite names who invited them', await newcomer.isVisible('text=אבא ואמא'));
check('and asks for no phone number', !(await newcomer.isVisible('input[name=joinPhone]')));
check('the family name is asked for in two parts',
  (await newcomer.$$('input[name=firstNames], input[name=surname]')).length === 2);

// ── the inviter's circle is offered, ticked, and can be trimmed ──────────────
const offeredAtJoin = await newcomer.$$eval('input[name=share]', (els) =>
  els.map((e) => ({ id: e.value, on: e.checked })),
);
check(`the inviter's circle is offered (${offeredAtJoin.length} families)`,
  offeredAtJoin.length >= 2);
check('all of it ticked to begin with', offeredAtJoin.every((f) => f.on));
await newcomer.uncheck('input[name=share][value=hh_sister]');
check('and one can be dropped',
  !(await newcomer.isChecked('input[name=share][value=hh_sister]')));

await newcomer.fill('input[name=name]', 'דנה');
await newcomer.fill('input[name=firstNames]', 'דנה ויוסי');
await newcomer.fill('input[name=surname]', 'לוי');
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('text=איפה אתם בחג?');
check('the newcomer is in', rows('Households').some((r) => r[1] === 'דנה ויוסי לוי'));
check('the family name is the two fields joined',
  rows('Households').some((r) => r[1] === 'דנה ויוסי לוי'));

// ── they arrive with the families they ticked, and only those ────────────────
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const options = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => t !== 'בחרו משפחה'),
);
check(`the newcomer starts with more than the one family (${options.join(', ') || 'none'})`,
  options.length > 1 && options.includes('אבא ואמא'));
check('and without the one they unticked', !options.includes('אחות ובעלה'));

await newcomer.selectOption('select[name=hostHouseholdId]', { label: 'אבא ואמא' });
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('text=מתארחים אצל אבא ואמא');
check('the newcomer can answer for the family that invited them',
  await newcomer.isVisible('text=מתארחים אצל אבא ואמא'));

await dad.goto(BASE);
check('and they show up as coming', await dad.isVisible('text=דנה ויוסי לוי'));

// ── both say they are at the other, and the sheet records it ─────────────────
// The Conflicts tab is an event log now: rows are appended, never rewritten, so
// two families answering at once cannot erase each other.
const conflictState = () => {
  const state = new Map();
  for (const r of rows('Conflicts')) state.set(`${r[0]}|${r[1]}|${r[2]}`, r[3]);
  return state;
};

await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
await dad.selectOption('select[name=hostHouseholdId]', { label: 'דנה ויוסי לוי' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל דנה ויוסי לוי');

await newcomer.reload();
check('the guest is warned their host is not hosting',
  await newcomer.isVisible('text=שימו לב — הם ענו שהם מתארחים'));

const newcomerHousehold = rows('Households').at(-1)[0];
const KEY = `erev_rosh_hashana_2026|${newcomerHousehold}|hh_parents`;
check(`the contradiction is written to the sheet (${rows('Conflicts').length} rows)`,
  conflictState().get(KEY) === 'open');

const openedRows = rows('Conflicts').length;
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=אנחנו מארחים');
await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=מגיעים אליכם');
check('resolving it is recorded as resolved', conflictState().get(KEY) === 'resolved');
check('and nothing was erased to do it — the tab only grew',
  rows('Conflicts').length > openedRows &&
    rows('Conflicts').some((r) => r[3] === 'open'));

await newcomer.reload();
check('the warning is gone for the guest',
  !(await newcomer.isVisible('text=שימו לב — הם ענו שהם מתארחים')));

// ── adding a family from the question screen ─────────────────────────────────
// The case this exists for: answering on the night, and the host is not listed.
const beforeAdd = rows('Households').length;
await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.click('text=לא מוצאים? הוסיפו משפחה');
await dad.fill('input[name=familySurname]', 'כהן');
await dad.click('text=הוספה');
await dad.waitForTimeout(1500);
check('a family can be added while answering', rows('Households').length === beforeAdd + 1);

await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
const withCohen = await dad.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('and is immediately pickable', withCohen.includes('כהן'));
await dad.selectOption('select[name=hostHouseholdId]', { label: 'כהן' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל כהן');
check('answering at them works', await dad.isVisible('text=מתארחים אצל כהן'));

await dad.goto(`${BASE}/families`);
check('a family nobody has signed up from says so plainly',
  await dad.isVisible('text=עוד לא נרשמו לאפליקציה'));

// nothing is inherited: the newcomer never sees them
await newcomer.goto(BASE);
await newcomer.click('text=שינוי תשובה');
await newcomer.waitForSelector('text=מתארחים אצל…');
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const newcomerSees = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('and nobody else inherits them', !newcomerSees.includes('כהן'));

// ── picking families out of the address book ─────────────────────────────────
// Chromium has no Contact Picker, so we hand the page one. What is being tested
// is what the app does with the contacts, not the browser's picker.
const UNKNOWN = '054-000-1122';
await dad.context().addInitScript(
  ([known, unknown]) => {
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: async () => [
          { name: ['דנה'], tel: [known] },
          { name: ['שכנים'], tel: [unknown] },
        ],
      },
      configurable: true,
    });
  },
  [NEWCOMER, UNKNOWN],
);

await dad.goto(`${BASE}/families`);
check('the picker appears when the browser has one', await dad.isVisible('text=בחירה מאנשי הקשר'));
await dad.click('text=בחירה מאנשי הקשר');
await dad.waitForSelector('text=/נוספו:|כבר ברשימה:/');
check('a contact already in the app is reported as already there',
  await dad.isVisible('text=כבר ברשימה: דנה ויוסי לוי'));
check('a contact who is not gets an invite', await dad.isVisible('text=שכנים'));
const inviteHref = await dad.getAttribute('li:has-text("שכנים") >> a', 'href');
check(`the invite is addressed to their number (${inviteHref?.slice(0, 24)}…)`,
  Boolean(inviteHref?.startsWith('https://wa.me/972540001122?text=')));

// ── stepping between holidays still works ────────────────────────────────────
await dad.goto(BASE);
const firstHoliday = (await dad.innerText('.font-display')).trim();
await dad.click('[aria-label="החג הבא"]');
await dad.waitForURL(/\?h=rosh_hashana_ii_2026/);
check(`the arrow moves to the next holiday (${firstHoliday} → ${(await dad.innerText('.font-display')).trim()})`,
  (await dad.innerText('.font-display')).trim() !== firstHoliday);

// ── not coming at all ────────────────────────────────────────────────────────
await newcomer.goto(BASE);
await newcomer.click('text=שינוי תשובה');
await newcomer.waitForSelector('text=לא מגיעים בכלל');
await newcomer.click('text=לא מגיעים בכלל');
await newcomer.waitForSelector('text=שינוי תשובה');
check('a family can answer that it is not gathering at all',
  rows('Answers').at(-1)[2] === 'away');
await dad.goto(BASE);
check('and the circle shows it', await dad.isVisible('text=לא מגיעים'));

// ── history: counts, and correcting the record ───────────────────────────────
await dad.click('nav >> text=היסטוריה');
await dad.waitForURL('**/history');
check('past holidays are listed', await dad.isVisible('text=ערב פסח'));

const stats = await dad.$$eval('.tabular-nums', (els) => els.map((e) => e.textContent.trim()));
check(`three counts are shown (${stats.join(' / ')})`, stats.length === 3);
check('holidays with no answer are marked as missing', await dad.isVisible('text=חסר'));
check('a past date carries its weekday', /(יום \S+|שבת) · \d/.test(await dad.innerText('li')));

const beforeEdit = rows('Answers').length;
const pastRow = dad.locator('li', { hasText: 'ערב פסח' });
await pastRow.getByText('עריכה').click();
// It opens on the answer that is already there — a guest — so switch first.
await pastRow.getByRole('button', { name: 'בעצם אירחנו' }).click();
await pastRow.getByRole('button', { name: 'אירחנו', exact: true }).click();
await dad.waitForTimeout(1500);
check('editing a past holiday appends rather than overwrites',
  rows('Answers').length === beforeEdit + 1);
check('and the row closes itself after saving', !(await dad.isVisible('text=שמירה')));

await dad.goto(`${BASE}/history`);
const corrected = await dad.$$eval('.tabular-nums', (els) => els.map((e) => e.textContent.trim()));
check(`the counts follow the correction (${stats.join('/')} → ${corrected.join('/')})`,
  Number(corrected[0]) === Number(stats[0]) + 1);

// ── families your families know, and you don't ───────────────────────────────
// Dad dropped nobody, so he sees everything already. The newcomer unticked
// אחות ובעלה at the join, and every family that did keep them is now evidence
// that they belong on the newcomer's list too.
await newcomer.goto(`${BASE}/families`);
await newcomer.waitForSelector('text=המעגלים שלי');
const suggestions = await newcomer.$$eval('section:has-text("מוצע להוספה") li', (els) =>
  els.map((e) => e.innerText.replace(/\n+/g, ' | ').trim()),
);
// Naming who the newcomer already knows, so a failure here says why.
const knownAlready = await newcomer.$$eval('section li p.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`the overlap is offered back (${suggestions[0] ?? `none; knows ${knownAlready.join(', ')}`})`,
  suggestions.some((t) => t.includes('אחות ובעלה')));
check('with how many of your families know them',
  suggestions.some((t) => /\d+ מהמשפחות שלכם רואות אותם|משפחה אחת שלכם רואה אותם/.test(t)));

const beforeSuggest = rows('Connections').length;
await newcomer.click('li:has-text("אחות ובעלה") >> text=הוספה');
await newcomer.waitForTimeout(1500);
check('taking one up connects the two families',
  rows('Connections').length === beforeSuggest + 2);
await newcomer.goto(BASE);
await newcomer.click('text=שינוי תשובה');
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const nowSees = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('and they are pickable straight away', nowSees.includes('אחות ובעלה'));

// ── being somebody else, without another phone ───────────────────────────────
await dad.goto(`${BASE}/families`);
check('signing out is offered, and says who you are',
  await dad.isVisible('text=/יציאה \\(אבא ואמא\\)/'));
await dad.click('text=/^יציאה/');
await dad.waitForSelector('input[name=phone]');
check('and it lands back on the sign-in', await dad.isVisible('input[name=phone]'));
await dad.fill('input[name=phone]', DAD);
await dad.click('button[type=submit]');
await dad.waitForSelector('nav');
check('signing back in takes one number and no code', await dad.isVisible('nav'));

// ── everything goes out through WhatsApp ─────────────────────────────────────
await dad.goto(BASE);
if (await dad.isVisible('text=שינוי תשובה')) await dad.click('text=שינוי תשובה');
await dad.click('text=מתארחים אצל…');
await dad.selectOption('select[name=hostHouseholdId]', { label: 'טמיר ואפיק' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=שינוי תשובה');
await dad.waitForTimeout(1200);

check('no phone number is offered as a call', (await dad.$$('a[href^="tel:"]')).length === 0);
check('the host carries a way to write to them',
  await dad.isVisible('[aria-label="הודעה לטמיר ואפיק בוואטסאפ"]'));
check('and it says who in our family answered', /ענו: אבא/.test(await dad.innerText('main')));

// A family with two people registered must not guess which of them you meant.
await dad.click('[aria-label="הודעה לטמיר ואפיק בוואטסאפ"]');
await dad.waitForSelector('a[href="https://wa.me/972502223333"]');
const chooser = await dad.$$eval('ul li a[href^="https://wa.me/972"]', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`picking between them is offered (${chooser.join(', ')})`,
  chooser.includes('טמיר') && chooser.includes('אפיק'));

// Message for a family that is here, invite for one that is not — everywhere.
await dad.goto(`${BASE}/families`);
const marks = await dad.$$eval('section a[href*="wa.me"], section button[aria-label*="וואטסאפ"]', (els) =>
  els.map((e) => `${e.getAttribute('aria-label')}|${(e.getAttribute('href') ?? '').includes('text=') ? 'invite' : 'chat'}`),
);
check(`a family that has joined gets a message (${marks[0] ?? 'none'})`,
  marks.some((m) => m.startsWith('הודעה לטמיר ואפיק')));
check('a family that has not gets an invite',
  marks.some((m) => m.startsWith('הזמנת אח ואשתו') && m.endsWith('invite')));

await dad.goto(`${BASE}/history`);
check('history says who answered', /ענו: אבא/.test(await dad.innerText('main')));

// ── one family stays one family, whatever number signs up ────────────────────
// Dad adds the Leibowitz family by name so he can answer at them. Naama joins
// and claims it. Then Yuval joins with a number nobody has ever entered — and
// must land in that same household rather than opening a second one for it.
const NAAMA = '054-000-7001';
const YUVAL = '054-000-7002';
const beforeJoin = rows('Households').length;

await dad.goto(BASE);
if (await dad.isVisible('text=שינוי תשובה')) await dad.click('text=שינוי תשובה');
await dad.click('text=מתארחים אצל…');
await dad.click('text=לא מוצאים? הוסיפו משפחה');
await dad.fill('input[name=familyFirstNames]', 'נעמה ויובל');
await dad.fill('input[name=familySurname]', 'לייבוביץ');
await dad.click('form:has(input[name=familyFirstNames]) button[type=submit]');
await dad.waitForTimeout(1500);
check('a family added by name is one new household',
  rows('Households').length === beforeJoin + 1);
const leibowitz = rows('Households').find((r) => r[1] === 'נעמה ויובל לייבוביץ')[0];

await dad.goto(`${BASE}/families`);
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=העתקת הקישור');
const shared = rows('Invites').at(-1)[0];

const naama = await open();
await naama.goto(`${BASE}/join/${shared}`);
await naama.fill('input[name=phone]', NAAMA);
await naama.click('button[type=submit]');
await naama.waitForSelector('select[name=claimHouseholdId]');
const offered = await naama.$$eval('select[name=claimHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`a newcomer is offered the families already on the list (${offered.length})`,
  offered.includes('נעמה ויובל לייבוביץ'));
await naama.fill('input[name=name]', 'נעמה');
await naama.selectOption('select[name=claimHouseholdId]', { label: 'נעמה ויובל לייבוביץ' });
check('and claiming one replaces being asked to name a new family',
  !(await naama.isVisible('input[name=householdName]')));
await naama.click('button[type=submit]');
await naama.waitForTimeout(1500);
check('claiming opens no second household', rows('Households').length === beforeJoin + 1);

// The point of the whole thing: Yuval's number is not the one on file.
const yuval = await open();
await yuval.goto(`${BASE}/join/${shared}`);
await yuval.fill('input[name=phone]', YUVAL);
await yuval.click('button[type=submit]');
await yuval.waitForSelector('select[name=claimHouseholdId]');
const stillOffered = await yuval.$$eval('select[name=claimHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('a family somebody already joined is still offered to the next one',
  stillOffered.includes('נעמה ויובל לייבוביץ'));
await yuval.fill('input[name=name]', 'יובל');
await yuval.selectOption('select[name=claimHouseholdId]', { label: 'נעמה ויובל לייבוביץ' });
await yuval.click('button[type=submit]');
await yuval.waitForTimeout(1500);

check('a second number in the family opens no household either',
  rows('Households').length === beforeJoin + 1);
check('both numbers sit in the one household',
  rows('People').filter((r) => r[2] === leibowitz).length === 2);
check('so the family is one row, not two',
  rows('Households').filter((r) => r[1] === 'נעמה ויובל לייבוביץ').length === 1);
await naama.close();
await yuval.close();

// ── the year is shown as something you can page through ──────────────────────
await dad.goto(BASE);
const dots = await dad.$$eval('main span[aria-hidden=true].rounded-full', (els) => els.length);
check(`the pager shows the whole round of the year (${dots} dots)`, dots > 1);
check('and says which holiday this is',
  /\d+ מתוך \d+ · החליקו לצדדים/.test(await dad.innerText('main')));
// Only the holiday and its answer travel; who you are and the pager hold still.
const travels = await dad.$eval('main [class*="flex-col gap-6"]', (el) =>
  el.innerText.split('\n').filter(Boolean).slice(0, 2).join(' | '));
check(`the panel that moves holds the holiday itself (${travels})`,
  travels.includes('ערב ראש השנה'));

// ── occasions belong to one family ───────────────────────────────────────────
const SOON = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
check('the question screen offers adding an occasion',
  await dad.isVisible('a[href="/occasions"]'));
await dad.click('a[href="/occasions"]');
await dad.waitForURL('**/occasions');
await dad.fill('input[name=name]', 'יום הולדת לסבתא');
await dad.fill('input[name=date]', SOON);
const preTicked = await dad.$$eval('input[name=share]', (els) => els.map((e) => e.checked));
check(`the circle is ticked without being asked (${preTicked.length})`,
  preTicked.length > 0 && preTicked.every(Boolean));
// Leave one out, so the audience is genuinely narrower than the circle.
await dad.uncheck('input[name=share][value=hh_sister]');
await dad.click('form button[type=submit]');
await dad.waitForSelector('text=יום הולדת לסבתא');
await dad.waitForTimeout(1200);
check('a family can add an occasion of its own', await dad.isVisible('text=יום הולדת לסבתא'));
const added = rows('Holidays').at(-1);
check('and it is written with the family as its owner', added[6] === 'hh_parents');
check(`and with who it goes out to (${added[7]})`,
  added[7].includes('hh_tamir') && !added[7].includes('hh_sister'));
const occasionKey = added[0];

await dad.goto(BASE);
check('the occasion is asked about like any holiday',
  (await dad.innerText('.font-display')).includes('יום הולדת לסבתא'));

// The point of sharing: somebody else can answer on it.
await newcomer.goto(`${BASE}/?h=${occasionKey}`);
await newcomer.waitForSelector('nav');
check('a family in the circle can open it too',
  (await newcomer.innerText('header')).includes('יום הולדת לסבתא'));

// Nobody who cannot see the date should sit there as "עוד לא ענו".
await dad.goto(`${BASE}/?h=${occasionKey}`);
await dad.waitForSelector('nav');
if (!(await dad.isVisible('text=איפה כולם'))) await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=איפה כולם');
const onOccasion = await dad.$$eval('section:has-text("איפה כולם") li p.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
// A seeded holiday by key: the occasion is only days away, so plain BASE would
// land on the occasion again and measure the same screen twice.
await dad.goto(`${BASE}/?h=erev_rosh_hashana_2026`);
await dad.waitForSelector('nav');
if (!(await dad.isVisible('text=איפה כולם'))) await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=איפה כולם');
const onHoliday = await dad.$$eval('section:has-text("איפה כולם") li p.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`the occasion lists only who it reaches (${onOccasion.length} of ${onHoliday.length})`,
  onOccasion.length > 0 && onOccasion.length < onHoliday.length);
check('while a shared holiday still lists everyone', onHoliday.length > onOccasion.length);

// And narrowing it takes it back off their list.
await dad.goto(`${BASE}/occasions`);
await dad.click('li:has-text("יום הולדת לסבתא") >> text=מי רואה');
await dad.click('li:has-text("יום הולדת לסבתא") >> text=בטלו הכל');
await dad.click('li:has-text("יום הולדת לסבתא") >> text=שמירה');
await dad.waitForTimeout(1500);
check('it can be made private again',
  await dad.isVisible('text=פרטי — רק אתם רואים'));
await newcomer.goto(`${BASE}/?h=${occasionKey}`);
await newcomer.waitForSelector('nav');
check('and then nobody else sees it',
  !(await newcomer.innerText('header')).includes('יום הולדת לסבתא'));

const beforeRemove = rows('Holidays').length;
await dad.click('text=הסרה');
await dad.waitForSelector('text=יום הולדת לסבתא', { state: 'detached' });
await dad.waitForTimeout(1500);
check('removing it leaves the list', !(await dad.isVisible('text=יום הולדת לסבתא')));

// The property, not an exact delta: how many rows earlier edits appended is
// beside the point, and counting them made this fail on timing rather than on
// anything being erased.
const afterRemove = rows('Holidays');
check(`and erases nothing — the tab only grew (${beforeRemove} → ${afterRemove.length})`,
  afterRemove.length > beforeRemove);
const gone = afterRemove.at(-1);
check(`removal is a row, not a deletion (include=${gone[5]})`,
  gone[0] === occasionKey && gone[5] === 'FALSE');

// ── the log stays keys-only ──────────────────────────────────────────────────
const a = rows('Answers').at(-1);
check(`the log holds five columns and no names (${a.join(' | ')})`,
  a.length === 5 && !a.some((v) => /[֐-׿]/.test(v)));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
