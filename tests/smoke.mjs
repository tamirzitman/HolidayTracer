/**
 * End-to-end smoke test, against a real browser.
 *
 *   npm run seed:holidays        # once, if .dev-sheet.json has no Holidays
 *   npm run build && SESSION_SECRET=test npm start -- --port 3111
 *   npm run test:smoke
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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
await stranger.waitForSelector('input[name=firstName]');
check('an unknown number is asked who it is, not turned away',
  await stranger.isVisible('input[name=firstName]'));
check('and is offered a way back if it was a typo',
  await stranger.isVisible('text=זה לא המספר שלי'));

await stranger.fill('input[name=firstName]', 'רן');
await stranger.fill('input[name=surname]', 'ברק');
await stranger.fill('input[name=householdName]', 'רן ומיכל ברק');
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
await stranger.waitForSelector('text=נוספו, וכבר נבחרו');
await stranger.waitForTimeout(1500);
check('a typed number that is known makes no second household',
  rows('Households').length === beforeCold);
check('and the family just added is already chosen',
  (await stranger.$eval('select[name=hostHouseholdId]', (el) =>
    el.selectedOptions[0].textContent.trim())) === 'אבא ואמא');
check('a number somebody already signed in with needs no invite',
  !(await stranger.isVisible('text=הזמנה בוואטסאפ')));

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

// A suggestion turned down should not come back: the families you decided
// against are exactly the ones your families keep vouching for.
const dropped = coldSuggested[0];
await stranger.click(`li:has-text("${dropped}") >> [aria-label^="להסיר את"]`);
await stranger.waitForTimeout(1500);
await stranger.reload();
await stranger.waitForSelector('text=המעגלים שלי');
const afterDismiss = await stranger.$$eval('section:has-text("מוצע להוספה") li', (els) =>
  els.map((e) => e.innerText.split('\n')[0].trim()),
);
check(`a dismissed suggestion stays gone (${dropped} → ${afterDismiss.length} left)`,
  !afterDismiss.includes(dropped) && afterDismiss.length === coldSuggested.length - 1);

// Taking one up is the other half: a mutual connection, usable at once.
const takeUp = afterDismiss[0];
const beforeSuggest = rows('Connections').length;
await stranger.click(`li:has-text("${takeUp}") >> text=הוספה`);
await stranger.waitForTimeout(1800);
check(`taking one up connects the two families (${takeUp})`,
  rows('Connections').length === beforeSuggest + 2);
await stranger.goto(BASE);
await stranger.waitForSelector('nav');
if (await stranger.isVisible('text=שינוי תשובה')) await stranger.click('text=שינוי תשובה');
await stranger.click('text=מתארחים אצל…');
await stranger.waitForSelector('select[name=hostHouseholdId]');
check('and they are pickable straight away',
  (await stranger.$$eval('select[name=hostHouseholdId] option', (els) =>
    els.map((e) => e.textContent.trim()))).includes(takeUp));
await stranger.goto(`${BASE}/families`);
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
check('and the circle lists the other families', await dad.isVisible('text=דנה ויוסי'));

// ── invite a family that is not in the app at all ────────────────────────────
await dad.click('nav >> text=המעגלים');
await dad.waitForURL('**/families');
check('the tab bar reaches the circles screen', await dad.isVisible('text=המעגלים שלי'));
const beforeInvite = rows('Invites').length;
await dad.fill('input[list=circle-names]', 'המשפחה של אבא');
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=שליחה בוואטסאפ');
check('an invite link is created', rows('Invites').length === beforeInvite + 1);
check('the invite is a family invite', rows('Invites').at(-1)[2] === 'family');
check(`and it names the circle it joins (${rows('Invites').at(-1)[4]})`,
  rows('Invites').at(-1)[4] === 'המשפחה של אבא');
const token = rows('Invites').at(-1)[0];

const newcomer = await open();
await newcomer.goto(`${BASE}/join/${token}`);
await newcomer.fill('input[name=phone]', NEWCOMER);
await newcomer.click('button[type=submit]');
await newcomer.waitForSelector('input[name=firstName]');
check('the invite names who invited them', await newcomer.isVisible('text=אבא ואמא'));
check('and asks for no phone number', !(await newcomer.isVisible('input[name=joinPhone]')));
check('your own name is asked once, in two halves',
  (await newcomer.$$('input[name=firstName], input[name=surname]')).length === 2);
