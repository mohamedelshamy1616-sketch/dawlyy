'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { z } from 'zod';
import { useMutation } from '@/components/clients/use-mutation';
import { Link, useRouter } from '@/i18n/navigation';
import { ArchiveRowControl } from '@/components/control/archive-controls';

/** Task 3: package archive and duplicate actions; archive preserves subscription history. */
export function PackageActions({ id, archived, canEdit, canCreate, itemLabel, onChanged }: { id: string; archived: boolean; canEdit: boolean; canCreate: boolean; itemLabel?: string; onChanged?(): void }) {
  const t = useTranslations('packages');
  const shared = useTranslations('archiveControls');
  const mutation = useMutation();
  const router = useRouter();
  async function duplicate() {
    const result = await mutation.send(`/api/v1/packages/${id}/duplicate`, 'POST');
    if (result === undefined) return;
    const parsed = z.object({ id: z.string().uuid() }).safeParse(result);
    if (parsed.success) router.push(`/coach/packages/${parsed.data.id}`);
    router.refresh();
  }
  return <VStack gap={2} className="min-w-0"><HStack wrap="wrap" gap={2}>
    {canCreate ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={() => duplicate()} label={t('duplicate')} /> : null}
    <ArchiveRowControl entity="packages" id={id} archived={archived} canEdit={canEdit} itemLabel={itemLabel ?? shared('thisItem')} onChanged={onChanged} />
  </HStack>{mutation.error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t(`errors.${mutation.error}`)}</Text> : null}</VStack>;
}

/** P5 group C: client boundary for the server package page's Astryx frame and archived label. */
export function PackagePageContent({ archived, header, children }: { archived: boolean; header: ReactNode; children: ReactNode }) {
  const t = useTranslations('packages');
  return <VStack gap={6} className="min-w-0 max-w-full break-words">
    {header}
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/packages">{t('back')}</Link>
    {archived ? <Text type="supporting" weight="medium">{t('archived')}</Text> : null}
    {children}
  </VStack>;
}
