import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UserRound } from 'lucide-react';
import { AuthFrame } from '@/components/auth/auth-frame';
import { OnboardingForm } from '@/components/auth/onboarding-form';
import { SessionReturn } from '@/components/auth/session-return';
import { getAuthContext, getSessionUser } from '@/src/server/auth';
import { EmptyState } from '@/src/components/shell/empty-state';
import { Link, redirect } from '@/i18n/navigation';

/** Task 2: identity-only onboarding; requirePage would redirect unassigned users back here. */
export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('onboarding');
  const a = await getTranslations('auth');
  const identityAvailable = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    || (process.env.NODE_ENV !== 'production' && process.env.DAWLYY_DEV_LOGIN === '1');
  const user = identityAvailable ? await getSessionUser() : null;
  if (user) {
    const auth = await getAuthContext();
    if (auth) redirect({ href: auth.role === 'client' ? '/app/today' : '/coach', locale });
  }
  return <AuthFrame title={t('title')} subtitle={t('subtitle')}>
    {user ? <OnboardingForm /> : identityAvailable ? <SessionReturn /> : <EmptyState Icon={UserRound}
      title={t('signupUnavailableTitle')} description={t('signupUnavailable')}
      action={<Link href="/login" className="inline-flex min-h-11 items-center underline">{a('backToLogin')}</Link>} />}
  </AuthFrame>;
}
