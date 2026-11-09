import { getTranslations, setRequestLocale } from 'next-intl/server';
import { KeyRound } from 'lucide-react';
import { AuthFrame } from '@/components/auth/auth-frame';
import { ResetForm } from '@/components/auth/reset-form';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Link } from '@/i18n/navigation';

/** Task 2: browser-owned Supabase email reset and recovery password form. */
export default async function ResetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  return <AuthFrame title={t('reset.title')} subtitle={t('reset.subtitle')}>
    {process.env.NEXT_PUBLIC_SUPABASE_URL ? <ResetForm /> : <EmptyState Icon={KeyRound}
      title={t('reset.title')} description={t('reset.unavailable')}
      action={<Link href="/login" className="inline-flex min-h-11 items-center underline">{t('backToLogin')}</Link>} />}
  </AuthFrame>;
}
