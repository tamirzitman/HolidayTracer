/**
 * End-to-end smoke test, against a real browser.
 *
 *   npm run seed:holidays        # once, if .dev-sheet.json has no Holidays
 *   npm run build && SESSION_SECRET=test SHEET_TTL_MS=100 npm start -- --port 3111
 *   npm run test:smoke
 *
 * SHEET_TTL_MS on the server (not this script) turns two ~20s waits below into
 * near-instant ones; see the constant below. Fine to omit — the suite reads
 * whatever the server was actually started with and waits that long instead.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3111';

// Refuse to run against anything but a local .dev-sheet.json. The suite signs
// up families, mints invites and answers for holidays; pointed at a real sheet
// it writes all of that into somebody's record, and every assertion below
// still reads the local file, so it fails without saying why. `next start`
// picks up .env.local, so a server started the ordinary way is exactly that —
// hence `npm run start:test`, which clears SHEET_ID.
const marker = await fetch(BASE)
  .then((r) => r.text())
  .catch(() => {
    console.error(`No server answering on ${BASE}. Start one with: npm run start:test`);
    process.exit(1);
  });
if (!marker.includes('name="holidaytracer-store" content="local"')) {
  console.error(
    `${BASE} is not on a local sheet — it has a SHEET_ID, so this run would write\n` +
      'into a real spreadsheet. Start the test server with: npm run start:test',
  );
  process.exit(1);
}

// Start from known fixtures: a half-finished earlier run would otherwise leave
// answers behind and the first assertion would fail for the wrong reason.
execFileSync(process.execPath, ['scripts/dev-fixtures.mjs'], { stdio: 'ignore' });
// The server's in-memory copy of the sheet outlives a write by this long — set
// by SHEET_TTL_MS on the server the suite is run against. Two checks below
// have to outlast it to see a write reflected with no cache to invalidate it
// (a stale sheet edited by hand, an invite backdated by hand). A little slack
// on top absorbs the gap between the two processes' clocks.
const SHEET_TTL_MS = (Number(process.env.SHEET_TTL_MS) || 20_000) + 1_000;
const SHEET = '.dev-sheet.json';
const DAD = '050-123-4567';
const NEWCOMER = `05${String(Date.now()).slice(-8)}`;
// A second unknown number, for the family that arrives on a circle's link.
const COUSIN = `05${String(Date.now() + 1).slice(-8)}`;

const sheet = () => JSON.parse(readFileSync(SHEET, 'utf8'));
const rows = (tab) => (sheet()[tab] ?? []).slice(1);
// Invite columns by name, never by position — the fixtures carry a spare
// column exactly as the real sheet does, and reading these by position is how
// writes landing one column over went unnoticed.
const colsOf = (tab) => (sheet()[tab]?.[0] ?? []).map((h) => String(h).trim().toLowerCase());

/**
 * Every family on the circles screen, with the circle group it sits under.
 *
 * That screen is grouped the way the holiday screen is — a named heading per
 * circle, its colour down the edge of each row — so a row no longer carries its
 * own dots, and which circles a family is in is read from the heading above it
 * rather than counted on the line itself.
 */
const familiesByGroup = async (page) => {
  const seen = await page.$$eval('#families li', (els) =>
    els.map((e) => ({
      name: e.querySelector('button > span.font-semibold')?.textContent.trim() ?? '',
      heading: e.querySelector('[data-circle-group]')?.textContent.trim() ?? '',
    })),
  );
  let group = '';
  return seen
    .map((row) => {
      if (row.heading) group = row.heading;
      return { name: row.name, group, circles: group.includes('במעגל') ? 0 : group.split('+').length };
    })
    .filter((row) => row.name);
};
const inv = (row, name) => (row ?? [])[colsOf('Invites').indexOf(name)] ?? '';

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const open = async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 820 } })).newPage();
  // Invitations now go straight out to WhatsApp, which the browser cannot
  // follow here. Blocking it leaves the app where it was; what the link said
  // is read from the sheet, which is where it matters anyway.
  await page.route('https://wa.me/**', (route) => route.abort());
  return page;
};

// The invitation on one family's row, which carries which family they are.
// Only families nobody has signed in from have one: getting in is a phone
// number, so a family already in the app needs nothing from its row.
const linkFromRow = async (page, familyName) => {
  await page.goto(`${BASE}/families`);
  await page.waitForSelector('text=המעגלים שלי');
  const before = rows('Invites').length;
  // Scoped to the families list: a suggestion row names the families that
  // vouch for it, so an unscoped search matches those too.
  const row = page.locator('#families li').filter({ hasText: familyName }).last();
  if ((await row.getByRole('button', { name: /הזמנה למשפחה/ }).count()) === 0) {
    const seen = await page.$$eval('#families li', (els) =>
      els.map((e) => e.innerText.replace(/\n/g, ' | ')),
    );
    const conn = rows('Connections')
      .filter((r) => r[0] === 'hh_parents')
      .map((r) => `${r[1]}:${r[2]}`)
      .join(' ');
    throw new Error(
      `no invitation on the row for "${familyName}".\n` +
        `#families holds:\n  ${seen.join('\n  ')}\n` +
        `Households (${rows('Households').length}): ${rows('Households').map((r) => `${r[0]}=${r[1]}`).join(', ')}\n` +
        `hh_parents connections: ${conn}`,
    );
  }
  await row.getByRole('button', { name: /הזמנה למשפחה/ }).click();
  // The tap leaves for WhatsApp, so the link's arrival is read from the sheet.
  for (let i = 0; i < 40 && rows('Invites').length === before; i += 1) {
    await page.waitForTimeout(250);
  }
  return rows('Invites').at(-1);
};

/** Bringing somebody into our own house — from the row about our own house. */
const addToOurHouse = async (page) => {
  await page.goto(`${BASE}/families`);
  await page.waitForSelector('text=הבית שלנו');
  const before = rows('Invites').length;
  // Behind the row, like everything else about a household on this screen.
  await page.click('[aria-label="מה אפשר לעשות עם הבית שלנו"]');
  await page.click('text=הוספת בן בית');
  for (let i = 0; i < 40 && rows('Invites').length === before; i += 1) {
    await page.waitForTimeout(250);
  }
  return rows('Invites').at(-1);
};

// ── an unknown number cannot let itself in ───────────────────────────────────
// ── signing up needs nobody's permission ─────────────────────────────────────
const stranger = await open();
await stranger.goto(BASE);

// ── the app has a face ──────────────────────────────────────────────────────
// The front door is where somebody handed a link in a family group decides
// whether to type their phone number in, so it is the one screen that says what
// this is rather than getting straight to the question.
check('the front door carries the mark',
  await stranger.isVisible('main svg path[d^="M140 126"]'));
const doorway = await stranger.innerText('main');
check('and names the app exactly once, not twice',
  doorway.split('איפה אתם בחג').length - 1 === 1);

// Every one of these is something a phone or a chat app fetches by itself, long
// after anybody would notice it was missing: a home-screen icon, the picture on
// an invitation, the file that makes "add to home screen" work at all. A path
// that stops resolving puts the app back to a blank square in silence.
for (const asset of [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/og.png',
]) {
  const res = await fetch(`${BASE}${asset}`);
  check(`${asset} is there (${res.status})`, res.ok);
}
const head = await stranger.content();
check('the page points a phone at the home-screen icon',
  head.includes('apple-touch-icon.png') && head.includes('manifest.webmanifest'));
// Every invitation this app sends is a WhatsApp link; without this each one
// arrives as a bare address.
check('and points a chat app at the picture for a link',
  /property="og:image"/.test(head) && head.includes('/og.png'));
check('the launch image is offered for the screens it was drawn for',
  (await stranger.$$('link[rel="apple-touch-startup-image"]')).length === 7);

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

// ── the footer ──────────────────────────────────────────────────────────────
// The version on screen is a claim made to every person using the app, so it
// has to be the version that was actually released — not a number typed into a
// component and left behind by the next change.
const declared = JSON.parse(readFileSync('package.json', 'utf8')).version;
const footer = await stranger.innerText('footer');
check(`the footer shows the released version (${declared})`,
  footer.includes(`גרסה ${declared}`));
// Outside <main>, which is what keeps it from reading as another card — and
// what keeps every other assertion in this suite from tripping over it.
check('and it sits outside the screen it ends',
  (await stranger.$$('main footer')).length === 0 && (await stranger.$$('footer')).length === 1);
check('the app says it was built with AI, where that can be read',
  /בינה מלאכותית/.test(footer));
// The footer once carried the app's name beside the version, which put the
// title of the sign-in screen onto every screen — and every `text=איפה אתם בחג?`
// in this suite started matching the footer and returning before the page it
// was waiting for had arrived. Chrome that repeats a screen's title is a trap.
check('and it does not repeat the app title onto every screen',
  !footer.includes('איפה אתם בחג'));
// A plain mailto arrives saying "לא עובד" and nothing else. This one carries
// the version and the screen, which is most of a bug report.
const reportTo = await stranger.getAttribute('footer a[href^="mailto:"]', 'href');
check(`a problem can be reported in one tap (${reportTo?.slice(0, 30)}…)`,
  reportTo?.startsWith('mailto:tamirzitman@gmail.com?'));
check('and the report says which version and which screen it came from',
  decodeURIComponent(reportTo ?? '').includes(declared) &&
    decodeURIComponent(reportTo ?? '').includes('מסך החג'));

// Nobody on the list yet: the guest button would open an empty dropdown, and
// the app should say where to go rather than leave it to be worked out.
check('an empty list is told what to do about it',
  await stranger.isVisible('text=להוסיף את המשפחות שלנו'));
check('and nothing is promised that cannot be shown yet',
  !/כשתענו, תוכלו לראות כאן/.test(await stranger.innerText('main')));
