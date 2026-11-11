'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { LocalizedText, NutritionTargets } from '@dawlyy/core/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { BilingualField, foodText, NutritionEmpty, NutritionStatus } from './shared';
import { nutritionRequest } from './transport';
import type { NutritionDetail } from './types';

/** Task 6: minimal template/client card shape shared with the list endpoint. */
export type PlanCards = { items: Array<{ id: string; name: LocalizedText; targets: NutritionTargets | null; currentStatus: string | null; publishedVersionNo: number | null; assignedClientsCount: number }>; nextCursor: string | null };
/** Task 6: searchable template and client-copy tabs with stable cursor continuation. */
export function NutritionPlans({ initial, create }: { initial: PlanCards; create: boolean }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale); const [data, setData] = useState(initial); const [kind, setKind] = useState('template'); const [q, setQ] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load(nextKind = kind, cursor?: string) { setBusy(true); setError(''); try { const next = await nutritionRequest<PlanCards>(`/api/v1/nutrition?kind=${nextKind}&q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); setData(cursor ? { ...next, items: [...data.items, ...next.items] } : next); setKind(nextKind); } catch { setError(t('errors.request')); } finally { setBusy(false); } }
  return <div className="grid min-w-0 gap-4"><div role="tablist" aria-label={t('plans.title')} className="flex flex-wrap gap-2">{['template', 'client'].map(k => <Button className="min-h-11" role="tab" aria-selected={kind === k} variant={kind === k ? 'secondary' : 'outline'} key={k} disabled={busy} onClick={() => void load(k)}>{t(`plans.${k}`)}</Button>)}</div><form className="flex min-w-0 flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void load(); }}><Input className="min-h-11 min-w-0 flex-1" value={q} onChange={e => setQ(e.target.value)} placeholder={t('plans.search')} aria-label={t('plans.search')} /><Button className="min-h-11" disabled={busy}>{t('common.search')}</Button></form>{create && <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link>}{error && <p role="alert">{error}</p>}{!data.items.length && <NutritionEmpty action={create ? <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link> : undefined} />}<div className="grid min-w-0 gap-3 md:grid-cols-2">{data.items.map(p => <Link key={p.id} href={`/coach/nutrition/${p.id}`} className="grid min-w-0 gap-3 rounded-2xl border p-4"><h2 className="text-lg font-semibold">{foodText(p.name, locale)}</h2><NutritionStatus status={p.currentStatus ?? 'draft'} /><p>{t('plans.kcal', { value: n.format(p.targets?.kcal ?? 0) })}</p><p>{t('plans.assigned', { value: n.format(p.assignedClientsCount) })}</p><p>{t('plans.publishedVersion', { value: n.format(p.publishedVersionNo ?? 0) })}</p></Link>)}</div>{data.nextCursor && <Button className="min-h-11" disabled={busy} onClick={() => void load(kind, data.nextCursor!)}>{t('common.more')}</Button>}</div>;
}
/** Task 6: template creation immediately opens its first draft. */
export function NewNutrition({ allowed }: { allowed: boolean }) {
  const t = useTranslations('nutrition'); const router = useRouter(); const [name, setName] = useState<LocalizedText>({ ar: '', en: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="grid min-w-0 gap-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const plan = await nutritionRequest<NutritionDetail>('/api/v1/nutrition', { method: 'POST', body: { name } }); router.push(`/coach/nutrition/${plan.head.id}`); } catch { setError(t('errors.request')); } finally { setBusy(false); } }}><BilingualField label={t('common.name')} value={name} onChange={setName} disabled={!allowed || busy} />{error && <p role="alert">{error}</p>}<Button className="min-h-11" disabled={!allowed || busy}>{t('plans.create')}</Button></form>;
}
