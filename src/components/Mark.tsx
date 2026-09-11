/**
 * The app's mark: a family at a table, with a candle on it.
 *
 * Drawn rather than shipped as a picture, so the same lines make a 32-pixel
 * favicon, a home-screen icon, the top of the sign-in screen and the image
 * WhatsApp shows on an invitation — one definition, no set of exported files to
 * keep in step with each other.
 *
 * No lettering anywhere in it. At the size an icon is actually looked at, a
 * Hebrew word is a smudge, and every place this is used says the name in real
 * text beside it — the sign-in screen in the page's own font, a link preview in
 * its title. A mark says which app; the words are already there to read.
 *
 * Everything is `currentColor`, so whatever uses it decides the gold.
 */
export function Mark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    /* The box is the drawing, not the 512 square its coordinates are written
       in: placed anywhere in the app it should fill what it is given, centred,
       without every caller repeating the same transform. The icon generator
       lifts these shapes out by their raw coordinates and is unaffected. */
    <svg viewBox="110 116 296 268" className={className} style={style} fill="none" aria-hidden="true">
      {/* `fill` is set here and not only on the <svg> above: this group is
          lifted out of its wrapper to be placed on a ground elsewhere, and a
          path that inherited "none" from a tag that is no longer there comes
          back filled black. */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Four at the table, two to a side, leaving the middle for the candle.
            Bodies end at the table rather than below it — seated, not standing
            behind it. */}
        {[150, 206, 306, 362].map((x) => (
          <g key={x}>
            <circle cx={x} cy={210} r={18} />
            <path d={`M${x - 26} 300 C ${x - 26} 264, ${x - 14} 248, ${x} 248 C ${x + 14} 248, ${x + 26} 264, ${x + 26} 300`} />
          </g>
        ))}

        {/* The table, and legs that splay a little so it reads as a table seen
            from the side rather than as a bar across the middle. */}
        <path d="M116 306 H396" />
        <path d="M162 306 L152 374" />
        <path d="M350 306 L360 374" />

        {/* The candle. */}
        <path d="M256 262 V300" />
      </g>

      <g fill="currentColor">
        {/* Its flame, filled — the one solid shape, so the middle of the mark
            holds at small sizes where strokes start to merge. */}
        <path d="M256 224 C 268 240, 268 252, 256 260 C 244 252, 244 240, 256 224 Z" />

        {/* The spark the artwork carries, kept because an icon of a table needs
            something above the line or it reads as furniture. Off to one side
            and clear of the heads — over the far one it read as a hat. */}
        <path d="M140 126 C 143 142, 150 149, 166 152 C 150 155, 143 162, 140 178 C 137 162, 130 155, 114 152 C 130 149, 137 142, 140 126 Z" />
      </g>
    </svg>
  );
}
