'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@/i18n/navigation';
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser';
import { AuthFeedback, AuthField } from './form-fields';

/** Task 2: Supabase owns password reset, recovery session establishment and password updates. */
export function ResetForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [recovering, setRecovering] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const auth = createSupabaseBrowserClient().auth;
    const url = new URL(window.location.href);
    const recovery = url.searchParams.get('recovery') === '1' || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
    const { data: listener } = auth.onAuthStateChange((event, session) => {
      if (active && event === 'PASSWORD_RECOVERY' && session) setRecovering(true);
    });
    void auth.getSession().then(({ data, error: providerError }) => {
      if (!active) return;
      if (providerError || (recovery && !data.session)) setError('recovery');
      if (recovery && data.session) setRecovering(true);
      window.history.replaceState(null, '', window.location.pathname);
      setChecking(false);
    }).catch(() => { if (active) { setError('unknown'); setChecking(false); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true); setError(null); setInfo(null);
    try {
      const auth = createSupabaseBrowserClient().auth;
      if (recovering) {
        if (values.get('password') !== values.get('confirmPassword')) { setError('passwordMismatch'); return; }
        const result = await auth.updateUser({ password: String(values.get('password') ?? '') });
        if (result.error) { setError('unknown'); return; }
        setDone(true); setInfo(t('reset.updated'));
      } else {
        const result = await auth.resetPasswordForEmail(String(values.get('email') ?? ''), {
          redirectTo: `${window.location.origin}/${locale}/reset?recovery=1`,
        });
        if (result.error) { setError('unknown'); return; }
        setInfo(t('reset.sent'));
      }
    } catch { setError('unknown'); }
    finally { setPending(false); }
  }

  if (checking) return <Text as="p" role="status" type="supporting" color="secondary">{t('working')}</Text>;
  return <form className="flex min-w-0 flex-col gap-4" onSubmit={submit} aria-busy={pending}>
    {recovering ? <>
      <AuthField id="password" name="password" type="password" dir="ltr" label={t('reset.newPassword')} autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending || done} />
      <AuthField id="confirmPassword" name="confirmPassword" type="password" dir="ltr" label={t('reset.confirmPassword')} autoComplete="new-password" required minLength={8} maxLength={128} disabled={pending || done} />
    </> : <AuthField id="email" name="email" type="email" dir="ltr" label={t('email')} autoComplete="email" required maxLength={254} disabled={pending} />}
    <AuthFeedback code={error} info={info} />
    <Button variant="primary" className="min-h-11 min-w-11" type="submit" isDisabled={pending || done} label={pending ? t('working') : recovering ? t('reset.save') : t('reset.send')} />
    <Link href="/login" className="inline-flex min-h-11 items-center justify-center text-sm underline">{t('backToLogin')}</Link>
  </form>;
}
