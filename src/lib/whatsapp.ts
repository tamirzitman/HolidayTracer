/**
 * Every outward link in this app goes through WhatsApp. A phone number on its
 * own is not much use — nobody wants to start a call — so numbers are never
 * shown as `tel:` links, only as a way to open a chat.
 */

/** wa.me wants digits only: 972541234567, never +972-54-123-4567. */
const digits = (phone: string): string => phone.replace(/\D/g, '');

/** An ordinary message. No prefilled text: people write what they actually mean. */
export const chatWith = (phone: string): string => `https://wa.me/${digits(phone)}`;

export const inviteText = (url: string): string =>
  `הצטרפו אלינו — עונים בשתי נגיעות איפה אתם בחג:\n${url}`;

/**
 * An invite. With a number it opens that person's chat; without one it opens
 * WhatsApp's own contact picker, which is what a family nobody has joined needs
 * — there is no number to aim at.
 */
export const inviteVia = (url: string, phone?: string): string =>
  `https://wa.me/${phone ? digits(phone) : ''}?text=${encodeURIComponent(inviteText(url))}`;

/**
 * Telling somebody about the app without introducing them to anybody. An invite
 * carries a token and connects two families; this is only the address, for the
 * friend who might like the idea but has no business in your circle.
 */
export const shareApp = (url: string): string =>
  `https://wa.me/?text=${encodeURIComponent(
    `אנחנו עוקבים ככה אחרי מי מארח בכל חג — שאלה אחת, שתי נגיעות:\n${url}`,
  )}`;
