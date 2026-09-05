'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addHousehold,
  addOccasion,
  addPerson,
  appendAnswer,
  circleOf,
  connect,
  createInvite,
  dismissSuggestion,
  hiddenSuggestions,
  restoreSuggestion,
  findPerson,
  getHousehold,
  getLatestAnswer,
  getPastHoliday,
  getUpcomingHolidays,
  removeOccasion,
  shareOccasion,
  isConnected,
  readInvite,
  recordConflicts,
  suggestionsFor,
  claimableIn,
  knownToOthers,
  unjoinedNamed,
  renameHousehold,
  membersByHousehold,
  spendInvite,
} from '@/lib/data';
import { familyName } from '@/lib/names';
import { normalizePhone } from '@/lib/phone';
import { clearSession, getSessionPhone, setSessionPhone } from '@/lib/session';
import { gateOpen } from '@/lib/gate';
import type { AnswerKind } from '@/lib/types';

export type ActionResult = {
  error?: string;
  savedAt?: string;
  /**
   * The number is known and its household is known to others, and nothing
   * vouched for this device. Not an error: the screen it produces says who can
   * let them in, and how.
   */
  blocked?: boolean;
  /**
   * A family already on the list, by name, that nobody has signed into — asked
   * about rather than assumed, because a name can repeat.
   */
  sameName?: { id: string; name: string };
};

/** What a newly added family came out as, so the screen can go on using it. */
export type AddedFamily = ActionResult & {
  householdId?: string;
  name?: string;
  /** A number we hold for them, and nobody has signed in with — so, invitable. */
  invitePhone?: string;
};

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  if (!phone) return { error: 'מספר הטלפון לא נראה תקין' };

  // Signing in from an invite should land back on the invite, not the question.
  const next = String(formData.get('next') ?? '');
  const token = /^\/join\/([A-Za-z0-9]+)$/.exec(next)?.[1] ?? '';

  // The gate. A number the sheet knows, belonging to a household somebody else
  // knows, is not let in by being typed: that would make every relative's
  // number a way to become them. It needs a link somebody in the family aimed
  // at this very number. A household nobody knows is not locked — there is
  // nothing to impersonate — and on the playground nothing is.
  const person = await findPerson(phone);
  if (person && !gateOpen() && (await knownToOthers(person.householdId))) {
    const invite = token ? await readInvite(token) : undefined;
    if (!invite || invite.forPhone !== phone) return { blocked: true };
    // Vouched. The link was one person's, and that person is now in.
    await spendInvite(token);
  }

  await setSessionPhone(phone);

  if (token) {
    revalidatePath(next);
    redirect(next);
  }

  revalidatePath('/');
  return {};
}

/**
 * Signing up. An invite is a shortcut, not a gate: it introduces two families
 * in one step and offers the inviter's circle to start from. Without one, a
 * person still registers — they simply arrive with nobody on their list and
 * add the families they care about, and each family they add brings the
 * families it knows along as suggestions.
 */
