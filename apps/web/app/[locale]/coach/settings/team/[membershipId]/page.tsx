import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getTeamMember } from '@/src/server/team/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { Link } from '@/i18n/navigation';
import { NoAccess } from '@/components/settings/no-access';
import { PermissionEditor } from '@/components/settings/permission-editor';

/** Task 11: per-user permission editor. Owner only; the owner membership itself has nothing to edit. */
export default async function MemberPermissionsPage({ params }: { params: Promise<{ locale: string; membershipId: string }> }) {
  await connection();
  const { locale, membershipId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings');
  if (auth.role !== 'owner') return <NoAccess />;
  if (!z.uuid().safeParse(membershipId).success) notFound();
  const member = await withAuthTx(auth, (tx) => getTeamMember(tx, auth, membershipId)).catch(() => null);
  if (!member) notFound();
  const name = member.displayName ?? t('team.noName');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('permissions.title', { name })} />
    {member.role === 'owner' ? <p>{t('permissions.ownerFixed')}</p> : <PermissionEditor member={member} />}
    <Link href="/coach/settings/team" className="inline-flex min-h-11 items-center underline">{t('shared.backToTeam')}</Link></div>;
}
