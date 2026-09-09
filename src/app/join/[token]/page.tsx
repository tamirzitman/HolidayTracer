import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { ConnectPrompt } from '@/components/ConnectPrompt';
import Link from 'next/link';
import { Title, card, primaryButton } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { claimableIn, findPerson, isConnected, readInvite } from '@/lib/data';
import { signOut, switchAccount } from '@/app/actions';
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
          circleName=""
          claimable={[]}
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

    // Already there? Nothing to ask. For a circle link that means already in
    // the circle — being connected to whoever sent it is not the same thing,
    // and the rest of the circle is exactly what the link is offering.
    const inviterId = invite.household.id;
    const settled = invite.circle
      ? invite.circle.members.some((m) => m.household.id === person.householdId)
      : person.householdId === inviterId || (await isConnected(person.householdId, inviterId));
    if (settled) redirect('/');
    return (
      <ConnectPrompt
        token={token}
        invitedBy={invite.household.name}
        circleName={invite.circle?.name ?? ''}
      />
    );
  }

  // A circle link shows the circle and nothing but: the families in it are the
  // ones the opener might be, and the sender's other families are not part of
  // this invitation. A family link still offers the sender's list, which is the
  // only list it can mean.
  const claimable = invite.circle
    ? invite.circle.members
    : await claimableIn(invite.household.id);

  return (
    <JoinForm
      phone={phone}
      token={token}
      invitedBy={invite.household.name}
      kind={invite.kind}
      circleName={invite.circle?.name ?? ''}
      joiningAs={invite.forHousehold?.name ?? ''}
      onLeave={signOut}
      claimable={claimable.map((c) => ({
        id: c.household.id,
        name: c.household.name,
        joined: c.joined,
      }))}
    />
  );
}
