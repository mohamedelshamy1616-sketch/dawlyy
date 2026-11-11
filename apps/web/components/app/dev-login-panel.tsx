import { getTranslations } from 'next-intl/server';
import { DevLoginPanelView } from '@/components/auth/auth-frame';

type Props = {
  locale: string;
  users: { userId: string; displayName: string; role: 'owner' | 'staff' | 'client'; tenantName: string }[];
};

/** doc §14 / P2B local testing: visibly labelled development forms for seeded demo memberships. */
export async function DevLoginPanel({ locale, users }: Props) {
  const t = await getTranslations('auth');
  return (
    <DevLoginPanelView locale={locale} users={users} title={t('devLogin.title')}
      description={t('devLogin.description')} empty={t('devLogin.empty')}
      roles={{ owner: t('devLogin.roles.owner'), staff: t('devLogin.roles.staff'), client: t('devLogin.roles.client') }} />
  );
}