const cold = await stranger.$$eval('main a, main button', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`an empty circle points at filling it (${cold.join(', ')})`,
  cold.includes('הוספת משפחה'));
// With nobody on the list there is nothing to be a guest at, so the picker is
// not offered at all — and adding is the same ＋ as everywhere else, opening
// where you are rather than on another screen.
check('and is not asked who it is a guest at, since there is nobody',
  !cold.includes('מתארחים אצל…'));

// ── what "משפחה" means here ─────────────────────────────────────────────────
// The word has meant three things to three people typing into the same box: a
// household, one person in it, and a whole side of a family — and the last is a
// circle, which arrives as a household nobody can ever be a guest at. Nothing in
// the data can tell those apart afterwards, so it is said where it is typed.
await stranger.click('text=הוספת משפחה');
check('naming a family says it is a household, not a person',
  /משק בית אחד/.test(await stranger.innerText('main')) &&
    /לא שם של צד במשפחה — זה מעגל/.test(await stranger.innerText('main')));
await stranger.waitForSelector('input[name=familyPhone]');
check('the ＋ opens the form here, without leaving the question',
  (await stranger.isVisible('input[name=familyPhone]')) && stranger.url() === `${BASE}/`);
check('a number can be typed, not only picked from contacts',
  await stranger.isVisible('input[name=familyPhone]'));

// Typing a number the app already knows joins that family rather than a copy.
const beforeCold = rows('Households').length;
await stranger.fill('input[name=familyName]', 'אבא ואמא');
await stranger.fill('input[name=familyPhone]', DAD);
await stranger.click('form:has(input[name=familyName]) button[type=submit]');
// Added from the holiday screen, so the family is chosen for the question that
// was on screen when they turned out to be missing.
await stranger.waitForSelector('text=נוספו, וכבר נבחרו');
await stranger.waitForTimeout(1500);
check('a typed number that is known makes no second household',
  rows('Households').length === beforeCold);
check('and the question is still the one behind it',
  await stranger.isVisible('text=איפה אתם בחג?'));

await stranger.goto(BASE);
await stranger.click('text=מתארחים אצל…');
await stranger.waitForSelector('select[name=hostHouseholdId]');
const coldSees = await stranger.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`and they are on the list (${coldSees.join(', ')})`, coldSees.includes('אבא ואמא'));

// Nobody arrives on your list because somebody else knows them. Families the
// app offered on a count of vouchers are gone: a household reaches your list
// when you add it, or when a circle puts it there — an act somebody performed,
// not a guess the app made about who your family is.
await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=המעגלים שלי');
const uninvited = (await familiesByGroup(stranger)).map((f) => f.name);
check(`only what we added is on the list (${uninvited.join(', ')})`,
  uninvited.length === 1 && uninvited[0].includes('אבא ואמא'));
check('and nothing is offered on anybody else\'s say-so',
  (await stranger.$$('section:has-text("מוצע להוספה")')).length === 0);

// Adding one by number while answering: the family it belongs to is joined
// rather than copied, and it is the host straight away — going back to hunt for
// it in the dropdown was the whole friction this removes.
await stranger.goto(BASE);
if (await stranger.isVisible('text=שינוי תשובה')) await stranger.click('text=שינוי תשובה');
await stranger.click('text=מתארחים אצל…');
await stranger.click('text=הוספת משפחה');
await stranger.waitForSelector('input[name=familyPhone]');
const beforeKnown = rows('Households').length;
await stranger.fill('input[name=familyName]', 'דנה ויוסי');
await stranger.fill('input[name=familyPhone]', '050-222-3333');
await stranger.click('form:has(input[name=familyName]) button[type=submit]');
await stranger.waitForSelector('text=נוספו, וכבר נבחרו');
await stranger.waitForTimeout(1500);
check('a number the app knows joins that family rather than copying it',
  rows('Households').length === beforeKnown);
// Somebody has already signed in with that number, so there is nobody to
// invite and the card says nothing about sending them a link.
check('a number somebody already signed in with needs no invite',
  !(await stranger.isVisible('text=הם עוד לא באפליקציה')));
check('a family added while answering is already chosen',
  (await stranger.$eval('select[name=hostHouseholdId]', (el) =>
    el.selectedOptions[0].textContent.trim())) === 'דנה ויוסי');

await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=המעגלים שלי');
const afterAdding = await stranger.$$eval('#families li', (els) =>
  els.map((e) => e.innerText.split('\n')[0].trim()),
);
// דנה ויוסי is on dad's list too, and dad's other families are not dragged
// along behind them. Two families on a list is two families.
check(`adding one family brings one family (${afterAdding.length})`,
  afterAdding.length === 2 && afterAdding.some((n) => n.includes('דנה ויוסי')));

// One way in, offered once. There used to be a panel at the foot of this screen
// with a second form for adding a family and a link that connected the opener
// to us and to nobody else — the same errand as the ＋ at the top, and a kind of
// invitation that says nothing about who is being invited.
check('adding a family is offered once on this screen, not twice',
  (await stranger.$$('main input[name=familyName]')).length === 0);
check('and the way to do it is the ＋ on the list it goes into',
  await stranger.isVisible('[aria-label="הוספת משפחה"]'));
// The circles come first: they are what the screen is called, and what decides
// who is on the list underneath.
const order = await stranger.$$eval('main h2', (els) => els.map((e) => e.textContent.trim()));
check(`the circles are above the families (${order.join(' → ')})`,
  order.indexOf('המעגלים שלנו') < order.indexOf('המשפחות שלנו') &&
    order.indexOf('המשפחות שלנו') < order.indexOf('הבית שלנו'));

// ── a family we added: correcting it, and taking it back ────────────────────
// A name we typed is our note about them, so it is ours to fix — until somebody
// signs in as that family, when the name becomes theirs.
await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=המעגלים שלי');
const typo = stranger.locator('#families li').filter({ hasText: 'דנה ויוסי' }).last();
await typo.getByRole('button', { expanded: false }).first().click();
check('a family we added opens what can be done about it',
  await stranger.isVisible('text=/מחיקת המשפחה|הסרה מהרשימה שלנו/'));

// דנה ויוסי has people in it, so it is a record rather than our note.
check('a family somebody has signed into cannot be renamed by us',
  await stranger.isVisible('text=השם שלהם לשנות'));
check('and is removed from our list rather than deleted',
  await stranger.isVisible('text=הסרה מהרשימה שלנו'));

// One we typed ourselves, that nobody has joined: ours to correct and to undo.
const beforeTypo = rows('Households').length;
await stranger.click('[aria-label="הוספת משפחה"]');
await stranger.waitForSelector('input[name=familyName]');
await stranger.fill('input[name=familyName]', 'משפחת טעות');
await stranger.click('form:has(input[name=familyName]) button[type=submit]');
await stranger.waitForTimeout(2000);
check('a family added by name is one new household',
  rows('Households').length === beforeTypo + 1);
const typoId = rows('Households').at(-1)[0];

await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=משפחת טעות');
const mine = stranger.locator('#families li').filter({ hasText: 'משפחת טעות' }).last();
await mine.getByRole('button', { expanded: false }).first().click();
await stranger.waitForSelector('input[value="משפחת טעות"]');
await stranger.fill('input[value="משפחת טעות"]', 'משפחת תיקון');
await stranger.click('[aria-label="שמירת השם"]');
await stranger.waitForTimeout(2000);
check('the name we gave them is ours to correct',
  rows('Households').some((r) => r[1] === 'משפחת תיקון'));
check('and correcting it is a row, not an edit', rows('Households').length === beforeTypo + 2);

await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=משפחת תיקון');
const fixed = stranger.locator('#families li').filter({ hasText: 'משפחת תיקון' }).last();
await fixed.getByRole('button', { expanded: false }).first().click();
await stranger.click('text=מחיקת המשפחה');
check('deleting asks before it does it', await stranger.isVisible('text=כן, למחוק'));
await stranger.click('text=כן, למחוק');
await stranger.waitForTimeout(2000);
await stranger.reload();
await stranger.waitForSelector('text=המעגלים שלי');
check('a family nobody joined can be taken back',
  !(await stranger.isVisible('text=משפחת תיקון')));
check('and the tab only grew — switched off, never erased',
  rows('Households').length === beforeTypo + 3 &&
    rows('Households').at(-1)[2] === 'FALSE');

// ── correcting our own family's name ────────────────────────────────────────
// The name is often not ours to begin with — somebody added us from a name in
// their phone — so this is a correction, and it lives on the row that shows the
// name rather than behind the menu under it.
const beforeRename = rows('Households').length;
await stranger.goto(`${BASE}/families`);
await stranger.waitForSelector('text=הבית שלנו');
// Behind the row, which opens like a family's does. On the row itself, a line
// about one household read as a row of controls.
check('our own house says it has something under it',
  await stranger.isVisible('[aria-label="מה אפשר לעשות עם הבית שלנו"]'));
check('and keeps it there until asked',
  !(await stranger.isVisible('text=שינוי שם המשפחה')));
await stranger.click('[aria-label="מה אפשר לעשות עם הבית שלנו"]');
await stranger.click('text=שינוי שם המשפחה');
await stranger.fill('input[name=householdName]', 'רן ומיכל ברק-שגיא');
await stranger.click('text=/^שמירה/');
await stranger.waitForTimeout(2000);
await stranger.reload();
await stranger.waitForSelector('text=המעגלים שלי');
check('renaming our family shows the new name',
  (await stranger.innerText('main')).includes('רן ומיכל ברק-שגיא'));
