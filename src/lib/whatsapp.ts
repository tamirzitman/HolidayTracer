/**
 * Every outward link in this app goes through WhatsApp. A phone number on its
 * own is not much use — nobody wants to start a call — so numbers are never
 * shown as `tel:` links, only as a way to open a chat.
 *
 * Four things get sent from here, and each says its own thing. They were near
 * enough identical to be confusing: a reminder for one holiday and an invitation
 * to a circle are not the same errand, and a message that fits both fits
 * neither.
 */

/** wa.me wants digits only: 972541234567, never +972-54-123-4567. */
const digits = (phone: string): string => phone.replace(/\D/g, '');

const message = (text: string, phone?: string): string =>
  `https://wa.me/${phone ? digits(phone) : ''}?text=${encodeURIComponent(text)}`;

/** An ordinary message. No prefilled text: people write what they actually mean. */
export const chatWith = (phone: string): string => `https://wa.me/${digits(phone)}`;

/**
 * One family, asked to join ours. Sent to somebody in particular, so it can say
 * "you" and name what opening it does.
 */
export const inviteText = (url: string): string =>
  `הצטרפו למעגל שלנו — נדע מי מארח בכל חג, ותוכלו לענות בשתי נגיעות:\n${url}`;

/**
 * An invite. With a number it opens that person's chat; without one it opens
 * WhatsApp's own contact picker, which is what a family nobody has joined needs
 * — there is no number to aim at.
 */
export const inviteVia = (url: string, phone?: string): string =>
  message(inviteText(url), phone);

/**
 * Telling somebody the app exists, without introducing them to anybody. An
 * invitation carries a token and joins two families; this is only the address,
 * for the friend who likes the idea but has no business in your circle.
 */
export const shareApp = (url: string): string =>
  message(`יש אפליקציה קטנה שאנחנו עוקבים בה אחרי מי מארח בכל חג. אולי תתאים גם לכם:\n${url}`);

/**
 * A whole circle at once, for the family's group chat. Whoever opens it joins
 * the circle and everybody already in it, which is why it is worth pasting
 * somewhere several people will read it — and why it says so, so that nobody
 * taps it thinking it is only for them.
 */
export const inviteToCircle = (circleName: string, url: string): string =>
  message(
    `פתחנו את «${circleName}» באפליקציה שעוקבת אחרי מי מארח בכל חג.\n` +
      `כל מי שנכנס מהקישור הזה מצטרף לכולנו — לא צריך להזמין אחד־אחד:\n${url}`,
  );

/**
 * A nudge for one holiday, for the family's group chat.
 *
 * No counts. "ענו 3 מתוך 10" was true of the sender's own list and of nobody
 * else's, so a family with four households on theirs read a number that could
 * not be squared with anything they could see. The holiday, the question, and
 * the way in — which is all a reminder has to carry.
 */
export const remindAbout = (holidayName: string, when: string, url: string): string =>
  message(`${holidayName} · ${when}\nמי מארח השנה? עונים בשתי נגיעות:\n${url}`);