export async function register(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };
  if (await findPerson(phone)) return {};

  const token = String(formData.get('token') ?? '').trim();
  const invite = token ? await readInvite(token) : undefined;
  if (token && !invite) return { error: 'הקישור כבר לא תקף — אפשר להירשם בלעדיו' };

  // Your own name, in the two halves the form asks for.
  const name = familyName(
    String(formData.get('firstName') ?? ''),
    String(formData.get('surname') ?? ''),
  );
  if (!name) return { error: 'צריך שם פרטי ושם משפחה' };

  let householdId: string;
  if (invite?.kind === 'household') {
    // Joining the inviter's own household — a spouse, a grown child.
    householdId = invite.household.id;
  } else if (invite?.forHousehold) {
    // The link names the family they are. Nothing to choose and nothing to
    // invent: it was sent to them *as* that family, and it is spent on use.
    householdId = invite.forHousehold.id;
    // Whoever added them guessed at the name, or took it from their phone.
    // These are the people it belongs to, so their correction wins.
    const corrected = String(formData.get('householdName') ?? '').trim();
    if (corrected && corrected !== invite.forHousehold.name) {
      await renameHousehold(householdId, corrected);
    }
  } else {
    // Saying "that one is us" about a family already on the list is what keeps
    // one family from becoming two. It works whichever number they sign up
    // with, which matching on the phone alone cannot.
    const claiming = invite ? String(formData.get('claimHouseholdId') ?? '').trim() : '';
    if (claiming && invite) {
      // Saying "we are that family" is the same claim as typing their number,
      // and is held to the same standard: a link aimed at you, not one that was
      // forwarded around. The general link still registers anybody — as a new
      // family of their own.
      if (!gateOpen() && invite.forPhone !== phone) {
        return { error: 'כדי להצטרף למשפחה שכבר ברשימה צריך קישור אישי ממי שהוסיף אתכם' };
      }
      const claimable = await claimableIn(invite.household.id);
      if (!claimable.some((c) => c.household.id === claiming)) {
        return { error: 'המשפחה הזו לא ברשימה של מי שהזמין אתכם' };
      }
      householdId = claiming;
    } else {
      // Offered as your two names joined, and editable into whatever the
      // family actually goes by.
      const named = String(formData.get('householdName') ?? '').trim() || name;

      // Somebody added this family by name and it has been sitting there empty
      // ever since. Opening a second one beside it is the wrong answer to a
      // question nobody asked, so ask it: the people it names are the only ones
      // who can say. Answering "we are them" puts them in that household, and
      // the connections whoever added them made are already there.
      const claimingByName = String(formData.get('claimHouseholdId') ?? '').trim();
      if (claimingByName) {
        const same = await unjoinedNamed(named);
        if (!same || same.id !== claimingByName) {
          return { error: 'המשפחה הזו כבר לא פנויה — אפשר להירשם כמשפחה חדשה' };
        }
        householdId = same.id;
      } else if (String(formData.get('newFamily') ?? '') === 'yes') {
        householdId = await addHousehold(named);
      } else {
        // Only at the front door. Arriving on a link, the families worth
        // claiming were already offered by name on the previous screen, and
        // asking again about one they passed over is noise.
        const same = invite ? undefined : await unjoinedNamed(named);
        if (same) return { sameName: { id: same.id, name: same.name } };
        householdId = await addHousehold(named);
      }
    }
  }

  await addPerson({ phone, name, householdId });

  // Registering and joining somebody's circle are two things, and the form asks
  // about the second one separately.
  // Only the family that invited them. Their circle used to be offered here as a
  // checklist, which asked the least-informed person at the least-informed
  // moment to judge families they had not seen — and that job is now done, in
  // context and with evidence, by the suggestions on the circles screen.
  if (invite && String(formData.get('connect') ?? 'yes') === 'yes') {
    if (householdId !== invite.household.id) await connect(householdId, invite.household.id);
  }

  // A link sent to one person is spent now they are in: forwarded on, it brings
  // nobody else. A general link is untouched and stays reusable.
  if (invite && token) await spendInvite(token);

  // Straight to the question: that is what they came for.
  revalidatePath('/');
  redirect('/');
}

/**
 * Answering the invite prompt. Saying no is not a failure state: it registers
 * nothing, connects nothing, and drops the person into the app they wanted.
 */
export async function acceptInvite(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (String(formData.get('connect') ?? '') !== 'yes') redirect('/');

  const me = await currentHousehold();
  if ('error' in me) return me;

  const invite = await readInvite(String(formData.get('token') ?? '').trim());
  if (!invite) return { error: 'הקישור כבר לא בתוקף' };

  if (invite.household.id !== me.householdId) {
    if (!(await isConnected(me.householdId, invite.household.id))) {
      await connect(me.householdId, invite.household.id);
    }
  }

  revalidatePath('/');
  revalidatePath('/families');
  redirect('/families');
}

/**
 * Contacts picked out of the phone's address book. Numbers that already belong
 * to a household are connected on the spot; the rest are handed back so they can
 * be invited. Nothing from the address book is stored.
 */
export type ContactResult = {
  connected: string[];
  already: string[];
  missing: { name: string; phone: string }[];
  error?: string;
};

/**
 * Contacts the picker brought back that are nobody in the app yet, added as
 * families of ours.
 *
 * Picking somebody out of the address book is the work; ending with nothing but
 * a message to send them is not what that work was for. Each becomes a family
 * with the name from the contact and the number beside it, on our list right
 * away — answerable at, countable, there. Whoever signs in with that number
 * later can put the name right, because a name taken from somebody's phone is
 * a guess at what the family calls itself.
 */