const headings = await newcomer.$$eval('legend', (els) => els.map((e) => e.textContent.trim()));
check(`the name and the family are asked as separate questions (${headings.join(' / ')})`,
  headings.includes('איך קוראים לכם?') && headings.includes('המשפחה שלכם'));

// The screen a link lands on has to be answerable at a glance.
const asked = await newcomer.$$eval('input:not([type=hidden]), select', (els) =>
  els.map((e) => e.name || e.type),
);
check(`joining asks three things and no more (${asked.join(', ')})`, asked.length === 3);
check('the family name is not guessed from your own',
  (await newcomer.inputValue('input[name=householdName]')) === '');
check('a way out exists for a number typed wrong',
  await newcomer.isVisible('text=זה לא המספר שלי — יציאה'));
check('and judges nobody else on the way in',
  (await newcomer.$$('input[name=share]')).length === 0);

// Claiming an existing family is there, one line away, for the rarer case.
await newcomer.click('text=המשפחה שלנו כבר ברשימה');
await newcomer.waitForSelector('select[name=claimHouseholdId]');
check('claiming an existing family is a line away, not in the way',
  await newcomer.isVisible('select[name=claimHouseholdId]'));

await newcomer.fill('input[name=firstName]', 'דנה');
await newcomer.fill('input[name=surname]', 'לוי');
await newcomer.fill('input[name=householdName]', 'דנה ויוסי לוי');
const joinButtons = await newcomer.$$eval('form button[type=submit]', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`joining a circle is asked, not assumed (${joinButtons.length} answers)`,
  joinButtons.length === 2 && joinButtons.some((t) => t.includes('בלי להתחבר')));
await newcomer.selectOption('select[name=claimHouseholdId]', '');
await newcomer.click('text=/^סיום/');
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
check(`the newcomer starts with the family that invited them (${options.join(', ') || 'none'})`,
  options.includes('אבא ואמא'));

// And the rest arrives where it can be judged: on the circles screen, named,
// with one tap for all of it.
await newcomer.goto(`${BASE}/families`);
await newcomer.waitForSelector('text=המעגלים שלי');
const waiting = await newcomer.$$eval('section:has-text("מוצע להוספה") li', (els) => els.length);
check(`the inviter's circle arrives as suggestions instead (${waiting})`, waiting >= 2);
const mineBefore = await newcomer.$$eval('section:first-of-type li', (els) => els.length);
await newcomer.click('text=הוספת כולן');
await newcomer.waitForTimeout(4000);
await newcomer.reload();
await newcomer.waitForSelector('text=המעגלים שלי');
const mineAfter = await newcomer.$$eval('section:first-of-type li', (els) => els.length);
const left = await newcomer.$$eval('section:has-text("מוצע להוספה") li', (els) => els.length);
// What the button promises: nothing offered is left behind, and the list grew.
check(`and all of it goes in one tap (${mineBefore} → ${mineAfter}, ${left} left)`,
  left === 0 && mineAfter > mineBefore);
// Back to the question, where the dropdown has to be opened again.
await newcomer.goto(BASE);
await newcomer.waitForSelector('nav');
if (await newcomer.isVisible('text=שינוי תשובה')) await newcomer.click('text=שינוי תשובה');
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
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

// ── an invite link cannot quietly put somebody on your list ──────────────────
const friend = await open();
await friend.goto(`${BASE}/join/${token}`);
await friend.fill('input[name=phone]', '058-111-2222');
await friend.click('button[type=submit]');
await friend.waitForSelector('input[name=firstName]');
await friend.fill('input[name=firstName]', 'חבר');
await friend.fill('input[name=surname]', 'סקרן');
await friend.fill('input[name=householdName]', 'חבר סקרן');
await friend.click('text=/^להירשם בלי להתחבר/');
await friend.waitForSelector('text=איפה אתם בחג?');
await friend.waitForTimeout(1500);
const friendId = rows('Households').at(-1)[0];
check('somebody who only wanted the app joins nobody',
  rows('Connections').every((r) => r[0] !== friendId && r[1] !== friendId));
await friend.close();

