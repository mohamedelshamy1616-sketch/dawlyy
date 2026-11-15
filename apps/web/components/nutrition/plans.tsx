'use client';
import { Card } from '@astryxdesign/core/Card';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
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
import { ArchivedEmpty, ArchivedFilter, ArchiveRowControl, useReloadOnUndoSettle } from '@/components/control/archive-controls';
import { BulkBar, BulkRowCheckbox, BulkSelectAll, useBulkSelection } from '@/components/control/bulk-actions';
import { listUrl } from '@/src/lib/control/archive-transport';
import type { BulkItem } from '@/src/lib/control/bulk-actions';

/** Task 6: minimal template/client card shape shared with the list endpoint. */
export type PlanCards = { items: Array<{ id: string; name: LocalizedText; targets: NutritionTargets | null; currentStatus: string | null; publishedVersionNo: number | null; assignedClientsCount: number; archivedAt?: string | null }>; nextCursor: string | null };
/** Task 6 / R3a: searchable template and client-copy tabs, an Active or Archived switch, bulk archive and stable cursor continuation. */
export function NutritionPlans({ initial, create, canEdit = false, initialKind = 'template', initialArchived = false, initialQuery = '' }: { initial: PlanCards; create: boolean; canEdit?: boolean; initialKind?: 'template' | 'client'; initialArchived?: boolean; initialQuery?: string }) {
  const panelId = useId(); const t = useTranslations('nutrition'); const locale = useLocale(); const n = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale) }) }; const kcal = (value: number) => formatKcal(value, { locale: numberLocale(locale) });
  const [data, setData] = useState(initial); const [kind, setKind] = useState<string>(initialKind); const [archived, setArchived] = useState(initialArchived); const [q, setQ] = useState(initialQuery); const [applied, setApplied] = useState(initialQuery);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const bulkItems: BulkItem[] = data.items.map(plan => ({ id: plan.id, name: foodText(plan.name, locale), archived, canEdit }));
  const selection = useBulkSelection(bulkItems, JSON.stringify([kind, applied, archived]));
  /* Every filter change restarts at page one; only "more" passes a cursor. A failed read keeps the rows already shown. */
  async function load(next: { kind?: string; archived?: boolean; cursor?: string } = {}) {
    const nextKind = next.kind ?? kind; const nextArchived = next.archived ?? archived;
    setBusy(true); setError('');
    try {
      const page = await nutritionRequest<PlanCards>(listUrl('nutrition', { kind: nextKind, q }, nextArchived, next.cursor));
      setData(next.cursor ? { ...page, items: [...data.items, ...page.items] } : page); setKind(nextKind); setArchived(nextArchived); setApplied(q);
    } catch { setError(t('errors.request')); } finally { setBusy(false); }
  }
  useReloadOnUndoSettle(() => void load());
  return <VStack gap={4} className="min-w-0">
    <TabList role="tablist" aria-label={t('plans.title')} value={kind} onChange={value => { if (!busy) void load({ kind: value }); }}>
      <Tab className="min-h-11!" value="template" label={t('plans.template')} aria-disabled={busy} ref={button => { if (button) button.disabled = busy; }} panelId={panelId} />
      <Tab className="min-h-11!" value="client" label={t('plans.client')} aria-disabled={busy} ref={button => { if (button) button.disabled = busy; }} panelId={panelId} />
    </TabList>
    <form className="flex min-w-0 flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void load(); }}>
      <TextInput label={t('plans.search')} isLabelHidden containerClassName="min-w-0 flex-1" controlClassName="min-h-11 min-w-0 flex-1" value={q} onChange={(_, e) => setQ(e.target.value)} placeholder={t('plans.search')} aria-label={t('plans.search')} />
      <Button variant="primary" type="submit" className="min-h-11" isDisabled={busy} label={t('common.search')} />
    </form>
    <ArchivedFilter archived={archived} onSelect={value => { if (!busy) void load({ archived: value }); }} />
    {create && <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link>}
    {error && <Text as="p" role="alert">{error}</Text>}
    {canEdit && data.items.length ? <BulkSelectAll items={bulkItems} selected={selection.selected} onChange={all => (all ? selection.selectAll() : selection.clear())} /> : null}
    <BulkBar entity="nutrition" items={bulkItems} selected={selection.selected} archivedView={archived} onSelectionChange={selection.set} onChanged={() => void load()} />
    {busy && !data.items.length ? <Text as="p" role="status">{t('common.loading')}</Text> : null}
    {!busy && !data.items.length && archived ? <ArchivedEmpty /> : null}
    {!busy && !data.items.length && !archived && <NutritionEmpty action={create ? <Link className="inline-flex min-h-11 items-center underline" href="/coach/nutrition/new">{t('plans.create')}</Link> : undefined} />}
    <Grid id={panelId} role="tabpanel" aria-label={t(`plans.${kind}`)} gap={3} className="min-w-0 md:grid-cols-2!">{data.items.map(p => <Card key={p.id} padding={4}><VStack gap={3}>
      <HStack gap={2} wrap="wrap" align="center" className="min-w-0">{canEdit ? <BulkRowCheckbox item={bulkItems.find(row => row.id === p.id)!} selected={selection.selected.has(p.id)} onToggle={() => selection.toggle(p.id)} /> : null}
        <Heading level={2} className="min-w-0 text-lg font-semibold"><Link href={`/coach/nutrition/${p.id}`} className="inline-flex min-h-11 min-w-0 items-center break-words">{foodText(p.name, locale)}</Link></Heading></HStack>
      <NutritionStatus status={p.currentStatus ?? 'draft'} /><Text as="p">{t('plans.kcal', { value: kcal(p.targets?.kcal ?? 0) })}</Text><Text as="p">{t('plans.assigned', { value: n.format(p.assignedClientsCount) })}</Text><Text as="p">{t('plans.publishedVersion', { value: n.format(p.publishedVersionNo ?? 0) })}</Text>
      <ArchiveRowControl entity="nutrition" id={p.id} archived={archived} canEdit={canEdit} itemLabel={foodText(p.name, locale)} onChanged={() => void load()} />
    </VStack></Card>)}</Grid>
    {data.nextCursor && <Button variant="primary" className="min-h-11" isDisabled={busy} onClick={() => void load({ cursor: data.nextCursor! })} label={t('common.more')} />}
  </VStack>;
}
/** Task 6: template creation immediately opens its first draft. */
export function NewNutrition({ allowed }: { allowed: boolean }) {
  const t = useTranslations('nutrition'); const router = useRouter(); const [name, setName] = useState<LocalizedText>({ ar: '', en: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="grid min-w-0 gap-4" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const plan = await nutritionRequest<NutritionDetail>('/api/v1/nutrition', { method: 'POST', body: { name } }); router.push(`/coach/nutrition/${plan.head.id}`); } catch { setError(t('errors.request')); } finally { setBusy(false); } }}><BilingualField label={t('common.name')} value={name} onChange={setName} disabled={!allowed || busy} />{error && <Text as="p" role="alert">{error}</Text>}<Button variant="primary" type="submit" className="min-h-11" isDisabled={!allowed || busy} label={t('plans.create')} /></form>;
}
