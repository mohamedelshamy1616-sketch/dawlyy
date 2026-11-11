'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { Package } from 'lucide-react';
import { z } from 'zod';
import { PackageActions } from './package-actions';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';

const itemSchema = z.object({ id: z.string(), name: z.object({ ar: z.string().optional(), en: z.string().optional() }), price: z.number(), currency: z.string(), durationDays: z.number(), createdAt: z.string(), archivedAt: z.string().nullable() });
type Item = Omit<z.infer<typeof itemSchema>, 'archivedAt' | 'createdAt'> & { archivedAt: Date | string | null; createdAt: Date | string };

/** Task 3: active-first flat package cards with archive/duplicate and cursor loading. */
export function PackageList({ initial, archived, canCreate, canEdit }: { initial: { items: Item[]; nextCursor: string | null }; archived: boolean; canCreate: boolean; canEdit: boolean }) {
  const t = useTranslations('packages');
  const status = useTranslations('status');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  function onArchived(id: string) {
    setItems(previous => {
      if (!archived) return previous.filter(row => row.id !== id);
      return previous.map(row => row.id === id ? { ...row, archivedAt: new Date().toISOString() } : row).sort((a, b) => {
        const rank = Number(a.archivedAt !== null) - Number(b.archivedAt !== null);
        const aTime = typeof a.createdAt === 'string' ? Date.parse(a.createdAt) : a.createdAt.getTime();
        const bTime = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) : b.createdAt.getTime();
        return rank || bTime - aTime || b.id.localeCompare(a.id);
      });
    });
  }
  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true); setError(false);
    try {
      const response = await fetch(`/api/v1/packages?${new URLSearchParams({ archived: archived ? '1' : '0', cursor })}`);
      if (!response.ok) throw new Error('Request failed');
      const result = z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() }).parse(await response.json());
      setItems(previous => [...previous, ...result.items.filter(row => !previous.some(item => item.id === row.id))]); setCursor(result.nextCursor);
    } catch { setError(true); } finally { setLoading(false); }
  }
  const add = canCreate ? <Button className="min-h-11" href="/coach/packages/new" variant="primary" label={t('add')} /> : undefined;
  return <VStack gap={5} className="min-w-0">
    <HStack wrap="wrap" gap={3}>{add}<Button variant="secondary" className="min-h-11" href={archived ? '/coach/packages' : '/coach/packages?archived=1'} label={t(archived ? 'hideArchived' : 'showArchived')} /></HStack>
    {!items.length ? <EmptyState Icon={Package} title={t('empty.title')} description={t('empty.body')} action={add} /> : <VStack gap={4} className="!grid min-w-0 lg:grid-cols-2">{items.map(item => <Card role="article" key={item.id} className="!grid min-w-0 gap-4" padding={5}>
      <HStack wrap="wrap" align="start" justify="between" gap={2} className="min-w-0"><Link className="inline-flex min-h-11 min-w-0 max-w-full items-center break-words text-lg font-semibold hover:underline" href={`/coach/packages/${item.id}`}>{localize(item.name, locale)}</Link><Text type="supporting" weight="medium">{item.archivedAt ? t('archived') : status('active')}</Text></HStack>
      <Text weight="semibold" size="xl" as="p" display="block" className="break-words">{new Intl.NumberFormat(locale, { style: 'currency', currency: item.currency }).format(item.price)}</Text>
      <Text type="supporting" as="p" display="block">{t('duration', { days: new Intl.NumberFormat(locale).format(item.durationDays) })}</Text>
      <PackageActions id={item.id} archived={item.archivedAt !== null} canCreate={canCreate} canEdit={canEdit} onArchived={onArchived} />
    </Card>)}</VStack>}
    {error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t('errors.failed')}</Text> : null}
    {cursor ? <Button className="min-h-11" variant="secondary" isDisabled={loading} onClick={loadMore} label={t(loading ? 'loading' : 'loadMore')} /> : null}
  </VStack>;
}
