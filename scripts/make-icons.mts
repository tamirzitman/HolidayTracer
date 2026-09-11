/**
 * Draws every icon the app needs from the one mark in src/components/Mark.tsx.
 *
 * A home-screen icon, a favicon, and the picture WhatsApp shows on an invitation
 * are the same drawing at different sizes on different grounds. Kept as exported
 * files they drift: one gets redrawn, the others stay as they were, and nobody
 * notices until the icon on a phone is a version old. So they are generated, and
 * the mark is the only thing anybody edits.
 *
 *   npm run make-icons
 *
 * Writes into public/. The PNGs are committed — a deployment serves them, it
 * does not run this.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { Mark } from '../src/components/Mark.tsx';
import { BRAND } from '../src/lib/brand.ts';

const GOLD = BRAND.gold;

const mark = renderToStaticMarkup(createElement(Mark));
/** The mark's own markup, without its <svg> wrapper, to place on a ground. */
const inner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

/**
 * What the drawing actually occupies inside its 512 box, strokes included — it
 * does not fill it, and is not centred in it. Measured once here so every size
 * below can say "this much of the square" and mean it, rather than each one
 * carrying a translate somebody arrived at by looking at the result.
 */
const ART = { x: 114, y: 120, w: 288, h: 260 };

/** Places the drawing centred in a w×h box, filling `fraction` of it. */
function place(w: number, h: number, fraction: number): string {
  const scale = (Math.min(w, h) * fraction) / Math.max(ART.w, ART.h);
  const x = w / 2 - (ART.x + ART.w / 2) * scale;
  const y = h / 2 - (ART.y + ART.h / 2) * scale;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(4)})`;
}

const ground = (w: number, h: number) => `
  <defs>
    <radialGradient id="ground" cx="50%" cy="42%" r="78%">
      <stop offset="0%" stop-color="${BRAND.groundLit}"/>
      <stop offset="100%" stop-color="${BRAND.groundEdge}"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#ground)"/>`;

/**
 * The icon. Square, full-bleed ground — the platforms round the corners and
 * mask it themselves, and a shape rounded here as well comes out rounded twice.
 * The mark sits at 62% so it clears the circle Android may cut out of it.
 */
const icon = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  ${ground(512, 512)}
  <g color="${GOLD}" transform="${place(512, 512, 0.66)}">${inner}</g>
</svg>`;

/**
 * What a link shows when it is pasted into a chat. Landscape, because that is
 * the card WhatsApp draws — and with no words in it: the title and description
 * beside it are real text, in whatever the person's app renders them in, and a
 * second copy baked into the picture would only disagree with them one day.
 */
const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  ${ground(1200, 630)}
  <g color="${GOLD}" transform="${place(1200, 630, 0.52)}">${inner}</g>
</svg>`;

/** The screen held while the app opens from a phone's home screen. */
const splash = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  ${ground(w, h)}
  <g color="${GOLD}" transform="${place(w, h, 0.46)}">${inner}</g>
</svg>`;

mkdirSync('public', { recursive: true });

const png = async (svg: string, name: string) => {
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`public/${name}`);
  console.log(`  public/${name}`);
};

console.log('drawing from src/components/Mark.tsx:\n');

// An SVG favicon for anything that takes one, which is every browser that
// matters now — it stays sharp at any size and weighs nothing.
writeFileSync('public/icon.svg', `${icon(512)}\n`, 'utf8');
console.log('  public/icon.svg');

await png(icon(180), 'apple-touch-icon.png'); // iOS home screen
await png(icon(192), 'icon-192.png'); // Android home screen
await png(icon(512), 'icon-512.png'); // the manifest's large icon, and its splash
await png(icon(32), 'favicon.png'); // for anything that will not take the SVG
await png(preview, 'og.png');

// iOS shows a launch image only for the exact sizes it is given, so these are
// the common iPhone screens. Anything not listed simply opens on the ground
// colour, which is the same colour — nobody sees a white flash either way.
for (const [w, h] of [
  [1170, 2532], // 14 / 13 / 12
  [1179, 2556], // 15 / 14 Pro
  [1284, 2778], // 14 Plus / 12 Pro Max
  [1290, 2796], // 15 / 14 Pro Max
  [1125, 2436], // X / XS / 11 Pro
  [828, 1792], // XR / 11
  [750, 1334], // SE
]) {
  await png(splash(w, h), `splash-${w}x${h}.png`);
}
