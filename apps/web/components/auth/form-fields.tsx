'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { Field } from '@astryxdesign/core/Field';
import { TextInput, type TextInputType } from '@astryxdesign/core/TextInput';
import { Text } from '@astryxdesign/core/Text';

/** Task 2: consistently labelled, direction-safe auth inputs with 44px targets. */
export function AuthField({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  const { type = 'text', value, defaultValue, onChange, name, disabled, readOnly, autoFocus,
    className, style, size, autoCapitalize, ...nativeProps } = props;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => String(defaultValue ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = (event: Event) => {
      // Native resets apply after the event dispatch; respect a cancelled reset.
      queueMicrotask(() => {
        if (!event.defaultPrevented) setUncontrolledValue(String(defaultValue ?? ''));
      });
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [defaultValue]);

  // Preserve the public native-input contract for types/attributes outside TextInput's API.
  if ((type !== 'text' && type !== 'password' && type !== 'email' && type !== 'search' && type !== 'tel' && type !== 'url')
    || size !== undefined || autoCapitalize !== undefined || style !== undefined) {
    return <Field label={label} inputID={id} className="min-w-0 max-w-full">
      <input ref={inputRef} id={id} {...props} className="h-11 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-start text-sm" />
    </Field>;
  }

  return <TextInput {...nativeProps} ref={inputRef} id={id} label={label} type={type as TextInputType}
    htmlName={name} isDisabled={disabled} isReadOnly={readOnly} hasAutoFocus={autoFocus}
    {...{ disabled }}
    value={value === undefined ? uncontrolledValue : String(value)}
    onChange={(nextValue, event) => { setUncontrolledValue(nextValue); onChange?.(event); }}
    containerClassName="min-w-0 max-w-full [&_input]:min-h-11 [&_input]:text-start"
    controlClassName={['min-h-11', className].filter(Boolean).join(' ')} />;
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
    return <Text as="p" type="supporting" role="alert" className="break-words text-destructive">{message}</Text>;
  }
  return info ? <Text as="p" type="supporting" color="secondary" role="status" className="break-words">{info}</Text> : null;
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
