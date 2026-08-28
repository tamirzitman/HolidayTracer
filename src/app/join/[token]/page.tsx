import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card } from '@/components/ui';
import { connect, findPerson, isConnected, readInvite } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await readInvite(token);

  if (!invite) {
    return (
      <div className={`${card} flex flex-col gap-2 text-center`}>
        <Title>הקישור לא תקף</Title>
        <p className="text-muted">בקשו מהמשפחה שהזמינה אתכם לשלוח קישור חדש.</p>
      </div>
    );
  }

  const phone = await getSessionPhone();
  if (!phone) return <SignInForm invitedBy={invite.household.name} token={token} />;

  // Already registered: the invite just introduces the two families.
  // Already registered: the link just introduces the two families.
  const person = await findPerson(phone);
  if (person) {
    const inviterId = invite.household.id;
    if (person.householdId !== inviterId && !(await isConnected(person.householdId, inviterId))) {
      await connect(person.householdId, inviterId);
    }
    redirect('/families');
  }

  return (
    <JoinForm
      phone={phone}
      token={token}
      invitedBy={invite.household.name}
      kind={invite.kind}
    />
  );
}
