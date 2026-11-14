/** doc §6.1: independently entered guard configuration vocabulary, never migration-derived. */
export type GuardConfig = {
  immutable?: readonly string[]; set_once?: readonly string[]; monotonic?: readonly string[];
  update_allow?: readonly string[]; client_update?: readonly string[]; staff_update?: readonly string[];
  insert_eq?: Readonly<Record<string, unknown>>; client_insert_eq?: Readonly<Record<string, unknown>>;
  stamp_insert?: Readonly<Record<string, string>>; stamp_update?: Readonly<Record<string, string>>;
  update_to?: Readonly<Record<string, unknown>>;
  require_perm?: Readonly<Record<string, readonly string[]>>;
  perm_transitions?: Readonly<Record<string, readonly string[]>>;
  editable_in?: readonly { column: string; states: readonly (string | null)[]; cols: readonly string[] }[];
  transitions?: { column: string; insert?: readonly (string | null)[]; edges: readonly (readonly [string | null, string | null])[] };
  client_transitions?: { column: string; insert?: readonly (string | null)[]; edges: readonly (readonly [string | null, string | null])[] };
  on_transition?: { column: string; stamps: Readonly<Record<string, Readonly<Record<string, string>>>> };
  on_set?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  on_clear?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  delete_when?: { column: string; states: readonly (string | null)[] };
};

const publish = (head: string, module: string): GuardConfig => ({
  stamp_insert: { created_by: 'uid' }, insert_eq: { published_at: null, published_by: null, superseded_at: null },
  immutable: ['id', 'tenant_id', 'client_id', head, 'version_no', 'created_by', 'created_at', 'published_at', 'published_by', 'superseded_at'],
  editable_in: [{ column: 'status', states: ['draft'], cols: ['document', 'change_note'] }],
  transitions: { column: 'status', insert: ['draft', 'published'], edges: [['draft','in_review'],['in_review','approved'],['in_review','draft'],['approved','published'],['draft','published'],['published','superseded'],['draft','archived'],['in_review','archived'],['approved','archived'],['published','archived'],['superseded','archived']] },
  perm_transitions: { published: [module, 'publish'] },
  on_transition: { column: 'status', stamps: { published: { published_at: 'now', published_by: 'uid' }, superseded: { superseded_at: 'now' } } },
  delete_when: { column: 'status', states: ['draft'] },
});
const head = (form = false): GuardConfig => ({ stamp_insert: { created_by: 'uid' }, insert_eq: { published_version_id: null }, immutable: ['id','tenant_id','kind', ...(form ? ['form_kind'] : []), 'client_id','template_id','created_by','created_at','published_version_id'], stamp_update: { updated_at: 'now' } });
const library: GuardConfig = { stamp_insert: { created_by: 'uid' }, immutable: ['id','tenant_id','created_by','created_at'], stamp_update: { updated_at: 'now' } };

