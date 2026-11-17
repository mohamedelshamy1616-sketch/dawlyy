import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { PageHeader } from '@/src/components/shell/page-header';
import { SettingsHub } from '@/components/settings/settings-hub';

/** Task 11: settings hub. Lists only the areas this member may open. */
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.hub');
  const clientApp = await getTranslations('clientAppComposer');
  const ai = await getTranslations('aiProvider');
  const activity = await getTranslations('activity');
  const item = (key: 'business' | 'team' | 'branding' | 'language' | 'legal' | 'legalPages', href: string) => ({ href, title: t(`${key}.title`), body: t(`${key}.body`) });
  const items = [
    item('business', '/coach/settings/business'),
    ...(isAllowed(auth, 'team', 'view') ? [item('team', '/coach/settings/team')] : []),
    item('branding', '/coach/settings/branding'),
    item('language', '/coach/settings/language'),
    ...(auth.role === 'owner' ? [item('legal', '/coach/settings/legal')] : []),
    ...((auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view')
      ? [{ href: '/coach/settings/activity', title: activity('title'), body: activity('subtitle') }] : []),
    ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/ai', title: ai('hub.title'), body: ai('hub.body') }] : []),
    ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/client-app', title: clientApp('hub.title'), body: clientApp('hub.body') }] : []),
    item('legalPages', '/terms'),
  ];
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><SettingsHub items={items} /></div>;
}
