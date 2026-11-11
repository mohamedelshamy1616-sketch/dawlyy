import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Users } from 'lucide-react';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listInvitations } from '@/src/server/invitations';
import { listTeam } from '@/src/server/team/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { NoAccess } from '@/components/settings/no-access';
import { TeamPanel } from '@/components/settings/team-panel';

/** Task 11: team members, pending staff invitations and the invite form (owner). */
export default async function TeamSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.team');
  if (!isAllowed(auth, 'team', 'view')) return <NoAccess />;
  const data = await withAuthTx(auth, async (tx) => ({
    team: await listTeam(tx, auth),
    invitations: auth.role === 'owner' ? await listInvitations(tx, auth, { limit: 50 }) : { items: [], nextCursor: null },
  }));
  const pending = data.invitations.items.filter((row) => row.role === 'staff' && row.status === 'pending')
    .map((row) => ({ id: row.id, displayName: row.displayName, email: row.email, expiresAt: row.expiresAt }));
  const onlyYou = data.team.items.length <= 1 && pending.length === 0;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    {onlyYou ? <EmptyState Icon={Users} title={t('emptyTitle')} description={t('emptyBody')} /> : null}
    <TeamPanel members={data.team.items} pending={pending} selfMembershipId={auth.membershipId} isOwner={auth.role === 'owner'} /></div>;
}