// The tab only grows, so a rename is a second row for the same id. The reader
// has to collapse them: without that the family appears once per name it has
// ever had, on every screen that lists households.
check('and it is a row, not an edit', rows('Households').length === beforeRename + 1);
const named = rows('Households').filter((r) => r[1].includes('רן ומיכל'));
check(`while the old name is gone from the app (${named.length} rows for one family)`,
  named.length === 2 && !(await stranger.innerText('main')).includes('רן ומיכל ברק\n'));
const listed = await stranger.$$eval('#families li button > span.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`and every family is listed once (${listed.length})`,
  new Set(listed).size === listed.length);

// A family already in the app has no errand on its row: nothing to invite them
// to, and no way back in to hand them, because getting in is a number.
const dadRow = stranger.locator('#families li').filter({ hasText: 'אבא ואמא' }).last();
check('a family already in the app is offered no link at all',
  (await dadRow.getByRole('button', { name: /הזמנה למשפחה/ }).count()) === 0 &&
    (await dadRow.getByRole('button', { name: 'עוד' }).count()) === 0);
await stranger.close();

// ── the circle is hidden until you answer ────────────────────────────────────
// ── a number is the whole of signing in ─────────────────────────────────────
// Nothing has to vouch for the device. Typing the number a household is known
// by signs you in as that household, on any phone, with no link involved.
const dad = await open();
await dad.goto(BASE);
await dad.fill('input[name=phone]', DAD);
await dad.click('button[type=submit]');
// Not the title: "איפה אתם בחג?" heads the sign-in form as well as the question
// behind it, so waiting on it proves nothing. The tab bar exists only once
// somebody is in.
await dad.waitForSelector('nav');
check('a known number signs in on a new device, with nothing to vouch for it',
  await dad.isVisible('nav'));
check('and lands in that household',
  (await dad.innerText('button[aria-haspopup="menu"]')).includes('אבא ואמא'));
// Saturday is "שבת", with no "יום" in front of it.
check('the holiday carries its weekday', /(יום \S+|שבת) · \d/.test(await dad.innerText('header')));
check('nobody else is shown before you answer', !(await dad.isVisible('text=איפה כולם')));
// Before answering is exactly when a missing family is noticed, and the circle
// card that carries the other one does not exist yet — so it stands alone here,
// as the same ＋ and not as a line of underlined text pointing somewhere else.
check('adding is reachable before answering, not only after',
  await dad.isVisible('text=הוספת משפחה'));
check('and it is the ＋, a thumb under the last answer',
  await dad.isVisible('main button:has-text("הוספת משפחה") svg'));
// But what answering buys is said before it is asked for — and only to somebody
// with a circle to reveal, since it is a promise the next screen has to keep.
check('answering is worth something, and says so before you do it',
  /כשתענו, תוכלו לראות כאן/.test(await dad.innerText('main')));

// ── us hosting looks the same wherever it is said ───────────────────────────
// A circle's colour follows a family across every screen. Hosting had no such
// mark at all, which left the one answer that is about our own table looking
// like any other. The candle from the app's mark now carries it — a shape, not
// only a colour, because a circle can be the same warm gold and never a candle.
const candle = 'svg path[d^="M12 2 C14.8"]';
check('the button that says the table is ours wears the mark',
  await dad.isVisible(`main button:has-text("אנחנו מארחים") ${candle}`));

await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=איפה כולם');
check('answering reveals where everyone is', await dad.isVisible('text=איפה כולם'));
check('and the answer itself carries the same mark',
  await dad.isVisible(`.celebrate-card ${candle}`));
check('on a card tinted for it, not the plain one every other answer gets',
  await dad.$eval('.celebrate-card', (el) =>
    getComputedStyle(el).backgroundColor !== getComputedStyle(document.body).backgroundColor &&
    el.style.backgroundColor !== '',
  ));
check('and the circle lists the other families', await dad.isVisible('text=דנה ויוסי'));

// ── answering for a family that will not open the app ───────────────────────
// The grandfather, the uncle who does not do phones: anyone in the circle can
// say where they are, the way anyone in the family group chat would.
const sisterRow = dad.locator('section:has-text("איפה כולם") li', { hasText: 'אחות ובעלה' });
check('a family that has not answered can be answered for',
  await sisterRow.getByText('לענות בשבילם').isVisible());
await sisterRow.getByText('לענות בשבילם').click();
await sisterRow.getByRole('button', { name: 'לא מגיעים' }).click();
await dad.waitForTimeout(1800);
const proxied = rows('Answers').at(-1);
check(`and it is written for them, credited to who said it (${proxied[5]} by ${proxied[4]})`,
  proxied[5] === 'hh_sister' && proxied[4] === '+972501234567' && proxied[2] === 'away');
check('the list shows it, and says it was said for them',
  /לא מגיעים/.test(await sisterRow.innerText()) && /בשבילם/.test(await sisterRow.innerText()));
check('and what was said for them can still be corrected',
  await sisterRow.getByText('לתקן בשבילם').isVisible());

// The commonest thing to say for a family that will not open the app is that
// they are coming to us, so we have to be on the list of places they can be.
await sisterRow.getByText('לתקן בשבילם').click();
await sisterRow.getByRole('button', { name: 'אצל…' }).click();
const placesForThem = await sisterRow
  .locator('select[name=hostHouseholdId] option')
  .allTextContents();
check(`answering for them can say they are at ours (${placesForThem.join(', ')})`,
  placesForThem.some((t) => t.trim() === 'אבא ואמא'));
check('and never at their own house', !placesForThem.includes('אחות ובעלה'));
// One way back, meaning one thing. An arrow that closed the whole form and a
// "חזרה" that went back one step read as the same word twice.
check('with one way back, not two',
  (await sisterRow.getByRole('button', { name: 'חזרה' }).count()) === 1);
await sisterRow.getByRole('button', { name: 'חזרה' }).click();
check('which steps back rather than closing it',
  await sisterRow.getByRole('button', { name: 'אצל…' }).isVisible());
await sisterRow.getByRole('button', { name: 'חזרה' }).click();
// Reaching adding from here without a second copy of the thing itself — and
// attached to the list it is about, since a family missing from those rows is
// the reason to go and add one.
const circleCard = dad.locator('section:has-text("איפה כולם")').first();
check('adding is a link inside the list it is about, not a second form',
  await circleCard.locator('a[href="/families"]').isVisible());
check('and it is a ＋ with two words, not a sentence',
  (await circleCard.locator('a[href="/families"]').innerText()).trim() === 'הוספת משפחה');
// A reminder goes to a circle's group chat, so with no circle there is nobody
// to send one to and nothing is offered.
check('no circle, no reminder to send', (await dad.$$('#reminders')).length === 0);
check('and the form itself is not duplicated here',
  (await dad.$$('main input[name=familyName]')).length === 0);

// ── invite a family that is not in the app at all ────────────────────────────
await dad.click('nav >> text=המעגלים');
await dad.waitForURL('**/families');
check('the tab bar reaches the circles screen', await dad.isVisible('text=המעגלים שלי'));
// Put them on the list by name, then send the link made on their row. Every
// invitation in the app now says who it is for — this one names a family, a
// circle's names a circle — so nobody opens a link and lands as a second copy
// of a household that is already there.
const beforeNewcomer = rows('Households').length;
await dad.click('[aria-label="הוספת משפחה"]');
await dad.waitForSelector('input[name=familyName]');
await dad.fill('input[name=familyName]', 'דנה ויוסי לוי');
await dad.click('form:has(input[name=familyName]) button[type=submit]');
await dad.waitForSelector('text=נוספו, וכבר נבחרו');
await dad.waitForTimeout(1500);
check('a family added by name is one new household',
  rows('Households').length === beforeNewcomer + 1);
const madeFor = await linkFromRow(dad, 'דנה ויוסי לוי');
check('the invite is a family invite', inv(madeFor, 'kind').trim() === 'family');
check('and it names the family it was made for',
  inv(madeFor, 'for_household_id') !== '');
const token = inv(madeFor, 'token');

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
// The link says which family they are, so the name is already written and open
// to correction — no list of strangers to find themselves in, and no family
// name to invent.
check('the family they were invited as is already filled in',
  (await newcomer.inputValue('input[name=householdName]')) === 'דנה ויוסי לוי');
check('and there is nobody else to pick out of a list',
  !(await newcomer.isVisible('select[name=claimHouseholdId]')));
check('a way out exists for a number typed wrong',
  await newcomer.isVisible('text=זה לא המספר שלי — יציאה'));
check('and judges nobody else on the way in',
  (await newcomer.$$('input[name=share]')).length === 0);

await newcomer.fill('input[name=firstName]', 'דנה');
await newcomer.fill('input[name=surname]', 'לוי');
const joinButtons = await newcomer.$$eval('form button[type=submit]', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`joining a circle is asked, not assumed (${joinButtons.length} answers)`,
  joinButtons.length === 2 && joinButtons.some((t) => t.includes('בלי להתחבר')));
await newcomer.click('text=/^סיום/');
await newcomer.waitForSelector('text=איפה אתם בחג?');
check('the newcomer is in', rows('Households').some((r) => r[1] === 'דנה ויוסי לוי'));
// Ids are handed out once and never again. A deleted household leaves its
// connections, answers and circle rows behind on the tabs, all naming its id —
// so a family created afterwards that took the id back would open the app
// inside somebody else's circle.
check(`and takes a fresh id, not the deleted family's (${typoId})`,
  rows('Households').find((r) => r[1] === 'דנה ויוסי לוי')[0] !== typoId);
check(`and opens no second household beside the one they were invited as (${rows('Households').length - beforeNewcomer})`,
  rows('Households').length === beforeNewcomer + 1);

// ── they arrive with the families they ticked, and only those ────────────────
await newcomer.click('text=מתארחים אצל…');
await newcomer.waitForSelector('select[name=hostHouseholdId]');
const options = await newcomer.$$eval('select[name=hostHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => t !== 'בחרו משפחה'),
);
check(`the newcomer starts with the family that invited them (${options.join(', ') || 'none'})`,
  options.includes('אבא ואמא'));

