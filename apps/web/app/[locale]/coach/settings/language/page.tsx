import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getPreferences } from '@/src/server/settings/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { LanguageForm } from '@/components/settings/language-form';

/** Task 11: own language and notification channels. */
export default async function LanguageSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.language');
  const preferences = await withAuthTx(auth, (tx) => getPreferences(tx, auth));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <LanguageForm initial={{ locale: preferences.locale, channels: preferences.channels }} /></div>;
}
