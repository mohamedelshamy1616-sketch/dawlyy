'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { AuthFeedback, AuthField, authErrorCode, postAuth } from './form-fields';

/** Task 2: a signed-in user starts a business without sending any identity or server-owned fields. */
export function BootstrapForm() {
  const t = useTranslations('onboarding');
  const a = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true); setError(null);
    try {
      await postAuth('/auth/bootstrap', {
        businessName: values.get('businessName'), displayName: values.get('displayName'),
        locale: locale === 'en' ? 'en' : 'ar', timezone: values.get('timezone'),
      }, locale);
      router.replace('/coach'); router.refresh();
    } catch (caught) { setError(authErrorCode(caught)); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" aria-busy={pending}>
    <AuthField id="businessName" name="businessName" label={t('businessName')} autoComplete="organization" required maxLength={160} disabled={pending} />
    <AuthField id="displayName" name="displayName" label={t('yourName')} autoComplete="name" required maxLength={160} disabled={pending} />
    <AuthField id="timezone" name="timezone" label={t('timezone')} defaultValue="Africa/Cairo" dir="ltr" required maxLength={100} disabled={pending} />
    <AuthFeedback code={error} />
    <Button type="submit" disabled={pending}>{pending ? a('working') : t('createBusiness')}</Button>
  </form>;
}
