'use client';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { Link } from '@/i18n/navigation';
import { formatNumber, localizeDigits } from '@/src/lib/numbers';
import type { ClientTodayModel } from './types';

const rowLink = 'focus-ring flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-lg py-2 text-start break-words';
const list = 'm-0 list-none p-0';

/** Dates and times use the page locale with the chosen numeral system. */
function dateParts(model: ClientTodayModel) {
  const base = { numberingSystem: model.numerals } as const;
  return {
    day: (iso: string) => new Intl.DateTimeFormat(model.locale, { ...base, dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)),
    due: (iso: string) => new Intl.DateTimeFormat(model.locale, { ...base, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
  };
}

type Props = {
  model: ClientTodayModel;
  preview?: boolean;
  onLogMeal?: (mealId: string, optionId: string) => void;
  busyMealId?: string | null;
  /** The meal whose last write failed: its row shows the error and a Retry button. */
  errorMealId?: string | null;
  /** The level of the page title. Default 1; the composer preview passes 3 so the page keeps a single h1. */
  headingLevel?: 1 | 2 | 3;
};

/**
 * R2a: Today. One lead card for the session, then meals as rows, then the check-in when due. No tiles.
 * With `preview`, every navigation and mutation control keeps its place but is inert.
 */
export function ClientTodayView({ model, preview = false, onLogMeal, busyMealId = null, errorMealId = null, headingLevel = 1 }: Props) {
  const t = useTranslations('clientToday');
  const quick = useTranslations('quickLog');
  const dates = dateParts(model);
  const number = { locale: model.locale, numerals: model.numerals } as const;
  const { workout, modules } = model;
  const hasWorkout = modules.workouts && workout !== null;
  const hasMeals = modules.nutrition;
  const hasCheckins = modules.checkins && model.checkins.length > 0;
  const hasIntake = modules.checkins && model.intakePending;
  const subscription = modules.payments ? model.subscription ?? null : null;
  const empty = !hasWorkout && !hasMeals && !hasCheckins && !hasIntake && !subscription;

  return (
    <VStack gap={6} className="min-w-0 max-w-full break-words">
      <VStack gap={1} className="min-w-0">
        <Heading level={headingLevel}>{t('today.title')}</Heading>
        <Text as="p" color="secondary">{dates.day(model.date)}</Text>
      </VStack>

      {preview ? <Banner status="info" title={t('preview.title')} description={t('preview.body')} role="note" /> : null}

      {subscription ? (
        <Banner
          status="warning"
          title={t('subscription.title')}
          description={subscription.daysLeft !== undefined && subscription.state === 'active'
            ? t('subscription.daysLeft', { n: Math.max(0, subscription.daysLeft), shown: formatNumber(Math.max(0, subscription.daysLeft), number) })
            : t('subscription.stateText', { state: subscription.state })}
          endContent={preview ? null : <Link href="/app/subscription" className={rowLink}>{t('subscription.open')}</Link>}
        />
      ) : null}

      {hasWorkout && workout ? (
        <Card padding={5} data-testid="today-workout" aria-label={t('workout.eyebrow')}>
          <VStack gap={3} className="min-w-0">
            <Text as="p" color="secondary">{t('workout.eyebrow')}</Text>
            {workout.state === 'none' ? (
              <>
                <Heading level={2}>{t('workout.noneTitle')}</Heading>
                <Text as="p">{t('workout.noneBody')}</Text>
              </>
            ) : workout.state === 'rest' ? (
              <>
                <Heading level={2}>{t('workout.restTitle')}</Heading>
                <Text as="p">{t('workout.restBody')}</Text>
              </>
            ) : (
              <>
                <Heading level={2}>{localizeDigits(localize(workout.name, model.locale), model.numerals) || t('workout.untitled')}</Heading>
                {workout.dayLabel ? <Text as="p" color="secondary">{localizeDigits(localize(workout.dayLabel, model.locale), model.numerals)}</Text> : null}
                {workout.exerciseCount !== undefined ? (
                  <Text as="p">{t('workout.exercises', { n: workout.exerciseCount, shown: formatNumber(workout.exerciseCount, number) })}</Text>
                ) : null}
                {workout.state === 'done' ? (
                  <>
                    <Text as="p">{t('workout.done')}</Text>
                    {workout.sessionId ? (
                      <Button
                        variant="secondary" size="lg" className="min-h-11" label={t('workout.review')}
                        href={preview ? undefined : `/app/history/${workout.sessionId}`} isDisabled={preview}
                      />
                    ) : null}
                  </>
                ) : (
                  <Button
                    variant="primary" size="lg" className="min-h-12 w-full" data-testid="start-workout"
                    label={t(workout.state === 'active' ? 'workout.continue' : 'workout.start')}
                    href={preview ? undefined : workout.state === 'active' && workout.sessionId ? `/app/workout/${workout.sessionId}` : '/app/workout/start'}
                    isDisabled={preview}
                  />
                )}
              </>
            )}
          </VStack>
        </Card>
      ) : null}

      {hasMeals ? (
        <VStack as="section" gap={2} className="min-w-0" aria-labelledby="today-meals">
          <Heading level={2} id="today-meals">{t('meals.title')}</Heading>
          {model.meals.length === 0 ? (
            <Text as="p" color="secondary">{t('meals.empty')}</Text>
          ) : (
            <VStack as="ul" gap={1} className={list}>
              {model.meals.map(meal => {
                const busy = busyMealId === meal.id;
                const failed = errorMealId === meal.id;
                return (
                  <HStack as="li" key={meal.id} align="center" justify="between" gap={3} className="min-h-14 min-w-0 border-b py-2" data-testid={`meal-${meal.id}`}>
                    <VStack gap={0} className="min-w-0 flex-1">
                      <Text as="p" weight="medium" className="break-words">{localize(meal.name, model.locale)}</Text>
                      {meal.status ? <Text as="p" color="secondary" className="text-sm">{t(`meals.status.${meal.status}`)}</Text> : null}
                      {failed ? <Text as="p" role="alert" className="text-sm">{t('meals.error')}</Text> : null}
                    </VStack>
                    {meal.status === null ? (
                      <Button
                        variant="secondary" className="min-h-11 shrink-0" label={t(failed ? 'meals.retry' : 'meals.ate')}
                        isDisabled={preview || busy || !meal.optionId} isLoading={busy}
                        onClick={preview || !meal.optionId ? undefined : () => onLogMeal?.(meal.id, meal.optionId!)}
                      />
                    ) : (
                      <Button
                        variant="ghost" size="sm" className="min-h-11 min-w-11 shrink-0" label={t('meals.change')}
                        href={preview ? undefined : '/app/nutrition/history'} isDisabled={preview}
                      />
                    )}
                  </HStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      ) : null}

      {hasMeals ? (
        <Button
          variant="secondary" size="lg" className="min-h-11 w-full"
          label={quick('open')} href={preview ? undefined : '/app/nutrition/log'}
          isDisabled={preview} data-testid="today-quick-log"
        />
      ) : null}

      {hasCheckins ? (
        <VStack as="section" gap={2} className="min-w-0" aria-labelledby="today-checkins">
          <Heading level={2} id="today-checkins">{t('checkins.title')}</Heading>
          <VStack as="ul" gap={1} className={list}>
            {model.checkins.map(event => {
              const body = (
                <>
                  <VStack gap={0} className="min-w-0">
                    <Text as="p" weight="medium" className="break-words">{localize(event.title, model.locale) || t('checkins.untitled')}</Text>
                    <Text as="p" color="secondary" className="text-sm">{dates.due(event.dueAt)}</Text>
                  </VStack>
                  <Text as="p" className="shrink-0 text-sm">{t(event.state === 'overdue' ? 'checkins.overdue' : 'checkins.due')}</Text>
                </>
              );
              return (
                <li key={event.eventId} className="border-b">
                  {preview ? <HStack align="center" justify="between" gap={3} className="min-h-11 py-2" aria-disabled="true">{body}</HStack>
                    : <Link href={`/app/checkins/${event.eventId}`} className={rowLink}>{body}</Link>}
                </li>
              );
            })}
          </VStack>
        </VStack>
      ) : null}

      {hasIntake ? (
        preview ? <Text as="p" aria-disabled="true">{t('intake.row')}</Text>
          : <Link href="/app/intake" className={rowLink}>{t('intake.row')}</Link>
      ) : null}

      {empty ? <EmptyState title={t('today.emptyTitle')} description={t('today.emptyBody')} /> : null}
    </VStack>
  );
}