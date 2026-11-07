import { z } from 'zod';

/**
 * State vocabularies shared by the database (pgEnum), the API and the UI.
 * Transitions live in `@dawlyy/core/state`; this file only names the states.
 * Spec §56.
 */

export const SUBSCRIPTION_STATES = ['pending', 'active', 'grace', 'expired', 'paused', 'cancelled', 'suspended'] as const;
export const SubscriptionState = z.enum(SUBSCRIPTION_STATES);
export type SubscriptionState = z.infer<typeof SubscriptionState>;

export const CHECKIN_STATES = [
  'scheduled',
  'due',
  'overdue',
  'submitted',
  'waiting_for_coach',
  'reviewed',
  'skipped',
  'rescheduled',
  'cancelled',
] as const;
export const CheckinState = z.enum(CHECKIN_STATES);
export type CheckinState = z.infer<typeof CheckinState>;

export const SESSION_STATES = [
  'not_started',
  'active',
  'paused',
  'completed',
  'partially_completed',
  'abandoned',
  'skipped',
] as const;
export const SessionState = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof SessionState>;

export const MEDIA_REVIEW_STATES = [
  'requested',
  'uploaded',
  'processing',
  'queued_for_review',
  'approved',
  'needs_resubmission',
  'rejected',
  'archived',
] as const;
export const MediaReviewState = z.enum(MEDIA_REVIEW_STATES);
export type MediaReviewState = z.infer<typeof MediaReviewState>;

export const PUBLISH_STATES = ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived'] as const;
export const PublishState = z.enum(PUBLISH_STATES);
export type PublishState = z.infer<typeof PublishState>;

export const AUTOMATION_RUN_STATES = ['pending', 'running', 'completed', 'failed', 'retrying', 'cancelled'] as const;
export const AutomationRunState = z.enum(AUTOMATION_RUN_STATES);
export type AutomationRunState = z.infer<typeof AutomationRunState>;

export const PAYMENT_STATES = ['pending', 'verified', 'rejected', 'refunded'] as const;
export const PaymentState = z.enum(PAYMENT_STATES);
export type PaymentState = z.infer<typeof PaymentState>;

export const CALENDAR_EVENT_STATES = [
  'scheduled',
  'due',
  'overdue',
  'completed',
  'skipped',
  'rescheduled',
  'cancelled',
] as const;
export const CalendarEventState = z.enum(CALENDAR_EVENT_STATES);
export type CalendarEventState = z.infer<typeof CalendarEventState>;

export const MEMBERSHIP_ROLES = ['owner', 'staff', 'client'] as const;
export const MembershipRole = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = z.infer<typeof MembershipRole>;

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'disabled'] as const;
export const MembershipStatus = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

export const CLIENT_SCOPES = ['all', 'assigned'] as const;
export const ClientScope = z.enum(CLIENT_SCOPES);
export type ClientScope = z.infer<typeof ClientScope>;

export const NOTIFICATION_DELIVERY_STATES = ['queued', 'sent', 'delivered', 'failed', 'read', 'cancelled'] as const;
export const NotificationDeliveryState = z.enum(NOTIFICATION_DELIVERY_STATES);
export type NotificationDeliveryState = z.infer<typeof NotificationDeliveryState>;

export const TASK_STATES = ['open', 'snoozed', 'done', 'cancelled'] as const;
export const TaskState = z.enum(TASK_STATES);
export type TaskState = z.infer<typeof TaskState>;
