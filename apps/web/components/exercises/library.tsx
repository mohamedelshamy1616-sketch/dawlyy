'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { TabList, Tab } from '@astryxdesign/core/TabList';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { muscleLabels } from '@/src/lib/muscles';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import { DIFFICULTIES, MOVEMENT_PATTERNS } from '@dawlyy/core/types';
import type { ExerciseListItem } from '@/src/server/exercises/service';
import { exerciseRequest } from './http';
import { ArchivedEmpty, ArchivedFilter, ArchiveRowControl, HideRowControl, useReloadOnUndoSettle } from '@/components/control/archive-controls';
import { BulkBar, BulkRowCheckbox, BulkSelectAll, useBulkSelection } from '@/components/control/bulk-actions';
import type { BulkItem } from '@/src/lib/control/bulk-actions';

type Result = { items: ExerciseListItem[]; nextCursor: string | null };

/** Task 4: responsive library with category tabs, filter Sheet and keyset load-more. */
/** R3a: filter values the page forwards from its URL, so a link such as the Library hub's ?archived=true survives the first client refetch. */
export type ExerciseInitialParams = Partial<Record<'q' | 'category' | 'muscle' | 'equipment' | 'pattern' | 'difficulty' | 'source' | 'includeHidden' | 'archived', string>>;

