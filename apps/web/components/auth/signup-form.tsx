'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser';
import { AuthFeedback, AuthField, authErrorCode, postAuth } from './form-fields';

/** Task 2: Supabase creates the identity in the browser; only profile settings cross the bootstrap API. */
export function SignupForm() {
  const t = useTranslations('auth');
  const o = useTranslations('onboarding');
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true); setError(null); setInfo(null);
    try {
      if (!created) {
        const { data, error: providerError } = await createSupabaseBrowserClient().auth.signUp({
          email: String(values.get('email') ?? ''), password: String(values.get('password') ?? ''),
          options: { emailRedirectTo: `${window.location.origin}/${locale}/onboarding` },
        });
        if (providerError) { setError('unknown'); return; }
        setCreated(true);
        if (!data.session) { setInfo(t('checkEmail')); return; }
      }
      await postAuth('/auth/bootstrap', {
        businessName: values.get('businessName'), displayName: values.get('displayName'),
        locale: locale === 'en' ? 'en' : 'ar', timezone: 'Africa/Cairo',
      }, locale);
      router.replace('/coach'); router.refresh();
    } catch (caught) { setError(authErrorCode(caught)); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" aria-busy={pending}>
    <AuthField id="businessName" name="businessName" label={o('businessName')} autoComplete="organization" required maxLength={160} disabled={pending} />
    <AuthField id="displayName" name="displayName" label={o('yourName')} autoComplete="name" required maxLength={160} disabled={pending} />
    <AuthField id="email" name="email" type="email" dir="ltr" label={t('email')} autoComplete="email" required maxLength={254} disabled={pending || created} />
    <AuthField id="password" name="password" type="password" dir="ltr" label={t('password')} autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending || created} />
    <AuthFeedback code={error} info={info} />
    <Button type="submit" disabled={pending || Boolean(info)}>{pending ? t('working') : created ? o('createBusiness') : t('signUp')}</Button>
    {created ? <Link className="inline-flex min-h-11 items-center justify-center text-sm underline" href="/onboarding">{o('continueSetup')}</Link> : null}
    <Link className="inline-flex min-h-11 items-center justify-center text-sm underline" href="/login">{t('alreadyHaveAccount')}</Link>
  </form>;
}
