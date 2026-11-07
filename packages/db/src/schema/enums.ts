import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AUTOMATION_RUN_STATES,
  CALENDAR_EVENT_STATES,
  CHECKIN_STATES,
  CLIENT_SCOPES,
  MEDIA_REVIEW_STATES,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_STATUSES,
  NOTIFICATION_DELIVERY_STATES,
  PAYMENT_STATES,
  PUBLISH_STATES,
  SESSION_STATES,
  SUBSCRIPTION_STATES,
  TASK_STATES,
} from '@dawlyy/core/types';

// One source of truth for state vocabularies: @dawlyy/core/types/states.ts.
export const membershipRole = pgEnum('membership_role', MEMBERSHIP_ROLES);
export const membershipStatus = pgEnum('membership_status', MEMBERSHIP_STATUSES);
export const clientScope = pgEnum('client_scope', CLIENT_SCOPES);
export const subscriptionState = pgEnum('subscription_state', SUBSCRIPTION_STATES);
export const paymentState = pgEnum('payment_state', PAYMENT_STATES);
export const publishState = pgEnum('publish_state', PUBLISH_STATES);
export const checkinState = pgEnum('checkin_state', CHECKIN_STATES);
export const sessionState = pgEnum('session_state', SESSION_STATES);
export const mediaReviewState = pgEnum('media_review_state', MEDIA_REVIEW_STATES);
export const automationRunState = pgEnum('automation_run_state', AUTOMATION_RUN_STATES);
export const calendarEventState = pgEnum('calendar_event_state', CALENDAR_EVENT_STATES);
export const notificationDeliveryState = pgEnum('notification_delivery_state', NOTIFICATION_DELIVERY_STATES);
export const taskState = pgEnum('task_state', TASK_STATES);

export const clientStatus = pgEnum('client_status', ['lead', 'active', 'inactive', 'archived']);
export const documentKind = pgEnum('document_kind', ['template', 'client']);
export const formKind = pgEnum('form_kind', ['intake', 'checkin', 'assessment', 'custom']);
export const paymentMethod = pgEnum('payment_method', ['vodafone_cash', 'instapay', 'cash', 'bank_transfer', 'card_manual', 'other']);
export const subscriptionEventKind = pgEnum('subscription_event_kind', [
  'created',
  'activated',
  'extension',
  'freeze',
  'resume',
  'cancel',
  'suspend',
  'reinstate',
  'expired',
  'grace',
]);
export const metricKind = pgEnum('metric_kind', ['weight', 'water', 'steps', 'sleep_hours', 'habit', 'cardio_minutes', 'calories_in', 'mood', 'energy', 'custom']);
export const metricSource = pgEnum('metric_source', ['manual', 'imported', 'device', 'ai_estimate', 'form']);
export const mediaKind = pgEnum('media_kind', ['photo', 'video', 'file', 'voice']);
export const mediaPurpose = pgEnum('media_purpose', [
  'progress_photo',
  'technique_video',
  'inbody',
  'payment_proof',
  'message_attachment',
  'form_answer',
  'exercise_demo',
  'branding',
  'other',
]);
export const notificationChannel = pgEnum('notification_channel', ['inapp', 'webpush', 'email', 'whatsapp', 'sms']);
export const taskPriority = pgEnum('task_priority', ['low', 'normal', 'high', 'urgent']);
export const consentKind = pgEnum('consent_kind', ['terms', 'privacy', 'health_data', 'photos', 'videos', 'communications']);
export const invitationStatus = pgEnum('invitation_status', ['pending', 'accepted', 'expired', 'revoked']);
export const calendarEventSource = pgEnum('calendar_event_source', ['package_rule', 'manual', 'automation']);
export const conversationKind = pgEnum('conversation_kind', ['client', 'internal']);