export async function addContacts(
  contacts: { name: string; phone: string }[],
): Promise<{ added: string[]; error?: string }> {
  const me = await currentHousehold();
  if ('error' in me) return { added: [], error: me.error };

  const added: string[] = [];
  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone);
    const name = contact.name.trim();
    if (!phone || !name) continue;
    if (await findPerson(phone)) continue;

    const householdId = await addHousehold(name);
    await addPerson({ phone, name, householdId });
    await connect(me.householdId, householdId);
    added.push(name);
  }

  revalidatePath('/families');
  revalidatePath('/');
  return { added };
}

export async function connectContacts(
  contacts: { name: string; phone: string }[],
): Promise<ContactResult> {
  const me = await currentHousehold();
  if ('error' in me) return { connected: [], already: [], missing: [], error: me.error };

  const connected: string[] = [];
  const already: string[] = [];
  const missing: { name: string; phone: string }[] = [];

  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone);
    if (!phone) continue;

    const person = await findPerson(phone);
    if (!person || person.householdId === me.householdId) {
      if (!person) missing.push({ name: contact.name, phone });
      continue;
    }

    const household = await getHousehold(person.householdId);
    const label = household?.name ?? contact.name;
    if (await isConnected(me.householdId, person.householdId)) {
      already.push(label);
    } else {
      await connect(me.householdId, person.householdId);
      connected.push(label);
    }
  }

  revalidatePath('/families');
  revalidatePath('/');
  return { connected, already, missing };
}

/**
 * Adding a family from the question screen, at the moment somebody is trying to
 * answer and cannot find their host.
 *
 * A number makes the household claimable: whoever owns it simply signs in later
 * and is already in the right family. Without one the household still works, but
 * nobody from it can ever join — so it is shown as not-yet-joined until a number
 * is attached. Only the person who added it is connected: nothing is inherited.
 */
export async function addFamilyNow(
  _prev: AddedFamily,
  formData: FormData,
): Promise<AddedFamily> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const name = familyName(
    String(formData.get('familyFirstNames') ?? ''),
    String(formData.get('familySurname') ?? ''),
  );
  const phone = normalizePhone(String(formData.get('familyPhone') ?? ''));
  if (!name && !phone) return { error: 'צריך שם למשפחה' };

  // A number we already know belongs to a household — connect, never duplicate.
  const known = phone ? await findPerson(phone) : undefined;
  let householdId: string;
  if (known) {
    if (known.householdId === me.householdId) return { error: 'זו המשפחה שלכם' };
    if (!(await isConnected(me.householdId, known.householdId))) {
      await connect(me.householdId, known.householdId);
    }
    householdId = known.householdId;
  } else {
    if (!name) return { error: 'צריך שם למשפחה' };
    householdId = await addHousehold(name);
    if (phone) await addPerson({ phone, name, householdId });
    await connect(me.householdId, householdId);
  }

  revalidatePath('/');
  revalidatePath('/families');

  // Handed back so the screen can select them straight away, and offer to invite
  // them if the number we hold is one nobody has actually signed in with.
  return {
    householdId,
    name: (await getHousehold(householdId))?.name ?? name,
    invitePhone: known ? '' : phone || '',
    savedAt: new Date().toISOString(),
  };
}

/**
 * Correcting the record after the fact. The log is append-only, so an edit is
 * simply a newer row for that holiday — the same mechanism as changing today's
 * answer, pointed at a date that has passed.
 */
export async function editHistory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };
  const person = await findPerson(phone);
  if (!person) return { error: 'עוד לא סיימתם להירשם' };

  const holiday = await getPastHoliday(
    String(formData.get('holidayKey') ?? '').trim(),
    person.householdId,
  );
  if (!holiday) return { error: 'החג הזה לא נמצא' };

  const kind = String(formData.get('kind') ?? '') as AnswerKind;
  if (!['hosting', 'guest', 'away'].includes(kind)) return { error: 'לא הבנתי את התשובה' };

  let hostHouseholdId = '';
  if (kind === 'guest') {
    const hostId = String(formData.get('hostHouseholdId') ?? '').trim();
    if (!hostId) return { error: 'צריך לבחור אצל מי הייתם' };
    if (hostId === person.householdId) return { error: 'אי אפשר להתארח אצל עצמכם' };
    if (!(await isConnected(person.householdId, hostId))) {
      return { error: 'המשפחה הזו לא במעגל שלכם' };
    }
    hostHouseholdId = hostId;
  }

  await appendAnswer({
    timestamp: new Date().toISOString(),
    holidayKey: holiday.key,
    kind,
    hostHouseholdId,
    byPhone: person.phone,
    forHouseholdId: '',
  });

  revalidatePath('/history');
  // A changing value, so the form can tell one save from the next and close.
  return { savedAt: new Date().toISOString() };
}