// ── circles: the only way a family reaches anybody's list ───────────────────
// The newcomer came in on dad's family link, so they have dad and nobody else.
// Dad's own families are not theirs, and nothing offers them: a circle is how
// dad says these people belong together, and it is the only way to say it.
await newcomer.goto(`${BASE}/families`);
await newcomer.waitForSelector('text=המעגלים שלי');
const beforeCircle = (await familiesByGroup(newcomer)).map((f) => f.name);
check(`the inviter's families are not handed over with the invite (${beforeCircle.join(', ')})`,
  beforeCircle.length === 1 && beforeCircle[0].includes('אבא ואמא'));

const newcomerId = rows('Households').find((r) => r[1] === 'דנה ויוסי לוי')[0];
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המעגלים שלנו');
await dad.click('[aria-label="מעגל חדש"]');
// The other half of the same contrast, said where a circle is named.
check('and naming a circle says it is a group of households',
  /קבוצה של כמה משקי בית/.test(await dad.innerText('main')));
await dad.fill('input[name=name]', 'צד אבא');
// By household id rather than by name: two families here are called דנה ויוסי
// and דנה ויוסי לוי, and a text match would take whichever came first.
for (const id of ['hh_a', 'hh_brother', 'hh_sister', newcomerId]) {
  await dad.click(`input[type=checkbox][value="${id}"]`);
}
await dad.click('text=יצירת המעגל');
await dad.waitForTimeout(2500);

const circleRows = rows('Circles');
check(`a circle is one row per household, ours among them (${circleRows.length})`,
  circleRows.length === 5 && circleRows.some((r) => r[1] === 'hh_parents' && r[2] === 'add'));
check('with a colour chosen rather than asked for', circleRows.every((r) => r[4]));
check('and every row says who put them there',
  circleRows.every((r) => r[5] === 'hh_parents'));

await dad.reload();
await dad.waitForSelector('text=צד אבא');
const inCircle = (await familiesByGroup(dad)).filter((f) => f.group.includes('צד אבא'));
check(`the four families in it are gathered under its name (${inCircle.map((f) => f.name).join(', ')})`,
  inCircle.length === 4);
// And the colour runs down the edge of each of their rows, the same as on the
// holiday screen — a strip left transparent is a family in no circle at all.
const striped = await dad.$$eval('#families [data-circle-strip]', (els) =>
  els.filter((e) => e.style.background && e.style.background !== 'transparent').length,
);
check(`and their rows carry its colour (${striped})`, striped === 4);
// Inviting the circle is the errand people come for most, so it is on the row
// rather than behind opening it.
check('the circle carries its invitation on the row itself',
  await dad.isVisible('#circles [aria-label="הזמנה לצד אבא בוואטסאפ"]'));

// The list is ordered by the circles rather than scattered: families in more of
// them first, and the same combination together.
await dad.click('[aria-label="מעגל חדש"]');
await dad.fill('input[name=name]', 'צד אמא');
for (const id of ['hh_a', 'hh_sister']) {
  await dad.click(`input[type=checkbox][value="${id}"]`);
}

// A family added while filling the form in appears once. Adding one revalidates
// this screen, so it arrives twice — from the field here and from the server's
// own list a moment later — and both rows carried the same household id.
const beforeNewHere = rows('Households').length;
await dad.fill('input[aria-label="משפחה חדשה למעגל"]', 'שכנים מלמטה');
await dad.click('[aria-label="הוספה — משפחה חדשה למעגל"]');
for (let i = 0; i < 40 && rows('Households').length === beforeNewHere; i += 1) {
  await dad.waitForTimeout(250);
}
await dad.waitForTimeout(2000);
const boxes = await dad.$$eval('form:has(input[name=name]) label', (els) =>
  els.map((e) => e.innerText.trim()).filter(Boolean),
);
check(`a family added while making a circle is listed once (${boxes.filter((b) => b.includes('שכנים')).length})`,
  boxes.filter((b) => b.includes('שכנים מלמטה')).length === 1);
check('and comes ticked, because adding it here said it belongs',
  await dad.locator('form:has(input[name=name]) label', { hasText: 'שכנים מלמטה' })
    .locator('input[type=checkbox]')
    .isChecked());

await dad.click('text=יצירת המעגל');
await dad.waitForTimeout(2500);
await dad.reload();
await dad.waitForSelector('text=צד אמא');
const ordered = await familiesByGroup(dad);
check(`families in more circles come first (${ordered.map((o) => `${o.name}:${o.circles}`).join(', ')})`,
  ordered.every((row, i) => i === 0 || ordered[i - 1].circles >= row.circles));
// דנה ויוסי and אחות ובעלה are in both circles, so they head the list; אח ואשתו
// is in one and follows them rather than sitting between.
check('and two circles put those families at the head',
  ordered[0].circles === 2 && ordered[1].circles === 2);

// Adding a family says which circle it belongs to at the same time — whoever
// adds them knows it then, not on a later screen.
await dad.click('[aria-label="הוספת משפחה"]');
await dad.waitForSelector('input[name=familyName]');
check('adding a family offers the circles it could belong to',
  await dad.isVisible('text=לאיזה מעגל?'));
const beforeWithCircle = rows('Households').length;
await dad.fill('input[name=familyName]', 'שכנים מהבניין');
await dad.click('form:has(input[name=familyName]) label:has-text("צד אבא") input[type=checkbox]');
await dad.click('form:has(input[name=familyName]) button[type=submit]');
await dad.waitForTimeout(2500);
check('a family added with a circle ticked is one new household',
  rows('Households').length === beforeWithCircle + 1);
const neighboursId = rows('Households').find((r) => r[1] === 'שכנים מהבניין')?.[0];
check('and lands in that circle in the same breath',
  Boolean(neighboursId) &&
    rows('Circles').some((r) => r[1] === neighboursId && r[2] === 'add' && r[3] === 'צד אבא'));

// Leaving is not a grey ✕ beside the pencil: it takes us out of something
// other people are in, so it lives inside the editor, marked as what it is,
// and it asks first.
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=צד אבא');
await dad.click('#circles button:has-text("צד אבא")');
await dad.waitForSelector('text=יציאה מהמעגל');
check('leaving is not offered from the row itself',
  (await dad.locator('[aria-label="לצאת מהמעגל צד אבא"]').count()) === 0);
await dad.click('text=יציאה מהמעגל');
check('leaving a circle asks before it does it',
  await dad.isVisible('text=כן, לצאת מהמעגל'));
check('and says that it is us being taken out, not the circle deleted',
  /מוציאה .*אתכם.* מהמעגל/s.test(await dad.innerText('#circles')));
await dad.click('text=ביטול');
check('and can be thought better of', !(await dad.isVisible('text=כן, לצאת מהמעגל')));
// A family the circle needs that is on nobody's list yet, added from here
// rather than by leaving the circle half-filled.
const beforeInCircle = rows('Households').length;
await dad.fill('#circles input[aria-label="משפחה חדשה למעגל"]', 'בני דודים מהצפון');
await dad.click('#circles [aria-label="הוספה — משפחה חדשה למעגל"]');
await dad.waitForTimeout(2500);
check('a family can be added from inside the circle',
  rows('Households').length === beforeInCircle + 1 &&
    rows('Households').some((r) => r[1] === 'בני דודים מהצפון'));
const cousinsId = rows('Households').find((r) => r[1] === 'בני דודים מהצפון')[0];
check('and it lands in that circle, not only on the list',
  rows('Circles').some((r) => r[1] === cousinsId && r[2] === 'add'));
// Ticked, because adding it here already said it belongs. The editor used to
// read its membership once and never again, so a family added below sat
// unticked and looked as though it had gone nowhere.
check('and shows as in the circle without being ticked by hand',
  await dad.locator('#circles label', { hasText: 'בני דודים מהצפון' })
    .locator('input[type=checkbox]')
    .isChecked());
await dad.click('#circles button:has-text("צד אבא")');

