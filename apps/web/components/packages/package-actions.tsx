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

/** Task 3: package archive and duplicate actions; archive preserves subscription history. */
export function PackageActions({ id, archived, canEdit, canCreate, onArchived }: { id: string; archived: boolean; canEdit: boolean; canCreate: boolean; onArchived?(id: string): void }) {
  const t = useTranslations('packages');
  const mutation = useMutation();
  const router = useRouter();
  async function act(action: 'archive' | 'duplicate') {
    const result = await mutation.send(`/api/v1/packages/${id}/${action}`, 'POST');
    if (result === undefined) return;
    const parsed = z.object({ id: z.string().uuid() }).safeParse(result);
    if (action === 'duplicate' && parsed.success) router.push(`/coach/packages/${parsed.data.id}`);
    if (action === 'archive') onArchived?.(id);
    router.refresh();
  }
  return <VStack gap={2} className="min-w-0"><HStack wrap="wrap" gap={2}>
    {canCreate ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={() => act('duplicate')} label={t('duplicate')} /> : null}
    {canEdit && !archived ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={() => act('archive')} label={t('archive')} /> : null}
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
