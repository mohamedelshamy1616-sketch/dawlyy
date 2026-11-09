import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UserRound } from 'lucide-react';
import { AuthFrame } from '@/components/auth/auth-frame';
import { SignupForm } from '@/components/auth/signup-form';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Link } from '@/i18n/navigation';

/** Task 2: business sign-up with a branded local-build fallback when Supabase is unavailable. */
export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');
  const o = await getTranslations('onboarding');
  return <AuthFrame title={t('signUp')} subtitle={t('signupSubtitle')}>
    {process.env.NEXT_PUBLIC_SUPABASE_URL ? <SignupForm /> : <EmptyState Icon={UserRound}
      title={o('signupUnavailableTitle')} description={o('signupUnavailable')}
      action={<Link href="/login" className="inline-flex min-h-11 items-center underline">{t('backToLogin')}</Link>} />}
  </AuthFrame>;
}
