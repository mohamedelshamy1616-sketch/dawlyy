import type { ClientModules, LocalizedText } from '@dawlyy/core/types';
import type { PortalToday } from '@/src/server/workout/contracts';

export type MealStatus = 'eaten' | 'partial' | 'skipped';

/** R2a: the one pure model behind Today. R2c builds a synthetic one for its preview. */
export type ClientTodayModel = {
  date: string;
  locale: 'ar' | 'en';
  numerals: 'latn' | 'arab';
  modules: ClientModules;
  workout: PortalToday['workout'] | null;
  meals: Array<{
    id: string; name: LocalizedText; optionId: string | null;
    status: 'eaten' | 'partial' | 'skipped' | null;
  }>;
  checkins: PortalToday['checkins'];
  intakePending: boolean;
  /** Present only while payments is on and the subscription needs attention. */
  subscription?: PortalToday['subscription'] | null;
};

/** R2a: the few fields of a meal-log row that Today reads. */
export type TodayLog = {
  mealId: string | null; optionId: string | null; status: string;
  voidedAt: string | null;
};

/** R2a: the validated bootstrap that every client screen shares. */
export type ClientBootstrap = { modules: ClientModules; numerals: 'latn' | 'arab' };

export type CoachMember = { userId: string; displayName: string | null };
export type CoachIdentity = {
  /** coach: one known coach. team: several possible coaches. unknown: nothing safe to show. */
  kind: 'coach' | 'team' | 'unknown';
  members: CoachMember[];
};
export type CoachPromise = {
  /** Effective chat entitlement turnaround, or null when the chat promise is not set. */
  chatHours: number | null;
  /** The business-wide check-in review promise. It is not a chat response time. */
  checkinReviewHours: number | null;
};