/** An occasion only this family sees — a birthday, a memorial, a barbecue. */
export async function createOccasion(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const name = String(formData.get('name') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  if (!name) return { error: 'צריך שם למועד' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'צריך תאריך' };

  await addOccasion(me.householdId, name, date, await chosenFromCircle(me.householdId, formData));
  revalidatePath('/');
  revalidatePath('/occasions');
  revalidatePath('/history');
  return { savedAt: new Date().toISOString() };
}

/**
 * Which of my families a form ticked. Filtered against the circle rather than
 * trusted, so a hand-made request cannot show an occasion to a household I am
 * not connected to.
 */
async function chosenFromCircle(householdId: string, formData: FormData): Promise<string[]> {
  const mine = new Set((await circleOf(householdId)).map((h) => h.id));
  return [...new Set(formData.getAll('share').map(String))].filter((id) => mine.has(id));
}

/** Widening or narrowing who sees an occasion after the fact. */
export async function shareOccasionWith(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  await shareOccasion(
    me.householdId,
    String(formData.get('holidayKey') ?? '').trim(),
    await chosenFromCircle(me.householdId, formData),
  );
  revalidatePath('/');
  revalidatePath('/occasions');
  revalidatePath('/history');
  return { savedAt: new Date().toISOString() };
}

export async function deleteOccasion(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  await removeOccasion(me.householdId, String(formData.get('holidayKey') ?? '').trim());
  revalidatePath('/');
  revalidatePath('/occasions');
  revalidatePath('/history');
  return { savedAt: new Date().toISOString() };
}

/**
 * Taking up one of the families suggested on the families screen. Only a
 * household that is actually being suggested can be added, so this cannot be
 * used to reach into the sheet and connect to an arbitrary id.
 */
export async function addSuggested(householdId: string): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const suggested = await suggestionsFor(me.householdId);
  if (!suggested.some((s) => s.household.id === householdId)) {
    return { error: 'המשפחה הזו לא בהצעות שלכם' };
  }

  await connect(me.householdId, householdId);
  revalidatePath('/families');
  revalidatePath('/');
  return {};
}

/** Turning down a suggestion, so it stops being offered. */
/**
 * Putting back a family hidden from the suggestions. It does not connect them —
 * they simply return to being offered, which is what an undo of a hiding means.
 */
export async function restoreSuggested(householdId: string): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const hidden = await hiddenSuggestions(me.householdId);
  if (!hidden.some((h) => h.id === householdId)) return { error: 'המשפחה הזו לא מוסתרת' };

  await restoreSuggestion(me.householdId, householdId);
  revalidatePath('/families');
  return { savedAt: new Date().toISOString() };
}

export async function dismissSuggested(householdId: string): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const suggested = await suggestionsFor(me.householdId);
  if (!suggested.some((s) => s.household.id === householdId)) {
    return { error: 'המשפחה הזו לא בהצעות שלכם' };
  }

  await dismissSuggestion(me.householdId, householdId);
  revalidatePath('/families');
  return {};
}

/**
 * A link to send. With a number it is that person's alone and dies once they
 * use it; without one it is the family's general link, reusable until it ages
 * out — which is what a link pasted into a group chat has to be.
 */
export type InviteLink = { token?: string; error?: string };

/**
 * Returns rather than throws: a thrown message from a server action reaches
 * the browser redacted in production, and the reasons this can fail are ones
 * the person needs to read.
 */