// A link that has gone stale is a way in, not a wall.
const aged = sheet();
aged.Invites = aged.Invites.map((r, i) =>
  i && r[0] === token ? [r[0], r[1], r[2], '2020-01-01T00:00:00.000Z'] : r,
);
writeFileSync(SHEET, `${JSON.stringify(aged, null, 2)}\n`, 'utf8');
await dad.waitForTimeout(21000);
const late = await open();
await late.goto(`${BASE}/join/${token}`);
await late.waitForSelector('input[name=phone]');
check('an expired link falls back to signing in, not to a dead end',
  await late.isVisible('text=כבר לא בתוקף'));
await late.close();

// ── two sides of a family are two circles ────────────────────────────────────
// They never sit together and do not share a group chat, so an invite to one is
// not an invite to the other. The link is what makes the circle.
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המעגלים שלי');
if (await dad.isVisible('text=קישור אחר')) await dad.click('text=קישור אחר');
await dad.fill('input[list=circle-names]', 'המשפחה של אמא');
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=שליחה בוואטסאפ');
const otherSide = rows('Invites').at(-1)[0];

const cousin = await open();
await cousin.goto(`${BASE}/join/${otherSide}`);
await cousin.fill('input[name=phone]', '058-300-4001');
await cousin.click('button[type=submit]');
await cousin.waitForSelector('input[name=firstName]');
await cousin.fill('input[name=firstName]', 'דודה');
await cousin.fill('input[name=surname]', 'לוי');
await cousin.fill('input[name=householdName]', 'דודה ואבי לוי');
await cousin.click('text=/^סיום/');
await cousin.waitForSelector('text=איפה אתם בחג?');
await cousin.waitForTimeout(1500);
await cousin.close();

check('joining through a link files it under that link\'s circle',
  rows('Connections').some((r) => r[4] === 'המשפחה של אמא'));

await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המעגלים שלי');
const headings = await dad.$$eval('section h2', (els) => els.map((e) => e.textContent.trim()));
check(`the circles screen keeps them apart (${headings.join(' · ')})`,
  headings.includes('המשפחה של אבא') && headings.includes('המשפחה של אמא'));

await dad.goto(BASE);
await dad.waitForSelector('nav');
if (await dad.isVisible('text=שינוי תשובה')) await dad.click('text=שינוי תשובה');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
const grouped = await dad.$$eval('select[name=hostHouseholdId] optgroup', (els) =>
  els.map((g) => g.label),
);
check(`and the dropdown is grouped the same way (${grouped.join(' · ')})`,
  grouped.includes('המשפחה של אבא') && grouped.includes('המשפחה של אמא'));

