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
import { Link } from '@/i18n/navigation';
import { CONSENT_KINDS } from '@/src/server/settings/constants';
import type { ConsentView } from '@/src/server/settings/service';
import { errorKey, settingsRequest } from './request';

type State = { state: 'accepted' | 'withdrawn'; at: string };
type Kind = (typeof CONSENT_KINDS)[number];

const REQUIRED: readonly Kind[] = ['terms', 'privacy'];
const TEXT_PAGE: Partial<Record<Kind, string>> = { terms: '/terms', privacy: '/privacy', health_data: '/consent', photos: '/consent', videos: '/consent', communications: '/consent' };

/**
 * Task 11 / spec §44: the client reviews each consent and records or withdraws it (POST /settings/consents).
 * `current` is the newest state per kind from GET /settings/consents; T8 reads the same table for `photos`.
 */
export function ConsentPanel({ current, version }: { current: Partial<Record<Kind, State>>; version: string }) {
  const t = useTranslations('settings.consent');
  const s = useTranslations('settings.shared');
  const locale = useLocale() === 'en' ? 'en' : 'ar';
  const [states, setStates] = useState(current);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  async function choose(kind: Kind, accepted: boolean) {
    setBusy(kind); setErrorCode(null); setDone(false);
    try {
      const row = await settingsRequest<ConsentView>('POST', '/settings/consents', { kind, version, locale, accepted });
      setStates((previous) => ({ ...previous, [kind]: accepted
        ? { state: 'accepted', at: row.acceptedAt } : { state: 'withdrawn', at: row.withdrawnAt ?? row.acceptedAt } }));
      setDone(true);
    } catch (error) {
      setErrorCode(errorKey(error));
    } finally { setBusy(null); }
  }

  return (
    <VStack gap={3} className="min-w-0 max-w-full">
      <Text color="secondary">{t('version', { version })}</Text>
      {done ? <Text role="status">{t('done')}</Text> : null}
      {errorCode ? <Banner status="error" title={s(`errors.${errorCode}`)} collapsible={false} /> : null}
      {CONSENT_KINDS.map((kind) => {
        const state = states[kind];
        const page = TEXT_PAGE[kind];
        return (
          <Card key={kind}>
            <VStack gap={2} className="min-w-0 [overflow-wrap:anywhere]">
              <HStack gap={2} className="min-w-0 flex-wrap items-center">
                <Text weight="semibold">{t(`kinds.${kind}.title`)}</Text>
                <Badge label={REQUIRED.includes(kind) ? t('required') : t('optional')} variant="neutral" />
              </HStack>
              <Text>{t(`kinds.${kind}.body`)}</Text>
              <Text color="secondary" role="status">
                {state ? t(`state.${state.state}`, { date: date.format(new Date(state.at)) }) : t('state.none')}
              </Text>
              <HStack gap={2} className="flex-wrap items-center">
                {state?.state === 'accepted' ? (
                  <Button label={t('withdraw')} variant="secondary" className="min-h-11" isDisabled={busy !== null} isLoading={busy === kind} onClick={() => void choose(kind, false)} />
                ) : (
                  <Button label={t('accept')} variant="primary" className="min-h-11" isDisabled={busy !== null} isLoading={busy === kind} onClick={() => void choose(kind, true)} />
                )}
                {page ? <Link href={page} className="inline-flex min-h-11 items-center text-sm underline">{t('readMore')}</Link> : null}
              </HStack>
            </VStack>
          </Card>
        );
      })}
    </VStack>
  );
}
