'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { programErrorKey, programRequest } from './transport';

/** Task 4: short template setup; core emptyProgram constructs the full builder document on the server. */
export function NewProgram() {
  const t = useTranslations('programs'); const locale = useLocale(); const router = useRouter();
  const [name, setName] = useState(''); const [weeks, setWeeks] = useState(4); const [days, setDays] = useState([0, 2, 4]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="grid min-w-0 max-w-xl gap-6" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const result = await programRequest<{ head: { id: string } }>('/api/v1/programs', { method: 'POST', body: { name: { [locale === 'ar' ? 'ar' : 'en']: name.trim() }, weeks, trainingDays: days } });
      router.push(`/coach/programs/${result.head.id}`);
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); setBusy(false); }
  }}>
    <Grid gap={2}><TextInput label={t('name')} id="program-name" isRequired value={name} onChange={value => setName(value)} controlClassName="min-h-11" ref={input => { if (input) { input.maxLength = 200; input.required = true; } }} /></Grid>
    <Grid gap={2}><TextInput label={t('weeks')} id="program-weeks" isRequired value={String(weeks)} onChange={value => setWeeks(Number(value))} controlClassName="min-h-11" ref={input => {
      // Astryx's NumberInput clamps on blur; retain the existing native validation.
      if (input) { input.type = 'number'; input.required = true; input.min = '1'; input.max = '104'; }
    }} /></Grid>
    <fieldset className="grid gap-2"><legend className="mb-3 font-medium">{t('trainingDays')}</legend><HStack gap={2} wrap="wrap">{Array.from({ length: 7 }, (_, day) => <Button key={day} type="button" className="min-h-11 min-w-11" variant={days.includes(day) ? 'primary' : 'secondary'} aria-pressed={days.includes(day)} onClick={() => setDays(old => old.includes(day) ? old.filter(value => value !== day) : [...old, day])} label={new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + day)))} />)}</HStack></fieldset>
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    <Button type="submit" className="min-h-11 min-w-11" isDisabled={busy || !name.trim()} label={busy ? t('creating') : t('createTemplate')} />
  </form>;
}
