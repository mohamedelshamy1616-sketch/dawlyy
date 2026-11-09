'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Dumbbell } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { EmptyState } from '@/src/components/shell/empty-state';
import { DIFFICULTIES, MOVEMENT_PATTERNS } from '@dawlyy/core/types';
import type { ExerciseListItem } from '@/src/server/exercises/service';
import { exerciseRequest } from './http';

type Result = { items: ExerciseListItem[]; nextCursor: string | null };
const selectStyle = 'min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3';

/** Task 4: responsive library with category tabs, filter Sheet and keyset load-more. */
export function ExerciseLibrary({ initial, categories: initialCategories, canCreate, owner }: { initial: Result; categories: string[]; canCreate: boolean; owner: boolean }) {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const [result, setResult] = useState(initial);
  const [resultParameters, setResultParameters] = useState<string | null>(null);
  const [categories, setCategories] = useState(initialCategories);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [filters, setFilters] = useState({ muscle: '', equipment: '', pattern: '', difficulty: '', source: '', includeHidden: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  function parameters(cursor?: string) {
    const params = new URLSearchParams({ q, category, muscle: filters.muscle, equipment: filters.equipment, pattern: filters.pattern, difficulty: filters.difficulty, limit: '20', includeHidden: String(filters.includeHidden) });
    if (filters.source) params.set('source', filters.source);
    if (cursor) params.set('cursor', cursor);
    return params;
  }
  const params = parameters().toString();
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
  return <div className="flex min-w-0 max-w-full flex-col gap-5">
    <div className="flex flex-wrap gap-2">{canCreate ? <><Button asChild className="min-h-11"><Link href="/coach/exercises/new">{t('new')}</Link></Button><Button asChild variant="outline" className="min-h-11"><Link href="/coach/exercises/import">{t('import')}</Link></Button></> : null}</div>
    <div className="flex min-w-0 items-end gap-2"><label className="min-w-0 flex-1">{t('search')}<Input className="min-h-11" value={q} onChange={(event) => { setQ(event.target.value); setResult((old) => ({ ...old, nextCursor: null })); }} /></label>
      <Sheet><SheetTrigger asChild><Button className="min-h-11" variant="outline">{t('filters')}</Button></SheetTrigger>
        <SheetContent side="bottom" showCloseButton={false} className="max-h-[90dvh] overflow-y-auto"><SheetHeader><SheetTitle>{t('filters')}</SheetTitle><SheetDescription>{t('filterHelp')}</SheetDescription></SheetHeader>
          <div className="grid min-w-0 gap-4 ps-4 pe-4 sm:grid-cols-2">
            {(['muscle', 'equipment'] as const).map((key) => <label key={key}>{t(key)}<Input className="min-h-11" value={filters[key]} onChange={(event) => setFilters((value) => ({ ...value, [key]: event.target.value }))} /></label>)}
            <label>{t('pattern')}<select className={selectStyle} value={filters.pattern} onChange={(event) => setFilters((value) => ({ ...value, pattern: event.target.value }))}><option value="">{t('all')}</option>{MOVEMENT_PATTERNS.map((value) => <option key={value} value={value}>{t(`patterns.${value}`)}</option>)}</select></label>
            <label>{t('difficulty')}<select className={selectStyle} value={filters.difficulty} onChange={(event) => setFilters((value) => ({ ...value, difficulty: event.target.value }))}><option value="">{t('all')}</option>{DIFFICULTIES.map((value) => <option key={value} value={value}>{t(`difficulties.${value}`)}</option>)}</select></label>
            <label>{t('source')}<select className={selectStyle} value={filters.source} onChange={(event) => setFilters((value) => ({ ...value, source: event.target.value }))}><option value="">{t('all')}</option><option value="system">{t('system')}</option><option value="coach">{t('mine')}</option></select></label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={filters.includeHidden} onChange={(event) => setFilters((value) => ({ ...value, includeHidden: event.target.checked }))} />{t('includeHidden')}</label>
          </div><SheetClose asChild><Button className="m-4 min-h-11">{t('done')}</Button></SheetClose>
        </SheetContent>
      </Sheet>
    </div>
    <div role="tablist" aria-label={t('category')} className="flex max-w-full gap-2 overflow-x-auto pb-2" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const forward = event.key === (locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (forward ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
    }}>
      {['', ...categories].map((value) => <Button role="tab" tabIndex={category === value ? 0 : -1} aria-selected={category === value} key={value} className="min-h-11 shrink-0" variant={category === value ? 'default' : 'outline'} onClick={() => setCategory(value)}>{value || t('all')}</Button>)}
    </div>
    <div aria-live="polite" role="status">{busy ? t('loading') : null}</div>
    {error ? <div role="alert">{t('errors.request')}<Button onClick={() => setRetry((value) => value + 1)} className="min-h-11">{t('retry')}</Button></div> : null}
    {!busy && !error && result.items.length === 0 ? <EmptyState Icon={Dumbbell} title={q || category || Object.values(filters).some(Boolean) ? t('noResults') : t('empty')} description={t('noResultsBody')} /> : null}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy={busy}>
      {result.items.map((exercise) => <Card key={exercise.id} className="min-w-0 overflow-hidden"><CardContent className="flex flex-col gap-3">
        {exercise.thumbnailUrl ? <div className="aspect-video overflow-hidden rounded-lg bg-muted"><Image src={exercise.thumbnailUrl} unoptimized width={640} height={360} alt="" className="size-full object-cover" /></div> : <div className="grid aspect-video place-items-center rounded-lg bg-brand-soft"><Dumbbell aria-hidden className="size-9 text-brand" /></div>}
        <Link className="block min-h-11 break-words text-lg font-semibold" href={`/coach/exercises/${exercise.id}`}>{locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar}</Link>
        <p className="break-words text-sm text-muted-foreground">{exercise.primaryMuscles.join(' · ')}</p>
        <div className="flex flex-wrap gap-2"><Badge>{exercise.source === 'system' ? t('system') : t('mine')}</Badge>{exercise.hidden ? <Badge variant="outline">{t('hidden')}</Badge> : null}</div>
      </CardContent></Card>)}
    </div>
    {result.nextCursor && resultParameters === params ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={more}>{t('loadMore')}</Button> : null}
    {owner ? <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer">{t('manageCategories')}</summary><form className="flex flex-col gap-3" onSubmit={saveCategories}><label>{t('categoriesHelp')}<textarea name="categories" defaultValue={categories.join('\n')} className="min-h-32 w-full rounded-lg border p-3" /></label><Button className="min-h-11" disabled={busy}>{t('saveCategories')}</Button></form></details> : null}
  </div>;
}