// Being put in a circle is joining it. The families in it arrive on the
// newcomer's own list, whole — no offers to accept one at a time, which is what
// "we are all one circle" meant in the first place.
await newcomer.reload();
await newcomer.waitForSelector('text=המעגלים שלי');
const mineNow = await newcomer.$$eval('#families li button > span.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`the circle's families arrive on the list, whole (${mineNow.join(', ')})`,
  ['דנה ויוסי', 'אח ואשתו', 'אחות ובעלה'].every((n) => mineNow.includes(n)));
check('while a family outside the circle is still not on the list',
  !mineNow.includes('רן ומיכל ברק-שגיא'));
// Both ways: the families in it can see the newcomer too.
check('and the circle sees them back',
  rows('Connections').some((r) => r[0] === 'hh_brother' && r[1] === newcomerId && r[2] === 'add'));

// ── the circle's own invitation ─────────────────────────────────────────────
// The message says whoever opens it joins everybody, and now the link says so
// too: it carries the circle rather than only who sent it. Before this it was
// the sender's general link with the circle's name written into the words, and
// it introduced the sender alone.
const beforeCircleInvite = rows('Invites').length;
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המעגלים שלנו');
// The tap leaves for WhatsApp, and what it leaves with is the message. Read off
// the request rather than the address bar: the hop out is a real navigation to
// a host this machine cannot reach, so it is asked for and never arrives.
let waMessage = '';
dad.on('request', (r) => {
  if (r.url().includes('wa.me')) waMessage = decodeURIComponent(r.url());
});
await dad.click('[aria-label="הזמנה לצד אבא בוואטסאפ"]');
for (let i = 0; i < 40 && rows('Invites').length === beforeCircleInvite; i += 1) {
  await dad.waitForTimeout(250);
}
check('the circle mints an invitation of its own', rows('Invites').length === beforeCircleInvite + 1);
const circleInvite = rows('Invites').at(-1);
check(`and the message says whoever opens it joins everybody (${waMessage.slice(-60)})`,
  waMessage.includes('מצטרף לכולנו') && waMessage.includes('צד אבא'));
check(`and the link carries the circle, not just the sender (${inv(circleInvite, 'kind')})`,
  inv(circleInvite, 'kind') === 'circle' && inv(circleInvite, 'for_circle_id') !== '');
// Reusable on purpose: a circle link is pasted into a group, and a link that
// died on the first opener would bring in one family out of a chat full of them.
check('and it is aimed at nobody in particular', inv(circleInvite, 'for_phone') === '');

// What the opener is shown: this circle, and the families in it. The sender's
// other families are not part of this invitation, and a list of strangers to
// pick yourself out of is how one family becomes two.
const guest = await open();
await guest.goto(`${BASE}/join/${inv(circleInvite, 'token')}`);
await guest.waitForSelector('input[name=phone]');
// Before a number is asked for. A name and a link are not enough to decide by:
// somebody handed this in a family group has to be told what it is, and what
// opening it does.
const doorstep = await guest.innerText('main');
check(`the door says what this is before asking for a number (${doorstep.split('\n')[2] ?? ''})`,
  doorstep.includes('מי מארח') && doorstep.includes('צד אבא') &&
    doorstep.includes('מצטרף לכל המעגל'));
await guest.fill('input[name=phone]', COUSIN);
await guest.click('button[type=submit]');
await guest.waitForSelector('input[name=firstName]');
check('the invitation names the circle it is for',
  await guest.isVisible('text=הזמינו אתכם למעגל') && await guest.isVisible('text=צד אבא'));
const offered = await guest.$$eval('select[name=claimHouseholdId] option', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`the circle's families are there to choose from (${offered.join(', ')})`,
  ['דנה ויוסי', 'אח ואשתו', 'אחות ובעלה'].every((n) => offered.includes(n)));
// רן ומיכל is on dad's list and in no circle with him — the one family that
// proves this list is the circle's and not the sender's.
check('and the sender\'s families outside the circle are not',
  !offered.some((n) => n.includes('רן ומיכל')));
check('being somebody new is still the first answer', offered.includes('אנחנו משפחה חדשה'));

// Joining is joining the circle, so the whole of it arrives at once — which is
// the promise the message in the group chat makes.
await guest.fill('input[name=firstName]', 'תמר');
await guest.fill('input[name=surname]', 'כהן');
await guest.fill('input[name=householdName]', 'תמר ואיתי כהן');
await guest.click('text=/^סיום/');
await guest.waitForSelector('text=איפה אתם בחג?');
await guest.goto(`${BASE}/families`);
await guest.waitForSelector('text=המעגלים שלי');
const guestList = await guest.$$eval('#families li button > span.font-semibold', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`one link, and the whole circle is on their list (${guestList.join(', ')})`,
  ['אבא ואמא', 'דנה ויוסי', 'אח ואשתו', 'אחות ובעלה'].every((n) => guestList.includes(n)));
const guestCircles = await guest.$$eval('#circles li', (els) =>
  els.map((e) => e.innerText.split('\n')[0].trim()),
);
check(`and the circle itself is theirs now (${guestCircles.join(', ')})`,
  guestCircles.some((c) => c.includes('צד אבא')));
// Both ways, like every other introduction here.
const guestId = rows('Households').find((r) => r[1] === 'תמר ואיתי כהן')[0];
check('and the circle has them back',
  rows('Connections').some((r) => r[0] === 'hh_sister' && r[1] === guestId && r[2] === 'add'));
await guest.close();

// ── the reminder on the holiday screen is one per circle ────────────────────
// It used to be a single nudge carrying the app's plain address: it named no
// circle, so it introduced nobody, and anybody not yet registered who followed
// it arrived as a household of their own — out of a message about where the
// family was eating.
await dad.goto(BASE);
await dad.waitForSelector('text=איפה כולם');
const nudges = await dad.$$eval('#reminders button', (els) =>
  els.map((e) => e.innerText.trim()).filter(Boolean),
);
check(`a reminder is offered per circle (${nudges.join(', ')})`,
  nudges.includes('צד אבא') && nudges.includes('צד אמא'));
check('each in its own colour, so they are told apart at a glance',
  (await dad.$$eval('#reminders button span[style*="background"]', (els) =>
    new Set(els.map((e) => e.getAttribute('style'))).size)) === 2);

// What it sends: the holiday, and the circle's own link — not the app's.
const beforeNudge = rows('Invites').length;
let nudgeText = '';
dad.on('request', (r) => {
  if (r.url().includes('wa.me')) nudgeText = decodeURIComponent(r.url());
});
await dad.click('#reminders button:has-text("צד אבא")');
for (let i = 0; i < 40 && rows('Invites').length === beforeNudge; i += 1) {
  await dad.waitForTimeout(250);
}
const nudgeInvite = rows('Invites').at(-1);
check('and sending one makes that circle a link of its own',
  inv(nudgeInvite, 'kind').trim() === 'circle' && inv(nudgeInvite, 'for_circle_id') !== '');
check(`the message invites to the holiday (${nudgeText.split('\n')[0].slice(-46)})`,
  nudgeText.includes('מי מארח') && nudgeText.includes('צד אבא'));
// No counts: "ענו 3 מתוך 10" was true of the sender's list and of nobody
// else's, so it read as a claim about a list the reader could not see.
check('and counts nobody\'s families', !/\d+\s*מתוך\s*\d+/.test(nudgeText));
check('and carries the circle link, never the app on its own',
  nudgeText.includes(`/join/${inv(nudgeInvite, 'token')}`));

// ── the families in no circle, where the open things are ────────────────────
// A family outside every circle is invisible in all the places a circle does
// the work: no colour on any row, no reminder, and no circle link that carries
// them. The only sign was a row without a dot, which reads as an absence rather
// than as something to fix.
await dad.goto(BASE);
await dad.waitForSelector('nav');
const loose = await dad.$$eval('section:has-text("עוד לא במעגל") li', (els) =>
  els.map((e) => e.innerText.split('\n')[0].trim()),
);
check(`families in no circle are named beside the next thing (${loose.join(', ')})`,
  loose.length > 0 && loose.some((n) => n.includes('רן ומיכל')));
const looseRow = dad.locator('section:has-text("עוד לא במעגל") li', { hasText: 'רן ומיכל' });
check('and the circles are there to drop them into',
  await looseRow.locator('button:has-text("צד אבא")').isVisible());
// Started with them in it, rather than making the circle and coming back to
// find them again.
const startsWith = await looseRow.locator('a[href*="/families?with="]').getAttribute('href');
const looseId = decodeURIComponent((startsWith ?? '').split('with=')[1] ?? '');
check(`a new circle can be started with them (${looseId})`, looseId !== '');

const beforeDrop = rows('Circles').length;
await looseRow.locator('button:has-text("צד אבא")').click();
for (let i = 0; i < 40 && rows('Circles').length === beforeDrop; i += 1) {
  await dad.waitForTimeout(250);
}
check('one tap puts them in a circle',
  rows('Circles').some((r) => r[1] === looseId && r[2] === 'add' && r[3] === 'צד אבא'));
await dad.reload();
await dad.waitForSelector('nav');
check('and they stop being one of the loose ones',
  !(await dad.isVisible('section:has-text("עוד לא במעגל") li:has-text("רן ומיכל")')));

// The other way out of it: the form opens with them already ticked.
const stillLoose = await dad.$$eval('section:has-text("עוד לא במעגל") a[href*="/families?with="]', (els) =>
  els.map((e) => e.getAttribute('href')),
);
if (stillLoose.length > 0) {
  const id = decodeURIComponent(stillLoose[0].split('with=')[1] ?? '');
  await dad.goto(`${BASE}${stillLoose[0]}`);
  await dad.waitForSelector('input[name=name]');
  check(`the new-circle form opens with that family ticked (${id})`,
    await dad.isChecked(`input[name=member][value="${id}"]`));
} else {
  check('the new-circle form opens with that family ticked (none left loose)', true);
}

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
// They answered themselves, so nobody else gets to change it.
const ownRow = dad.locator('section:has-text("איפה כולם") li', { hasText: 'דנה ויוסי לוי' });
check('an answer a family gave itself is not offered for correction',
  !(await ownRow.getByText(/בשבילם/).isVisible().catch(() => false)));

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

const newcomerHousehold = rows('Households').find((r) => r[1] === 'דנה ויוסי לוי')[0];
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

// ── who else is at the meal you said you are going to ───────────────────────
// Hosting always said who was coming. Being a guest said nothing, though the
// same answers hold it: everyone who named the same host.
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.waitForSelector('select[name=hostHouseholdId]');
await dad.selectOption('select[name=hostHouseholdId]', { label: 'דנה ויוסי לוי' });
await dad.click('button[type=submit]');
await dad.waitForSelector('text=מתארחים אצל דנה ויוסי לוי');
check('a guest with nobody alongside them is told so, not left guessing',
  await dad.isVisible('text=עוד אף אחד לא אמר שהוא מגיע לשם'));

// Say, for the family that will not open the app, that they are going there too.
const alongside = dad.locator('section:has-text("איפה כולם") li', { hasText: 'אחות ובעלה' });
await alongside.getByRole('button', { name: 'לתקן בשבילם' }).click();
await alongside.getByRole('button', { name: 'אצל…' }).click();
await alongside.locator('select[name=hostHouseholdId]').selectOption({ label: 'דנה ויוסי לוי' });
await alongside.getByRole('button', { name: 'שמירה' }).click();
await dad.waitForTimeout(1800);
await dad.reload();
check('and once somebody else names the same host, the guest sees them too',
  await dad.isVisible('text=מגיעים לשם גם'));
