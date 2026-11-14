import type { ClientNutrition } from '@/components/nutrition/types';
import type { PortalToday } from '@/src/server/workout/contracts';
import type { ClientModules } from '@dawlyy/core/types';
import type { ThreadData } from '@/components/messaging/types';
import type { ClientTodayModel, CoachIdentity, CoachMember, MealStatus, TodayLog } from './types';

const STATUS_RANK: Record<MealStatus, number> = { eaten: 0, partial: 1, skipped: 2 };
const isMealStatus = (value: string): value is MealStatus => value === 'eaten' || value === 'partial' || value === 'skipped';

/** R0c rows carry Date, ISO text, null or nothing for voidedAt; Today needs text or null. */
function dateText(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** R2a: normalizes a meal-log row (API JSON or server row) to the fields Today reads. */
export function toTodayLog(row: unknown): TodayLog | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.status !== 'string') return null;
  return {
    mealId: typeof r.mealId === 'string' ? r.mealId : null,
    optionId: typeof r.optionId === 'string' ? r.optionId : null,
    status: r.status,
    voidedAt: dateText(r.voidedAt),
  };
}

/** The active (not voided) log of a meal. Several active rows resolve the same way for any input order. */
function activeLog(logs: readonly TodayLog[], mealId: string): TodayLog | null {
  const live = logs.filter(log => log.mealId === mealId && log.voidedAt === null && isMealStatus(log.status));
  if (live.length === 0) return null;
  return [...live].sort((a, b) =>
    STATUS_RANK[a.status as MealStatus] - STATUS_RANK[b.status as MealStatus]
    || (a.optionId ?? '').localeCompare(b.optionId ?? ''))[0] ?? null;
}

const SUBSCRIPTION_WARNING = ['expired', 'suspended', 'cancelled', 'grace'];
const needsAttention = (s: PortalToday['subscription']) => (s.daysLeft !== undefined && s.daysLeft <= 7) || SUBSCRIPTION_WARNING.includes(s.state);

/** R2a: pure view model. Disabled modules are absent from the result, not merely hidden by the view. */
export function buildClientTodayModel(input: {
  today: PortalToday; nutrition: ClientNutrition | null; logs: readonly TodayLog[];
  modules: ClientModules; locale: 'ar' | 'en'; numerals: 'latn' | 'arab';
}): ClientTodayModel {
  const { today, nutrition, logs, modules } = input;
  const planMeals = modules.nutrition ? nutrition?.version?.document.meals ?? [] : [];
  return {
    date: today.date,
    locale: input.locale,
    numerals: input.numerals,
    modules: { ...modules },
    workout: modules.workouts ? { ...today.workout } : null,
    meals: planMeals.map(meal => {
      const log = activeLog(logs, meal.id);
      const fromLog = log?.optionId && meal.options.some(option => option.id === log.optionId) ? log.optionId : null;
      return {
        id: meal.id,
        name: { ...meal.name },
        optionId: fromLog ?? meal.options[0]?.id ?? null,
        status: log ? log.status as MealStatus : null,
      };
    }),
    checkins: modules.checkins ? today.checkins.map(event => ({ ...event })) : [],
    intakePending: modules.checkins ? today.intakePending : false,
    subscription: modules.payments && needsAttention(today.subscription) ? { ...today.subscription } : null,
  };
}

/**
 * R2a: who the client's coach is, from messages and the public staff directory only. A conversation stores no
 * coach id, so the latest staff sender is matched against the directory; a one-person directory is certain.
 * Several possible coaches are shown as a team by their real public names, never as an invented assignment.
 */
export function pickCoachIdentity(directory: ReadonlyArray<{ user_id: string; display_name: string | null }>, thread: ThreadData | null): CoachIdentity {
  const members = (rows: ReadonlyArray<{ user_id: string; display_name: string | null }>): CoachMember[] =>
    rows.map(row => ({ userId: row.user_id, displayName: row.display_name?.trim() || null }));
  const staff = (thread?.messages.items ?? []).filter(message => !message.mine && message.senderRole !== 'client' && !message.deletedAt);
  const latest = [...staff].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const sender = latest ? directory.find(row => row.user_id === latest.senderUserId) : undefined;
  if (sender) return { kind: 'coach', members: members([sender]) };
  if (directory.length === 1) return { kind: 'coach', members: members(directory) };
  const named = members(directory).filter(member => member.displayName);
  return named.length > 0 ? { kind: 'team', members: named } : { kind: 'unknown', members: [] };
}