'use client';

import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { useMutation } from '@/components/clients/use-mutation';

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
  return <div className="grid min-w-0 gap-2"><div className="flex flex-wrap gap-2">
    {canCreate ? <Button variant="outline" className="min-h-11" disabled={mutation.pending} onClick={() => act('duplicate')}>{t('duplicate')}</Button> : null}
    {canEdit && !archived ? <Button variant="outline" className="min-h-11" disabled={mutation.pending} onClick={() => act('archive')}>{t('archive')}</Button> : null}
  </div>{mutation.error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${mutation.error}`)}</p> : null}</div>;
}
