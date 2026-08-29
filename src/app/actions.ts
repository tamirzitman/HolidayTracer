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
  findPerson,
  getHousehold,
  getPastHoliday,
  getUpcomingHolidays,
  removeOccasion,
  isConnected,
  readInvite,
  recordConflicts,
  suggestionsFor,
  claimableIn,
} from '@/lib/data';
import { familyName } from '@/lib/names';
import { normalizePhone } from '@/lib/phone';
import { clearSession, getSessionPhone, setSessionPhone } from '@/lib/session';
import type { AnswerKind } from '@/lib/types';

export type ActionResult = { error?: string; savedAt?: string };

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  if (!phone) return { error: 'מספר הטלפון לא נראה תקין' };

  await setSessionPhone(phone);

  // Signing in from an invite should land back on the invite, not the question.
  const next = String(formData.get('next') ?? '');
  if (/^\/join\/[A-Za-z0-9]+$/.test(next)) {
    revalidatePath(next);
    redirect(next);
  }

  revalidatePath('/');
  return {};
}

/**
 * Joining happens through an invite: either the newcomer's family is already
 * here and they attach to it by a number inside it, or they name a new family.
 * Either way the inviter's household and theirs are introduced.
 */
export async function register(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };
  if (await findPerson(phone)) return {};

  const token = String(formData.get('token') ?? '').trim();
  const invite = token ? await readInvite(token) : undefined;
  if (!invite) return { error: 'צריך הזמנה ממשפחה שכבר רשומה' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'צריך שם' };

  let householdId: string;
  if (invite.kind === 'household') {
    // Joining the inviter's own household — a spouse, a grown child.
    householdId = invite.household.id;
  } else {
    // Saying "that one is us" about a family already on the list is what keeps
    // one family from becoming two. It works whichever number they sign up
    // with, which matching on the phone alone cannot.
    const claiming = String(formData.get('claimHouseholdId') ?? '').trim();
    if (claiming) {
      const claimable = await claimableIn(invite.household.id);
      if (!claimable.some((h) => h.id === claiming)) {
        return { error: 'המשפחה הזו לא ברשימה של מי שהזמין אתכם' };
      }
      householdId = claiming;
    } else {
      const named = familyName(
        String(formData.get('firstNames') ?? ''),
        String(formData.get('surname') ?? ''),
      );
      if (!named) return { error: 'צריך שם למשפחה' };
      householdId = await addHousehold(named);
    }
  }

  await addPerson({ phone, name, householdId });
  if (householdId !== invite.household.id) await connect(householdId, invite.household.id);

  // The families the newcomer ticked off the inviter's circle. Circles overlap
  // heavily — a parent's list can be all of yours — so arriving with only the
  // one family that invited you means arriving with nothing to answer about.
  // The choice is theirs and it costs the inviter nothing; every name is
  // checked against the inviter's circle so a hand-made form cannot connect
  // this household to a family nobody offered it.
  const offered = new Set((await circleOf(invite.household.id)).map((h) => h.id));
  for (const id of formData.getAll('share').map(String)) {
    if (!offered.has(id) || id === householdId) continue;
    if (!(await isConnected(householdId, id))) await connect(householdId, id);
  }

  // Straight to the question: that is what they came for.
  revalidatePath('/');
  redirect('/');
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
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
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
  if (known) {
    if (known.householdId === me.householdId) return { error: 'זו המשפחה שלכם' };
    if (!(await isConnected(me.householdId, known.householdId))) {
      await connect(me.householdId, known.householdId);
    }
  } else {
    if (!name) return { error: 'צריך שם למשפחה' };
    const householdId = await addHousehold(name);
    if (phone) await addPerson({ phone, name, householdId });
    await connect(me.householdId, householdId);
  }

  revalidatePath('/');
  revalidatePath('/families');
  return {};
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

  await addOccasion(me.householdId, name, date);
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

export async function newInviteLink(kind: 'family' | 'household'): Promise<string> {
  const me = await currentHousehold();
  if ('error' in me) throw new Error(me.error);
  return createInvite(me.householdId, kind);
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
  });

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

export async function signOut(): Promise<void> {
  await clearSession();
  revalidatePath('/');
}

/** Used by the answer screen: only families this household is connected to. */
export async function myCircle() {
  const me = await currentHousehold();
  return 'error' in me ? [] : circleOf(me.householdId);
}
