'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addHousehold,
  addPerson,
  appendAnswer,
  circleOf,
  connect,
  createInvite,
  findPerson,
  getHousehold,
  getUpcomingHolidays,
  hideFamily,
  inviteHousehold,
  isConnected,
  rewriteConflicts,
} from '@/lib/data';
import { normalizePhone } from '@/lib/phone';
import { clearSession, getSessionPhone, setSessionPhone } from '@/lib/session';
import type { AnswerKind } from '@/lib/types';

export type ActionResult = { error?: string };

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
  const inviter = token ? await inviteHousehold(token) : undefined;
  if (!inviter) return { error: 'צריך הזמנה ממשפחה שכבר רשומה' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'צריך שם' };

  const joinPhone = normalizePhone(String(formData.get('joinPhone') ?? ''));
  const householdName = String(formData.get('householdName') ?? '').trim();

  let householdId: string;
  if (joinPhone) {
    const relative = await findPerson(joinPhone);
    if (!relative) return { error: 'המספר הזה לא מוכר לנו' };
    householdId = relative.householdId;
  } else if (householdName) {
    householdId = await addHousehold(householdName);
  } else {
    return { error: 'צריך שם למשפחה, או מספר של מישהו שכבר רשום ממנה' };
  }

  await addPerson({ phone, name, householdId });
  if (householdId !== inviter.id) await connect(householdId, inviter.id);

  // Straight to the question: that is what they came for.
  revalidatePath('/');
  redirect('/');
}

/** Connect to a family already in the app, by a number you would call anyway. */
export async function addFamily(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  if (!phone) return { error: 'מספר הטלפון לא נראה תקין' };

  const person = await findPerson(phone);
  if (!person) return { error: 'המספר הזה עוד לא רשום. שלחו להם הזמנה' };
  if (person.householdId === me.householdId) return { error: 'זו המשפחה שלכם' };
  if (await isConnected(me.householdId, person.householdId)) return { error: 'הם כבר ברשימה שלכם' };

  await connect(me.householdId, person.householdId);
  revalidatePath('/families');
  revalidatePath('/');
  return {};
}

/** One-sided: they keep seeing you, so nobody is cut off without knowing. */
export async function hide(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await currentHousehold();
  if ('error' in me) return me;

  const theirs = String(formData.get('householdId') ?? '').trim();
  if (!theirs) return { error: 'לא הבנתי איזו משפחה' };

  await hideFamily(me.householdId, theirs);
  revalidatePath('/families');
  revalidatePath('/');
  return {};
}

export async function newInviteLink(): Promise<string> {
  const me = await currentHousehold();
  if ('error' in me) throw new Error(me.error);
  return createInvite(me.householdId);
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
  const upcoming = await getUpcomingHolidays();
  const holiday = upcoming.find((h) => h.key === holidayKey) ?? (holidayKey ? undefined : upcoming[0]);
  if (!holiday) return { error: 'החג הזה כבר לא פתוח לתשובות' };

  const kind = String(formData.get('kind') ?? '') as AnswerKind;
  if (kind !== 'hosting' && kind !== 'guest') return { error: 'לא הבנתי את התשובה' };

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

  // Derived from every answer, so it is recomputed after each one. The answer is
  // already safely recorded; a failure here must not lose it.
  try {
    await rewriteConflicts();
  } catch (error) {
    console.error('could not rewrite the Conflicts tab', error);
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
