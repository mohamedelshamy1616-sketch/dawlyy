'use client';
import { Card } from '@astryxdesign/core/Card';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { LocalizedText, NutritionTargets } from '@dawlyy/core/types';
import { Button } from '@astryxdesign/core/Button';
import { Link, useRouter } from '@/i18n/navigation';
import { BilingualField, foodText, NutritionEmpty, NutritionStatus, NutritionTextInput as TextInput } from './shared';
import { nutritionRequest } from './transport';
import type { NutritionDetail } from './types';
import { formatKcal, formatNumber, numberLocale } from '@/src/lib/numbers';

/** Task 6: minimal template/client card shape shared with the list endpoint. */
export type PlanCards = { items: Array<{ id: string; name: LocalizedText; targets: NutritionTargets | null; currentStatus: string | null; publishedVersionNo: number | null; assignedClientsCount: number }>; nextCursor: string | null };
/** Task 6: searchable template and client-copy tabs with stable cursor continuation. */
export function NutritionPlans({ initial, create }: { initial: PlanCards; create: boolean }) {
  const panelId = useId(); const t = useTranslations('nutrition'); const locale = useLocale(); const n = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale) }) }; const kcal = (value: number) => formatKcal(value, { locale: numberLocale(locale) }); const [data, setData] = useState(initial); const [kind, setKind] = useState('template'); const [q, setQ] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load(nextKind = kind, cursor?: string) { setBusy(true); setError(''); try { const next = await nutritionRequest<PlanCards>(`/api/v1/nutrition?kind=${nextKind}&q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); setData(cursor ? { ...next, items: [...data.items, ...next.items] } : next); setKind(nextKind); } catch { setError(t('errors.request')); } finally { setBusy(false); } }
  return <VStack gap={4} className="min-w-0"><TabList role="tablist" aria-label={t('plans.title')} value={kind} onChange={value => { if (!busy) void load(value); }}><Tab className="min-h-11!" value="template" label={t('plans.template')} aria-disabled={busy} ref={button => { if (button) button.disabled = busy; }} panelId={panelId} /><Tab className="min-h-11!" value="client" label={t('plans.client')} aria-disabled={busy} ref={button => { if (button) button.disabled = busy; }} panelId={panelId} /></TabList><form className="flex min-w-0 flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void load(); }}><TextInput label={t('plans.search')} isLabelHidden containerClassName="min-w-0 flex-1" controlClassName="min-h-11 min-w-0 flex-1" value={q} onChange={(_, e) => setQ(e.target.value)} placeholder={t('plans.search')} aria-label={t('plans.search')} /><Button variant="primary" type="submit" className="min-h-11" isDisabled={busy} label={t('common.search')} /></form>{create && <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link>}{error && <Text as="p" role="alert">{error}</Text>}{!data.items.length && <NutritionEmpty action={create ? <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link> : undefined} />}<Grid id={panelId} role="tabpanel" aria-label={t(`plans.${kind}`)} gap={3} className="min-w-0 md:grid-cols-2!">{data.items.map(p => <Link key={p.id} href={`/coach/nutrition/${p.id}`} className="min-h-11 min-w-0"><Card padding={4}><VStack gap={3}><Heading level={2} className="text-lg font-semibold">{foodText(p.name, locale)}</Heading><NutritionStatus status={p.currentStatus ?? 'draft'} /><Text as="p">{t('plans.kcal', { value: kcal(p.targets?.kcal ?? 0) })}</Text><Text as="p">{t('plans.assigned', { value: n.format(p.assignedClientsCount) })}</Text><Text as="p">{t('plans.publishedVersion', { value: n.format(p.publishedVersionNo ?? 0) })}</Text></VStack></Card></Link>)}</Grid>{data.nextCursor && <Button variant="primary" className="min-h-11" isDisabled={busy} onClick={() => void load(kind, data.nextCursor!)} label={t('common.more')} />}</VStack>;
}
/** Task 6: template creation immediately opens its first draft. */
export function NewNutrition({ allowed }: { allowed: boolean }) {
  const t = useTranslations('nutrition'); const router = useRouter(); const [name, setName] = useState<LocalizedText>({ ar: '', en: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="grid min-w-0 gap-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const plan = await nutritionRequest<NutritionDetail>('/api/v1/nutrition', { method: 'POST', body: { name } }); router.push(`/coach/nutrition/${plan.head.id}`); } catch { setError(t('errors.request')); } finally { setBusy(false); } }}><BilingualField label={t('common.name')} value={name} onChange={setName} disabled={!allowed || busy} />{error && <Text as="p" role="alert">{error}</Text>}<Button variant="primary" type="submit" className="min-h-11" isDisabled={!allowed || busy} label={t('plans.create')} /></form>;
}
