/**
 * The identity's own colours: gold on a lit red.
 *
 * Kept here rather than beside either of the things that draw with them. The
 * mark is rendered twice from two places — by the page, for the sign-in screen,
 * and by `make-icons` for every file a phone or a chat app fetches — and while
 * the values sat in both files, retuning one left the other as it was. Nobody
 * would have seen it: the icon on a home screen is looked at daily and compared
 * to the app it opens roughly never.
 *
 * The red is the app's own `--color-brand`, lit from the middle rather than a
 * deeper one of its own. A mark in a heavier red than anything else on screen
 * reads as belonging to a different app than the one behind it.
 */
export const BRAND = {
  gold: '#e6c78c',
  goldBright: '#f3dcae',
  /** The middle of the ground, where the light falls: the brand exactly. */
  groundLit: '#7c2740',
  /** Its edge — the same wine, in shadow. */
  groundEdge: '#59192d',
} as const;

/** The ground every version of the mark sits on, as one CSS value. */
export const brandGround = (shape = '120% 90% at 50% 30%'): string =>
  `radial-gradient(${shape}, ${BRAND.groundLit}, ${BRAND.groundEdge})`;
