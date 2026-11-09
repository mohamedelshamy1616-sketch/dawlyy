CREATE TABLE "tenant_hidden_items" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_id" uuid NOT NULL,
	"hidden_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_hidden_items_pk" PRIMARY KEY("tenant_id","kind","item_id"),
	CONSTRAINT "tenant_hidden_items_kind_ck" CHECK ("tenant_hidden_items"."kind" in ('exercise','food'))
);
--> statement-breakpoint
ALTER TABLE "tenant_hidden_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "message_revisions" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"client_id" uuid,
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revised_by" uuid,
	CONSTRAINT "message_revisions_pkey" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "message_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meal_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplement_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbody_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "measurement_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metric_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "progress_photo_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "set_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workout_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_client_assignments" DROP CONSTRAINT "staff_client_assignments_membership_id_memberships_id_fk";
--> statement-breakpoint
ALTER TABLE "client_flags" DROP CONSTRAINT "client_flags_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "client_notes" DROP CONSTRAINT "client_notes_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" DROP CONSTRAINT "client_entitlement_overrides_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" DROP CONSTRAINT "client_entitlement_overrides_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription_events" DROP CONSTRAINT "subscription_events_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_package_id_packages_id_fk";
--> statement-breakpoint
ALTER TABLE "program_versions" DROP CONSTRAINT "program_versions_program_id_programs_id_fk";
--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "meal_logs" DROP CONSTRAINT "meal_logs_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" DROP CONSTRAINT "nutrition_plan_versions_plan_id_nutrition_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "nutrition_plans" DROP CONSTRAINT "nutrition_plans_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "supplement_logs" DROP CONSTRAINT "supplement_logs_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT "form_submissions_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT "form_submissions_form_version_id_form_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "form_versions" DROP CONSTRAINT "form_versions_form_id_forms_id_fk";
--> statement-breakpoint
ALTER TABLE "forms" DROP CONSTRAINT "forms_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "inbody_records" DROP CONSTRAINT "inbody_records_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "measurement_sets" DROP CONSTRAINT "measurement_sets_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "metric_entries" DROP CONSTRAINT "metric_entries_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "progress_photo_sets" DROP CONSTRAINT "progress_photo_sets_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "set_logs" DROP CONSTRAINT "set_logs_session_id_workout_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP CONSTRAINT "workout_sessions_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk";
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_client_id_clients_id_fk";
--> statement-breakpoint
DROP INDEX "push_subscriptions_endpoint_uq";--> statement-breakpoint
DROP INDEX "meal_logs_client_uuid_uq";--> statement-breakpoint
DROP INDEX "supplement_logs_client_uuid_uq";--> statement-breakpoint
DROP INDEX "form_submissions_client_uuid_uq";--> statement-breakpoint
DROP INDEX "measurement_sets_client_uuid_uq";--> statement-breakpoint
DROP INDEX "metric_entries_client_uuid_uq";--> statement-breakpoint
DROP INDEX "progress_photo_sets_client_uuid_uq";--> statement-breakpoint
DROP INDEX "set_logs_client_uuid_uq";--> statement-breakpoint
DROP INDEX "workout_sessions_client_uuid_uq";--> statement-breakpoint
DROP INDEX "messages_client_uuid_uq";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "code" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "source_event_id" SET DATA TYPE bigint USING NULL::bigint;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "receipt_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "search_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "based_on_id" uuid;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "based_on_id" uuid;--> statement-breakpoint
ALTER TABLE "set_logs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "tenant_hidden_items" ADD CONSTRAINT "tenant_hidden_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tenant_id_uq" ON "messages" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_message_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_revisions_tenant_message_idx" ON "message_revisions" USING btree ("tenant_id","message_id","revised_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_tenant_id_uq" ON "clients" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_id_uq" ON "memberships" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ADD CONSTRAINT "sca_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_client_assignments" ADD CONSTRAINT "sca_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_flags" ADD CONSTRAINT "client_flags_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ADD CONSTRAINT "ceo_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_client_id_uq" ON "subscriptions" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "client_entitlement_overrides" ADD CONSTRAINT "ceo_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_tenant_client_id_uq" ON "media" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_media_fk" FOREIGN KEY ("tenant_id","client_id","proof_media_id") REFERENCES "public"."media"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_events" ADD CONSTRAINT "sub_events_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "packages_tenant_id_uq" ON "packages" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_fk" FOREIGN KEY ("tenant_id","package_id") REFERENCES "public"."packages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_tenant_id_uq" ON "media" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_thumbnail_fk" FOREIGN KEY ("tenant_id","thumbnail_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_based_on_fk" FOREIGN KEY ("based_on_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_tenant_id_uq" ON "programs" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_program_fk" FOREIGN KEY ("tenant_id","program_id") REFERENCES "public"."programs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."programs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_based_on_fk" FOREIGN KEY ("based_on_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_plan_versions_tenant_client_id_uq" ON "nutrition_plan_versions" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_plan_version_fk" FOREIGN KEY ("tenant_id","client_id","plan_version_id") REFERENCES "public"."nutrition_plan_versions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_plans_tenant_id_uq" ON "nutrition_plans" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ADD CONSTRAINT "nutrition_plan_versions_plan_fk" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."nutrition_plans"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."nutrition_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_plan_version_fk" FOREIGN KEY ("tenant_id","client_id","plan_version_id") REFERENCES "public"."nutrition_plan_versions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_tenant_id_uq" ON "form_versions" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_version_fk" FOREIGN KEY ("tenant_id","form_version_id") REFERENCES "public"."form_versions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_tenant_client_id_uq" ON "calendar_events" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_event_fk" FOREIGN KEY ("tenant_id","client_id","calendar_event_id") REFERENCES "public"."calendar_events"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forms_tenant_id_uq" ON "forms" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_fk" FOREIGN KEY ("tenant_id","form_id") REFERENCES "public"."forms"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."forms"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_subscription_fk" FOREIGN KEY ("tenant_id","client_id","subscription_id") REFERENCES "public"."subscriptions"("tenant_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_rescheduled_fk" FOREIGN KEY ("tenant_id","client_id","rescheduled_from") REFERENCES "public"."calendar_events"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbody_records" ADD CONSTRAINT "inbody_records_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbody_records" ADD CONSTRAINT "inbody_records_media_fk" FOREIGN KEY ("tenant_id","client_id","raw_media_id") REFERENCES "public"."media"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_sets" ADD CONSTRAINT "measurement_sets_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_tenant_client_id_uq" ON "metric_entries" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_correction_fk" FOREIGN KEY ("tenant_id","client_id","correction_of") REFERENCES "public"."metric_entries"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photo_sets" ADD CONSTRAINT "progress_photo_sets_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_tenant_client_id_uq" ON "workout_sessions" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_fk" FOREIGN KEY ("tenant_id","client_id","session_id") REFERENCES "public"."workout_sessions"("tenant_id","client_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_exercise_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_substituted_fk" FOREIGN KEY ("substituted_for") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_tenant_client_id_uq" ON "programs" USING btree ("tenant_id","client_id","id");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_fk" FOREIGN KEY ("tenant_id","client_id","program_id") REFERENCES "public"."programs"("tenant_id","client_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_tenant_client_program_id_uq" ON "program_versions" USING btree ("tenant_id","client_id","program_id","id");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_version_fk" FOREIGN KEY ("tenant_id","client_id","program_id","program_version_id") REFERENCES "public"."program_versions"("tenant_id","client_id","program_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_tenant_id_uq" ON "conversations" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tenant_conversation_id_uq" ON "messages" USING btree ("tenant_id","conversation_id","id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_fk" FOREIGN KEY ("tenant_id","conversation_id","reply_to_id") REFERENCES "public"."messages"("tenant_id","conversation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_tenant_id_uq" ON "notifications" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_fk" FOREIGN KEY ("tenant_id","notification_id") REFERENCES "public"."notifications"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_fk" FOREIGN KEY ("tenant_id","client_id") REFERENCES "public"."clients"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_fk" FOREIGN KEY ("tenant_id","assignee_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_tenant_client_idx" ON "invitations" USING btree ("tenant_id","client_id") WHERE "invitations"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "clients_tenant_search_idx" ON "clients" USING btree ("tenant_id","search_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tenant_receipt_uq" ON "payments" USING btree ("tenant_id","receipt_no");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_package_idx" ON "subscriptions" USING btree ("tenant_id","package_id");--> statement-breakpoint
CREATE INDEX "exercises_tenant_thumbnail_idx" ON "exercises" USING btree ("tenant_id","thumbnail_media_id") WHERE "exercises"."thumbnail_media_id" is not null;--> statement-breakpoint
CREATE INDEX "exercises_based_on_idx" ON "exercises" USING btree ("based_on_id") WHERE "exercises"."based_on_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_id_program_uq" ON "program_versions" USING btree ("id","program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_versions_one_published_uq" ON "program_versions" USING btree ("program_id") WHERE "program_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "programs_tenant_template_idx" ON "programs" USING btree ("tenant_id","template_id") WHERE "programs"."template_id" is not null;--> statement-breakpoint
CREATE INDEX "foods_based_on_idx" ON "foods" USING btree ("based_on_id") WHERE "foods"."based_on_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_plan_versions_id_plan_uq" ON "nutrition_plan_versions" USING btree ("id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nutrition_plan_versions_one_published_uq" ON "nutrition_plan_versions" USING btree ("plan_id") WHERE "nutrition_plan_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "nutrition_plans_tenant_template_idx" ON "nutrition_plans" USING btree ("tenant_id","template_id") WHERE "nutrition_plans"."template_id" is not null;--> statement-breakpoint
CREATE INDEX "form_submissions_tenant_version_idx" ON "form_submissions" USING btree ("tenant_id","form_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_id_form_uq" ON "form_versions" USING btree ("id","form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_one_published_uq" ON "form_versions" USING btree ("form_id") WHERE "form_versions"."status" = 'published';--> statement-breakpoint
CREATE INDEX "forms_tenant_client_idx" ON "forms" USING btree ("tenant_id","client_id") WHERE "forms"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "forms_tenant_template_idx" ON "forms" USING btree ("tenant_id","template_id") WHERE "forms"."template_id" is not null;--> statement-breakpoint
CREATE INDEX "set_logs_exercise_idx" ON "set_logs" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "set_logs_substituted_idx" ON "set_logs" USING btree ("substituted_for") WHERE "set_logs"."substituted_for" is not null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_tenant_user_idx" ON "notification_deliveries" USING btree ("tenant_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_tenant_client_idx" ON "notifications" USING btree ("tenant_id","client_id") WHERE "notifications"."client_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_tenant_endpoint_uq" ON "push_subscriptions" USING btree ("tenant_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_tenant_user_idx" ON "push_subscriptions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_requests_tenant_client_idx" ON "ai_requests" USING btree ("tenant_id","client_id") WHERE "ai_requests"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_client_created_idx" ON "audit_log" USING btree ("tenant_id","client_id","created_at" DESC NULLS LAST) WHERE "audit_log"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "tasks_tenant_assignee_idx" ON "tasks" USING btree ("tenant_id","assignee_membership_id") WHERE "tasks"."assignee_membership_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_logs_client_uuid_uq" ON "meal_logs" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "supplement_logs_client_uuid_uq" ON "supplement_logs" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_client_uuid_uq" ON "form_submissions" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "measurement_sets_client_uuid_uq" ON "measurement_sets" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_client_uuid_uq" ON "metric_entries" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_photo_sets_client_uuid_uq" ON "progress_photo_sets" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_client_uuid_uq" ON "set_logs" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_client_uuid_uq" ON "workout_sessions" USING btree ("tenant_id","client_id","client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_uuid_uq" ON "messages" USING btree ("tenant_id","sender_user_id","client_uuid");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_client_ck" CHECK (("invitations"."role" = 'client') = ("invitations"."client_id" is not null));--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_client_ck" CHECK (("memberships"."role" = 'client') = ("memberships"."client_id" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount" >= 0 and "payments"."amount" < 'Infinity'::numeric and ("payments"."refund_amount" is null or ("payments"."refund_amount" >= 0 and "payments"."refund_amount" <= "payments"."amount")));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_state_ck" CHECK (("payments"."state" = 'refunded') = ("payments"."refund_amount" is not null and "payments"."refund_amount" = "payments"."amount") and ("payments"."refund_amount" is null or "payments"."state" in ('verified', 'refunded')));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_reason_ck" CHECK ("payments"."rejected_reason" is null or "payments"."state" = 'rejected');--> statement-breakpoint
ALTER TABLE "program_versions" ADD CONSTRAINT "program_versions_published_at_ck" CHECK ("program_versions"."status" not in ('published', 'superseded') or "program_versions"."published_at" is not null);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_kind_client_ck" CHECK (("programs"."kind" = 'template') = ("programs"."client_id" is null));--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_client_sub_ck" CHECK ("programs"."client_id" is not null or "programs"."subscription_id" is null);--> statement-breakpoint
ALTER TABLE "nutrition_plan_versions" ADD CONSTRAINT "nutrition_plan_versions_published_at_ck" CHECK ("nutrition_plan_versions"."status" not in ('published', 'superseded') or "nutrition_plan_versions"."published_at" is not null);--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_kind_client_ck" CHECK (("nutrition_plans"."kind" = 'template') = ("nutrition_plans"."client_id" is null));--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_client_sub_ck" CHECK ("nutrition_plans"."client_id" is not null or "nutrition_plans"."subscription_id" is null);--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_at_ck" CHECK ("form_versions"."status" not in ('published', 'superseded') or "form_versions"."published_at" is not null);--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_kind_client_ck" CHECK (("forms"."kind" = 'template') = ("forms"."client_id" is null));--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_rule_ck" CHECK ("calendar_events"."source" <> 'package_rule' or ("calendar_events"."rule_key" is not null and "calendar_events"."subscription_id" is not null));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_program_pair_ck" CHECK ("workout_sessions"."program_version_id" is null or "workout_sessions"."program_id" is not null);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_client_ck" CHECK (("conversations"."kind" = 'internal') = ("conversations"."client_id" is null));--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_ck" CHECK ("push_subscriptions"."endpoint" ~ '^https://');--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_path_ck" CHECK ("media"."bucket" in ('client-media', 'tenant-assets')
        and ("media"."client_id" is null) = ("media"."bucket" = 'tenant-assets')
        and "media"."path" ~ '^[A-Za-z0-9._/-]+$'
        and "media"."path" !~ '(^|/)[.]{1,2}(/|$)'
        and "media"."path" !~ '//'
        and "media"."path" !~ '/$'
        and (("media"."client_id" is null and starts_with("media"."path", "media"."tenant_id"::text || '/assets/'))
          or ("media"."client_id" is not null and starts_with("media"."path", "media"."tenant_id"::text || '/clients/' || "media"."client_id"::text || '/'))));--> statement-breakpoint
DROP POLICY "business_settings_member_select" ON "business_settings" CASCADE;--> statement-breakpoint
DROP POLICY "business_settings_owner_all" ON "business_settings" CASCADE;--> statement-breakpoint
DROP POLICY "consents_owner_all" ON "consents" CASCADE;--> statement-breakpoint
DROP POLICY "consents_staff_select" ON "consents" CASCADE;--> statement-breakpoint
DROP POLICY "invitations_staff_all" ON "invitations" CASCADE;--> statement-breakpoint
DROP POLICY "memberships_self_select" ON "memberships" CASCADE;--> statement-breakpoint
DROP POLICY "memberships_staff_select" ON "memberships" CASCADE;--> statement-breakpoint
DROP POLICY "memberships_owner_all" ON "memberships" CASCADE;--> statement-breakpoint
DROP POLICY "staff_client_assignments_staff_select" ON "staff_client_assignments" CASCADE;--> statement-breakpoint
DROP POLICY "staff_client_assignments_owner_all" ON "staff_client_assignments" CASCADE;--> statement-breakpoint
DROP POLICY "tenants_member_select" ON "tenants" CASCADE;--> statement-breakpoint
DROP POLICY "tenants_owner_update" ON "tenants" CASCADE;--> statement-breakpoint
DROP POLICY "user_preferences_owner_all" ON "user_preferences" CASCADE;--> statement-breakpoint
DROP POLICY "client_flags_coach_all" ON "client_flags" CASCADE;--> statement-breakpoint
DROP POLICY "client_notes_coach_all" ON "client_notes" CASCADE;--> statement-breakpoint
DROP POLICY "clients_access_select" ON "clients" CASCADE;--> statement-breakpoint
DROP POLICY "clients_staff_all" ON "clients" CASCADE;--> statement-breakpoint
DROP POLICY "client_entitlement_overrides_access_select" ON "client_entitlement_overrides" CASCADE;--> statement-breakpoint
DROP POLICY "client_entitlement_overrides_staff_all" ON "client_entitlement_overrides" CASCADE;--> statement-breakpoint
DROP POLICY "packages_member_select" ON "packages" CASCADE;--> statement-breakpoint
DROP POLICY "packages_staff_all" ON "packages" CASCADE;--> statement-breakpoint
DROP POLICY "payments_access_select" ON "payments" CASCADE;--> statement-breakpoint
DROP POLICY "payments_staff_all" ON "payments" CASCADE;--> statement-breakpoint
DROP POLICY "payments_client_insert" ON "payments" CASCADE;--> statement-breakpoint
DROP POLICY "payments_client_update" ON "payments" CASCADE;--> statement-breakpoint
DROP POLICY "subscription_events_access_select" ON "subscription_events" CASCADE;--> statement-breakpoint
DROP POLICY "subscription_events_staff_all" ON "subscription_events" CASCADE;--> statement-breakpoint
DROP POLICY "subscriptions_access_select" ON "subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "subscriptions_staff_all" ON "subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "exercises_system_select" ON "exercises" CASCADE;--> statement-breakpoint
DROP POLICY "exercises_member_select" ON "exercises" CASCADE;--> statement-breakpoint
DROP POLICY "exercises_staff_all" ON "exercises" CASCADE;--> statement-breakpoint
DROP POLICY "program_versions_staff_templates" ON "program_versions" CASCADE;--> statement-breakpoint
DROP POLICY "program_versions_client_access_select" ON "program_versions" CASCADE;--> statement-breakpoint
DROP POLICY "program_versions_client_staff_all" ON "program_versions" CASCADE;--> statement-breakpoint
DROP POLICY "programs_staff_templates" ON "programs" CASCADE;--> statement-breakpoint
DROP POLICY "programs_client_access_select" ON "programs" CASCADE;--> statement-breakpoint
DROP POLICY "programs_client_staff_all" ON "programs" CASCADE;--> statement-breakpoint
DROP POLICY "foods_system_select" ON "foods" CASCADE;--> statement-breakpoint
DROP POLICY "foods_member_select" ON "foods" CASCADE;--> statement-breakpoint
DROP POLICY "foods_staff_all" ON "foods" CASCADE;--> statement-breakpoint
DROP POLICY "meal_logs_access_select" ON "meal_logs" CASCADE;--> statement-breakpoint
DROP POLICY "meal_logs_staff_all" ON "meal_logs" CASCADE;--> statement-breakpoint
DROP POLICY "meal_logs_client_insert" ON "meal_logs" CASCADE;--> statement-breakpoint
DROP POLICY "meal_logs_client_update" ON "meal_logs" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plan_versions_staff_templates" ON "nutrition_plan_versions" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plan_versions_client_access_select" ON "nutrition_plan_versions" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plan_versions_client_staff_all" ON "nutrition_plan_versions" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plans_staff_templates" ON "nutrition_plans" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plans_client_access_select" ON "nutrition_plans" CASCADE;--> statement-breakpoint
DROP POLICY "nutrition_plans_client_staff_all" ON "nutrition_plans" CASCADE;--> statement-breakpoint
DROP POLICY "supplement_logs_access_select" ON "supplement_logs" CASCADE;--> statement-breakpoint
DROP POLICY "supplement_logs_staff_all" ON "supplement_logs" CASCADE;--> statement-breakpoint
DROP POLICY "supplement_logs_client_insert" ON "supplement_logs" CASCADE;--> statement-breakpoint
DROP POLICY "supplement_logs_client_update" ON "supplement_logs" CASCADE;--> statement-breakpoint
DROP POLICY "form_submissions_access_select" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "form_submissions_staff_all" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "form_submissions_client_insert" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "form_submissions_client_update" ON "form_submissions" CASCADE;--> statement-breakpoint
DROP POLICY "form_versions_staff_templates" ON "form_versions" CASCADE;--> statement-breakpoint
DROP POLICY "form_versions_client_access_select" ON "form_versions" CASCADE;--> statement-breakpoint
DROP POLICY "form_versions_client_staff_all" ON "form_versions" CASCADE;--> statement-breakpoint
DROP POLICY "forms_staff_templates" ON "forms" CASCADE;--> statement-breakpoint
DROP POLICY "forms_client_access_select" ON "forms" CASCADE;--> statement-breakpoint
DROP POLICY "forms_client_staff_all" ON "forms" CASCADE;--> statement-breakpoint
DROP POLICY "calendar_events_access_select" ON "calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "calendar_events_staff_all" ON "calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "calendar_events_client_insert" ON "calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "calendar_events_client_update" ON "calendar_events" CASCADE;--> statement-breakpoint
DROP POLICY "inbody_records_access_select" ON "inbody_records" CASCADE;--> statement-breakpoint
DROP POLICY "inbody_records_staff_all" ON "inbody_records" CASCADE;--> statement-breakpoint
DROP POLICY "inbody_records_client_insert" ON "inbody_records" CASCADE;--> statement-breakpoint
DROP POLICY "inbody_records_client_update" ON "inbody_records" CASCADE;--> statement-breakpoint
DROP POLICY "measurement_sets_access_select" ON "measurement_sets" CASCADE;--> statement-breakpoint
DROP POLICY "measurement_sets_staff_all" ON "measurement_sets" CASCADE;--> statement-breakpoint
DROP POLICY "measurement_sets_client_insert" ON "measurement_sets" CASCADE;--> statement-breakpoint
DROP POLICY "measurement_sets_client_update" ON "measurement_sets" CASCADE;--> statement-breakpoint
DROP POLICY "metric_entries_access_select" ON "metric_entries" CASCADE;--> statement-breakpoint
DROP POLICY "metric_entries_staff_all" ON "metric_entries" CASCADE;--> statement-breakpoint
DROP POLICY "metric_entries_client_insert" ON "metric_entries" CASCADE;--> statement-breakpoint
DROP POLICY "metric_entries_client_update" ON "metric_entries" CASCADE;--> statement-breakpoint
DROP POLICY "progress_photo_sets_access_select" ON "progress_photo_sets" CASCADE;--> statement-breakpoint
DROP POLICY "progress_photo_sets_staff_all" ON "progress_photo_sets" CASCADE;--> statement-breakpoint
DROP POLICY "progress_photo_sets_client_insert" ON "progress_photo_sets" CASCADE;--> statement-breakpoint
DROP POLICY "progress_photo_sets_client_update" ON "progress_photo_sets" CASCADE;--> statement-breakpoint
DROP POLICY "set_logs_access_select" ON "set_logs" CASCADE;--> statement-breakpoint
DROP POLICY "set_logs_staff_all" ON "set_logs" CASCADE;--> statement-breakpoint
DROP POLICY "set_logs_client_insert" ON "set_logs" CASCADE;--> statement-breakpoint
DROP POLICY "set_logs_client_update" ON "set_logs" CASCADE;--> statement-breakpoint
DROP POLICY "workout_sessions_access_select" ON "workout_sessions" CASCADE;--> statement-breakpoint
DROP POLICY "workout_sessions_staff_all" ON "workout_sessions" CASCADE;--> statement-breakpoint
DROP POLICY "workout_sessions_client_insert" ON "workout_sessions" CASCADE;--> statement-breakpoint
DROP POLICY "workout_sessions_client_update" ON "workout_sessions" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_access_select" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_staff_all" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_client_insert" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_client_update" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "conversations_internal_coach_all" ON "conversations" CASCADE;--> statement-breakpoint
DROP POLICY "messages_access_select" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "messages_staff_all" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "messages_client_insert" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "messages_client_update" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "messages_internal_coach_all" ON "messages" CASCADE;--> statement-breakpoint
DROP POLICY "notification_deliveries_owner_select" ON "notification_deliveries" CASCADE;--> statement-breakpoint
DROP POLICY "notifications_owner_all" ON "notifications" CASCADE;--> statement-breakpoint
DROP POLICY "push_subscriptions_owner_all" ON "push_subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "ai_requests_coach_all" ON "ai_requests" CASCADE;--> statement-breakpoint
DROP POLICY "audit_log_staff_select" ON "audit_log" CASCADE;--> statement-breakpoint
DROP POLICY "audit_log_member_insert" ON "audit_log" CASCADE;--> statement-breakpoint
DROP POLICY "events_member_insert" ON "events" CASCADE;--> statement-breakpoint
DROP POLICY "events_staff_select" ON "events" CASCADE;--> statement-breakpoint
DROP POLICY "idempotency_keys_owner_all" ON "idempotency_keys" CASCADE;--> statement-breakpoint
DROP POLICY "job_runs_staff_select" ON "job_runs" CASCADE;--> statement-breakpoint
DROP POLICY "media_tenant_select" ON "media" CASCADE;--> statement-breakpoint
DROP POLICY "media_tenant_staff_all" ON "media" CASCADE;--> statement-breakpoint
DROP POLICY "media_client_select" ON "media" CASCADE;--> statement-breakpoint
DROP POLICY "media_client_owner_insert" ON "media" CASCADE;--> statement-breakpoint
DROP POLICY "media_client_staff_all" ON "media" CASCADE;--> statement-breakpoint
DROP POLICY "tasks_coach_all" ON "tasks" CASCADE;
--> statement-breakpoint

-- doc §8.2 / §11.2 H3: deleting a current version clears only the head's pointer.
ALTER TABLE "programs" ADD CONSTRAINT "programs_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."program_versions"("id","program_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."nutrition_plan_versions"("id","plan_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."form_versions"("id","form_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