check('by name, the same list hosting has always had',
  /אחות ובעלה/.test(await dad.locator('.celebrate-card').innerText()));

await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=אנחנו מארחים');
await dad.click('text=אנחנו מארחים');
await dad.waitForSelector('text=מגיעים אליכם');

// ── adding a family from the question screen ─────────────────────────────────
// The case this exists for: answering on the night, and the host is not listed.
const beforeAdd = rows('Households').length;
await dad.goto(BASE);
await dad.click('text=שינוי תשובה');
await dad.waitForSelector('text=מתארחים אצל…');
await dad.click('text=מתארחים אצל…');
await dad.click('main button:has-text("הוספת משפחה")');
await dad.fill('input[name=familyName]', 'כהן');
await dad.click('text=הוספה');
await dad.waitForTimeout(1500);
check('a family can be added while answering', rows('Households').length === beforeAdd + 1);
// Most families here are typed in by somebody else, so "who made this row" is
// a different question from "whose household is it" — and it is the one worth
// asking when two rows turn out to be the same family.
const madeRow = rows('Households').at(-1);
const madeCols = colsOf('Households');
const madeBy = madeRow[madeCols.indexOf('created_by')];
const madeAt = madeRow[madeCols.indexOf('created_at')];
check(`a new family records who typed it in (${madeBy})`, madeBy === '+972501234567');
check(`and when (${madeAt})`, !Number.isNaN(Date.parse(madeAt ?? '')));

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

// ── answering for a family offers what *they* could say, not what we could ──
// כהן was added by us a moment ago and is connected to nobody else, so אחות
// ובעלה have never met them. Offering כהן when answering for אחות ובעלה was a
// question with an impossible answer in it: the server refuses that answer, so
// picking it got an error rather than a saved reply.
const forSister = dad.locator('section:has-text("איפה כולם") li', { hasText: 'אחות ובעלה' });
await forSister.getByRole('button', { name: /בשבילם/ }).click();
await forSister.getByRole('button', { name: 'אצל…' }).click();
const theirs = await forSister.locator('select[name=hostHouseholdId] option').allTextContents();
check(`answering for them offers only families they know (${theirs.join(', ')})`,
  !theirs.some((t) => t.trim() === 'כהן'));
// And still offers the commonest answer there is for a family that will not
// open the app: that they are coming to us.
check('and still offers us, whom they do know',
  theirs.some((t) => t.trim() === 'אבא ואמא'));
check('and never themselves', !theirs.some((t) => t.trim() === 'אחות ובעלה'));
await forSister.getByRole('button', { name: 'חזרה' }).click();
await forSister.getByRole('button', { name: 'חזרה' }).click();

await dad.goto(`${BASE}/families`);
check('a family nobody has signed up from says so plainly',
  await dad.isVisible('text=עוד לא נרשמו לאפליקציה'));

// The same grouping the holiday screen draws, from the same sort: this list was
// already ordered by circle and showed it only as a row of small dots.
const grouped = await dad.$$eval('#families [data-circle-group]', (els) =>
  els.map((e) => e.textContent.trim()),
);
check(`the families list is grouped by circle, with the circle named (${grouped.join(' / ')})`,
  grouped.some((t) => t.includes('צד אבא')));
check('and families in none of them are said to be so',
  (await dad.innerText('#families')).includes('עוד לא במעגל'));

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

// Choosing from contacts sits beside typing a name, at the head of the list
// both of them fill — and it is the only way in now, since it takes several at
// a time where the one it replaced took exactly one.
await dad.goto(`${BASE}/families`);
await dad.click('[aria-label="הוספת משפחה"]');
check('the picker appears when the browser has one', await dad.isVisible('text=בחירה מאנשי הקשר'));
check('and it is the only one', (await dad.$$('text=בחירה מאנשי הקשר')).length === 1);
await dad.click('text=בחירה מאנשי הקשר');
await dad.waitForSelector('text=/נוספו:|כבר ברשימה:/');
check('a contact already in the app is reported as already there',
  await dad.isVisible('text=כבר ברשימה: דנה ויוסי לוי'));
// A contact nobody has signed in from is not just an invite to send: it is
// offered as a family to add, so the name in our phone becomes a family we can
// answer for — after we have looked at the list.
// By the field itself, not by text on the row: the name lives in an input now,
// and a text match would find the unrelated family called שכנים מהבניין.
const nameBox = dad.locator('input[aria-label^="שם המשפחה עבור"]');
check('a contact who is not is offered for adding', (await nameBox.count()) === 1);
check('and nothing is written before we confirm',
  !rows('Households').some((r) => r[1] === 'שכנים'));
const beforeContacts = rows('Households').length;
// "שכנים" is a note to self in an address book, not what a family is called,
// and everyone in the circle will read whatever goes in — so it can be put
// right before anybody else sees it.
check('a name out of the address book can be corrected first',
  (await nameBox.inputValue()) === 'שכנים');
await nameBox.fill('משפחת שכנוביץ');
await dad.click('button:has-text("הוספת המשפחה")');
await dad.waitForSelector('text=נוספו: משפחת שכנוביץ');
check('confirming adds them as a family',
  rows('Households').length === beforeContacts + 1);
const neighbours = rows('Households').find((r) => r[1] === 'משפחת שכנוביץ');
check('under the name we corrected, not the one in the phone',
  Boolean(neighbours) && !rows('Households').some((r) => r[1] === 'שכנים'));
check('and their number tied to it',
  rows('People').some((r) => r[0] === '+972540001122' && r[2] === neighbours[0]));
check('and connected to us, so we can answer for them',
  rows('Connections').some((r) => r[0] === 'hh_parents' && r[1] === neighbours[0] && r[2] === 'add'));

// ── stepping between holidays still works ────────────────────────────────────
// Rosh Hashana is three meals on three consecutive days, and the arrow walks
// them in order: the eve, the day after it, then the second eve.
await dad.goto(BASE);
const firstHoliday = (await dad.innerText('.font-display')).trim();
await dad.click('[aria-label="החג הבא"]');
await dad.waitForURL(/\?h=rosh_hashana_2026/);
const secondHoliday = (await dad.innerText('.font-display')).trim();
check(`the arrow moves to the next holiday (${firstHoliday} → ${secondHoliday})`,
  secondHoliday !== firstHoliday);
check('and the day of Rosh Hashana is the day after its eve',
  firstHoliday.includes('ערב ראש השנה') && secondHoliday.includes('יום ראש השנה'));

await dad.click('[aria-label="החג הבא"]');
await dad.waitForURL(/\?h=rosh_hashana_ii_2026/);
const thirdHoliday = (await dad.innerText('.font-display')).trim();
check(`and the second eve is the day after that (${thirdHoliday})`,
  thirdHoliday.includes('ערב ראש השנה ב'));

// ── swiping back into holidays that have already been ───────────────────────
// The screen used to hold only what was still to come, so a holiday was gone
// from it the morning after. A year back is reachable now; the rest is the
// history tab's, and the far end of the strip says so.
await dad.goto(BASE);
check('the screen still opens on a holiday still to come, never on a past one',
  !(await dad.isVisible('text=חג שעבר')));

let backwards = 0;
while ((await dad.locator('[aria-label="החג הקודם"]').count()) > 0 && backwards < 20) {
  await dad.click('[aria-label="החג הקודם"]');
  await dad.waitForTimeout(400);
  backwards += 1;
}
check(`the arrow walks back into holidays that have been (${backwards} of them)`, backwards > 0);
check('and each one says so rather than leaving it to the date',
  await dad.isVisible('text=חג שעבר'));
// Read-only: correcting the past is one job and it lives in one place.
check('a past holiday cannot be answered or re-answered here',
  !(await dad.isVisible('text=שינוי תשובה')) && !(await dad.isVisible('main button:has-text("אנחנו מארחים")')));
// Nor reminded about — there is nothing left to remind anybody of.
check('and offers no reminder to send about it', (await dad.$$('#reminders')).length === 0);
check('the list of where everybody was speaks in the past tense',
  (await dad.innerText('main')).includes('איפה היו כולם'));
// The far end of a year's worth of swiping, and the way to the rest of it.
check('the end of the strip says where the rest of the history is',
  /עד כאן אפשר להחליק/.test(await dad.innerText('main')));

// The link goes to that holiday's own row, not to the top of the tab.
const backTo = await dad.getAttribute('main a[href^="/history#"]', 'href');
check(`a past holiday links to its own row in the history (${backTo})`,
  Boolean(backTo) && backTo.startsWith('/history#'));
await dad.goto(`${BASE}${backTo}`);
await dad.waitForSelector('text=איפה היינו');
await dad.waitForTimeout(600);
const landed = dad.locator(`li#${backTo.split('#')[1]}`);
check('and that row is there to land on', (await landed.count()) === 1);
check('and it is the same holiday', (await landed.innerText()).includes('ערב פסח'));

// ── the mark beside a holiday comes from the sheet ───────────────────────────
// Editing a cell is the whole configuration: no deploy, no code change.
await dad.goto(`${BASE}?h=rosh_hashana_2026`);
check('a holiday carries the mark its kind suggests',
  (await dad.innerText('main')).includes('🍯'));

