import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { ConnectPrompt } from '@/components/ConnectPrompt';
import Link from 'next/link';
import { Title, card, primaryButton } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { claimableIn, findPerson, isConnected, readInvite } from '@/lib/data';
import { signOut, switchAccount } from '@/app/actions';
import { gateOpen } from '@/lib/gate';
import { getSessionPhone } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await readInvite(token);
  const phone = await getSessionPhone();

  // A dead link is not a wall. These get forwarded around and opened months
  // later; landing on "this link is invalid" tells somebody who wanted the app
  // that they cannot have it. So an expired or unknown token simply becomes the
  // ordinary way in, with a line saying why nobody is being introduced.
  if (!invite) {
    const stale = (
      <p className="text-center text-sm text-muted">
        הקישור שפתחתם כבר לא בתוקף — אפשר פשוט להירשם.
      </p>
    );
    if (!phone) {
      return (
        <div className="flex flex-col gap-4">
          {stale}
          <SignInForm />
        </div>
      );
    }
    if (await findPerson(phone)) redirect('/');
    return (
      <div className="flex flex-col gap-4">
        {stale}
        <JoinForm
          phone={phone}
          token=""
          invitedBy=""
          kind="family"
          claimable={[]}
          canClaim={false}
          joiningAs=""
          onLeave={signOut}
        />
      </div>
    );
  }

  if (!phone) return <SignInForm invitedBy={invite.household.name} token={token} />;

  // Already registered. Opening a link should never quietly put somebody on
  // your list — a friend who taps it out of curiosity has no business there —
  // so joining a circle is a decision, taken here.
  const person = await findPerson(phone);
  if (person) {
    // A link meant for one number, opened on a phone signed in as somebody
    // else — the household tablet, a parent's phone. Redirecting away would
    // throw the link out, and it is the only thing that lets that person in.
    if (invite.forPhone && invite.forPhone !== phone) {
      return (
        <div className={`${card} flex flex-col gap-4 text-center`}>
          <span className="text-4xl" aria-hidden="true">👤</span>
          <Title>הקישור הזה נשלח למישהו אחר</Title>
          <p className="text-muted">
            הטלפון הזה מחובר בתור {person.name}. הקישור נשלח למספר{' '}
            <span dir="ltr">{formatPhone(invite.forPhone)}</span> — אפשר לצאת ולהיכנס איתו.
          </p>
          <form action={switchAccount}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={primaryButton}>
              יציאה וכניסה עם המספר הזה
            </button>
          </form>
          <Link href="/" className="text-sm font-semibold text-muted underline underline-offset-4">
            להישאר בתור {person.name}
          </Link>
        </div>
      );
    }

    const inviterId = invite.household.id;
    if (person.householdId === inviterId || (await isConnected(person.householdId, inviterId))) {
      redirect('/');
    }
    return <ConnectPrompt token={token} invitedBy={invite.household.name} />;
  }

  return (
    <JoinForm
      phone={phone}
      token={token}
      invitedBy={invite.household.name}
      kind={invite.kind}
      canClaim={gateOpen() || invite.forPhone === phone}
      joiningAs={invite.forHousehold?.name ?? ''}
      onLeave={signOut}
      claimable={(await claimableIn(invite.household.id)).map((c) => ({
        id: c.household.id,
        name: c.household.name,
        joined: c.joined,
      }))}
    />
  );
}
