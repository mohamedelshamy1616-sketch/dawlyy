'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { formatNumber, numberLocale, type NumeralSystem } from '@/src/lib/numbers';
import type { ReviewPreferences } from '@/src/server/review/types';
import { reviewRequest, ReviewRequestError } from './review-workspace';

/** R4b: caller-only reply preferences, saved explicitly without changing other preferences. */
export function ReviewPreferencesForm({ initial, numerals = 'latn', initialError }: { initial: ReviewPreferences; numerals?: NumeralSystem; initialError?: 'forbidden' | 'request' }) {
  const t = useTranslations('review');
  const locale = numberLocale(useLocale());
  const [dialect, setDialect] = useState(initial.dialect);
  const [phrases, setPhrases] = useState(initial.signaturePhrases.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const receipt = useRef<{ fingerprint: string; key: string } | null>(null);
  const count = (value: number) => formatNumber(value, { locale, numerals, maximumFractionDigits: 0 });
  async function save() {
    if (pending.current) return;
    const signaturePhrases = phrases.split('\n').map(value => value.trim()).filter(Boolean);
    if (signaturePhrases.length > 5 || signaturePhrases.some(value => value.length > 200)) { setError('validation'); setSaved(false); return; }
    pending.current = true; setBusy(true); setError(null); setSaved(false);
    const body: ReviewPreferences = { dialect, signaturePhrases };
    const fingerprint = JSON.stringify(body);
    const key = receipt.current?.fingerprint === fingerprint ? receipt.current.key : crypto.randomUUID();
    receipt.current = { fingerprint, key };
    try {
      const result = await reviewRequest<ReviewPreferences>('/api/v1/settings/review-preferences', { method: 'PUT', body, key });
      setDialect(result.dialect); setPhrases(result.signaturePhrases.join('\n')); setSaved(true); receipt.current = null;
    } catch (failure) {
      if (failure instanceof ReviewRequestError && failure.status < 500) receipt.current = null;
      setError(failure instanceof ReviewRequestError && failure.status === 403 ? 'forbidden' : 'request');
    } finally { pending.current = false; setBusy(false); }
  }
  return <VStack gap={6} className="min-w-0 max-w-full" dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-busy={busy}>
    <VStack gap={2} className="min-w-0 max-w-full">
      <Link href="/coach/settings" className="inline-flex min-h-11 min-w-11 max-w-full items-center break-words rounded-lg underline focus-ring">{t('settings.back')}</Link>
      <Heading level={1} wordBreak="break-word">{t('settings.title')}</Heading><Text as="p" color="secondary">{t('settings.description')}</Text>
    </VStack>
    {error ? <Text as="p" role="alert">{t(error === 'validation' ? 'settings.validation' : `errors.${error}`)}</Text> : null}
    {error !== 'forbidden' ? <VStack as="section" gap={4} className="min-w-0 max-w-full">
      <VStack gap={2} className="min-w-0 max-w-full" role="group" aria-labelledby="review-dialect-label">
        <Heading level={2} id="review-dialect-label">{t('settings.dialect')}</Heading>
        <HStack gap={2} wrap="wrap">{(['egyptian', 'gulf'] as const).map(value => <Button key={value} label={t(`settings.dialects.${value}`)} aria-pressed={dialect === value} size="lg" variant={dialect === value ? 'primary' : 'secondary'} isDisabled={busy} onClick={() => { setDialect(value); setSaved(false); }} />)}</HStack>
      </VStack>
      <TextArea label={t('settings.phrases')} description={t('settings.phrasesHint', { max: count(5), length: count(200) })} value={phrases} onChange={value => { setPhrases(value); setSaved(false); }} rows={5} isDisabled={busy} containerClassName="min-w-0 max-w-full" controlClassName="min-h-11" />
      <Button label={t('settings.save')} size="lg" variant="primary" isDisabled={busy} onClick={() => void save()} />
      {busy ? <Text as="p" role="status">{t('settings.saving')}</Text> : null}
      {saved ? <Text as="p" role="status" aria-live="polite">{t('settings.saved')}</Text> : null}
    </VStack> : null}
  </VStack>;
}
