'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser';
import { AuthFeedback, AuthField, authErrorCode, postAuth } from './form-fields';

/** Task 2: invite identity forms always return to this invitation before explicit acceptance. */
export function AcceptInvitationForm({ token, signedIn }: { token: string; signedIn: boolean }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (signedIn) return;
    let active = true;
    void createSupabaseBrowserClient().auth.getSession().then(({ data, error: providerError }) => {
      if (!active) return;
      if (providerError) { setError('unknown'); return; }
      if (data.session) {
        window.history.replaceState(null, '', window.location.pathname);
        router.refresh();
      }
    }).catch(() => { if (active) setError('unknown'); });
    return () => { active = false; };
  }, [signedIn, router]);

  async function accept() {
    setPending(true); setError(null);
    try {
      const result = await postAuth<{ redirectTo: '/app/today' | '/coach' }>('/invitations/accept', { token }, locale);
      router.replace(result.redirectTo); router.refresh();
    } catch (caught) { setError(authErrorCode(caught)); }
    finally { setPending(false); }
  }

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setPending(true); setError(null); setInfo(null);
    try {
      const auth = createSupabaseBrowserClient().auth;
      const password = String(values.get('password') ?? '');
      if (mode === 'signup') {
        const result = await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
        if (result.error) { setError('unknown'); return; }
        if (!result.data.session) { setInfo(t('checkEmail')); return; }
      } else {
        const result = await auth.signInWithPassword({ email, password });
        if (result.error) { setError('credentials'); return; }
      }
      router.refresh();
    } catch { setError('unknown'); }
    finally { setPending(false); }
  }

  async function magicLink() {
    if (!email) { setInfo(t('emailRequired')); return; }
    setPending(true); setError(null); setInfo(null);
    try {
      const { error: providerError } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email, options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (providerError) setError('unknown'); else setInfo(t('magicLinkSent'));
    } catch { setError('unknown'); }
    finally { setPending(false); }
  }

  if (signedIn) return <VStack gap={4}>
    <AuthFeedback code={error} />
    <Button variant="primary" className="min-h-11 min-w-11" isDisabled={pending} onClick={accept} label={pending ? t('working') : t('invite.accept')} />
  </VStack>;

  return <form className="flex min-w-0 flex-col gap-4" onSubmit={identify} aria-busy={pending}>
    <Text as="p" type="supporting" color="secondary">{t('invite.identityHelp')}</Text>
    <AuthField id="email" type="email" name="email" dir="ltr" label={t('email')} autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} />
    <AuthField id="password" name="password" type="password" dir="ltr" label={t('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={128} disabled={pending} />
    <AuthFeedback code={error} info={info} />
    <Button variant="primary" className="min-h-11 min-w-11" type="submit" isDisabled={pending} label={pending ? t('working') : mode === 'signup' ? t('signUp') : t('signIn')} />
    <Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={pending} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setInfo(null); setError(null); }} label={mode === 'signin' ? t('createAccount') : t('alreadyHaveAccount')} />
    <Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={pending} onClick={magicLink} label={t('magicLink')} />
  </form>;
}
