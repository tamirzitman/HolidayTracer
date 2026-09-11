/**
 * Says whether the version in package.json still describes what is in src/.
 *
 * The footer shows that number, so it is a claim made to every person using the
 * app: this is the version you are looking at. A change shipped without bumping
 * it makes the claim false, and quietly — nothing breaks, the number is simply
 * wrong from then on, and the next bug report names a version that never had
 * the bug.
 *
 * So: find the commit that last changed the version, and see whether anything
 * under src/ has changed since. If it has, the version is behind the code.
 *
 *   npm run version-check
 *
 * major — the app works differently enough that somebody would have to relearn it
 * minor — something new they can do
 * patch — the same app, fixed or tidied
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// -G, not -S. -S counts how many times a string appears and reports the commits
// where that count changed — and a version being raised from one number to
// another leaves the word "version" appearing exactly once either way, so every
// bump was invisible to it and this always compared against the commit that
// first added the field. -G matches the changed lines themselves.
const bumped = git('log', '-1', '--format=%H', '-G^\\s*"version":', '--', 'package.json');
if (!bumped) {
  console.log(`version ${version} — no commit has ever changed it, so nothing to compare against.`);
  process.exit(0);
}

// Committed changes since the bump, and anything not committed yet: a version
// left behind is a version left behind either way. Asked as plain paths rather
// than read out of `status --porcelain`, whose leading status column is two
// characters wide and one of them is a space — trimming the output to tidy it
// ate that space and took the first letter of the first filename with it.
const since = git('diff', '--name-only', `${bumped}..HEAD`, '--', 'src/').split('\n').filter(Boolean);
const edited = git('diff', '--name-only', 'HEAD', '--', 'src/').split('\n').filter(Boolean);
const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src/')
  .split('\n')
  .filter(Boolean);
const pending = [...edited, ...untracked];

const changed = [...new Set([...since, ...pending])];
const at = git('log', '-1', '--format=%h %cd', '--date=short', bumped);

if (changed.length === 0) {
  console.log(`✓ version ${version} covers src/ — set in ${at}, nothing changed since`);
  process.exit(0);
}

console.log(`✗ version ${version} is behind the code — set in ${at}, and since then:\n`);
for (const file of changed) console.log(`  ${file}`);
console.log(`\n${changed.length} file(s) under src/. Bump package.json before pushing.`);
process.exitCode = 1;