// One cell, on the entry that stands for every year of it — not one cell per
// year, which is what this tab used to be.
const marked = sheet();
const emojiCol = marked.Holidays[0].indexOf('emoji');
marked.Holidays = marked.Holidays.map((r, i) =>
  i && r[0] === 'rosh_hashana' ? Object.assign([...r], { [emojiCol]: '🐟' }) : r,
);
writeFileSync(SHEET, `${JSON.stringify(marked, null, 2)}\n`, 'utf8');
await dad.waitForTimeout(SHEET_TTL_MS);
await dad.goto(`${BASE}?h=rosh_hashana_2026`);
const withOwnMark = await dad.innerText('main');
check('and a mark typed into the sheet wins over it',
  withOwnMark.includes('🐟') && !withOwnMark.includes('🍯'));

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

// The holiday screen groups by circle and so names its colours in the headings.
// This list is in date order and cannot, which left a coloured dot beside a host
// meaning nothing at all — so the names are said once, above the list.
const legend = await dad.innerText('main');
check('the colours are named here too, since the order cannot name them',
  /המעגלים שלכם/.test(legend) && /צד אבא/.test(legend) && /צד אמא/.test(legend));
check('and a holiday spent at a family carries that family\'s circles',
  (await dad.$$eval('li [aria-label^="מעגלים:"]', (e) => e.length)) > 0);

// A blank row is blank because that family was never added, so adding one has
// to be reachable from here — not on another screen, with this row to find again.
const gapRow = dad.locator('li', { hasText: 'ערב שבועות' });
await gapRow.getByText('מילוי').click();
await gapRow.getByRole('button', { name: 'התארחנו אצל…' }).click();
check('a family can be added while filling in history',
  await gapRow.getByText('לא מוצאים? הוסיפו משפחה').isVisible());
const beforeHistoryAdd = rows('Households').length;
await gapRow.getByText('לא מוצאים? הוסיפו משפחה').click();
await gapRow.locator('input[name=familyName]').fill('שגיא');
await gapRow.getByRole('button', { name: 'הוספה', exact: true }).click();
await dad.waitForTimeout(1800);
check('and adding one from history opens a household',
  rows('Households').length === beforeHistoryAdd + 1);
await dad.reload();
await dad.waitForSelector('text=איפה היינו');
const afterAdd = dad.locator('li', { hasText: 'ערב שבועות' });
await afterAdd.getByText('מילוי').click();
await afterAdd.getByRole('button', { name: 'התארחנו אצל…' }).click();
const historyHosts = await afterAdd.locator('select[name=hostHouseholdId] option').allTextContents();
check(`and they are pickable straight away (${historyHosts.length})`,
  historyHosts.some((t) => t.includes('שגיא')));
await afterAdd.getByRole('button', { name: 'חזרה' }).click();

const beforeEdit = rows('Answers').length;
const pastRow = dad.locator('li', { hasText: 'ערב פסח' });
await pastRow.getByText('עריכה').click();
// It opens on the answer that is already there — a guest — so switch first.
await pastRow.getByRole('button', { name: 'בעצם אירחנו' }).click();
await pastRow.getByRole('button', { name: 'אירחנו', exact: true }).click();
await dad.waitForTimeout(1500);
check('editing a past holiday appends rather than overwrites',
  rows('Answers').length === beforeEdit + 1);

// The same mark again, on the third screen that says it. A year we hosted has
// no other family to colour it by, so before this it was the only answered row
// here with nothing down its edge at all.
await dad.reload();
await dad.waitForSelector('text=איפה היינו');
const hosted = dad.locator('li', { hasText: 'אירחנו' }).first();
check('a year we hosted is marked the same way the holiday screen marks it',
  await hosted.locator('svg path[d^="M12 2 C14.8"]').isVisible());
check('and carries it down the edge, where a circle would put its colour',
  await hosted.locator('span[aria-hidden="true"]').first().evaluate(
    (el) => getComputedStyle(el).background.includes('rgb'),
  ));
check('and the row closes itself after saving', !(await dad.isVisible('text=שמירה')));

await dad.goto(`${BASE}/history`);
const corrected = await dad.$$eval('.tabular-nums', (els) => els.map((e) => e.textContent.trim()));
check(`the counts follow the correction (${stats.join('/')} → ${corrected.join('/')})`,
  Number(corrected[0]) === Number(stats[0]) + 1);

// ── a link sent to one person is that person's alone ─────────────────────────
const personal = await linkFromRow(dad, 'אח ואשתו');
check(`a link can be aimed at one family (${inv(personal, 'for_household_id')})`,
  inv(personal, 'for_household_id') === 'hh_brother');
const personalToken = inv(personal, 'token');

const aimed = await open();
await aimed.goto(`${BASE}/join/${personalToken}`);
await aimed.fill('input[name=phone]', '058-900-1122');
await aimed.click('button[type=submit]');
await aimed.waitForSelector('input[name=firstName]');
// The link already said which family they are, so there is nothing to name.
check('a link that names the family fills the name in for them',
  (await aimed.inputValue('input[name=householdName]')) === 'אח ואשתו');
await aimed.fill('input[name=firstName]', 'נועה');
await aimed.fill('input[name=surname]', 'אביב');
await aimed.click('text=/^סיום/');
await aimed.waitForSelector('text=איפה אתם בחג?');
await aimed.waitForTimeout(1500);
await aimed.close();
check('the link is spent once it is used',
  rows('Invites').filter((r) => inv(r, 'token') === personalToken).some((r) => inv(r, 'used_at')));
check('and made them that family rather than a new one',
  rows('People').some((r) => r[0] === '+972589001122' && r[2] === 'hh_brother'));

// Forwarded on, it must bring nobody else — but it is still not a dead end.
const forwarded = await open();
await forwarded.goto(`${BASE}/join/${personalToken}`);
await forwarded.waitForSelector('input[name=phone]');
check('and forwarding it introduces nobody',
  await forwarded.isVisible('text=כבר לא בתוקף'));
check('while still letting them into the app',
  await forwarded.isVisible('input[name=phone]'));
await forwarded.close();

// The general link is untouched by any of that.
await dad.goto(`${BASE}/families`);
await dad.waitForSelector('text=המעגלים שלי');
await dad.click('[aria-label="מה אפשר לעשות עם הבית שלנו"]');
check('our own house is invited from its own row, not from the menu',
  await dad.isVisible('text=הוספת בן בית'));
check('and the menu keeps only what belongs to nobody\'s row',
  !(await dad.isVisible('[role=menu]')));
// Nothing hands out a link that names nobody any more. Every invitation the app
// makes is for a family or for a circle, so a link opened by the wrong person
// cannot quietly put them on somebody's list as a household of their own.
const anonymous = rows('Invites').filter(
  (r) =>
    inv(r, 'kind').trim() === 'family' &&
    !inv(r, 'for_phone') &&
    !inv(r, 'for_household_id') &&
    !inv(r, 'for_circle_id'),
);
check(`no invitation is made out to nobody (${anonymous.length})`, anonymous.length === 0);

// ── an invite link cannot quietly put somebody on your list ──────────────────
// The circle's link, which is the widest one the app makes: it is meant for a
// group chat, so it is the one a stranger is most likely to be handed. Even
// that one joins nobody to anybody unless the opener says so.
const friend = await open();
await friend.goto(`${BASE}/join/${inv(circleInvite, 'token')}`);
await friend.fill('input[name=phone]', '058-111-2222');
await friend.click('button[type=submit]');
await friend.waitForSelector('input[name=firstName]');
await friend.fill('input[name=firstName]', 'חבר');
await friend.fill('input[name=surname]', 'סקרן');
await friend.fill('input[name=householdName]', 'חבר סקרן');
// Matched loosely: the button names the family that invited them.
await friend.click('text=/^להירשם בלי להתחבר/');
await friend.waitForSelector('text=איפה אתם בחג?');
await friend.waitForTimeout(1500);
const friendId = rows('Households').find((r) => r[1] === 'חבר סקרן')[0];
check('somebody who only wanted the app joins nobody',
  rows('Connections').every((r) => r[0] !== friendId && r[1] !== friendId));

// Nobody knows this household, so there is nobody to impersonate it to: it is
// not locked, and its own second device walks in.
const friendAgain = await open();
await friendAgain.goto(BASE);
await friendAgain.fill('input[name=phone]', '058-111-2222');
await friendAgain.click('button[type=submit]');
await friendAgain.waitForSelector('text=איפה אתם בחג?');
check('a household nobody knows is not locked out of its own second device',
  await friendAgain.isVisible('text=איפה אתם בחג?'));
await friendAgain.close();

// And it cannot mint a key for a family it is not part of.
await friend.goto(`${BASE}/families`);
await friend.waitForSelector('text=המעגלים שלי');
check('a stranger has no row for a family they are not connected to, so no link',
  !(await friend.isVisible('text=אבא ואמא')));
await friend.close();

// A link opened by somebody who is already where it leads is not a way in for a
// stranger — it simply takes them where they were going.
const withGroupLink = await open();
await withGroupLink.goto(`${BASE}/join/${inv(circleInvite, 'token')}`);
await withGroupLink.fill('input[name=phone]', DAD);
await withGroupLink.click('button[type=submit]');
await withGroupLink.waitForSelector('nav');
check('a circle link signs a number already in that circle in as itself',
  await withGroupLink.isVisible('nav'));
await withGroupLink.close();

// A link that has gone stale is a way in, not a wall.
const aged = sheet();
const agedCols = colsOf('Invites');
aged.Invites = aged.Invites.map((r, i) => {
  if (!i || r[agedCols.indexOf('token')] !== inv(circleInvite, 'token')) return r;
  const copy = [...r];
  copy[agedCols.indexOf('created_at')] = '2020-01-01T00:00:00.000Z';
  return copy;
});
writeFileSync(SHEET, `${JSON.stringify(aged, null, 2)}\n`, 'utf8');
await dad.waitForTimeout(SHEET_TTL_MS);
const late = await open();
await late.goto(`${BASE}/join/${inv(circleInvite, 'token')}`);
await late.waitForSelector('input[name=phone]');
check('an expired link falls back to signing in, not to a dead end',
  await late.isVisible('text=כבר לא בתוקף'));
