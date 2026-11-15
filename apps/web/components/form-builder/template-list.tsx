'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize, type LocalizedText } from '@dawlyy/core/types';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { FormRequestError, formRequest } from '../form-runner/http';
import { FormActionDialog } from './action-dialog';
import { coachFormPath, formPageSchema, type FormGrants, type FormKind, type FormPage } from './contracts';
import { BilingualField } from './question-editor';
import { FormStatus } from './status';
import { ArchivedEmpty, ArchivedFilter, ArchiveRowControl, useReloadOnUndoSettle } from '@/components/control/archive-controls';
import { BulkBar, BulkRowCheckbox, BulkSelectAll, useBulkSelection } from '@/components/control/bulk-actions';
import { listUrl } from '@/src/lib/control/archive-transport';
import type { BulkItem } from '@/src/lib/control/bulk-actions';

type Filters = { kind: 'template' | 'client'; archived: boolean; q: string };
type Item = FormPage['items'][number];

/** Task 7: templates and per-client copies for one form kind, with create, duplicate, default, archive, send and customise. */
export function TemplateList({ initial, formKind, grants, filters, archiveCanEdit }: { initial: FormPage; formKind: FormKind; grants: FormGrants; filters: Filters; archiveCanEdit?: boolean }) {
  // Archive and restore of every form kind need forms edit, not the kind's own module; the hub page passes that grant.
  const canArchive = archiveCanEdit ?? grants.edit;
  const t = useTranslations('forms');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const base = coachFormPath(formKind);
  const [data, setData] = useState(initial);
  const [q, setQ] = useState(filters.q);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState<LocalizedText>({});
  const [action, setAction] = useState<{ mode: 'send' | 'customize'; item: Item } | null>(null);

  const href = (next: Partial<Filters>) => {
    const merged = { ...filters, q, ...next };
    return `${base}?${new URLSearchParams({ tab: 'templates', kind: merged.kind, archived: String(merged.archived), ...(merged.q ? { q: merged.q } : {}) })}`;
  };
  const bulkItems: BulkItem[] = data.items.map(item => ({ id: item.id, name: localize(item.name, locale), archived: !!item.archivedAt, canEdit: canArchive }));
  const selection = useBulkSelection(bulkItems, JSON.stringify([filters.kind, filters.archived, filters.q]));
  const fail = (error: unknown) => setErrorKey(error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed');

  async function more() {
    if (!data.nextCursor) return;
    setBusy(true); setErrorKey('');
    try {
      const result = formPageSchema.parse(await formRequest(`/forms?${new URLSearchParams({ formKind, kind: filters.kind, archived: String(filters.archived), ...(filters.q ? { q: filters.q } : {}), cursor: data.nextCursor })}`));
      setData(old => ({ items: [...old.items, ...result.items.filter(item => !old.items.some(row => row.id === item.id))], nextCursor: result.nextCursor }));
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function create() {
    if (!(name.ar?.trim() || name.en?.trim())) { setErrorKey('invalid_document'); return; }
    setBusy(true); setErrorKey('');
    try {
      const created = z.object({ head: z.object({ id: z.string() }) }).parse(await formRequest('/forms', 'POST', { name, formKind }, crypto.randomUUID()));
      setCreateOpen(false); router.push(`${base}/${created.head.id}`);
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  /* After an archive, restore or undo: refetch page one of this view; the server page also refreshes so Send drops an archived template. */
  async function reload() {
    try {
      setData(formPageSchema.parse(await formRequest(listUrl('forms', { formKind, kind: filters.kind, ...(filters.q ? { q: filters.q } : {}) }, filters.archived).replace('/api/v1', ''))));
      setErrorKey('');
    } catch (error) { fail(error); }
    router.refresh();
  }
  useReloadOnUndoSettle(() => void reload());
  async function mutate(item: Item, kind: 'duplicate' | 'default') {
    setBusy(true); setErrorKey('');
    try {
      if (kind === 'duplicate') {
        const copy = z.object({ head: z.object({ id: z.string() }) }).parse(await formRequest(`/forms/${item.id}/duplicate`, 'POST', undefined, crypto.randomUUID()));
        router.push(`${base}/${copy.head.id}`);
      } else {
        await formRequest(`/forms/${item.id}`, 'PATCH', { is_default: true }, crypto.randomUUID());
        router.refresh();
      }
    } catch (error) { fail(error); } finally { setBusy(false); }
  }

  return <VStack gap={4} maxWidth="100%">
    <HStack gap={2} wrap="wrap" vAlign="center">
      <StackItem size="fill">
        <SegmentedControl label={t('templates.kind')} value={filters.kind} size="lg" layout="fill" onChange={value => router.push(href({ kind: value === 'client' ? 'client' : 'template' }))}>
          <SegmentedControlItem value="template" label={t('templates.templates')} />
          <SegmentedControlItem value="client" label={t('templates.clientCopies')} />
        </SegmentedControl>
      </StackItem>
      {grants.create ? <Button label={t('templates.create')} variant="primary" size="lg" onClick={() => { setName({}); setErrorKey(''); setCreateOpen(true); }} /> : null}
    </HStack>
    <HStack gap={2} wrap="wrap" vAlign="end">
      <StackItem size="fill"><TextInput label={t('templates.search')} type="search" size="lg" value={q} onChange={setQ} onEnter={() => router.push(href({}))} /></StackItem>
      <Button label={t('templates.searchAction')} size="lg" onClick={() => router.push(href({}))} />
    </HStack>
    <ArchivedFilter archived={filters.archived} onSelect={archived => router.push(href({ archived }))} />
    {canArchive && data.items.length ? <BulkSelectAll items={bulkItems} selected={selection.selected} onChange={all => (all ? selection.selectAll() : selection.clear())} /> : null}
    <BulkBar entity="forms" items={bulkItems} selected={selection.selected} archivedView={filters.archived} onSelectionChange={selection.set} onChanged={() => void reload()} />
    {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}

    {!data.items.length && filters.archived ? <ArchivedEmpty /> : null}
    {!data.items.length && !filters.archived
      ? <EmptyState title={t('templates.emptyTitle')} description={t('templates.emptyDescription')}
        actions={grants.create && filters.kind === 'template' ? <Button label={t('templates.create')} variant="primary" size="lg" onClick={() => setCreateOpen(true)} /> : undefined} />
      : null}
    {data.items.map(item => <Card key={item.id}>
      <VStack gap={3}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          {canArchive ? <BulkRowCheckbox item={bulkItems.find(row => row.id === item.id)!} selected={selection.selected.has(item.id)} onToggle={() => selection.toggle(item.id)} /> : null}
          <StackItem size="fill"><Heading level={3} wordBreak="break-word">{localize(item.name, locale)}</Heading></StackItem>
          <FormStatus status={item.status ?? 'draft'} />
          {item.isDefault ? <Badge label={t('templates.default')} variant="info" /> : null}
        </HStack>
        <Text type="supporting" as="p">{item.publishedVersionNo !== null ? t('templates.publishedVersion', { number: new Intl.NumberFormat(locale).format(item.publishedVersionNo) }) : t('templates.neverPublished')}</Text>
        <HStack gap={2} wrap="wrap">
          <Button label={t('templates.open')} variant="secondary" href={`${base}/${item.id}`} />
          {grants.create && item.kind === 'template' ? <Button label={t('templates.duplicate')} isDisabled={busy} onClick={() => void mutate(item, 'duplicate')} /> : null}
          {grants.edit && item.kind === 'template' && item.publishedVersionNo !== null && !item.isDefault && !item.archivedAt ? <Button label={t('templates.makeDefault')} isDisabled={busy} onClick={() => void mutate(item, 'default')} /> : null}
          {grants.create && item.publishedVersionNo !== null && !item.archivedAt ? <Button label={t('templates.send')} isDisabled={busy} onClick={() => setAction({ mode: 'send', item })} /> : null}
          {grants.create && item.kind === 'template' && item.publishedVersionNo !== null && !item.archivedAt ? <Button label={t('templates.customize')} isDisabled={busy} onClick={() => setAction({ mode: 'customize', item })} /> : null}
          <ArchiveRowControl entity="forms" id={item.id} archived={!!item.archivedAt} canEdit={canArchive} itemLabel={localize(item.name, locale)} onChanged={() => void reload()} />
        </HStack>
      </VStack>
    </Card>)}
    {data.nextCursor ? <HStack><Button label={busy ? t('templates.loading') : t('templates.loadMore')} size="lg" isDisabled={busy} onClick={() => void more()} /></HStack> : null}

    {action ? <FormActionDialog key={`${action.mode}-${action.item.id}`} mode={action.mode} formKind={formKind} templates={[{ id: action.item.id, name: action.item.name }]} isOpen onOpenChange={open => { if (!open) setAction(null); }} /> : null}

    <Dialog isOpen={createOpen} onOpenChange={setCreateOpen} purpose="form" padding={4}>
      <DialogHeader title={t('templates.createTitle')} onOpenChange={setCreateOpen} />
      <VStack gap={3} paddingBlockStart={3}>
        <BilingualField label={t('templates.name')} value={name} required onChange={setName} />
        {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button label={t('builder.cancel')} variant="secondary" size="lg" onClick={() => setCreateOpen(false)} />
          <Button label={t('templates.create')} variant="primary" size="lg" isLoading={busy} onClick={() => void create()} />
        </HStack>
      </VStack>
    </Dialog>
  </VStack>;
}
