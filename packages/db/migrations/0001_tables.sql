CREATE TYPE "public"."automation_run_state" AS ENUM('pending', 'running', 'completed', 'failed', 'retrying', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_source" AS ENUM('package_rule', 'manual', 'automation');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_state" AS ENUM('scheduled', 'due', 'overdue', 'completed', 'skipped', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."checkin_state" AS ENUM('scheduled', 'due', 'overdue', 'submitted', 'waiting_for_coach', 'reviewed', 'skipped', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."client_scope" AS ENUM('all', 'assigned');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('lead', 'active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('terms', 'privacy', 'health_data', 'photos', 'videos', 'communications');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('client', 'internal');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('template', 'client');--> statement-breakpoint
CREATE TYPE "public"."form_kind" AS ENUM('intake', 'checkin', 'assessment', 'custom');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('photo', 'video', 'file', 'voice');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('progress_photo', 'technique_video', 'inbody', 'payment_proof', 'message_attachment', 'form_answer', 'exercise_demo', 'branding', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_review_state" AS ENUM('requested', 'uploaded', 'processing', 'queued_for_review', 'approved', 'needs_resubmission', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'staff', 'client');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."metric_kind" AS ENUM('weight', 'water', 'steps', 'sleep_hours', 'habit', 'cardio_minutes', 'calories_in', 'mood', 'energy', 'custom');--> statement-breakpoint
CREATE TYPE "public"."metric_source" AS ENUM('manual', 'imported', 'device', 'ai_estimate', 'form');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('inapp', 'webpush', 'email', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_state" AS ENUM('queued', 'sent', 'delivered', 'failed', 'read', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('vodafone_cash', 'instapay', 'cash', 'bank_transfer', 'card_manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('pending', 'verified', 'rejected', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."publish_state" AS ENUM('draft', 'in_review', 'approved', 'published', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."session_state" AS ENUM('not_started', 'active', 'paused', 'completed', 'partially_completed', 'abandoned', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."subscription_event_kind" AS ENUM('created', 'activated', 'extension', 'freeze', 'resume', 'cancel', 'suspend', 'reinstate', 'expired', 'grace');--> statement-breakpoint
CREATE TYPE "public"."subscription_state" AS ENUM('pending', 'active', 'grace', 'expired', 'paused', 'cancelled', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_state" AS ENUM('open', 'snoozed', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "business_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"version" text NOT NULL,
	"locale" text NOT NULL,
	"accepted" boolean DEFAULT true NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"client_id" uuid,
	"email" text,
	"phone" text,
	"permissions" jsonb,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"client_id" uuid,
	"permissions" jsonb,
	"display_name" text,
	"email" text,
	"phone" text,
	"locale" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_client_assignments" (
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"client_code_prefix" text DEFAULT 'DW' NOT NULL,
	"client_counter" integer DEFAULT 0 NOT NULL,
	"default_locale" text DEFAULT 'ar' NOT NULL,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"detail" jsonb,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "client_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned_at" timestamp with time zone,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"membership_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text,
	"display_name" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"birth_date" date,
	"locale" text DEFAULT 'ar' NOT NULL,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"status" "client_status" DEFAULT 'lead' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text,
	"started_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_entitlement_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid,
	"override" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"duration_days" integer NOT NULL,
	"price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"entitlements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule_rules" jsonb NOT NULL,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"method" "payment_method" NOT NULL,
	"state" "payment_state" DEFAULT 'pending' NOT NULL,
	"receipt_no" text,
	"proof_media_id" uuid,
	"reference" text,
	"paid_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"rejected_reason" text,
	"refunded_at" timestamp with time zone,
	"refund_amount" numeric(12, 2),
	"provider" text,
	"provider_ref" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"kind" "subscription_event_kind" NOT NULL,
	"from_state" "subscription_state",
	"to_state" "subscription_state",
	"old_ends_on" date,
	"new_ends_on" date,
	"days" integer,
	"reason" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"package_snapshot" jsonb NOT NULL,
	"state" "subscription_state" DEFAULT 'pending' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"grace_ends_on" date,
	"timezone" text DEFAULT 'Africa/Cairo' NOT NULL,
	"paused_at" timestamp with time zone,
	"frozen_days" integer DEFAULT 0 NOT NULL,
	"price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"category" text NOT NULL,
	"primary_muscles" text[] DEFAULT '{}' NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}' NOT NULL,
	"movement_pattern" text NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"difficulty" text NOT NULL,
	"unilateral" boolean DEFAULT false NOT NULL,
	"compound" boolean DEFAULT true NOT NULL,
	"plane" text DEFAULT 'sagittal' NOT NULL,
	"cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contraindications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progressions" text[] DEFAULT '{}' NOT NULL,
	"regressions" text[] DEFAULT '{}' NOT NULL,
	"alternatives" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"video_url" text,
	"thumbnail_media_id" uuid,
	"source" text DEFAULT 'coach' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"client_id" uuid,
	"version_no" integer NOT NULL,
	"status" "publish_state" DEFAULT 'draft' NOT NULL,
	"document" jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "program_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"kind" "document_kind" NOT NULL,
	"template_id" uuid,
	"client_id" uuid,
	"subscription_id" uuid,
	"current_version_id" uuid,
	"published_version_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"category" text NOT NULL,
	"per_100" jsonb NOT NULL,
	"micronutrients" jsonb,
	"raw_or_cooked" text,
	"counterpart_slug" text,
	"cooked_yield" numeric(6, 3),
	"measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'estimate' NOT NULL,
	"brand" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meal_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"local_date" date NOT NULL,
	"meal_id" text,
	"option_id" text,
	"free_entry" jsonb,
	"status" text DEFAULT 'eaten' NOT NULL,
	"note" text,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nutrition_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"client_id" uuid,
	"version_no" integer NOT NULL,
	"status" "publish_state" DEFAULT 'draft' NOT NULL,
	"document" jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nutrition_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"kind" "document_kind" NOT NULL,
	"template_id" uuid,
	"client_id" uuid,
	"subscription_id" uuid,
	"current_version_id" uuid,
	"published_version_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "nutrition_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplement_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"supplement_id" text NOT NULL,
	"local_date" date NOT NULL,
	"taken" boolean NOT NULL,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplement_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"form_version_id" uuid NOT NULL,
	"form_kind" "form_kind" NOT NULL,
	"calendar_event_id" uuid,
	"subscription_id" uuid,
	"state" "checkin_state" DEFAULT 'due' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"missing_required" text[] DEFAULT '{}' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"coach_feedback" text,
	"results" jsonb,
	"client_uuid" uuid,
	"client_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"client_id" uuid,
	"version_no" integer NOT NULL,
	"status" "publish_state" DEFAULT 'draft' NOT NULL,
	"document" jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "form_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"form_kind" "form_kind" NOT NULL,
	"kind" "document_kind" NOT NULL,
	"template_id" uuid,
	"client_id" uuid,
	"current_version_id" uuid,
	"published_version_id" uuid,
	"is_default" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"subscription_id" uuid,
	"type" text NOT NULL,
	"state" "calendar_event_state" DEFAULT 'scheduled' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"window_days" integer DEFAULT 1 NOT NULL,
	"source" "calendar_event_source" NOT NULL,
	"rule_key" text,
	"title" jsonb,
	"payload" jsonb,
	"rescheduled_from" uuid,
	"completed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"last_processed_at" timestamp with time zone,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inbody_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"raw_media_id" uuid,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"normalized" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbody_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurement_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"values" jsonb NOT NULL,
	"taken_by" text DEFAULT 'client' NOT NULL,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "measurement_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"metric" "metric_kind" NOT NULL,
	"metric_key" text,
	"value" numeric(12, 3) NOT NULL,
	"unit" text NOT NULL,
	"source" "metric_source" DEFAULT 'manual' NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"correction_of" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "progress_photo_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"poses" jsonb NOT NULL,
	"weight_kg" numeric(6, 2),
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_photo_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"block_id" text,
	"item_id" text,
	"set_no" integer NOT NULL,
	"tag" text DEFAULT 'working' NOT NULL,
	"reps" integer,
	"load" numeric(8, 2),
	"load_unit" text,
	"duration_sec" integer,
	"distance_m" numeric(9, 1),
	"rpe" numeric(4, 1),
	"rir" integer,
	"rest_sec" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"substituted_for" uuid,
	"pain_flag" boolean DEFAULT false NOT NULL,
	"note" text,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "set_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"program_id" uuid,
	"program_version_id" uuid,
	"phase_id" text,
	"week_id" text,
	"day_id" text,
	"workout_id" text,
	"planned_workout" jsonb,
	"state" "session_state" DEFAULT 'not_started' NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"rpe_overall" numeric(4, 1),
	"mood" text,
	"pain_note" text,
	"client_note" text,
	"summary" jsonb,
	"client_uuid" uuid NOT NULL,
	"client_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "conversation_kind" DEFAULT 'client' NOT NULL,
	"client_id" uuid,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"unread_for_coach" integer DEFAULT 0 NOT NULL,
	"unread_for_client" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_id" uuid,
	"sender_user_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template_key" text,
	"reply_to_id" uuid,
	"client_uuid" uuid NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"read_by_client_at" timestamp with time zone,
	"read_by_coach_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"state" "notification_delivery_state" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_ref" text,
	"last_error" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid,
	"type" text NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb,
	"link" text,
	"dedupe_key" text,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"model" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"client_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"aggregate" text NOT NULL,
	"aggregate_id" text,
	"client_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"job" text NOT NULL,
	"state" "automation_run_state" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"attempts" integer DEFAULT 1 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"owner_user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"purpose" "media_purpose" NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" integer,
	"review_state" "media_review_state",
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"uploaded_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"title" text NOT NULL,
	"detail" text,
	"priority" "task_priority" DEFAULT 'normal' NOT NULL,
	"state" "task_state" DEFAULT 'open' NOT NULL,
	"due_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"assignee_membership_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_event_id" uuid,
	"dedupe_key" text,
	"link" text,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ADD CONSTRAINT "staff_client_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ADD CONSTRAINT "staff_client_assignments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_flags" ADD CONSTRAINT "client_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_flags" ADD CONSTRAINT "client_flags_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ADD CONSTRAINT "client_entitlement_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ADD CONSTRAINT "client_entitlement_overrides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ADD CONSTRAINT "client_entitlement_overrides_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ADD CONSTRAINT "nutrition_plan_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ADD CONSTRAINT "nutrition_plan_versions_plan_id_nutrition_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."nutrition_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_version_id_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbody_records" ADD CONSTRAINT "inbody_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbody_records" ADD CONSTRAINT "inbody_records_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_sets" ADD CONSTRAINT "measurement_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_sets" ADD CONSTRAINT "measurement_sets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photo_sets" ADD CONSTRAINT "progress_photo_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photo_sets" ADD CONSTRAINT "progress_photo_sets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_tenant_user_idx" ON "consents" USING btree ("tenant_id","user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uq" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_tenant_status_idx" ON "invitations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_uq" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_role_idx" ON "memberships" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "memberships_client_idx" ON "memberships" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_client_assignments_uq" ON "staff_client_assignments" USING btree ("membership_id","client_id");--> statement-breakpoint
CREATE INDEX "staff_client_assignments_tenant_client_idx" ON "staff_client_assignments" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_uq" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_uq" ON "user_preferences" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "client_flags_tenant_open_idx" ON "client_flags" USING btree ("tenant_id","resolved_at");--> statement-breakpoint
CREATE INDEX "client_flags_client_idx" ON "client_flags" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_notes_tenant_client_idx" ON "client_notes" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tenant_code_uq" ON "clients" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "clients_tenant_status_idx" ON "clients" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "clients_tenant_phone_idx" ON "clients" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "clients_membership_idx" ON "clients" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "client_entitlement_overrides_client_idx" ON "client_entitlement_overrides" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "packages_tenant_idx" ON "packages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_state_idx" ON "payments" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "payments_client_idx" ON "payments" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "subscription_events_sub_idx" ON "subscription_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_client_idx" ON "subscriptions" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_state_ends_idx" ON "subscriptions" USING btree ("tenant_id","state","ends_on");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_tenant_slug_uq" ON "exercises" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "exercises_tenant_category_idx" ON "exercises" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_program_no_uq" ON "program_versions" USING btree ("program_id","version_no");--> statement-breakpoint
CREATE INDEX "program_versions_program_status_idx" ON "program_versions" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "programs_tenant_kind_idx" ON "programs" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "programs_client_idx" ON "programs" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_tenant_slug_uq" ON "foods" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "foods_tenant_category_idx" ON "foods" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_logs_client_uuid_uq" ON "meal_logs" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "meal_logs_client_date_idx" ON "meal_logs" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_plan_versions_plan_no_uq" ON "nutrition_plan_versions" USING btree ("plan_id","version_no");--> statement-breakpoint
CREATE INDEX "nutrition_plan_versions_plan_status_idx" ON "nutrition_plan_versions" USING btree ("plan_id","status");--> statement-breakpoint
CREATE INDEX "nutrition_plans_tenant_kind_idx" ON "nutrition_plans" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX "nutrition_plans_client_idx" ON "nutrition_plans" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplement_logs_client_uuid_uq" ON "supplement_logs" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "supplement_logs_client_date_idx" ON "supplement_logs" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE INDEX "form_submissions_client_kind_idx" ON "form_submissions" USING btree ("tenant_id","client_id","form_kind");--> statement-breakpoint
CREATE INDEX "form_submissions_tenant_state_idx" ON "form_submissions" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX "form_submissions_event_idx" ON "form_submissions" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_client_uuid_uq" ON "form_submissions" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_form_no_uq" ON "form_versions" USING btree ("form_id","version_no");--> statement-breakpoint
CREATE INDEX "forms_tenant_kind_idx" ON "forms" USING btree ("tenant_id","form_kind","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_sub_rule_uq" ON "calendar_events" USING btree ("subscription_id","rule_key");--> statement-breakpoint
CREATE INDEX "calendar_events_tenant_due_idx" ON "calendar_events" USING btree ("tenant_id","state","due_at");--> statement-breakpoint
CREATE INDEX "calendar_events_client_date_idx" ON "calendar_events" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE INDEX "inbody_records_client_date_idx" ON "inbody_records" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_sets_client_uuid_uq" ON "measurement_sets" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "measurement_sets_client_date_idx" ON "measurement_sets" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_client_uuid_uq" ON "metric_entries" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "metric_entries_client_metric_date_idx" ON "metric_entries" USING btree ("tenant_id","client_id","metric","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_photo_sets_client_uuid_uq" ON "progress_photo_sets" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "progress_photo_sets_client_date_idx" ON "progress_photo_sets" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_client_uuid_uq" ON "set_logs" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "set_logs_session_idx" ON "set_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_logs_client_exercise_idx" ON "set_logs" USING btree ("tenant_id","client_id","exercise_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_client_uuid_uq" ON "workout_sessions" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "workout_sessions_client_date_idx" ON "workout_sessions" USING btree ("tenant_id","client_id","local_date");--> statement-breakpoint
CREATE INDEX "workout_sessions_client_workout_idx" ON "workout_sessions" USING btree ("tenant_id","client_id","workout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_tenant_client_uq" ON "conversations" USING btree ("tenant_id","client_id");--> statement-breakpoint
CREATE INDEX "conversations_tenant_last_idx" ON "conversations" USING btree ("tenant_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_uuid_uq" ON "messages" USING btree ("tenant_id","client_uuid");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queue_idx" ON "notification_deliveries" USING btree ("state","scheduled_for");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" USING btree ("tenant_id","user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "ai_requests_tenant_idx" ON "ai_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_created_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "events_unprocessed_idx" ON "events" USING btree ("processed_at","created_at");--> statement-breakpoint
CREATE INDEX "events_tenant_type_idx" ON "events" USING btree ("tenant_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_uq" ON "idempotency_keys" USING btree ("tenant_id","user_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_bucket_path_uq" ON "media" USING btree ("bucket","path");--> statement-breakpoint
CREATE INDEX "media_client_purpose_idx" ON "media" USING btree ("tenant_id","client_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_tenant_dedupe_uq" ON "tasks" USING btree ("tenant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "tasks_tenant_state_due_idx" ON "tasks" USING btree ("tenant_id","state","due_at");--> statement-breakpoint
CREATE INDEX "tasks_client_idx" ON "tasks" USING btree ("client_id");--> statement-breakpoint
CREATE POLICY "business_settings_member_select" ON "business_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("business_settings"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "business_settings_owner_all" ON "business_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING ("business_settings"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner') WITH CHECK ("business_settings"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner');--> statement-breakpoint
CREATE POLICY "consents_owner_all" ON "consents" AS PERMISSIVE FOR ALL TO "authenticated" USING ("consents"."tenant_id" = (select app.tenant_id()) and "consents"."user_id" = (select app.uid())) WITH CHECK ("consents"."tenant_id" = (select app.tenant_id()) and "consents"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "consents_staff_select" ON "consents" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("consents"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "invitations_staff_all" ON "invitations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("invitations"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("invitations"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "memberships_self_select" ON "memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("memberships"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "memberships_staff_select" ON "memberships" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("memberships"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "memberships_owner_all" ON "memberships" AS PERMISSIVE FOR ALL TO "authenticated" USING ("memberships"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner') WITH CHECK ("memberships"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner');--> statement-breakpoint
CREATE POLICY "staff_client_assignments_staff_select" ON "staff_client_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("staff_client_assignments"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "staff_client_assignments_owner_all" ON "staff_client_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING ("staff_client_assignments"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner') WITH CHECK ("staff_client_assignments"."tenant_id" = (select app.tenant_id()) and (select app.role()) = 'owner');--> statement-breakpoint
CREATE POLICY "tenants_member_select" ON "tenants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("tenants"."id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "tenants_owner_update" ON "tenants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("tenants"."id" = (select app.tenant_id()) and (select app.role()) = 'owner') WITH CHECK ("tenants"."id" = (select app.tenant_id()) and (select app.role()) = 'owner');--> statement-breakpoint
CREATE POLICY "user_preferences_owner_all" ON "user_preferences" AS PERMISSIVE FOR ALL TO "authenticated" USING ("user_preferences"."tenant_id" = (select app.tenant_id()) and "user_preferences"."user_id" = (select app.uid())) WITH CHECK ("user_preferences"."tenant_id" = (select app.tenant_id()) and "user_preferences"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "client_flags_coach_all" ON "client_flags" AS PERMISSIVE FOR ALL TO "authenticated" USING ("client_flags"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("client_flags"."client_id" is null or (select app.can_access_client("client_flags"."client_id")))) WITH CHECK ("client_flags"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("client_flags"."client_id" is null or (select app.can_access_client("client_flags"."client_id"))));--> statement-breakpoint
CREATE POLICY "client_notes_coach_all" ON "client_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING ("client_notes"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("client_notes"."client_id" is null or (select app.can_access_client("client_notes"."client_id")))) WITH CHECK ("client_notes"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("client_notes"."client_id" is null or (select app.can_access_client("client_notes"."client_id"))));--> statement-breakpoint
CREATE POLICY "clients_access_select" ON "clients" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("clients"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("clients"."id")));--> statement-breakpoint
CREATE POLICY "clients_staff_all" ON "clients" AS PERMISSIVE FOR ALL TO "authenticated" USING ("clients"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("clients"."id")) and (select app.is_staff())) WITH CHECK ("clients"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("clients"."id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "client_entitlement_overrides_access_select" ON "client_entitlement_overrides" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("client_entitlement_overrides"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("client_entitlement_overrides"."client_id")));--> statement-breakpoint
CREATE POLICY "client_entitlement_overrides_staff_all" ON "client_entitlement_overrides" AS PERMISSIVE FOR ALL TO "authenticated" USING ("client_entitlement_overrides"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("client_entitlement_overrides"."client_id")) and (select app.is_staff())) WITH CHECK ("client_entitlement_overrides"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("client_entitlement_overrides"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "packages_member_select" ON "packages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("packages"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "packages_staff_all" ON "packages" AS PERMISSIVE FOR ALL TO "authenticated" USING ("packages"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("packages"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "payments_access_select" ON "payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("payments"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("payments"."client_id")));--> statement-breakpoint
CREATE POLICY "payments_staff_all" ON "payments" AS PERMISSIVE FOR ALL TO "authenticated" USING ("payments"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("payments"."client_id")) and (select app.is_staff())) WITH CHECK ("payments"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("payments"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "payments_client_insert" ON "payments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("payments"."tenant_id" = (select app.tenant_id()) and "payments"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "payments_client_update" ON "payments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("payments"."tenant_id" = (select app.tenant_id()) and "payments"."client_id" = (select app.client_id())) WITH CHECK ("payments"."tenant_id" = (select app.tenant_id()) and "payments"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "subscription_events_access_select" ON "subscription_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("subscription_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscription_events"."client_id")));--> statement-breakpoint
CREATE POLICY "subscription_events_staff_all" ON "subscription_events" AS PERMISSIVE FOR ALL TO "authenticated" USING ("subscription_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscription_events"."client_id")) and (select app.is_staff())) WITH CHECK ("subscription_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscription_events"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "subscriptions_access_select" ON "subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("subscriptions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscriptions"."client_id")));--> statement-breakpoint
CREATE POLICY "subscriptions_staff_all" ON "subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("subscriptions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscriptions"."client_id")) and (select app.is_staff())) WITH CHECK ("subscriptions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("subscriptions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "exercises_system_select" ON "exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exercises"."tenant_id" is null);--> statement-breakpoint
CREATE POLICY "exercises_member_select" ON "exercises" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exercises"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "exercises_staff_all" ON "exercises" AS PERMISSIVE FOR ALL TO "authenticated" USING ("exercises"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("exercises"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "program_versions_staff_templates" ON "program_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("program_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "program_versions"."client_id" is null) WITH CHECK ("program_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "program_versions"."client_id" is null);--> statement-breakpoint
CREATE POLICY "program_versions_client_access_select" ON "program_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("program_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("program_versions"."client_id")));--> statement-breakpoint
CREATE POLICY "program_versions_client_staff_all" ON "program_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("program_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("program_versions"."client_id")) and (select app.is_staff())) WITH CHECK ("program_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("program_versions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "programs_staff_templates" ON "programs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("programs"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "programs"."client_id" is null) WITH CHECK ("programs"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "programs"."client_id" is null);--> statement-breakpoint
CREATE POLICY "programs_client_access_select" ON "programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("programs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("programs"."client_id")));--> statement-breakpoint
CREATE POLICY "programs_client_staff_all" ON "programs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("programs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("programs"."client_id")) and (select app.is_staff())) WITH CHECK ("programs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("programs"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "foods_system_select" ON "foods" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("foods"."tenant_id" is null);--> statement-breakpoint
CREATE POLICY "foods_member_select" ON "foods" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("foods"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "foods_staff_all" ON "foods" AS PERMISSIVE FOR ALL TO "authenticated" USING ("foods"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("foods"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "meal_logs_access_select" ON "meal_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("meal_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("meal_logs"."client_id")));--> statement-breakpoint
CREATE POLICY "meal_logs_staff_all" ON "meal_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("meal_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("meal_logs"."client_id")) and (select app.is_staff())) WITH CHECK ("meal_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("meal_logs"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "meal_logs_client_insert" ON "meal_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("meal_logs"."tenant_id" = (select app.tenant_id()) and "meal_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "meal_logs_client_update" ON "meal_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("meal_logs"."tenant_id" = (select app.tenant_id()) and "meal_logs"."client_id" = (select app.client_id())) WITH CHECK ("meal_logs"."tenant_id" = (select app.tenant_id()) and "meal_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "nutrition_plan_versions_staff_templates" ON "nutrition_plan_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("nutrition_plan_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "nutrition_plan_versions"."client_id" is null) WITH CHECK ("nutrition_plan_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "nutrition_plan_versions"."client_id" is null);--> statement-breakpoint
CREATE POLICY "nutrition_plan_versions_client_access_select" ON "nutrition_plan_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("nutrition_plan_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plan_versions"."client_id")));--> statement-breakpoint
CREATE POLICY "nutrition_plan_versions_client_staff_all" ON "nutrition_plan_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("nutrition_plan_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plan_versions"."client_id")) and (select app.is_staff())) WITH CHECK ("nutrition_plan_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plan_versions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "nutrition_plans_staff_templates" ON "nutrition_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING ("nutrition_plans"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "nutrition_plans"."client_id" is null) WITH CHECK ("nutrition_plans"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "nutrition_plans"."client_id" is null);--> statement-breakpoint
CREATE POLICY "nutrition_plans_client_access_select" ON "nutrition_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("nutrition_plans"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plans"."client_id")));--> statement-breakpoint
CREATE POLICY "nutrition_plans_client_staff_all" ON "nutrition_plans" AS PERMISSIVE FOR ALL TO "authenticated" USING ("nutrition_plans"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plans"."client_id")) and (select app.is_staff())) WITH CHECK ("nutrition_plans"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("nutrition_plans"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "supplement_logs_access_select" ON "supplement_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("supplement_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("supplement_logs"."client_id")));--> statement-breakpoint
CREATE POLICY "supplement_logs_staff_all" ON "supplement_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("supplement_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("supplement_logs"."client_id")) and (select app.is_staff())) WITH CHECK ("supplement_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("supplement_logs"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "supplement_logs_client_insert" ON "supplement_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("supplement_logs"."tenant_id" = (select app.tenant_id()) and "supplement_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "supplement_logs_client_update" ON "supplement_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("supplement_logs"."tenant_id" = (select app.tenant_id()) and "supplement_logs"."client_id" = (select app.client_id())) WITH CHECK ("supplement_logs"."tenant_id" = (select app.tenant_id()) and "supplement_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "form_submissions_access_select" ON "form_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("form_submissions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_submissions"."client_id")));--> statement-breakpoint
CREATE POLICY "form_submissions_staff_all" ON "form_submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("form_submissions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_submissions"."client_id")) and (select app.is_staff())) WITH CHECK ("form_submissions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_submissions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "form_submissions_client_insert" ON "form_submissions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("form_submissions"."tenant_id" = (select app.tenant_id()) and "form_submissions"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "form_submissions_client_update" ON "form_submissions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("form_submissions"."tenant_id" = (select app.tenant_id()) and "form_submissions"."client_id" = (select app.client_id())) WITH CHECK ("form_submissions"."tenant_id" = (select app.tenant_id()) and "form_submissions"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "form_versions_staff_templates" ON "form_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("form_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "form_versions"."client_id" is null) WITH CHECK ("form_versions"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "form_versions"."client_id" is null);--> statement-breakpoint
CREATE POLICY "form_versions_client_access_select" ON "form_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("form_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_versions"."client_id")));--> statement-breakpoint
CREATE POLICY "form_versions_client_staff_all" ON "form_versions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("form_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_versions"."client_id")) and (select app.is_staff())) WITH CHECK ("form_versions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("form_versions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "forms_staff_templates" ON "forms" AS PERMISSIVE FOR ALL TO "authenticated" USING ("forms"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "forms"."client_id" is null) WITH CHECK ("forms"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and "forms"."client_id" is null);--> statement-breakpoint
CREATE POLICY "forms_client_access_select" ON "forms" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("forms"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("forms"."client_id")));--> statement-breakpoint
CREATE POLICY "forms_client_staff_all" ON "forms" AS PERMISSIVE FOR ALL TO "authenticated" USING ("forms"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("forms"."client_id")) and (select app.is_staff())) WITH CHECK ("forms"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("forms"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "calendar_events_access_select" ON "calendar_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("calendar_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("calendar_events"."client_id")));--> statement-breakpoint
CREATE POLICY "calendar_events_staff_all" ON "calendar_events" AS PERMISSIVE FOR ALL TO "authenticated" USING ("calendar_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("calendar_events"."client_id")) and (select app.is_staff())) WITH CHECK ("calendar_events"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("calendar_events"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "calendar_events_client_insert" ON "calendar_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("calendar_events"."tenant_id" = (select app.tenant_id()) and "calendar_events"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "calendar_events_client_update" ON "calendar_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("calendar_events"."tenant_id" = (select app.tenant_id()) and "calendar_events"."client_id" = (select app.client_id())) WITH CHECK ("calendar_events"."tenant_id" = (select app.tenant_id()) and "calendar_events"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "inbody_records_access_select" ON "inbody_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("inbody_records"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("inbody_records"."client_id")));--> statement-breakpoint
CREATE POLICY "inbody_records_staff_all" ON "inbody_records" AS PERMISSIVE FOR ALL TO "authenticated" USING ("inbody_records"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("inbody_records"."client_id")) and (select app.is_staff())) WITH CHECK ("inbody_records"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("inbody_records"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "inbody_records_client_insert" ON "inbody_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("inbody_records"."tenant_id" = (select app.tenant_id()) and "inbody_records"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "inbody_records_client_update" ON "inbody_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("inbody_records"."tenant_id" = (select app.tenant_id()) and "inbody_records"."client_id" = (select app.client_id())) WITH CHECK ("inbody_records"."tenant_id" = (select app.tenant_id()) and "inbody_records"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "measurement_sets_access_select" ON "measurement_sets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("measurement_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("measurement_sets"."client_id")));--> statement-breakpoint
CREATE POLICY "measurement_sets_staff_all" ON "measurement_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("measurement_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("measurement_sets"."client_id")) and (select app.is_staff())) WITH CHECK ("measurement_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("measurement_sets"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "measurement_sets_client_insert" ON "measurement_sets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("measurement_sets"."tenant_id" = (select app.tenant_id()) and "measurement_sets"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "measurement_sets_client_update" ON "measurement_sets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("measurement_sets"."tenant_id" = (select app.tenant_id()) and "measurement_sets"."client_id" = (select app.client_id())) WITH CHECK ("measurement_sets"."tenant_id" = (select app.tenant_id()) and "measurement_sets"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "metric_entries_access_select" ON "metric_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_entries"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("metric_entries"."client_id")));--> statement-breakpoint
CREATE POLICY "metric_entries_staff_all" ON "metric_entries" AS PERMISSIVE FOR ALL TO "authenticated" USING ("metric_entries"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("metric_entries"."client_id")) and (select app.is_staff())) WITH CHECK ("metric_entries"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("metric_entries"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "metric_entries_client_insert" ON "metric_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("metric_entries"."tenant_id" = (select app.tenant_id()) and "metric_entries"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "metric_entries_client_update" ON "metric_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("metric_entries"."tenant_id" = (select app.tenant_id()) and "metric_entries"."client_id" = (select app.client_id())) WITH CHECK ("metric_entries"."tenant_id" = (select app.tenant_id()) and "metric_entries"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "progress_photo_sets_access_select" ON "progress_photo_sets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("progress_photo_sets"."client_id")));--> statement-breakpoint
CREATE POLICY "progress_photo_sets_staff_all" ON "progress_photo_sets" AS PERMISSIVE FOR ALL TO "authenticated" USING ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("progress_photo_sets"."client_id")) and (select app.is_staff())) WITH CHECK ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("progress_photo_sets"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "progress_photo_sets_client_insert" ON "progress_photo_sets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and "progress_photo_sets"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "progress_photo_sets_client_update" ON "progress_photo_sets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and "progress_photo_sets"."client_id" = (select app.client_id())) WITH CHECK ("progress_photo_sets"."tenant_id" = (select app.tenant_id()) and "progress_photo_sets"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "set_logs_access_select" ON "set_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("set_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("set_logs"."client_id")));--> statement-breakpoint
CREATE POLICY "set_logs_staff_all" ON "set_logs" AS PERMISSIVE FOR ALL TO "authenticated" USING ("set_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("set_logs"."client_id")) and (select app.is_staff())) WITH CHECK ("set_logs"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("set_logs"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "set_logs_client_insert" ON "set_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("set_logs"."tenant_id" = (select app.tenant_id()) and "set_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "set_logs_client_update" ON "set_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("set_logs"."tenant_id" = (select app.tenant_id()) and "set_logs"."client_id" = (select app.client_id())) WITH CHECK ("set_logs"."tenant_id" = (select app.tenant_id()) and "set_logs"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "workout_sessions_access_select" ON "workout_sessions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("workout_sessions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("workout_sessions"."client_id")));--> statement-breakpoint
CREATE POLICY "workout_sessions_staff_all" ON "workout_sessions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("workout_sessions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("workout_sessions"."client_id")) and (select app.is_staff())) WITH CHECK ("workout_sessions"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("workout_sessions"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "workout_sessions_client_insert" ON "workout_sessions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("workout_sessions"."tenant_id" = (select app.tenant_id()) and "workout_sessions"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "workout_sessions_client_update" ON "workout_sessions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("workout_sessions"."tenant_id" = (select app.tenant_id()) and "workout_sessions"."client_id" = (select app.client_id())) WITH CHECK ("workout_sessions"."tenant_id" = (select app.tenant_id()) and "workout_sessions"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "conversations_access_select" ON "conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("conversations"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("conversations"."client_id")));--> statement-breakpoint
CREATE POLICY "conversations_staff_all" ON "conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("conversations"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("conversations"."client_id")) and (select app.is_staff())) WITH CHECK ("conversations"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("conversations"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "conversations_client_insert" ON "conversations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("conversations"."tenant_id" = (select app.tenant_id()) and "conversations"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "conversations_client_update" ON "conversations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("conversations"."tenant_id" = (select app.tenant_id()) and "conversations"."client_id" = (select app.client_id())) WITH CHECK ("conversations"."tenant_id" = (select app.tenant_id()) and "conversations"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "conversations_internal_coach_all" ON "conversations" AS PERMISSIVE FOR ALL TO "authenticated" USING ("conversations"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("conversations"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "messages_access_select" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("messages"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("messages"."client_id")));--> statement-breakpoint
CREATE POLICY "messages_staff_all" ON "messages" AS PERMISSIVE FOR ALL TO "authenticated" USING ("messages"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("messages"."client_id")) and (select app.is_staff())) WITH CHECK ("messages"."tenant_id" = (select app.tenant_id()) and (select app.can_access_client("messages"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "messages_client_insert" ON "messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("messages"."tenant_id" = (select app.tenant_id()) and "messages"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "messages_client_update" ON "messages" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("messages"."tenant_id" = (select app.tenant_id()) and "messages"."client_id" = (select app.client_id())) WITH CHECK ("messages"."tenant_id" = (select app.tenant_id()) and "messages"."client_id" = (select app.client_id()));--> statement-breakpoint
CREATE POLICY "messages_internal_coach_all" ON "messages" AS PERMISSIVE FOR ALL TO "authenticated" USING ("messages"."tenant_id" = (select app.tenant_id()) and (select app.is_staff())) WITH CHECK ("messages"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "notification_deliveries_owner_select" ON "notification_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notification_deliveries"."tenant_id" = (select app.tenant_id()) and "notification_deliveries"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "notifications_owner_all" ON "notifications" AS PERMISSIVE FOR ALL TO "authenticated" USING ("notifications"."tenant_id" = (select app.tenant_id()) and "notifications"."user_id" = (select app.uid())) WITH CHECK ("notifications"."tenant_id" = (select app.tenant_id()) and "notifications"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_owner_all" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO "authenticated" USING ("push_subscriptions"."tenant_id" = (select app.tenant_id()) and "push_subscriptions"."user_id" = (select app.uid())) WITH CHECK ("push_subscriptions"."tenant_id" = (select app.tenant_id()) and "push_subscriptions"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "ai_requests_coach_all" ON "ai_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING ("ai_requests"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("ai_requests"."client_id" is null or (select app.can_access_client("ai_requests"."client_id")))) WITH CHECK ("ai_requests"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("ai_requests"."client_id" is null or (select app.can_access_client("ai_requests"."client_id"))));--> statement-breakpoint
CREATE POLICY "audit_log_staff_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("audit_log"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "audit_log_member_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("audit_log"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "events_member_insert" ON "events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("events"."tenant_id" = (select app.tenant_id()));--> statement-breakpoint
CREATE POLICY "events_staff_select" ON "events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("events"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "idempotency_keys_owner_all" ON "idempotency_keys" AS PERMISSIVE FOR ALL TO "authenticated" USING ("idempotency_keys"."tenant_id" = (select app.tenant_id()) and "idempotency_keys"."user_id" = (select app.uid())) WITH CHECK ("idempotency_keys"."tenant_id" = (select app.tenant_id()) and "idempotency_keys"."user_id" = (select app.uid()));--> statement-breakpoint
CREATE POLICY "job_runs_staff_select" ON "job_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("job_runs"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "media_tenant_select" ON "media" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is null);--> statement-breakpoint
CREATE POLICY "media_tenant_staff_all" ON "media" AS PERMISSIVE FOR ALL TO "authenticated" USING ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is null and (select app.is_staff())) WITH CHECK ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is null and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "media_client_select" ON "media" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is not null and (select app.can_access_client("media"."client_id")));--> statement-breakpoint
CREATE POLICY "media_client_owner_insert" ON "media" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("media"."tenant_id" = (select app.tenant_id()) and "media"."owner_user_id" = (select app.uid()) and (select app.can_access_client("media"."client_id")));--> statement-breakpoint
CREATE POLICY "media_client_staff_all" ON "media" AS PERMISSIVE FOR ALL TO "authenticated" USING ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is not null and (select app.can_access_client("media"."client_id")) and (select app.is_staff())) WITH CHECK ("media"."tenant_id" = (select app.tenant_id()) and "media"."client_id" is not null and (select app.can_access_client("media"."client_id")) and (select app.is_staff()));--> statement-breakpoint
CREATE POLICY "tasks_coach_all" ON "tasks" AS PERMISSIVE FOR ALL TO "authenticated" USING ("tasks"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("tasks"."client_id" is null or (select app.can_access_client("tasks"."client_id")))) WITH CHECK ("tasks"."tenant_id" = (select app.tenant_id()) and (select app.is_staff()) and ("tasks"."client_id" is null or (select app.can_access_client("tasks"."client_id"))));