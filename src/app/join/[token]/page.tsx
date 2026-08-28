import { JoinForm } from '@/components/JoinForm';
import { SignInForm } from '@/components/SignInForm';
import { Title, card } from '@/components/ui';
import { connect, findPerson, inviteHousehold, isConnected } from '@/lib/data';
import { getSessionPhone } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inviter = await inviteHousehold(token);

  if (!inviter) {
    return (
      <div className={`${card} flex flex-col gap-2 text-center`}>
        <Title>הקישור לא תקף</Title>
        <p className="text-muted">בקשו מהמשפחה שהזמינה אתכם לשלוח קישור חדש.</p>
      </div>
    );
  }

  const phone = await getSessionPhone();
  if (!phone) return <SignInForm invitedBy={inviter.name} token={token} />;

  // Already registered: the invite just introduces the two families.
  const person = await findPerson(phone);
  if (person) {
    if (person.householdId !== inviter.id && !(await isConnected(person.householdId, inviter.id))) {
      await connect(person.householdId, inviter.id);
    }
    redirect('/families');
  }

  return <JoinForm phone={phone} token={token} invitedBy={inviter.name} />;
}
