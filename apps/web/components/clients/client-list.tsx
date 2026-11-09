'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { z } from 'zod';
import { localize } from '@dawlyy/core/types';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/src/components/shell/empty-state';

const itemSchema = z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), displayName: z.string().nullable(), code: z.string(),
  status: z.enum(['lead', 'active', 'inactive', 'archived']), activePackage: z.object({ id: z.string(), name: z.object({ ar: z.string().optional(), en: z.string().optional() }) }).nullable(), daysLeft: z.number().nullable() });
type Item = z.infer<typeof itemSchema>;
type Filters = { q?: string; status?: string; packageId?: string; tag?: string; limit?: string };

/** Task 3: reuse shared status words where available and translate the client-only states locally. */
export function ClientStatus({ value }: { value: Item['status'] }) {
  const status = useTranslations('status');
  const t = useTranslations('clients');
  return <Badge variant="secondary" className="max-w-full whitespace-normal">{value === 'active' ? status('active') : t(`statuses.${value}`)}</Badge>;
}

/** Task 3 / G6: URL-backed filters, a phone card layout, desktop table and additive keyset pagination. */
export function ClientList({ initial, filters, packages, tags, canCreate }: { initial: { items: Item[]; nextCursor: string | null }; filters: Filters;
  packages: { id: string; name: { ar?: string; en?: string } }[]; tags: string[]; canCreate: boolean }) {
  const t = useTranslations('clients');
  const status = useTranslations('status');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const [query, setQuery] = useState(filters.q ?? '');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  function href(patch: Partial<Filters>) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, ...patch }).forEach(([key, value]) => { if (value) params.set(key, value); });
    return `/coach/clients${params.size ? `?${params}` : ''}`;
  }
  useEffect(() => {
    if (query === (filters.q ?? '')) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries({ ...filters, q: query }).forEach(([key, value]) => { if (value) params.set(key, value); });
      startTransition(() => router.replace(`/coach/clients${params.size ? `?${params}` : ''}`));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, filters, router]);
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      params.set('cursor', cursor);
      const response = await fetch(`/api/v1/clients?${params}`);
      if (!response.ok) throw new Error('Request failed');
      const result = z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() }).parse(await response.json());
      setItems(previous => [...previous, ...result.items.filter(row => !previous.some(item => item.id === row.id))]); setCursor(result.nextCursor);
    } catch { setError(true); } finally { setLoading(false); }
  }
  function clientName(item: Item) { return item.displayName || [item.firstName, item.lastName].filter(Boolean).join(' '); }
  const add = canCreate ? <Button asChild className="min-h-11"><Link href="/coach/clients/new">{t('add')}</Link></Button> : undefined;
  return <div className="grid min-w-0 max-w-full gap-5" aria-busy={pending || loading}>
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">{t('search')}<Input className="min-h-11" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchHint')} maxLength={300} /></label>{add}
    </div>
    <div className="flex flex-wrap gap-2" aria-label={t('filterStatus')}>
      {(['', 'lead', 'active', 'inactive', 'archived'] as const).map(value => <Button key={value} asChild variant={(filters.status ?? '') === value ? 'default' : 'outline'} className="min-h-11">
        <Link aria-current={(filters.status ?? '') === value ? 'page' : undefined} href={href({ status: value })}>{value === '' ? t('allStatuses') : value === 'active' ? status('active') : t(`statuses.${value}`)}</Link>
      </Button>)}
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-2 text-sm">{t('fields.package')}<select className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3" value={filters.packageId ?? ''} onChange={event => startTransition(() => router.replace(href({ packageId: event.target.value })))}><option value="">{t('allPackages')}</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{localize(pkg.name, locale)}</option>)}</select></label>
      <label className="grid min-w-0 gap-2 text-sm">{t('fields.tags')}<select className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3" value={filters.tag ?? ''} onChange={event => startTransition(() => router.replace(href({ tag: event.target.value })))}><option value="">{t('allTags')}</option>{tags.map(tag => <option key={tag}>{tag}</option>)}</select></label>
    </div>
    {filters.packageId || filters.tag ? <div className="flex flex-wrap gap-2">
      {filters.packageId ? <Button asChild variant="outline" className="min-h-11 max-w-full whitespace-normal"><Link href={href({ packageId: '' })}>{t('clearPackage')}</Link></Button> : null}
      {filters.tag ? <Button asChild variant="outline" className="min-h-11 max-w-full whitespace-normal"><Link href={href({ tag: '' })}>{t('clearTag', { tag: filters.tag })}</Link></Button> : null}
    </div> : null}
    {!items.length ? <EmptyState Icon={Users} title={t('empty.title')} description={t('empty.body')} action={add} /> : <>
      <div className="grid min-w-0 gap-3 md:hidden">{items.map(item => <article key={item.id} className="grid min-w-0 gap-3 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><Link href={`/coach/clients/${item.id}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center break-words font-semibold underline-offset-4 hover:underline">{clientName(item)}</Link><ClientStatus value={item.status} /></div>
        <dl className="grid min-w-0 grid-cols-2 gap-2 text-sm"><dt className="text-muted-foreground">{t('fields.code')}</dt><dd className="break-words" dir="ltr">{item.code}</dd><dt className="text-muted-foreground">{t('fields.package')}</dt><dd className="min-w-0 break-words">{item.activePackage ? localize(item.activePackage.name, locale) : t('noPackage')}</dd><dt className="text-muted-foreground">{t('daysLeft')}</dt><dd>{item.daysLeft === null ? '' : new Intl.NumberFormat(locale).format(item.daysLeft)}</dd></dl>
      </article>)}</div>
      <div className="hidden min-w-0 max-w-full md:block"><Table className="w-full table-fixed"><TableHeader><TableRow>{['name', 'code', 'status', 'package', 'daysLeft'].map(key => <TableHead key={key} className="whitespace-normal text-start">{t(key === 'daysLeft' ? key : `fields.${key}`)}</TableHead>)}</TableRow></TableHeader><TableBody>{items.map(item => <TableRow key={item.id}>
        <TableCell className="whitespace-normal break-words"><Link className="inline-flex min-h-11 items-center font-medium hover:underline" href={`/coach/clients/${item.id}`}>{clientName(item)}</Link></TableCell><TableCell className="whitespace-normal break-words"><bdi>{item.code}</bdi></TableCell><TableCell className="whitespace-normal"><ClientStatus value={item.status} /></TableCell><TableCell className="whitespace-normal break-words">{item.activePackage ? localize(item.activePackage.name, locale) : t('noPackage')}</TableCell><TableCell>{item.daysLeft === null ? '' : new Intl.NumberFormat(locale).format(item.daysLeft)}</TableCell>
      </TableRow>)}</TableBody></Table></div>
    </>}
    {error ? <p role="alert" className="text-sm text-destructive">{t('errors.failed')}</p> : null}
    {cursor ? <Button variant="outline" onClick={loadMore} disabled={loading || pending} className="min-h-11">{t(loading ? 'loading' : 'loadMore')}</Button> : null}
  </div>;
}
