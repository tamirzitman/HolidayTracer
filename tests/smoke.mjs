/**
 * End-to-end smoke test of the whole of phase 1, against a real browser.
 *
 *   node scripts/dev-fixtures.mjs
 *   npm run seed:holidays            # once, if .dev-sheet.json has no Holidays
 *   # mark at least one holiday include=TRUE in .dev-sheet.json
 *   npm run build && SESSION_SECRET=test npm start -- --port 3111
 *   npm run test:smoke
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:3111';
// A number nobody has registered, so the run is repeatable.
const NEW_PHONE = `05${String(Date.now()).slice(-8)}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: 'he-IL' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) process.exitCode = 1;
}

// --- 1. a brand new phone: sign in, then register ---
await page.goto(BASE);
await page.fill('input[name=phone]', NEW_PHONE);
await page.click('button[type=submit]');
await page.waitForSelector('select[name=householdId]');
check('unknown number lands on registration', await page.isVisible('text=נעים להכיר'));

const options = await page.$$eval('select[name=householdId] option', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => t !== 'בחרו מהרשימה'),
);
const activeInSheet = JSON.parse(readFileSync('.dev-sheet.json', 'utf8'))
  .Households.slice(1)
  .filter((r) => r[3] === 'TRUE')
  .map((r) => r[1]);
check(`dropdown lists exactly the active families (${options.join(', ')})`,
  options.length === activeInSheet.length && activeInSheet.every((n) => options.includes(n)));
check('no way to create a family from the app', !(await page.isVisible('text=משפחה חדשה')));

await page.fill('input[name=name]', 'אח');
await page.selectOption('select[name=householdId]', 'hh_brother');
await page.click('button[type=submit]');
await page.waitForSelector('text=איפה אתם בחג?');

// --- 2. the question ---
check('next holiday is the soonest included one', await page.isVisible('text=ערב ראש השנה'));
check('hebrew date shown', await page.isVisible('text=כ״ט אלול תשפ״ו'));

// --- 3. answer: guest at the parents ---
await page.click('text=מתארחים אצל…');
await page.waitForSelector('select[name=hostHouseholdId]');
await page.selectOption('select[name=hostHouseholdId]', 'hh_parents');
await page.click('button[type=submit]');
await page.waitForSelector('text=מתארחים אצל אבא ואמא');
check('answer recorded and shown back', await page.isVisible('text=מתארחים אצל אבא ואמא'));
check('host phone offered to call', await page.isVisible('a[href="tel:+972501234567"]'));

// --- 4. the write landed in the sheet ---
const sheet = JSON.parse(readFileSync('.dev-sheet.json', 'utf8'));
const people = sheet.People.slice(1);
const answers = (sheet.Answers ?? []).slice(1);
check('a People row was appended', people.some((r) => r[1] === 'אח' && r[2] === 'hh_brother'));
check('an Answers row was appended', answers.length === 1);
const a = answers[0];
check(`answer row is right (${a?.slice(5, 10).join(' | ')})`,
  a && a[2] === 'erev_rosh_hashana_5786' && a[5] === 'hh_brother' && a[7] === 'guest' && a[8] === 'hh_parents');
check('hebrew year carried on the row', a && a[1] === '5786');

// --- 5. changing the answer appends, never overwrites ---
await page.click('text=שינוי תשובה');
await page.waitForSelector('text=אנחנו מארחים');
await page.click('text=אנחנו מארחים');
await page.waitForSelector('.font-display >> text=אנחנו מארחים');
const after = JSON.parse(readFileSync('.dev-sheet.json', 'utf8')).Answers.slice(1);
check('changing the answer appends a second row', after.length === 2);
check('newest row wins on screen', await page.isVisible('text=אנחנו מארחים'));

// --- 6. the cookie remembers ---
await page.goto(BASE);
check('returning visit skips sign-in entirely', await page.isVisible('text=ערב ראש השנה'));

// --- 7. a bad number is refused ---
await ctx.clearCookies();
await page.goto(BASE);
await page.fill('input[name=phone]', '123');
await page.click('button[type=submit]');
await page.waitForSelector('[role=alert]');
const alertText = (await page.innerText('[role=alert]')).trim();
check(`nonsense number is rejected (${alertText})`, alertText === 'מספר הטלפון לא נראה תקין');
check('still on the sign-in screen', await page.isVisible('input[name=phone]'));

await browser.close();
console.log(process.exitCode ? '\nsome checks failed' : '\nall checks passed');
