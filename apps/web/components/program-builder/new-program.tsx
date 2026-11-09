'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="grid gap-2"><Label htmlFor="program-name">{t('name')}</Label><Input id="program-name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="min-h-11" /></div>
    <div className="grid gap-2"><Label htmlFor="program-weeks">{t('weeks')}</Label><Input id="program-weeks" type="number" required min={1} max={104} value={weeks} onChange={e => setWeeks(Number(e.target.value))} className="min-h-11" /></div>
    <fieldset className="grid gap-2"><legend className="mb-3 font-medium">{t('trainingDays')}</legend><div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, day) => <Button key={day} type="button" className="min-h-11" variant={days.includes(day) ? 'default' : 'outline'} aria-pressed={days.includes(day)} onClick={() => setDays(old => old.includes(day) ? old.filter(value => value !== day) : [...old, day])}>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + day)))}</Button>)}</div></fieldset>
    {error ? <p role="alert">{error}</p> : null}
    <Button type="submit" className="min-h-11" disabled={busy || !name.trim()}>{busy ? t('creating') : t('createTemplate')}</Button>
  </form>;
}