/** doc §6.3/G20–G22 and 0008 D/E: all forty-two guard goldens, handwritten from the contract. */
export const GUARDS: Readonly<Record<string, GuardConfig>> = {
  tenants: { immutable: ['id','client_counter','receipt_counter','created_at'], stamp_update: { updated_at: 'now' } },
  memberships: { immutable: ['id','tenant_id','user_id','client_id','created_at'], stamp_update: { updated_at: 'now' }, client_update: ['display_name','phone','locale','last_seen_at'], staff_update: ['display_name','phone','locale','last_seen_at'] },
  staff_client_assignments: { stamp_insert: { assigned_by: 'uid' } },
  invitations: { stamp_insert: { invited_by: 'uid' }, insert_eq: { status: 'pending', accepted_at: null, accepted_user_id: null }, immutable: ['id','tenant_id','token_hash','role','client_id','invited_by','accepted_at','accepted_user_id','created_at'], staff_update: ['status'], transitions: { column: 'status', insert: ['pending'], edges: [['pending','revoked'],['pending','expired']] } },
  business_settings: { stamp_insert: { updated_by: 'uid' }, immutable: ['tenant_id'], stamp_update: { updated_by: 'uid', updated_at: 'now' } },
  user_preferences: { immutable: ['tenant_id','user_id'], update_allow: ['preferences'], stamp_update: { updated_at: 'now' } },
  consents: { stamp_insert: { accepted_at: 'now' }, insert_eq: { withdrawn_at: null }, update_allow: ['withdrawn_at'], set_once: ['withdrawn_at'], on_set: { withdrawn_at: { withdrawn_at: 'now' } } },
  clients: { stamp_insert: { created_by: 'uid' }, insert_eq: { code: '', membership_id: null }, immutable: ['id','tenant_id','code','membership_id','created_by','created_at'], stamp_update: { updated_at: 'now' }, client_update: ['first_name','last_name','display_name','email','phone','whatsapp','birth_date','locale','timezone','profile','search_key'] },
  client_notes: { stamp_insert: { author_user_id: 'uid' }, immutable: ['id','tenant_id','client_id','author_user_id','created_at'], stamp_update: { updated_at: 'now' } },
  client_flags: { stamp_insert: { raised_at: 'now' }, insert_eq: { resolved_by: null }, immutable: ['id','tenant_id','client_id','raised_at','resolved_by'], on_set: { resolved_at: { resolved_at: 'now', resolved_by: 'uid' } }, on_clear: { resolved_at: { resolved_by: 'null' } } },
  tasks: { stamp_insert: { created_by: 'uid' }, insert_eq: { completed_at: null, completed_by: null, source: 'manual', source_event_id: null, dedupe_key: null }, immutable: ['id','tenant_id','client_id','created_by','created_at','completed_at','completed_by','source','source_event_id','dedupe_key'], stamp_update: { updated_at: 'now' }, transitions: { column: 'state', insert: ['open'], edges: [['open','snoozed'],['snoozed','open'],['open','done'],['snoozed','done'],['open','cancelled'],['snoozed','cancelled'],['done','open'],['cancelled','open']] }, on_transition: { column: 'state', stamps: { done: { completed_at: 'now', completed_by: 'uid' }, open: { completed_at: 'null', completed_by: 'null' }, snoozed: { completed_at: 'null', completed_by: 'null' }, cancelled: { completed_at: 'null', completed_by: 'null' } } } },
  ai_requests: { stamp_insert: { created_by: 'uid' }, insert_eq: { approved_by: null, approved_at: null }, immutable: ['id','tenant_id','client_id','kind','input','created_by','created_at','approved_by','approved_at'], editable_in: [{ column: 'state', states: ['draft'], cols: ['output','model'] }], transitions: { column: 'state', insert: ['draft'], edges: [['draft','approved'],['draft','rejected']] }, perm_transitions: { approved: ['ai','publish'] }, on_transition: { column: 'state', stamps: { approved: { approved_at: 'now', approved_by: 'uid' } } } },
  // 0008: D/E add private review guards; direct approval and staleness have no transition edge.
  ai_drafts: { stamp_insert: { created_by: 'uid' }, insert_eq: { status: 'draft', approved_by: null, approved_at: null }, immutable: ['id','tenant_id','client_id','kind','input_hash','input_version','provider','created_by','created_at','approved_by','approved_at'], stamp_update: { updated_at: 'now' }, transitions: { column: 'status', insert: ['draft'], edges: [['draft','rejected']] }, editable_in: [{ column: 'status', states: ['draft'], cols: ['body'] }] },
  red_flags: { immutable: ['id','tenant_id','client_id','source','source_id','category','matched','created_at','handled_by','handled_at'], transitions: { column: 'status', insert: ['open'], edges: [['open','handled']] }, on_transition: { column: 'status', stamps: { handled: { handled_by: 'uid', handled_at: 'now' } } } },
  packages: { ...library, require_perm: { insert: ['packages','create'], update: ['packages','edit'], delete: ['packages','delete'] } },
  subscriptions: { stamp_insert: { created_by: 'uid' }, immutable: ['id','tenant_id','client_id','package_id','package_snapshot','price','currency','created_by','created_at'], stamp_update: { updated_at: 'now' }, require_perm: { insert: ['billing','create'], update: ['billing','edit'] }, transitions: { column: 'state', insert: ['pending','active'], edges: [['pending','active'],['active','grace'],['active','expired'],['grace','expired'],['active','paused'],['paused','active'],['active','cancelled'],['grace','cancelled'],['paused','cancelled'],['pending','cancelled'],['suspended','cancelled'],['pending','suspended'],['active','suspended'],['grace','suspended'],['paused','suspended'],['expired','suspended'],['suspended','active'],['expired','active'],['grace','active']] } },
  subscription_events: { stamp_insert: { actor_user_id: 'uid' }, require_perm: { insert: ['billing','edit'] } },
  client_entitlement_overrides: { stamp_insert: { created_by: 'uid' }, insert_eq: { revoked_at: null }, update_allow: ['revoked_at'], set_once: ['revoked_at'], on_set: { revoked_at: { revoked_at: 'now' } }, require_perm: { insert: ['billing','edit'], update: ['billing','edit'] } },
  payments: { stamp_insert: { created_by: 'uid' }, insert_eq: { verified_at: null, verified_by: null, receipt_no: null, refunded_at: null, refund_amount: null, rejected_reason: null }, client_insert_eq: { state: 'pending', notes: null, provider: null, provider_ref: null }, immutable: ['id','tenant_id','client_id','created_by','created_at','verified_at','verified_by','receipt_no','refunded_at','provider','provider_ref'], set_once: ['subscription_id'], monotonic: ['refund_amount'], stamp_update: { updated_at: 'now' }, client_update: ['proof_media_id','reference','paid_at'], editable_in: [{ column: 'state', states: ['pending'], cols: ['amount','currency','method','proof_media_id','reference','paid_at'] }, { column: 'state', states: ['verified'], cols: ['refund_amount'] }, { column: 'state', states: ['pending'], cols: ['rejected_reason'] }], transitions: { column: 'state', insert: ['pending','verified'], edges: [['pending','verified'],['pending','rejected'],['verified','refunded']] }, perm_transitions: { verified: ['billing','verify'], rejected: ['billing','verify'], refunded: ['billing','verify'] }, require_perm: { insert: ['billing','create'], update: ['billing','edit'] }, on_transition: { column: 'state', stamps: { verified: { verified_at: 'now', verified_by: 'uid' } } }, on_set: { refund_amount: { refunded_at: 'now' } } },
  exercises: library, foods: library, tenant_hidden_items: { stamp_insert: { hidden_by: 'uid' } },
  programs: head(), nutrition_plans: head(), forms: head(true),
  program_versions: publish('program_id','programs'), nutrition_plan_versions: publish('plan_id','nutrition'), form_versions: publish('form_id','forms'),
  metric_entries: { client_insert_eq: { source: 'manual' } },
  measurement_sets: { client_insert_eq: { taken_by: 'client' }, immutable: ['id','tenant_id','client_id','client_uuid','taken_by','created_at'], monotonic: ['client_updated_at'], client_update: ['local_date','values','note','client_updated_at'] },
  progress_photo_sets: { immutable: ['id','tenant_id','client_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: ['local_date','poses','weight_kg','note','client_updated_at'] },
  inbody_records: { stamp_insert: { created_by: 'uid' }, client_insert_eq: { source: 'manual' }, immutable: ['id','tenant_id','client_id','created_by','created_at','normalized'], client_update: ['local_date','raw_media_id','fields','note'], insert_eq: { normalized: {} } },
  workout_sessions: { immutable: ['id','tenant_id','client_id','program_id','program_version_id','phase_id','week_id','day_id','workout_id','planned_workout','client_uuid','created_at','summary'], monotonic: ['client_updated_at'], stamp_update: { updated_at: 'now' }, client_update: ['state','local_date','timezone','started_at','ended_at','active_seconds','rpe_overall','mood','pain_note','client_note','client_updated_at'], insert_eq: { summary: null } },
  set_logs: { immutable: ['id','tenant_id','client_id','session_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: ['exercise_id','block_id','item_id','set_no','tag','reps','load','load_unit','duration_sec','distance_m','rpe','rir','rest_sec','completed','skipped','substituted_for','pain_flag','note','client_updated_at','deleted_at'] },
  meal_logs: { immutable: ['id','tenant_id','client_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: ['plan_version_id','local_date','meal_id','option_id','free_entry','status','note','client_updated_at','recorded_at'] },
  supplement_logs: { immutable: ['id','tenant_id','client_id','client_uuid'], monotonic: ['client_updated_at'], client_update: ['plan_version_id','supplement_id','local_date','taken','client_updated_at','recorded_at'] },
  form_submissions: { insert_eq: { reviewed_at: null, reviewed_by: null, submitted_at: null }, client_insert_eq: { coach_feedback: null, results: null }, immutable: ['id','tenant_id','client_id','form_id','form_version_id','form_kind','calendar_event_id','subscription_id','client_uuid','created_at','submitted_at','reviewed_at','reviewed_by'], monotonic: ['client_updated_at'], stamp_update: { updated_at: 'now' }, client_update: ['answers','missing_required','state','client_updated_at'], editable_in: [{ column: 'state', states: ['scheduled','due','overdue'], cols: ['answers','missing_required'] }], transitions: { column: 'state', insert: ['scheduled','due','submitted'], edges: [['scheduled','due'],['due','overdue'],['due','submitted'],['overdue','submitted'],['submitted','waiting_for_coach'],['submitted','reviewed'],['waiting_for_coach','reviewed'],['scheduled','skipped'],['due','skipped'],['overdue','skipped'],['scheduled','rescheduled'],['due','rescheduled'],['overdue','rescheduled'],['scheduled','cancelled'],['due','cancelled'],['overdue','cancelled']] }, client_transitions: { column: 'state', insert: ['due','submitted'], edges: [['due','submitted'],['overdue','submitted']] }, on_transition: { column: 'state', stamps: { submitted: { submitted_at: 'now' }, reviewed: { reviewed_at: 'now', reviewed_by: 'uid' } } } },
  // 0008: B recreates calendar_events_50_guard with cancelled_by equality, immutability and stamps.
  calendar_events: { stamp_insert: { created_by: 'uid' }, insert_eq: { completed_at: null, skipped_at: null, cancelled_at: null, cancelled_by: null, source: 'manual', rule_key: null }, immutable: ['id','tenant_id','client_id','subscription_id','source','rule_key','created_by','created_at','completed_at','skipped_at','cancelled_at','cancelled_by'], stamp_update: { updated_at: 'now' }, client_update: ['state'], client_transitions: { column: 'state', edges: [['scheduled','completed'],['due','completed'],['overdue','completed'],['scheduled','skipped'],['due','skipped'],['overdue','skipped']] }, on_transition: { column: 'state', stamps: { scheduled: { completed_at: 'null', skipped_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, due: { completed_at: 'null', skipped_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, overdue: { completed_at: 'null', skipped_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, rescheduled: { completed_at: 'null', skipped_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, completed: { completed_at: 'now', skipped_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, skipped: { skipped_at: 'now', completed_at: 'null', cancelled_at: 'null', cancelled_by: 'null' }, cancelled: { cancelled_at: 'now', completed_at: 'null', skipped_at: 'null', cancelled_by: 'uid' } } } },
  conversations: { immutable: ['id','tenant_id','kind','client_id','created_at','last_message_at','last_message_preview'], insert_eq: { last_message_at: null, last_message_preview: null, unread_for_coach: 0, unread_for_client: 0 }, client_insert_eq: { kind: 'client', subject: null, archived_at: null }, update_to: { unread_for_client: 0, unread_for_coach: 0 }, client_update: ['unread_for_client'], staff_update: ['subject','archived_at','unread_for_coach'] },
  notifications: { update_allow: ['read_at'] },
  push_subscriptions: { immutable: ['id','tenant_id','user_id','endpoint','created_at','last_used_at','failed_at'], update_allow: ['keys','user_agent'], insert_eq: { last_used_at: null, failed_at: null } },
  media: { stamp_insert: { owner_user_id: 'uid' }, insert_eq: { reviewed_by: null, reviewed_at: null }, client_insert_eq: { review_note: null }, immutable: ['id','tenant_id','client_id','owner_user_id','bucket','path','kind','purpose','created_at','reviewed_by','reviewed_at'], set_once: ['deleted_at'], client_update: ['mime_type','uploaded_at','bytes','width','height','duration_sec','metadata','deleted_at','review_state'], editable_in: [{ column: 'review_state', states: ['requested','needs_resubmission'], cols: ['mime_type'] }, { column: 'review_state', states: [null,'requested','uploaded','processing','queued_for_review','needs_resubmission','archived'], cols: ['bytes','width','height','duration_sec','metadata','uploaded_at','deleted_at'] }], transitions: { column: 'review_state', insert: [null,'requested','uploaded'], edges: [[null,'uploaded'],['requested','uploaded'],['uploaded','processing'],['uploaded','queued_for_review'],['processing','queued_for_review'],['queued_for_review','approved'],['queued_for_review','needs_resubmission'],['queued_for_review','rejected'],['needs_resubmission','uploaded'],['approved','archived'],['rejected','archived'],['needs_resubmission','archived']] }, client_transitions: { column: 'review_state', insert: [null,'requested','uploaded'], edges: [[null,'uploaded'],['requested','uploaded'],['uploaded','processing'],['uploaded','queued_for_review'],['processing','queued_for_review'],['needs_resubmission','uploaded']] }, on_transition: { column: 'review_state', stamps: { approved: { reviewed_at: 'now', reviewed_by: 'uid' }, needs_resubmission: { reviewed_at: 'now', reviewed_by: 'uid' }, rejected: { reviewed_at: 'now', reviewed_by: 'uid' } } } },
};

/** doc §13.4 G20: physical columns typed independently; u UUID, t time, d date, j JSON, a text[], n numeric, b boolean, s text/enum. */
export const GUARD_COLUMNS: Readonly<Record<string,string>> = {
  tenants:'id:u name:s slug:s client_code_prefix:s client_counter:n receipt_counter:n default_locale:s timezone:s currency:s created_at:t updated_at:t archived_at:t',
  memberships:'id:u tenant_id:u user_id:u role:s status:s client_id:u permissions:j display_name:s email:s phone:s locale:s last_seen_at:t created_at:t updated_at:t disabled_at:t',
  staff_client_assignments:'tenant_id:u membership_id:u client_id:u assigned_by:u created_at:t',
  invitations:'id:u tenant_id:u token_hash:s role:s client_id:u display_name:s email:s phone:s permissions:j status:s invited_by:u expires_at:t accepted_at:t accepted_user_id:u created_at:t',
  // 0008: C adds client_modules jsonb.
  business_settings:'tenant_id:u settings:j updated_at:t updated_by:u client_modules:j',
  user_preferences:'tenant_id:u user_id:u preferences:j updated_at:t',
  consents:'id:u tenant_id:u user_id:u kind:s version:s locale:s accepted:b accepted_at:t withdrawn_at:t ip_hash:s user_agent:s',
  // 0008: A adds archived_by uuid.
  clients:'id:u tenant_id:u code:s search_key:s membership_id:u first_name:s last_name:s display_name:s email:s phone:s whatsapp:s birth_date:d locale:s timezone:s status:s tags:a profile:j source:s started_on:d created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  client_notes:'id:u tenant_id:u client_id:u body:s pinned_at:t author_user_id:u created_at:t updated_at:t',
  client_flags:'id:u tenant_id:u client_id:u kind:s severity:s detail:j raised_at:t resolved_at:t resolved_by:u',
  tasks:'id:u tenant_id:u client_id:u title:s detail:s priority:s state:s due_at:t snoozed_until:t assignee_membership_id:u source:s source_event_id:n dedupe_key:s link:s completed_at:t completed_by:u created_by:u created_at:t updated_at:t',
  ai_requests:'id:u tenant_id:u client_id:u kind:s input:j output:j model:s state:s approved_by:u approved_at:t created_by:u created_at:t',
  // 0008: D/E create ai_drafts and red_flags with these physical columns.
  ai_drafts:'id:u tenant_id:u client_id:u kind:s input_hash:s input_version:s body:j provider:s status:s approved_by:u approved_at:t created_by:u created_at:t updated_at:t',
  red_flags:'id:u tenant_id:u client_id:u source:s source_id:u category:s matched:s status:s handled_by:u handled_at:t created_at:t',
  // 0008: A adds archived_by uuid.
  packages:'id:u tenant_id:u name:j description:j duration_days:n price:n currency:s entitlements:j schedule_rules:j grace_days:n is_public:b sort_order:n created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  subscriptions:'id:u tenant_id:u client_id:u package_id:u package_snapshot:j state:s starts_on:d ends_on:d grace_ends_on:d timezone:s paused_at:t frozen_days:n price:n currency:s notes:s created_by:u created_at:t updated_at:t',
  subscription_events:'id:u tenant_id:u client_id:u subscription_id:u kind:s from_state:s to_state:s old_ends_on:d new_ends_on:d days:n reason:s actor_user_id:u created_at:t',
  client_entitlement_overrides:'id:u tenant_id:u client_id:u subscription_id:u override:j created_by:u created_at:t revoked_at:t',
  payments:'id:u tenant_id:u client_id:u subscription_id:u amount:n currency:s method:s state:s receipt_no:s proof_media_id:u reference:s paid_at:t verified_at:t verified_by:u rejected_reason:s refunded_at:t refund_amount:n provider:s provider_ref:s notes:s created_by:u created_at:t updated_at:t',
  // 0008: A adds archived_at timestamptz and archived_by uuid.
  exercises:'id:u tenant_id:u based_on_id:u slug:s name:j aliases:a category:s primary_muscles:a secondary_muscles:a movement_pattern:s equipment:a difficulty:s unilateral:b compound:b plane:s cues:j common_mistakes:j contraindications:j progressions:a regressions:a alternatives:a tags:a video_url:s thumbnail_media_id:u source:s hidden:b created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  foods:'id:u tenant_id:u based_on_id:u slug:s name:j aliases:a category:s per_100:j micronutrients:j raw_or_cooked:s counterpart_slug:s cooked_yield:n measures:j source:s brand:s tags:a hidden:b created_by:u created_at:t updated_at:t',
  tenant_hidden_items:'tenant_id:u kind:s item_id:u hidden_by:u created_at:t',
  // 0008: A adds archived_by uuid.
  programs:'id:u tenant_id:u name:j kind:s template_id:u client_id:u subscription_id:u current_version_id:u published_version_id:u tags:a created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  // 0008: A adds archived_by uuid.
  nutrition_plans:'id:u tenant_id:u name:j kind:s template_id:u client_id:u subscription_id:u current_version_id:u published_version_id:u tags:a created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  // 0008: A adds archived_by uuid.
  forms:'id:u tenant_id:u name:j form_kind:s kind:s template_id:u client_id:u current_version_id:u published_version_id:u is_default:n created_by:u created_at:t updated_at:t archived_at:t archived_by:u',
  program_versions:'id:u tenant_id:u program_id:u client_id:u version_no:n status:s document:j change_note:s created_by:u created_at:t published_at:t published_by:u superseded_at:t',
  nutrition_plan_versions:'id:u tenant_id:u plan_id:u client_id:u version_no:n status:s document:j change_note:s created_by:u created_at:t published_at:t published_by:u superseded_at:t',
  form_versions:'id:u tenant_id:u form_id:u client_id:u version_no:n status:s document:j change_note:s created_by:u created_at:t published_at:t published_by:u superseded_at:t',
  // 0008: B adds voided_at, voided_by and void_reason.
  metric_entries:'id:u tenant_id:u client_id:u metric:s metric_key:s value:n unit:s source:s recorded_at:t local_date:d timezone:s client_uuid:u client_updated_at:t correction_of:u note:s created_at:t voided_at:t voided_by:u void_reason:s',
  // 0008: B adds void attribution and replaces_id.
  measurement_sets:'id:u tenant_id:u client_id:u local_date:d values:j taken_by:s client_uuid:u client_updated_at:t note:s created_at:t voided_at:t voided_by:u void_reason:s replaces_id:u',
  progress_photo_sets:'id:u tenant_id:u client_id:u local_date:d poses:j weight_kg:n client_uuid:u client_updated_at:t note:s created_at:t',
  inbody_records:'id:u tenant_id:u client_id:u local_date:d raw_media_id:u fields:j normalized:j source:s note:s created_by:u created_at:t',
  // 0008: B adds voided_at, voided_by and void_reason.
  workout_sessions:'id:u tenant_id:u client_id:u program_id:u program_version_id:u phase_id:s week_id:s day_id:s workout_id:s planned_workout:j state:s local_date:d timezone:s started_at:t ended_at:t active_seconds:n rpe_overall:n mood:s pain_note:s client_note:s summary:j client_uuid:u client_updated_at:t created_at:t updated_at:t voided_at:t voided_by:u void_reason:s',
  set_logs:'id:u tenant_id:u client_id:u session_id:u exercise_id:u block_id:s item_id:s set_no:n tag:s reps:n load:n load_unit:s duration_sec:n distance_m:n rpe:n rir:n rest_sec:n completed:b skipped:b substituted_for:u pain_flag:b note:s client_uuid:u client_updated_at:t deleted_at:t created_at:t',
  // 0008: B adds void attribution and replaces_id.
  meal_logs:'id:u tenant_id:u client_id:u plan_version_id:u local_date:d meal_id:s option_id:s free_entry:j status:s note:s client_uuid:u client_updated_at:t recorded_at:t created_at:t voided_at:t voided_by:u void_reason:s replaces_id:u',
  supplement_logs:'id:u tenant_id:u client_id:u plan_version_id:u supplement_id:s local_date:d taken:b client_uuid:u client_updated_at:t recorded_at:t',
  form_submissions:'id:u tenant_id:u client_id:u form_id:u form_version_id:u form_kind:s calendar_event_id:u subscription_id:u state:s answers:j missing_required:a submitted_at:t reviewed_at:t reviewed_by:u coach_feedback:s results:j client_uuid:u client_updated_at:t created_at:t updated_at:t',
  // 0008: B adds cancelled_by uuid.
  calendar_events:'id:u tenant_id:u client_id:u subscription_id:u type:s state:s due_at:t local_date:d timezone:s window_days:n source:s rule_key:s title:j payload:j rescheduled_from:u completed_at:t skipped_at:t cancelled_at:t last_processed_at:t reminders_sent:n created_by:u created_at:t updated_at:t cancelled_by:u',
  conversations:'id:u tenant_id:u kind:s client_id:u subject:s last_message_at:t last_message_preview:s unread_for_coach:n unread_for_client:n archived_at:t created_at:t',
  notifications:'id:u tenant_id:u user_id:u client_id:u type:s title:j body:j link:s dedupe_key:s payload:j read_at:t created_at:t',
  push_subscriptions:'id:u tenant_id:u user_id:u endpoint:s keys:j user_agent:s created_at:t last_used_at:t failed_at:t',
  media:'id:u tenant_id:u client_id:u owner_user_id:u bucket:s path:s kind:s purpose:s mime_type:s bytes:n width:n height:n duration_sec:n review_state:s reviewed_by:u reviewed_at:t review_note:s uploaded_at:t metadata:j created_at:t deleted_at:t',
};

/** doc §5.2/§6.3: permitted INSERT actor classes, independent of grants/policies under test. */
export const INSERT_ACTORS: Readonly<Record<string,readonly ('o1'|'s1'|'ua')[]>> = {
  // 0008: D/E/F grant draft INSERT to staff; red_flags has no runtime INSERT grant.
  ai_drafts:['o1','s1'],red_flags:[],
  tenants:[],memberships:['o1'],staff_client_assignments:['o1'],invitations:['o1','s1'],business_settings:['o1'],
  user_preferences:['o1','s1','ua'],consents:['o1','s1','ua'],clients:['o1','s1'],client_notes:['o1','s1'],client_flags:['o1','s1'],tasks:['o1','s1'],ai_requests:['o1','s1'],packages:['o1','s1'],subscriptions:['o1','s1'],subscription_events:['o1','s1'],client_entitlement_overrides:['o1','s1'],payments:['o1','s1','ua'],exercises:['o1','s1'],foods:['o1','s1'],tenant_hidden_items:['o1','s1'],programs:['o1','s1'],nutrition_plans:['o1','s1'],forms:['o1','s1'],program_versions:['o1','s1'],nutrition_plan_versions:['o1','s1'],form_versions:['o1','s1'],metric_entries:['o1','s1','ua'],measurement_sets:['o1','s1','ua'],progress_photo_sets:['o1','s1','ua'],inbody_records:['o1','s1','ua'],workout_sessions:['o1','s1','ua'],set_logs:['o1','s1','ua'],meal_logs:['o1','s1','ua'],supplement_logs:['o1','s1','ua'],form_submissions:['o1','s1','ua'],calendar_events:['o1','s1'],conversations:['o1','s1','ua'],notifications:[],push_subscriptions:['o1','s1','ua'],media:['o1','s1','ua'],
};

/** doc §6.3/G20: relevant OLD states, including non-null set-once/toggle/sync values. */
export const MATRIX_STATES: Readonly<Record<string,readonly (string|null)[]>> = {
  // 0008: A archive attribution and restore states; B voided rows refuse every runtime UPDATE.
  clients:['base','archived'],programs:['base','archived'],nutrition_plans:['base','archived'],forms:['base','archived'],packages:['base','archived'],exercises:['base','archived'],
  metric_entries:['base','voided'],workout_sessions:['base','voided'],
  // 0008: D/E OLD states include service-only approval/staleness and stamped handling.
  ai_drafts:['draft','approved','rejected','stale'],red_flags:['open','handled'],
  invitations:['pending','accepted','revoked','expired'],consents:['base','set'],client_flags:['base','set'],
  subscriptions:['pending','active','grace','expired','paused','cancelled','suspended'],
  client_entitlement_overrides:['base','set'],payments:['pending','verified','partial','rejected','refunded'],
  program_versions:['draft','in_review','approved','published','superseded','archived'],
  nutrition_plan_versions:['draft','in_review','approved','published','superseded','archived'],
  form_versions:['draft','in_review','approved','published','superseded','archived'],
  // 0008: B retain the existing sync OLD states and add the terminal void state.
  measurement_sets:['base','set','voided'],progress_photo_sets:['base','set'],set_logs:['base','set'],meal_logs:['base','set','voided'],supplement_logs:['base','set'],
  form_submissions:['scheduled','due','overdue','submitted','waiting_for_coach','reviewed','skipped','rescheduled','cancelled'],
  calendar_events:['scheduled','due','overdue','completed','skipped','rescheduled','cancelled'],
  tasks:['open','snoozed','done','cancelled'],ai_requests:['draft','approved','rejected'],
  media:[null,'requested','uploaded','processing','queued_for_review','approved','needs_resubmission','rejected','archived'],
};

/** doc §7.12/G20: named rules that precede the guard; refund permission follows it. */
export const SPECIAL_PRECEDENCE = {
  heads:{ published_version_id:'rule:app.head_rules' },
  frozenVersions:{ document:'rule:app.protect_published_version',version_no:'rule:app.protect_published_version',published_at:'rule:app.protect_published_version',published_by:'rule:app.protect_published_version',tenant_id:'rule:app.protect_published_version',client_id:'rule:app.protect_published_version',program_id:'rule:app.protect_published_version',plan_id:'rule:app.protect_published_version',form_id:'rule:app.protect_published_version' },
  archivedVersionStatus:'rule:app.protect_published_version',paymentProofDelete:'rule:app.media_proof_rules',refundAfterGuard:'rule:app.payment_refund_permission',
} as const;

/** doc §13.4 G20: changing these alone violates a coupled identity CHECK; catalog plus named dedicated case pins them. */
export const NO_ALTERNATE: Readonly<Record<string,string>> = {
  // 0008: D ai_drafts_kind_ck permits only week_review (reinvent immutable/CHECK cases and G20 catalog pin).
  'ai_drafts.kind':'X0008: singleton kind CHECK; no semantically valid changed label',
  'memberships.role.client':'T21: client role iff client_id is non-null',
  'invitations.role':'T03: client role iff client_id is non-null',
  'programs.kind':'D05: template kind iff client_id is null',
  'nutrition_plans.kind':'D05: template kind iff client_id is null',
  'forms.kind':'D05: template kind iff client_id is null',
  'conversations.kind':'M12: internal kind iff client_id is null',
  'payments.state.partial':'P07/P08/X04: a partial refund cannot change state without changing its amount',
  'payments.state.refunded':'P08/X04: a full refund requires state refunded',
  'payments.refund_amount.refunded':'P08: a refunded payment must retain refund_amount equal to amount',
  'payments.amount.refunded':'P08: changing amount alone would make the full refund inconsistent',
  'payments.rejected_reason.pending':'P09: a reason exists only with rejected state',
  'payments.rejected_reason.verified':'P09: a reason exists only with rejected state',
  'payments.rejected_reason.partial':'P09: a reason exists only with rejected state',
  'payments.rejected_reason.refunded':'P09: a reason exists only with rejected state',
};