// ── everything goes out through WhatsApp ─────────────────────────────────────
await dad.goto(BASE);
if (await dad.isVisible('text=שינוי תשובה')) await dad.click('text=שינוי תשובה');
await dad.click('text=מתארחים אצל…');
await dad.selectOption('select[name=hostHouseholdId]', { label: 'דנה ויוסי' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=שינוי תשובה');
await dad.waitForTimeout(1200);

check('no phone number is offered as a call', (await dad.$$('a[href^="tel:"]')).length === 0);
check('the host carries a way to write to them',
  await dad.isVisible('[aria-label="הודעה לדנה ויוסי בוואטסאפ"]'));
check('and it says who in our family answered', /ענו: אבא/.test(await dad.innerText('main')));

// A family with two people registered must not guess which of them you meant.
await dad.click('[aria-label="הודעה לדנה ויוסי בוואטסאפ"]');
await dad.waitForSelector('a[href="https://wa.me/972502223333"]');
const chooser = await dad.$$eval('ul li a[href^="https://wa.me/972"]', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`picking between them is offered (${chooser.join(', ')})`,
  chooser.includes('דנה') && chooser.includes('יוסי'));

// Message for a family that is here, invite for one that is not — everywhere.
await dad.goto(`${BASE}/families`);
const marks = await dad.$$eval('section a[href*="wa.me"], section button[aria-label*="וואטסאפ"]',
  (els) => els.length);
check(`the circles list carries no per-family marks (${marks})`, marks === 0);
check('the household name is not repeated under the header',
  (await dad.$$('main [aria-hidden="true"]:text("🏡")')).length === 0);

await dad.goto(`${BASE}/history`);
check('history says who answered', /ענו: אבא/.test(await dad.innerText('main')));

// ── one family stays one family, whatever number signs up ────────────────────
// Dad adds a family by name so he can answer at them. One of them joins and
// claims it. Then a second person from that family joins with a number nobody
// has ever entered — and must land in the same household, not a second one.
const FIRST_NUMBER = '054-000-7001';
const SECOND_NUMBER = '054-000-7002';
const beforeJoin = rows('Households').length;

await dad.goto(BASE);
if (await dad.isVisible('text=שינוי תשובה')) await dad.click('text=שינוי תשובה');
await dad.click('text=מתארחים אצל…');
await dad.click('text=לא מוצאים? הוסיפו משפחה');
await dad.fill('input[name=familyFirstNames]', 'רות ואורי');
await dad.fill('input[name=familySurname]', 'לוי');
await dad.click('form:has(input[name=familyFirstNames]) button[type=submit]');
await dad.waitForTimeout(1500);
check('a family added by name is one new household',
  rows('Households').length === beforeJoin + 1);
const theirHousehold = rows('Households').find((r) => r[1] === 'רות ואורי לוי')[0];

await dad.goto(`${BASE}/families`);
await dad.click('text=הזמנת משפחה');
await dad.waitForSelector('text=העתקת הקישור');
const shared = rows('Invites').at(-1)[0];

const first = await open();
await first.goto(`${BASE}/join/${shared}`);
await first.fill('input[name=phone]', FIRST_NUMBER);
await first.click('button[type=submit]');
await first.waitForSelector('input[name=firstName]');
await first.click('text=המשפחה שלנו כבר ברשימה');
await first.waitForSelector('select[name=claimHouseholdId]');
const offered = await first.$$eval('select[name=claimHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`a newcomer is offered the families already on the list (${offered.length})`,
  offered.includes('רות ואורי לוי'));
await first.fill('input[name=firstName]', 'רות');
await first.fill('input[name=surname]', 'לוי');
await first.selectOption('select[name=claimHouseholdId]', { label: 'רות ואורי לוי' });
check('and claiming one replaces being asked to name a new family',
  !(await first.isVisible('input[name=householdName]')));
await first.click('text=/^סיום/');
await first.waitForTimeout(1500);
check('claiming opens no second household', rows('Households').length === beforeJoin + 1);

// The point of the whole thing: this number is not the one on file.
const second = await open();
await second.goto(`${BASE}/join/${shared}`);
await second.fill('input[name=phone]', SECOND_NUMBER);
await second.click('button[type=submit]');
await second.waitForSelector('input[name=firstName]');
await second.click('text=המשפחה שלנו כבר ברשימה');
await second.waitForSelector('select[name=claimHouseholdId]');
const stillOffered = await second.$$eval('select[name=claimHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('a family somebody already joined is still offered to the next one',
  stillOffered.includes('רות ואורי לוי'));
await second.fill('input[name=firstName]', 'אורי');
await second.fill('input[name=surname]', 'לוי');
await second.selectOption('select[name=claimHouseholdId]', { label: 'רות ואורי לוי' });
await second.click('text=/^סיום/');
await second.waitForTimeout(1500);

check('a second number in the family opens no household either',
  rows('Households').length === beforeJoin + 1);
check('both numbers sit in the one household',
  rows('People').filter((r) => r[2] === theirHousehold).length === 2);
check('so the family is one row, not two',
  rows('Households').filter((r) => r[1] === 'רות ואורי לוי').length === 1);
await first.close();
await second.close();

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
// Reached through the household menu, from wherever you happen to be.
await dad.click('button[aria-haspopup=menu]');
await dad.waitForSelector('[role=menu]');
await dad.click('[role=menu] >> text=המועדים שלנו');
await dad.waitForURL('**/occasions');
check('the occasions screen is two taps from anywhere',
  await dad.isVisible('text=הוספת מועד'));
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
  added[7].includes('hh_a') && !added[7].includes('hh_sister'));
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
// Counted against the header rather than a fixed number: the point is that the
// log holds keys and no names, not that it has exactly so many columns.
const answerHeader = sheet().Answers[0];
const a = rows('Answers').at(-1);
check(`the log holds ${answerHeader.length} keyed columns and no names (${a.join(' | ')})`,
  a.length === answerHeader.length && !a.some((v) => /[֐-׿]/.test(v)));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
