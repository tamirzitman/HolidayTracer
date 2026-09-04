/**
 * Whether signing in is gated.
 *
 * In production a number the sheet already knows cannot simply be typed in:
 * the person has to hold the device that signed in before, or a link somebody
 * in their family aimed at that number. That is what stops anyone who knows a
 * relative's number from becoming them — the one thing that matters once the
 * app is used beyond one family.
 *
 * On the playground it is switched off entirely, so that trying the app out
 * *as* other people — which is what the playground is for — still works. The
 * same variable already marks that deployment with a strip across the top, so
 * there is one switch, not two that can disagree.
 */
export const gateOpen = (): boolean => Boolean(process.env.PLAYGROUND);
