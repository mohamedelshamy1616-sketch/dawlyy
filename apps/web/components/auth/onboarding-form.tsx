'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';
import { BootstrapForm } from './bootstrap-form';
import { AuthFeedback, AuthField } from './form-fields';

/** Task 2: unassigned users can start a business or open their existing invitation link. */
export function OnboardingForm() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [choice, setChoice] = useState<'business' | 'invite' | null>(null);
  const [error, setError] = useState(false);

  function openInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('invitationLink') ?? '').trim();
    try {
      const url = new URL(value, window.location.origin);
      const match = url.pathname.match(/^\/(?:ar|en)\/invite\/([A-Za-z0-9_-]{43})\/?$/);
      const token = match?.[1] ?? (/^[A-Za-z0-9_-]{43}$/.test(value) ? value : null);
      if (!token) { setError(true); return; }
      // Navigate only to our invite route, never to the host supplied in the pasted URL.
      router.push(`/invite/${token}`);
    } catch { setError(true); }
  }

  return <VStack gap={4} className="min-w-0">
    <Button type="button" variant={choice === 'business' ? 'primary' : 'secondary'} className="h-auto min-h-11 whitespace-normal" aria-pressed={choice === 'business'} onClick={() => setChoice('business')} label={t('startBusiness')} />
    <Button type="button" variant={choice === 'invite' ? 'primary' : 'secondary'} className="h-auto min-h-11 whitespace-normal" aria-pressed={choice === 'invite'} onClick={() => setChoice('invite')} label={t('haveInvitation')} />
    {choice === 'business' ? <BootstrapForm /> : null}
    {choice === 'invite' ? <form onSubmit={openInvite} className="flex min-w-0 flex-col gap-4">
      <AuthField id="invitationLink" name="invitationLink" dir="ltr" label={t('invitationLink')} required autoComplete="off" />
      <AuthFeedback code={error ? 'invalid_invitation' : null} />
      <Button variant="primary" className="min-h-11 min-w-11" type="submit" label={t('openInvitation')} />
    </form> : null}
  </VStack>;
}
