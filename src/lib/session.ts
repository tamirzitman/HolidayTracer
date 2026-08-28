import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'ht_phone';
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production');
  }
  return 'dev-only-insecure-secret';
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The phone number this browser has signed in with, or null. */
export async function getSessionPhone(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const at = raw.lastIndexOf('.');
  if (at < 1) return null;
  const phone = raw.slice(0, at);
  return verify(phone, raw.slice(at + 1)) ? phone : null;
}

export async function setSessionPhone(phone: string): Promise<void> {
  (await cookies()).set(COOKIE, `${phone}.${sign(phone)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