export async function newInviteLink(
  kind: 'family' | 'household',
  forPhone = '',
  /** A family already on our list, whose people have never signed in. */
  forHouseholdId = '',
): Promise<InviteLink> {
  const me = await currentHousehold();
  if ('error' in me) return { error: me.error };

  // Only a family we are connected to, and only one nobody has signed into:
  // a link that makes somebody an existing family is a key to that family.
  if (forHouseholdId) {
    if (!(await isConnected(me.householdId, forHouseholdId))) {
      return { error: 'המשפחה הזו לא במעגל שלכם' };
    }
    if ((await membersByHousehold()).get(forHouseholdId)?.length) {
      return { error: 'מישהו מהמשפחה הזו כבר נרשם — שלחו לו קישור אישי' };
    }
  }

  // A number that will not parse must not quietly become a general link: the
  // sender would believe they had sent something single-use.
  let phone = '';
  if (forPhone.trim()) {
    const parsed = normalizePhone(forPhone);
    if (!parsed) return { error: 'המספר לא נראה תקין — אפשר לתקן, או להשאיר ריק לקישור כללי' };
    phone = parsed;

    // A link aimed at a number the sheet knows is a key to that person's
    // account, so only somebody who knows them can make one: their own
    // household, or a family connected to it. Without this, registering as a
    // stranger and minting a link for a relative's number would open the gate
    // from the inside.
    const them = await findPerson(phone);
    if (
      them &&
      them.householdId !== me.householdId &&
      !(await isConnected(me.householdId, them.householdId))
    ) {
      return {
        error: 'המספר הזה לא במשפחה שלכם — קישור למישהו שכבר באפליקציה יכול לשלוח רק מי שמחובר אליו',
      };
    }
  }
  return { token: await createInvite(me.householdId, kind, phone, forHouseholdId) };
}

async function currentHousehold(): Promise<{ householdId: string } | ActionResult & { error: string }> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };
  const person = await findPerson(phone);
  if (!person) return { error: 'עוד לא סיימתם להירשם' };
  return { householdId: person.householdId };
}

export async function answer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };

  const person = await findPerson(phone);
  if (!person) return { error: 'עוד לא סיימתם להירשם' };

  const household = await getHousehold(person.householdId);
  if (!household) return { error: 'המשפחה שלכם כבר לא ברשימה' };

  // Which holiday is being answered comes from the form, because the screen may
  // have been stepped forward. Only holidays inside the window are accepted.
  const holidayKey = String(formData.get('holidayKey') ?? '').trim();
  const upcoming = await getUpcomingHolidays(person.householdId);
  const holiday = upcoming.find((h) => h.key === holidayKey) ?? (holidayKey ? undefined : upcoming[0]);
  if (!holiday) return { error: 'החג הזה כבר לא פתוח לתשובות' };

  const kind = String(formData.get('kind') ?? '') as AnswerKind;
  if (!['hosting', 'guest', 'away'].includes(kind)) return { error: 'לא הבנתי את התשובה' };

  let hostHouseholdId = '';
  if (kind === 'guest') {
    const hostId = String(formData.get('hostHouseholdId') ?? '').trim();
    if (!hostId) return { error: 'צריך לבחור אצל מי אתם מתארחים' };
    if (hostId === person.householdId) return { error: 'אי אפשר להתארח אצל עצמכם' };

    const hostHousehold = await getHousehold(hostId);
    if (!hostHousehold) return { error: 'המשפחה הזו לא נמצאה ברשימה' };
    // You can only record being at a family you are connected to.
    if (!(await isConnected(person.householdId, hostId))) {
      return { error: 'המשפחה הזו לא במעגל שלכם' };
    }
    hostHouseholdId = hostHousehold.id;
  }

  await appendAnswer({
    timestamp: new Date().toISOString(),
    holidayKey: holiday.key,
    kind,
    hostHouseholdId,
    byPhone: person.phone,
    forHouseholdId: '',
  });

  // Saying you are coming to somebody says they are hosting — the implication
  // only runs this way, which is why a guest at a third family implies nothing
  // about anyone else. Recorded only when the host has said nothing yet, so it
  // can never overwrite their own answer, and credited to the person who
  // actually said it rather than to somebody in the host's family who did not.
  if (kind === 'guest' && hostHouseholdId) {
    try {
      if (!(await getLatestAnswer(holiday.key, hostHouseholdId))) {
        await appendAnswer({
          timestamp: new Date().toISOString(),
          holidayKey: holiday.key,
          kind: 'hosting',
          hostHouseholdId: '',
          byPhone: person.phone,
          forHouseholdId: hostHouseholdId,
        });
      }
    } catch (error) {
      console.error('could not record the implied hosting answer', error);
    }
  }

  // Appended after every answer. The answer is already safely recorded, so a
  // failure here must not lose it.
  try {
    await recordConflicts();
  } catch (error) {
    console.error('could not record conflicts', error);
  }

  revalidatePath('/');
  revalidatePath('/history');
  return {};
}

