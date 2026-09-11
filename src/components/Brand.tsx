import { Mark } from './Mark';

/** The artwork's palette. Fixed, not themed — see the note on Brand below. */
const GOLD = '#e6c78c';
const GOLD_BRIGHT = '#f3dcae';

/**
 * The holiday things, scattered and repeating, the way they run along the top
 * and bottom of the artwork this is drawn from.
 *
 * Four shapes rather than a dozen: at this size and this opacity the band reads
 * as texture, and a shape nobody can quite make out is the same as a shape that
 * is not there — while four that are each obvious at a glance carry it.
 */
function PatternBand({ className }: { className: string }) {
  return (
    <svg className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="holidays" width="108" height="56" patternUnits="userSpaceOnUse">
          {/* Laid out on a 132×68 tile and shrunk as a whole, so the shapes keep
              their spacing relative to each other. */}
          <g transform="scale(0.82)">
          <g
            fill="none"
            stroke={GOLD}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.32"
          >
            {/* Star of David */}
            <g transform="translate(6 10)">
              <path d="M12 4 L19.5 17 L4.5 17 Z" />
              <path d="M12 20 L4.5 7 L19.5 7 Z" />
            </g>
            {/* Pomegranate */}
            <g transform="translate(42 34)">
              <circle cx="12" cy="14" r="6.5" />
              <path d="M12 7.5 V4.5" />
              <path d="M9.5 5.5 L12 3 L14.5 5.5" />
            </g>
            {/* A candle's flame */}
            <g transform="translate(78 8)">
              <path d="M12 4 C15.5 9.5 16.5 12.5 12 16.5 C7.5 12.5 8.5 9.5 12 4 Z" />
            </g>
            {/* The cup */}
            <g transform="translate(104 36)">
              <path d="M7.5 5 H16.5 L15.5 12 C15.5 14.5 13.5 15.5 12 15.5 C10.5 15.5 8.5 14.5 8.5 12 Z" />
              <path d="M12 15.5 V19" />
              <path d="M8.5 19 H15.5" />
            </g>
          </g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#holidays)" />
    </svg>
  );
}

/**
 * The app, saying what it is, at the one moment that is worth doing it.
 *
 * Everywhere else the screens are light and quiet on purpose — they are read
 * every few weeks, in a hurry, to answer one question. This is the exception:
 * the front door, and the screen an invitation lands on, where somebody handed
 * a link in a family group is deciding whether to type their phone number in.
 *
 * Deliberately the same in light mode and dark: gold on a deep table-lit red
 * is the identity, and an identity that changes with the reader's settings is
 * not one. Hence the literal colours rather than the theme's tokens.
 */
export function Brand() {
  return (
    <div
      className="relative isolate overflow-hidden rounded-3xl px-6 py-11 text-center"
      style={{ background: `radial-gradient(120% 90% at 50% 30%, #4d1f2c, #1d0b10)` }}
    >
      {/* Along the top and bottom edges, fading inwards, so the middle stays
          clear for the thing that has to be read. */}
      <PatternBand className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-14 w-full [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <PatternBand className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-14 w-full [mask-image:linear-gradient(to_top,black,transparent)]" />

      <div className="flex flex-col items-center gap-3">
        <Mark className="h-20 w-auto" style={{ color: GOLD }} />
        <h1
          className="font-display text-4xl leading-tight font-bold text-balance"
          style={{ color: GOLD_BRIGHT }}
        >
          איפה אתם בחג?
        </h1>
        <p className="text-sm" style={{ color: GOLD, opacity: 0.75 }}>
          מי מארח ומי מתארח, חג אחרי חג
        </p>
      </div>
    </div>
  );
}
