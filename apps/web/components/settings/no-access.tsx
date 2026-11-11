import { ShieldOff } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';

/** Task 11: shown instead of a settings page when the member lacks the module or role for it. */
export async function NoAccess() {
  const t = await getTranslations('settings.shared');
  return (
    <EmptyState Icon={ShieldOff} title={t('noAccessTitle')} description={t('noAccessBody')}
      action={<Link href="/coach/settings" className="inline-flex min-h-11 items-center underline">{t('backToSettings')}</Link>} />
  );
}
