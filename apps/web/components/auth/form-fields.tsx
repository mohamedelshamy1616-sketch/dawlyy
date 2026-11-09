'use client';

import type { InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Task 2: consistently labelled, direction-safe auth inputs with 44px targets. */
export function AuthField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return <div className="flex min-w-0 flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Input id={id} {...props} className="h-11 min-w-0 max-w-full text-start" />
  </div>;
}

/** Task 2: only known, translated error messages reach the auth screens. */
export function AuthFeedback({ code, info }: { code?: string | null; info?: string | null }) {
  const t = useTranslations('auth');
  if (code) {
    const message = code === 'already_member' ? t('errors.alreadyMember')
      : code === 'invitation_used' ? t('errors.invitationUsed')
        : code === 'invalid_invitation' ? t('errors.invalidInvitation')
          : code === 'unauthenticated' ? t('errors.unauthenticated')
            : code === 'validation_error' ? t('errors.validation')
              : code === 'credentials' ? t('invalidCredentials')
                : code === 'passwordMismatch' ? t('reset.passwordMismatch')
                  : code === 'recovery' ? t('reset.invalidRecovery') : t('genericError');
    return <p role="alert" className="break-words text-sm text-destructive">{message}</p>;
  }
  return info ? <p role="status" className="break-words text-sm text-muted-foreground">{info}</p> : null;
}

/** Task 2: typed HTTP error that keeps server messages out of visible UI. */
export class AuthRequestError extends Error {
  constructor(readonly code: string) { super('Auth request failed'); }
}

/** Task 2: browser API requests use session cookies; passwords are sent only to Supabase. */
export async function postAuth<T>(path: string, body: unknown, locale: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': locale }, body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object'
      && 'code' in data.error && typeof data.error.code === 'string' ? data.error.code : 'unknown';
    throw new AuthRequestError(code);
  }
  return data as T;
}

/** Task 2: classify transport and API failures without rendering untrusted provider messages. */
export function authErrorCode(error: unknown): string {
  return error instanceof AuthRequestError ? error.code : 'unknown';
}
