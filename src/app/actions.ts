'use server';

import { revalidatePath } from 'next/cache';
import {
  addPerson,
  appendAnswer,
  findPerson,
  getHousehold,
  getHouseholds,
  getNextHoliday,
  nextPersonId,
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
  revalidatePath('/');
  return {};
}

export async function register(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };

  const name = String(formData.get('name') ?? '').trim();
  const householdId = String(formData.get('householdId') ?? '').trim();
  if (!name) return { error: 'צריך שם' };
  if (!householdId) return { error: 'צריך לבחור משפחה' };

  const household = await getHousehold(householdId);
  if (!household) return { error: 'המשפחה הזו לא נמצאה ברשימה' };

  if (!(await findPerson(phone))) {
    await addPerson({ id: await nextPersonId(), phone, name, householdId });
  }
  revalidatePath('/');
  return {};
}

export async function answer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const phone = await getSessionPhone();
  if (!phone) return { error: 'הכניסה פגה, נסו שוב' };

  const person = await findPerson(phone);
  if (!person) return { error: 'עוד לא סיימתם להירשם' };

  const household = await getHousehold(person.householdId);
  if (!household) return { error: 'המשפחה שלכם כבר לא ברשימה' };

  const holiday = await getNextHoliday();
  if (!holiday) return { error: 'אין חג קרוב ברשימה' };

  const kind = String(formData.get('kind') ?? '') as AnswerKind;
  if (kind !== 'hosting' && kind !== 'guest') return { error: 'לא הבנתי את התשובה' };

  let hostHouseholdId = '';
  if (kind === 'guest') {
    const hostId = String(formData.get('hostHouseholdId') ?? '').trim();
    if (!hostId) return { error: 'צריך לבחור אצל מי אתם מתארחים' };
    if (hostId === person.householdId) return { error: 'אי אפשר להתארח אצל עצמכם' };

    const hostHousehold = await getHousehold(hostId);
    if (!hostHousehold) return { error: 'המשפחה הזו לא נמצאה ברשימה' };
    hostHouseholdId = hostHousehold.id;
  }

  await appendAnswer({
    timestamp: new Date().toISOString(),
    year: holiday.year,
    holidayKey: holiday.key,
    householdId: household.id,
    kind,
    hostHouseholdId,
    byPersonId: person.id,
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

/** Used by the registration screen, which needs the same list the answer screen shows. */
export async function householdOptions() {
  return getHouseholds();
}
