'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { errorKey, settingsRequest } from './request';

/** One row of GET /settings/consents/all. */
export type ConsentRecord = {
  id: string; userId: string; memberName: string | null; kind: string; version: string; locale: string;
  acceptedAt: string; withdrawnAt: string | null;
};
type Page = { items: ConsentRecord[]; nextCursor: string | null };

/** Task 11: the owner's tenant-wide consent log with keyset "load more". Cards, so it reads at 360 px. */
export function ConsentRecords({ initial }: { initial: Page }) {
  const t = useTranslations('settings.legal');
  const s = useTranslations('settings.shared');
  const locale = useLocale();
  const [rows, setRows] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  async function more() {
    if (!cursor) return;
    setBusy(true); setErrorCode(null);
    try {
      const next = await settingsRequest<Page>('GET', `/settings/consents/all?cursor=${encodeURIComponent(cursor)}`);
      setRows((previous) => [...previous, ...next.items]);
      setCursor(next.nextCursor);
    } catch (error) {
      setErrorCode(errorKey(error));
    } finally { setBusy(false); }
  }

  return (
    <VStack gap={3} className="min-w-0 max-w-full">
      {rows.map((row) => (
        <Card key={row.id}>
          <VStack gap={1} className="min-w-0 [overflow-wrap:anywhere]">
            <HStack gap={2} className="min-w-0 flex-wrap items-center">
              <Text weight="semibold">{row.memberName ?? row.userId.slice(0, 8)}</Text>
              <Badge label={row.withdrawnAt ? t('withdrawn') : t('stillActive')} variant={row.withdrawnAt ? 'warning' : 'success'} />
            </HStack>
            <Text>{t(`kinds.${row.kind}`)} - {t('version')}: {row.version} - {t('locale')}: {row.locale}</Text>
            <Text color="secondary">{t('given')}: {date.format(new Date(row.acceptedAt))}</Text>
            {row.withdrawnAt ? <Text color="secondary">{t('withdrawn')}: {date.format(new Date(row.withdrawnAt))}</Text> : null}
          </VStack>
        </Card>
      ))}
      {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
      {cursor ? <Button label={t('loadMore')} variant="secondary" className="min-h-11" isLoading={busy} onClick={() => void more()} /> : null}
    </VStack>
  );
}
