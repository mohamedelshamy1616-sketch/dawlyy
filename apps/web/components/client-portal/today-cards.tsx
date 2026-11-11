'use client';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { PortalToday } from '@/src/server/workout/contracts';
import { localized, displayDate } from './display';

const card = 'flex min-h-16 min-w-0 flex-col gap-2 rounded-2xl border bg-card p-5 text-start break-words';
/** Task 5: Today only reads cross-task cards and links to their locale-aware destinations. */
export function TodayCards({ data }: { data: PortalToday }) {
  const t = useTranslations('client.today'); const w = useTranslations('workout'); const status = useTranslations('status'); const locale = useLocale();
  const workout = data.workout;
  return <VStack className="flex min-w-0 flex-col gap-4">
    <Text as="p" className="text-sm text-muted-foreground">{displayDate(data.date, locale)}</Text>
    {data.subscription.daysLeft !== undefined && data.subscription.daysLeft <= 7 || ['expired', 'suspended', 'cancelled', 'grace'].includes(data.subscription.state) ?
      <VStack role="status" className="rounded-xl border border-warning p-4"><Text as="p">{t('subscription')}</Text><Text as="p">{['expired', 'cancelled', 'paused', 'active'].includes(data.subscription.state) ? status(data.subscription.state) : t(`subscriptionStates.${data.subscription.state}`)}</Text>
        {data.subscription.daysLeft !== undefined ? <Text as="p">{t('daysLeft', { count: Math.max(0, data.subscription.daysLeft) })}</Text> : null}</VStack> : null}
    {workout.state === 'none' ? <EmptyState Icon={CalendarCheck} title={t('emptyTitle')} description={t('emptyBody')} /> :
      <VStack as="section" className={`${card} border-brand/40 bg-brand-soft/30`}><Text className="text-sm font-medium">{t('workout')}</Text>
        <Heading level={2} className="text-xl font-bold">{localized(workout.name, locale) || t('restTitle')}</Heading><Text as="p">{localized(workout.dayLabel, locale)}</Text>
        {workout.state === 'rest' ? <Text as="p">{t('restBody')}</Text> : null}
        {workout.exerciseCount !== undefined ? <Text as="p">{t('exercises', { count: workout.exerciseCount })}</Text> : null}
        {['planned', 'active'].includes(workout.state) ? <Button variant="primary" data-testid="start-workout" className="min-h-12" href={workout.sessionId ? `/app/workout/${workout.sessionId}` : '/app/workout/start'} label={t(workout.state === 'active' ? 'continue' : 'start')} /> : null}
        {workout.state === 'done' && workout.sessionId ? <Link className="min-h-11 py-3 underline" href={`/app/history/${workout.sessionId}`}>{status('complete')}</Link> : null}
      </VStack>}
    {data.meals ? <Link className={card} href="/app/nutrition"><Heading level={2} className="font-semibold">{t('meals')}</Heading><Text as="p">{localized(data.meals.planName, locale)}</Text>{data.meals.kcalTarget !== undefined ? <Text as="p">{t('kcal', { count: data.meals.kcalTarget })}</Text> : null}</Link> : null}
    {data.checkins.map(event => <Link key={event.eventId} className={card} href={`/app/checkins/${event.eventId}`}><Heading level={2} className="font-semibold">{localized(event.title, locale) || t('checkin')}</Heading><Text as="p">{status(event.state === 'overdue' ? 'overdue' : 'due')}</Text><time>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.dueAt))}</time></Link>)}
    {data.intakePending ? <Link className={card} href="/app/intake">{t('intake')}</Link> : null}
    <Grid columns={2} gap={3} className="min-w-0"><Link className={card} href="/app/tracking">{t('water')}</Link><Link className={card} href="/app/tracking">{t('steps')}</Link></Grid>
    <Link className={card} href="/app/messages">{t('messages', { count: data.unreadMessages })}</Link>
    <Link className="min-h-11 py-3 underline" href="/app/program">{w('program')}</Link>
    <Link className="min-h-11 py-3 underline" href="/app/history">{w('history')}</Link>
  </VStack>;
}
