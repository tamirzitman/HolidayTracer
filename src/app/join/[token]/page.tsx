import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { ConnectPrompt } from '@/components/ConnectPrompt';
import { Title, card } from '@/components/ui';
import { claimableIn, findPerson, isConnected, readInvite } from '@/lib/data';
import { signOut } from '@/app/actions';
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
        <JoinForm phone={phone} token="" invitedBy="" kind="family" claimable={[]} onLeave={signOut} />
      </div>
    );
  }

  if (!phone) return <SignInForm invitedBy={invite.household.name} token={token} />;

  // Already registered. Opening a link should never quietly put somebody on
  // your list — a friend who taps it out of curiosity has no business there —
  // so joining a circle is a decision, taken here.
  const person = await findPerson(phone);
  if (person) {
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
      onLeave={signOut}
      claimable={(await claimableIn(invite.household.id)).map((h) => ({ id: h.id, name: h.name }))}
    />
  );
}
