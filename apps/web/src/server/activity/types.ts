/** R3b: the only audit producers whose metadata is supported by this projection. */
export const ACTIVITY_ENTITY_NAMES = [
  'clients', 'client_notes', 'exercises', 'programs', 'program_versions', 'nutrition_plans',
  'nutrition_plan_versions', 'forms', 'form_versions', 'form_submissions', 'packages',
  'subscriptions', 'subscription_events', 'payments', 'calendar_events', 'meal_logs',
  'measurement_sets', 'metric_entries', 'workout_sessions', 'messages', 'ai_drafts', 'red_flags',
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITY_NAMES)[number];
export type ActivityKind = 'program' | 'nutrition' | 'form';
export type ActivityQuery = { clientId?: string; entity?: string; limit?: string; cursor?: string };
export type ActivityItem = {
  id: string;
  createdAt: string;
  clientId: string | null;
  actor: { userId: string | null; displayName: string | null; role: string | null };
  action: string;
  entity: string;
  entityId: string | null;
  href: string | null;
  version: { kind: ActivityKind; headId: string; versionNo: number; href: string; canRevert: boolean } | null;
};
export type ActivityPage = { items: ActivityItem[]; nextCursor: string | null };