/**
 * Answering for a family that has not — the grandfather who will never open
 * the app, the uncle who does not do phones. Anyone in the circle can, the
 * way anyone in the family group chat would say "saba is with us".
 *
 * It fills a gap or corrects what somebody else said on their behalf. It never
 * replaces an answer a family gave itself: that one is theirs, and the way to
 * change it is to write to them. The row is credited to whoever actually
 * spoke, and marked as being for the other family.
 */
export async function answerFor(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };
  const person = await findPerson(phone);
  if (!person) return { error: 'עוד לא סיימתם להירשם' };

  const forId = String(formData.get('householdId') ?? '').trim();
  if (!forId || forId === person.householdId) return { error: 'זו המשפחה שלכם — ענו בעצמכם' };
  if (!(await isConnected(person.householdId, forId))) return { error: 'המשפחה הזו לא במעגל שלכם' };

  const holidayKey = String(formData.get('holidayKey') ?? '').trim();
  const holiday = (await getUpcomingHolidays(forId)).find((h) => h.key === holidayKey);
  if (!holiday) return { error: 'החג הזה לא פתוח לתשובות בשבילם' };

  const latest = await getLatestAnswer(holiday.key, forId);
  if (latest && !latest.forHouseholdId) {
    return { error: 'הם ענו בעצמם — אם משהו השתנה, כתבו להם' };
  }

  const kind = String(formData.get('kind') ?? '') as AnswerKind;
  if (!['hosting', 'guest', 'away'].includes(kind)) return { error: 'לא הבנתי את התשובה' };

  let hostHouseholdId = '';
  if (kind === 'guest') {
    const hostId = String(formData.get('hostHouseholdId') ?? '').trim();
    if (!hostId) return { error: 'צריך לבחור אצל מי הם מתארחים' };
    if (hostId === forId) return { error: 'אי אפשר להתארח אצל עצמם' };
    // At a family *they* could be at: the host has to be in their circle, not
    // only in the circle of whoever is answering for them.
    if (!(await isConnected(forId, hostId))) return { error: 'המשפחה הזו לא במעגל שלהם' };
    hostHouseholdId = hostId;
  }

  await appendAnswer({
    timestamp: new Date().toISOString(),
    holidayKey: holiday.key,
    kind,
    hostHouseholdId,
    byPhone: person.phone,
    forHouseholdId: forId,
  });

  // The same implication as answering for yourself: saying they are going to
  // somebody says that somebody is hosting, unless that somebody already said.
  if (kind === 'guest' && hostHouseholdId) {
    try {
      if (!(await getLatestAnswer(holiday.key, hostHouseholdId))) {
        await appendAnswer({
          timestamp: new Date().toISOString(),
          holidayKey: holiday.key,
          kind: 'hosting',
          hostHouseholdId: '',
          byPhone: person.phone,
          forHouseholdId: hostHouseholdId,
        });
      }
    } catch (error) {
      console.error('could not record the implied hosting answer', error);
    }
  }

  try {
    await recordConflicts();
  } catch (error) {
    console.error('could not record conflicts', error);
  }

  revalidatePath('/');
  revalidatePath('/history');
  return { savedAt: new Date().toISOString() };
}

/**
 * Putting our own family's name right. It is often not ours to begin with —
 * somebody else added us before we ever opened the app, from a name in their
 * phone — so this is a correction, not a rename, and only we can make it.
 */
export async function nameOurHousehold(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const name = String(formData.get('householdName') ?? '').trim();
  if (!name) return { error: 'צריך שם למשפחה' };

  await renameHousehold(me.householdId, name);
  revalidatePath('/');
  revalidatePath('/families');
  return { savedAt: new Date().toISOString() };
}

export async function signOut(): Promise<void> {
  await clearSession();
  revalidatePath('/');
  redirect('/');
}

/**
 * Signing out *back onto* an invite. A link sent to one person is often opened
 * on a phone signed in as somebody else in the family — the household tablet,
 * a parent's phone — and dropping them at the front door loses the link, which
 * is the one thing that would have let them in.
 */
export async function switchAccount(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  await clearSession();
  const next = /^[A-Za-z0-9]+$/.test(token) ? `/join/${token}` : '/';
  revalidatePath(next);
  redirect(next);
}

/** Used by the answer screen: only families this household is connected to. */
export async function myCircle() {
  const me = await currentHousehold();
  return 'error' in me ? [] : circleOf(me.householdId);
}