export function ExerciseLibrary({ initial, categories: initialCategories, canCreate, owner, canEdit = false, initialParams = {} }: { initial: Result; categories: string[]; canCreate: boolean; owner: boolean; canEdit?: boolean; initialParams?: ExerciseInitialParams }) {
  const t = useTranslations('exercises'); const muscleT = useTranslations('workout');
  const locale = useLocale();
  const [result, setResult] = useState(initial);
  const [resultParameters, setResultParameters] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [q, setQ] = useState(initialParams.q ?? '');
  const [category, setCategory] = useState(initialParams.category ?? '');
  const [archived, setArchived] = useState(initialParams.archived === 'true');
  const [filters, setFilters] = useState({ muscle: initialParams.muscle ?? '', equipment: initialParams.equipment ?? '', pattern: initialParams.pattern ?? '', difficulty: initialParams.difficulty ?? '', source: initialParams.source ?? '', includeHidden: initialParams.includeHidden === 'true' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTrigger = useRef<HTMLButtonElement>(null);
  const [categoryText, setCategoryText] = useState(initialCategories.join('\n'));
  const generation = useRef(0);
  function parameters(cursor?: string) {
    const params = new URLSearchParams({ q, category, muscle: filters.muscle, equipment: filters.equipment, pattern: filters.pattern, difficulty: filters.difficulty, limit: '20', includeHidden: String(filters.includeHidden), archived: String(archived) });
    if (filters.source) params.set('source', filters.source);
    if (cursor) params.set('cursor', cursor);
    return params;
  }
  const params = parameters().toString();
  // Only tenant-owned exercises archive; shared (system) ones keep the per-tenant Hide, so they are never bulk-selectable.
  const bulkItems: BulkItem[] = result.items.map(exercise => ({ id: exercise.id, name: (locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar) ?? '', archived, canEdit: canEdit && exercise.editable }));
  const selection = useBulkSelection(bulkItems, params);
  useReloadOnUndoSettle(() => setRetry(value => value + 1));
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    const timer = setTimeout(() => {
      setBusy(true); setError(false);
      exerciseRequest<Result>(`?${params}`, { signal: controller.signal }).then((value) => { setResult(value); setResultParameters(params); })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [params, retry]);
  async function more() {
    if (!result.nextCursor || resultParameters !== params) return;
    const current = generation.current;
    setBusy(true);
    try {
      const next = await exerciseRequest<Result>(`?${parameters(result.nextCursor)}`);
      if (current === generation.current) setResult((previous) => ({ items: [...previous.items, ...next.items], nextCursor: next.nextCursor }));
    } catch { if (current === generation.current) setError(true); } finally { if (current === generation.current) setBusy(false); }
  }
  async function saveCategories(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(false);
    const values = String(new FormData(event.currentTarget).get('categories') ?? '').split('\n').map((value) => value.trim()).filter(Boolean);
    try { await exerciseRequest('/categories', { method: 'PUT', body: { categories: values }, key: crypto.randomUUID() }); setCategories((await exerciseRequest<{ categories: string[] }>('/categories')).categories); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <VStack gap={5} className="min-w-0 max-w-full">
    <HStack gap={2} wrap="wrap">{canCreate ? <><Button className="min-h-11 min-w-11" href="/coach/exercises/new" label={t('new')} /><Button variant="secondary" className="min-h-11 min-w-11" href="/coach/exercises/import" label={t('import')} /></> : null}</HStack>
    <HStack gap={2} className="min-w-0 items-end"><VStack className="min-w-0 flex-1"><TextInput label={t('search')} controlClassName="min-h-11" value={q} onChange={value => { setQ(value); setResult((old) => ({ ...old, nextCursor: null })); }} /></VStack>
      <Button ref={filtersTrigger} className="min-h-11 min-w-11" variant="secondary" onClick={() => setFiltersOpen(true)} label={t('filters')} />
      <BottomSheet isOpen={filtersOpen} onOpenChange={setFiltersOpen} finalFocusRef={filtersTrigger} label={t('filters')} aria-describedby="exercise-filters-description" height="90dvh"><VStack gap={4}><Heading level={2}>{t('filters')}</Heading><Text as="p" id="exercise-filters-description">{t('filterHelp')}</Text>
          <Grid gap={4} className="min-w-0 ps-4 pe-4 sm:grid-cols-2">
            {(['muscle', 'equipment'] as const).map((key) => <VStack key={key}><TextInput label={t(key)} controlClassName="min-h-11" value={filters[key]} onChange={next => setFilters(previous => ({ ...previous, [key]: next }))} /></VStack>)}
            <VStack><Selector label={t('pattern')} controlClassName="min-h-11" value={filters.pattern} onChange={value => setFilters(previous => ({ ...previous, pattern: value }))} options={[{ value: '', label: t('all') }, ...MOVEMENT_PATTERNS.map(value => ({ value, label: t(`patterns.${value}`) }))]} /></VStack>
            <VStack><Selector label={t('difficulty')} controlClassName="min-h-11" value={filters.difficulty} onChange={value => setFilters(previous => ({ ...previous, difficulty: value }))} options={[{ value: '', label: t('all') }, ...DIFFICULTIES.map(value => ({ value, label: t(`difficulties.${value}`) }))]} /></VStack>
            <VStack><Selector label={t('source')} controlClassName="min-h-11" value={filters.source} onChange={value => setFilters(previous => ({ ...previous, source: value }))} options={[{ value: '', label: t('all') }, { value: 'system', label: t('system') }, { value: 'coach', label: t('mine') }]} /></VStack>
            <CheckboxInput className="min-h-11" label={t('includeHidden')} value={filters.includeHidden} onChange={includeHidden => setFilters(value => ({ ...value, includeHidden }))} />
          </Grid><Button className="min-h-11 min-w-11" onClick={() => setFiltersOpen(false)} label={t('done')} /></VStack></BottomSheet>
    </HStack>
    <TabList role="tablist" aria-label={t('category')} value={category} onChange={setCategory} className="max-w-full">
      {['', ...categories].map(value => <Tab key={value} value={value} label={value || t('all')} panelId="exercise-category-results" className="min-h-11 min-w-11" />)}
    </TabList>
    <VStack aria-live="polite" role="status">{busy ? t('loading') : null}</VStack>
    {error ? <VStack role="alert">{t('errors.request')}<Button onClick={() => setRetry((value) => value + 1)} className="min-h-11 min-w-11" label={t('retry')} /></VStack> : null}
    <ArchivedFilter archived={archived} onSelect={setArchived} />
    {canEdit && result.items.length ? <BulkSelectAll items={bulkItems} selected={selection.selected} onChange={all => (all ? selection.selectAll() : selection.clear())} /> : null}
    <BulkBar entity="exercises" items={bulkItems} selected={selection.selected} archivedView={archived} onSelectionChange={selection.set} onChanged={() => setRetry(value => value + 1)} />
    {!busy && !error && result.items.length === 0 && archived ? <ArchivedEmpty /> : null}
    {!busy && !error && result.items.length === 0 && !archived ? <EmptyState Icon={Dumbbell} title={q || category || Object.values(filters).some(Boolean) ? t('noResults') : t('empty')} description={t('noResultsBody')} /> : null}
    <Grid gap={4} id="exercise-category-results" role="tabpanel" aria-label={category || t('all')} className="min-w-0 sm:grid-cols-2 xl:grid-cols-3" aria-busy={busy}>
      {result.items.map((exercise) => <Card key={exercise.id} className="min-w-0 overflow-hidden"><VStack gap={3}>
        {exercise.thumbnailUrl ? <VStack className="aspect-video overflow-hidden rounded-lg bg-muted"><Image src={exercise.thumbnailUrl} unoptimized width={640} height={360} alt="" className="size-full object-cover" /></VStack> : <Grid className="aspect-video place-items-center rounded-lg bg-brand-soft"><Dumbbell aria-hidden className="size-9 text-brand" /></Grid>}
        <HStack gap={2} wrap="wrap" align="center" className="min-w-0">{bulkItems.find(row => row.id === exercise.id)?.canEdit ? <BulkRowCheckbox item={bulkItems.find(row => row.id === exercise.id)!} selected={selection.selected.has(exercise.id)} onToggle={() => selection.toggle(exercise.id)} /> : null}
          <Link className="block min-h-11 min-w-0 flex-1 break-words text-lg font-semibold" href={`/coach/exercises/${exercise.id}`}>{locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar}</Link></HStack>
        {muscleLabels(exercise.primaryMuscles, muscleT).length ? <Text as="p" className="break-words text-sm text-muted-foreground">{muscleLabels(exercise.primaryMuscles, muscleT).join(' · ')}</Text> : null}
        <HStack gap={2} wrap="wrap"><Text type="label" className="rounded-full bg-muted ps-2 pe-2 py-1">{exercise.source === 'system' ? t('system') : t('mine')}</Text>{exercise.hidden ? <Text type="label" className="rounded-full border ps-2 pe-2 py-1">{t('hidden')}</Text> : null}</HStack>
        {exercise.editable
          ? <ArchiveRowControl entity="exercises" id={exercise.id} archived={archived} canEdit={canEdit} itemLabel={(locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar) ?? ''} onChanged={() => setRetry(value => value + 1)} />
          : <HideRowControl kind="exercises" id={exercise.id} hidden={exercise.hidden} canEdit={canEdit} itemLabel={(locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar) ?? ''} onChanged={() => setRetry(value => value + 1)} />}
      </VStack></Card>)}
    </Grid>
    {result.nextCursor && resultParameters === params ? <Button variant="secondary" className="min-h-11 min-w-11" isDisabled={busy} onClick={more} label={t('loadMore')} /> : null}
    {owner ? <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer">{t('manageCategories')}</summary><form className="flex flex-col gap-3" onSubmit={saveCategories}><TextArea label={t('categoriesHelp')} htmlName="categories" value={categoryText} onChange={setCategoryText} controlClassName="min-h-32" /><Button type="submit" className="min-h-11 min-w-11" isDisabled={busy} label={t('saveCategories')} /></form></details> : null}
  </VStack>;
}
