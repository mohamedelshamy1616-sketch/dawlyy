'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, ClipboardList, Dumbbell, Lock, MessageSquare, Repeat, Scale, StickyNote, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import type { TimelineKind } from '@/src/server/dashboard/logic';
import { formatDate, sendJson } from './format';
import type { TimelineItem, TimelinePage } from './types';

const ICONS: Record<TimelineKind, LucideIcon> = {
  subscription: Repeat, submission: ClipboardList, version: BookOpen, session: Dumbbell, metric: Scale, message: MessageSquare, payment: Wallet, note: StickyNote,
};

const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const SUBSCRIPTION_EVENTS = ['created', 'activated', 'extension', 'freeze', 'resume', 'cancel', 'suspend', 'reinstate', 'expired', 'grace'] as const;
const METRICS = ['weight', 'water', 'steps', 'sleep_hours', 'habit', 'cardio_minutes', 'calories_in', 'mood', 'energy', 'custom'] as const;
const FORM_KINDS = ['intake', 'checkin', 'assessment', 'custom'] as const;
const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => list.find(item => item === value) ?? fallback;

/** Task 10: one-line, translated summary of a timeline entry. */
function useDescribe() {
  const t = useTranslations('dashboard.timeline'); const locale = useLocale();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (item: TimelineItem): string => {
    const s = item.summary;
    switch (item.kind) {
      case 'subscription':
        return t(`subscription.${pick(SUBSCRIPTION_EVENTS, s.event, 'created')}`, { startsOn: formatDate(text(s.startsOn), locale), endsOn: formatDate(text(s.endsOn), locale), days: text(s.days) });
      case 'submission': {
        const state = text(s.state) === 'reviewed' ? 'reviewed' : text(s.state) === 'waiting_for_coach' ? 'waiting_for_coach' : 'submitted';
        return t(`submission.${pick(FORM_KINDS, s.formKind, 'custom')}`, { state: t(`submission.states.${state}`) });
      }
      case 'version':
        return t(`version.${s.status === 'superseded' ? 'superseded' : 'published'}`, { versionNo: text(s.versionNo) });
      case 'session': {
        const state = pick(['completed', 'partially_completed', 'abandoned', 'skipped'] as const, s.state, 'completed');
        const name = s.name && typeof s.name === 'object' ? text((s.name as Record<string, unknown>)[locale === 'ar' ? 'ar' : 'en']) || text((s.name as Record<string, unknown>).en) || text((s.name as Record<string, unknown>).ar) : '';
        return name ? t('session.named', { name, state: t(`session.${state}`) }) : t(`session.${state}`);
      }
      case 'metric': {
        const metric = pick(METRICS, s.metric, 'custom');
        return t('metric.line', { metric: metric === 'custom' && text(s.metricKey) ? text(s.metricKey) : t(`metric.${metric}`), value: typeof s.value === 'number' ? number.format(s.value) : text(s.value), unit: text(s.unit) });
      }
      case 'message': {
        const base = t(text(s.senderRole) === 'client' ? 'message.fromClient' : 'message.fromTeam', { preview: text(s.preview) });
        return typeof s.attachments === 'number' && s.attachments > 0 ? `${base} (${t('message.attachments', { count: s.attachments })})` : base;
      }
      case 'payment':
        return t('payment.line', { amount: typeof s.amount === 'number' ? number.format(s.amount) : text(s.amount), currency: text(s.currency), state: t(`payment.states.${pick(['pending', 'verified', 'rejected', 'refunded'] as const, s.state, 'pending')}`) });
      case 'note':
        return t('note.line', { preview: text(s.preview) });
    }
  };
}

function Entry({ item }: { item: TimelineItem }) {
  const t = useTranslations('dashboard.timeline'); const locale = useLocale(); const describe = useDescribe();
  const Icon = item.private ? Lock : ICONS[item.kind];
  const body = (
    <HStack gap={3} align="start" className="min-w-0">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><Icon className="size-5" /></span>
      <VStack gap={0.5} className="min-w-0">
        <Text type="supporting" size="xsm">{item.private ? t('privateNote') : t(`kinds.${item.kind}`)} · {formatDate(item.at, locale, true)}</Text>
        <Text className="break-words">{describe(item)}</Text>
        {item.private ? <Text type="supporting" size="xsm" weight="semibold">{t('privateLabel')}</Text> : null}
        {!item.private ? <Link className="inline-flex min-h-11 items-center underline" href={item.href}>{t('openSource')}</Link> : null}
      </VStack>
    </HStack>
  );
  return (
    <li className="min-w-0 py-2">
      {item.private ? <Card variant="yellow" padding={3}>{body}</Card> : body}
    </li>
  );
}

/** Task 10: Client 360 vertical feed, newest first; private coach notes sit in a tinted card with an "only you" label. */
export function TimelineFeed({ clientId, initial }: { clientId: string; initial: TimelinePage }) {
  const t = useTranslations('dashboard.timeline');
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  async function more() {
    if (!data.nextCursor || busy) return;
    setBusy(true); setFailed(false);
    try {
      const next = await sendJson<TimelinePage>(`/api/v1/dashboard/timeline/${clientId}?cursor=${encodeURIComponent(data.nextCursor)}`, 'GET');
      setData(current => ({ items: [...current.items, ...next.items.filter(row => !current.items.some(known => known.id === row.id))], nextCursor: next.nextCursor }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  return (
    <VStack gap={3} as="section" className="min-w-0 max-w-full">
      <ol className="m-0 min-w-0 list-none border-s ps-4">
        {data.items.map(item => <Entry key={item.id} item={item} />)}
      </ol>
      <HStack gap={3} wrap="wrap">
        {data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}
        {failed ? <Text role="alert">{t('loadError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