await late.close();

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
const marks = await dad.$$eval(
  '#families a[href*="wa.me"], #families button[aria-label*="וואטסאפ"]',
  (els) => els.length,
);
check(`the families list carries no per-family marks (${marks})`, marks === 0);
// The contact picker is Chrome-on-Android only, so without this the families
// screen offers an iPhone no way to add anybody at all.
check('and a family can be added by name from the families screen',
  await dad.isVisible('[aria-label="הוספת משפחה"]'));
check('the household name is not repeated under the header',
  (await dad.$$('main [aria-hidden="true"]:text("🏡")')).length === 0);

// Telling a friend the app exists is not an invitation: it carries no token and
// introduces nobody. At the foot of every screen it sat among the things that
// do introduce people and read as one of them.
check('the app is not shared from the foot of every screen',
  !(await dad.isVisible('main >> text=/שיתוף/')));
await dad.click('[aria-haspopup=menu]');
check('and telling a friend is in the menu, and says friends',
  await dad.isVisible('[role=menu] >> text=שיתוף עם חברים'));
const friendly = await dad.getAttribute('[role=menu] a[href*="wa.me"]', 'href');
check('carrying the app itself and nobody\'s token',
  Boolean(friendly) && !decodeURIComponent(friendly).includes('/join/'));
await dad.click('[aria-haspopup=menu]');

// The holiday screen used to carry the sender's own general link beside a
// family nobody had joined — a mark that said "invite them" and handed over an
// invitation to nobody in particular. Whoever opened it arrived as a household
// of their own, beside the one the mark was about.
await dad.goto(BASE);
await dad.waitForSelector('nav');
check('no ready-made link is sitting on the holiday screen',
  (await dad.$$('main a[href*="/join/"]')).length === 0);

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
await dad.click('main button:has-text("הוספת משפחה")');
await dad.fill('input[name=familyName]', 'רות ואורי לוי');
await dad.click('form:has(input[name=familyName]) button[type=submit]');
await dad.waitForTimeout(1500);
check('a family added by name is one new household',
  rows('Households').length === beforeJoin + 1);
const theirHousehold = rows('Households').find((r) => r[1] === 'רות ואורי לוי')[0];

// Saying "that one is us" is the circle link's job now — it is the one
// invitation aimed at a group rather than at a person, and it is checked where
// it is made.

// Made from their own row, it says which family they are.
const forFirst = inv(await linkFromRow(dad, 'רות ואורי לוי'), 'token');

const first = await open();
await first.goto(`${BASE}/join/${forFirst}`);
await first.fill('input[name=phone]', FIRST_NUMBER);
await first.click('button[type=submit]');
await first.waitForSelector('input[name=firstName]');
// The link was made on their row, so it already says which family they are.
check('a link made on a family\'s row says so when it is opened',
  (await first.inputValue('input[name=householdName]')) === 'רות ואורי לוי');
check('nor for a family to pick themselves out of',
  !(await first.isVisible('select[name=claimHouseholdId]')));
await first.fill('input[name=firstName]', 'רות');
await first.fill('input[name=surname]', 'לוי');
await first.click('text=/^סיום/');
await first.waitForTimeout(1500);
check('joining through it opens no second household',
  rows('Households').length === beforeJoin + 1);

// The point of the whole thing: this number is not the one on file.
// The second person in that family is invited into it by the one already in,
// from their own house's row — not out of anybody else's list.
const forSecond = (await addToOurHouse(first))[0];

const second = await open();
await second.goto(`${BASE}/join/${forSecond}`);
await second.fill('input[name=phone]', SECOND_NUMBER);
await second.click('button[type=submit]');
await second.waitForSelector('input[name=firstName]');
check('joining a house asks who you are and nothing about the family',
  !(await second.isVisible('input[name=householdName]')));
await second.fill('input[name=firstName]', 'אורי');
await second.fill('input[name=surname]', 'לוי');
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
// The soonest day no seeded holiday already occupies. A fixed "three days from
// now" eventually lands on one of them — it landed on ערב ראש השנה — and then
// two holidays share a date and which one the front page opens on is a toss-up.
const taken = new Set(rows('Dates').map((r) => r[2]));
let free = new Date(Date.now() + 86_400_000);
while (taken.has(free.toISOString().slice(0, 10))) {
  free = new Date(free.getTime() + 86_400_000);
}
const SOON = free.toISOString().slice(0, 10);
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
// Two rows, because they are two facts: what the occasion is, and when it falls
// this year. The key every answer is written against is the two joined.
const added = rows('Holidays').at(-1);
const whenAdded = rows('Dates').at(-1);
check('and it is written with the family as its owner', added[5] === 'hh_parents');
check(`and with who it goes out to (${added[6]})`,
  added[6].includes('hh_a') && !added[6].includes('hh_sister'));
check(`and its date is a row of its own (${whenAdded.join(' | ')})`,
  whenAdded[0] === added[0] && whenAdded[2] === SOON);
const occasionKey = `${added[0]}_${SOON.slice(0, 4)}`;

// Opened by its own key rather than by being the nearest thing on the calendar:
// which occasion the front page lands on depends on the day the suite runs, and
// this is about an occasion being a holiday like any other, not about the date.
await dad.goto(`${BASE}/?h=${occasionKey}`);
await dad.waitForSelector('nav');
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

// ── the name and the mark are said once, for every year ─────────────────────
// The whole point of the split: an occasion is one row on the catalogue, so
// correcting what it is called changes it in every year at once. It used to be
// one row per year with the name copied into each, and putting it right meant
// editing all of them.
const beforeName = rows('Holidays').length;
await dad.goto(`${BASE}/occasions`);
await dad.waitForSelector('text=יום הולדת לסבתא');
await dad.click('[aria-label="שינוי השם והסימן של יום הולדת לסבתא"]');
await dad.waitForSelector('input[name=emoji]');
await dad.fill('input[name=name]', 'יום הולדת לסבתא רבתא');
await dad.fill('input[name=emoji]', '🎂');
await dad.click('form:has(input[name=emoji]) button[type=submit]');
await dad.waitForSelector('text=יום הולדת לסבתא רבתא');
await dad.waitForTimeout(1500);
const renamedRow = rows('Holidays').at(-1);
check(`the name and the mark are one row, not one per year (${renamedRow.slice(0, 4).join(' | ')})`,
  rows('Holidays').length === beforeName + 1 &&
    renamedRow[0] === occasionKey.replace(/_\d{4}$/, '') &&
    renamedRow[1] === 'יום הולדת לסבתא רבתא' &&
    renamedRow[3] === '🎂');
check('and no date moved for a change of name',
  rows('Dates').at(-1)[2] === SOON);
await dad.goto(`${BASE}/?h=${occasionKey}`);
check('which is what the holiday screen then shows',
  (await dad.innerText('main')).includes('🎂'));
await dad.goto(`${BASE}/occasions`);
await dad.waitForSelector('text=יום הולדת לסבתא רבתא');

const beforeRemove = rows('Holidays').length;
// Asked first, like every other thing that takes something away.
await dad.click('text=הסרה');
check('removing an occasion asks before it does it',
  await dad.isVisible('text=כן, להסיר'));
await dad.click('text=כן, להסיר');
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
check(`removal is a row, not a deletion (include=${gone[4]})`,
  gone[0] === occasionKey.replace(/_\d{4}$/, '') && gone[4] === 'FALSE');

// ── the log stays keys-only ──────────────────────────────────────────────────
// Counted against the header rather than a fixed number: the point is that the
// log holds keys and no names, not that it has exactly so many columns.
const answerHeader = sheet().Answers[0];
const a = rows('Answers').at(-1);
check(`the log holds ${answerHeader.length} keyed columns and no names (${a.join(' | ')})`,
  a.length === answerHeader.length && !a.some((v) => /[֐-׿]/.test(v)));

// ── the very first family, in a sheet with nothing in it ────────────────────
// A fresh install: the tabs exist and hold nothing but their headers. Signing
// in has to lead to registering — this used to be met with "the spreadsheet is
// empty, check your SHEET_ID", which turned away the first person ever to
// arrive. Last, because it empties the sheet the rest of the suite built.
const bare = sheet();
for (const tab of ['Households', 'People', 'Connections', 'Circles', 'Answers', 'Invites']) {
  bare[tab] = [bare[tab][0]];
}
writeFileSync(SHEET, `${JSON.stringify(bare, null, 2)}\n`, 'utf8');
// Written behind the server's back, so its copy has to lapse before it looks.
await new Promise((resolve) => setTimeout(resolve, SHEET_TTL_MS));

const firstEver = await open();
await firstEver.goto(BASE);
await firstEver.fill('input[name=phone]', '053-000-9001');
await firstEver.click('button[type=submit]');
await firstEver.waitForSelector('input[name=firstName]', { timeout: 15000 }).catch(() => {});
check('an empty sheet asks the first person who they are, rather than blaming itself',
  await firstEver.isVisible('input[name=firstName]'));
check('and says nothing about spreadsheets',
  !/גיליון|SHEET_ID/.test(await firstEver.innerText('body')));
await firstEver.fill('input[name=firstName]', 'ראשון');
await firstEver.fill('input[name=surname]', 'בשדה');
await firstEver.fill('input[name=householdName]', 'משפחת ראשון');
await firstEver.click('text=/^סיום/');
await firstEver.waitForSelector('nav', { timeout: 15000 }).catch(() => {});
check('and the first family opens the first household',
  rows('Households').some((r) => r[1] === 'משפחת ראשון'));
check('with nobody on its list and nothing pretending otherwise',
  await firstEver.isVisible('text=איפה אתם בחג?'));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exitCode = failures ? 1 : 0;
