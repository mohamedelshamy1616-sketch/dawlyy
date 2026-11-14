import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACCESS, ME, OWNER, STAFF, T, allow, tenantGuard } from './_rls';
import { clients } from './clients';
import { DEFAULT_CLIENT_MODULES, type ClientModules, type ClientScope } from '@dawlyy/core/types';
import { clientScope, consentKind, invitationStatus, membershipRole, membershipStatus } from './enums';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §3 (multi-tenant), §5 (roles), §41 (team), §46 (settings). */

/** doc §5.2, §8: tenants policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Prefix for persistent client ids, e.g. DW → DW-000123 (spec §10). */
    clientCodePrefix: text('client_code_prefix').notNull().default('DW'),
    clientCounter: integer('client_counter').notNull().default(0),
    receiptCounter: integer('receipt_counter').notNull().default(0),
    defaultLocale: text('default_locale').notNull().default('ar'),
    timezone: text('timezone').notNull().default('Africa/Cairo'),
    currency: text('currency').notNull().default('EGP'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tenants_slug_uq').on(t.slug),
    ...tenantGuard('tenants', T(t.id)),
    ...allow('tenants_member', ['select'], sql`${T(t.id)}`),
    ...allow('tenants_owner', ['update'], sql`${T(t.id)} and ${OWNER}`),
  ],
).enableRLS();

export type StaffPermissions = {
  client_scope: ClientScope;
  /** module → allowed actions, e.g. { programs: ['view','edit','publish'] }. Shape owned by @dawlyy/core/authz. */
  modules: Record<string, string[]>;
  preset?: string;
};

/** One row per (user, tenant). `user_id` is the Supabase auth user id. */
/** doc §5.2, §8: memberships policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('invited'),
    /** Set when role = client. */
    clientId: uuid('client_id'),
    permissions: jsonb('permissions').$type<StaffPermissions>(),
    displayName: text('display_name'),
    email: text('email'),
    phone: text('phone'),
    locale: text('locale'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('memberships_tenant_user_uq').on(t.tenantId, t.userId),
    index('memberships_user_idx').on(t.userId),
    index('memberships_tenant_role_idx').on(t.tenantId, t.role),
    index('memberships_client_idx').on(t.clientId),
    uniqueIndex('memberships_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      name: 'memberships_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('memberships_role_client_ck', sql`(${t.role} = 'client') = (${t.clientId} is not null)`),
    ...tenantGuard('memberships', sql`${T(t.tenantId)} or ${ME(t.userId)}`, T(t.tenantId)),
    ...allow('memberships_self', ['select'], sql`${ME(t.userId)}`),
    ...allow('memberships_self', ['update'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
    ...allow('memberships_owner', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWNER}`),
    ...allow('memberships_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF} and (${t.role} in ('owner','staff') or ${ACCESS(t.clientId)})`),
  ],
).enableRLS();

/** Staff with client_scope = assigned see only these clients. */
/** doc §5.2, §8: staff_client_assignments policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const staffClientAssignments = pgTable(
  'staff_client_assignments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').notNull(),
    clientId: uuid('client_id').notNull(),
    assignedBy: uuid('assigned_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_client_assignments_uq').on(t.membershipId, t.clientId),
    index('staff_client_assignments_tenant_client_idx').on(t.tenantId, t.clientId),
    foreignKey({
      name: 'sca_membership_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sca_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    ...tenantGuard('staff_client_assignments', T(t.tenantId)),
    ...allow('staff_client_assignments_owner', ['select', 'insert', 'delete'], sql`${T(t.tenantId)} and ${OWNER}`),
    ...allow('staff_client_assignments_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF} and (${t.membershipId} = (select app.membership_id()) or ${ACCESS(t.clientId)})`),
  ],
).enableRLS();

/** doc §5.2, §8: invitations policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Random 32-byte token, stored hashed (sha256 hex). The raw token travels in the link only. */
    tokenHash: text('token_hash').notNull(),
    role: membershipRole('role').notNull(),
    clientId: uuid('client_id'),
    displayName: text('display_name'),
    email: text('email'),
    phone: text('phone'),
    permissions: jsonb('permissions').$type<StaffPermissions>(),
    status: invitationStatus('status').notNull().default('pending'),
    invitedBy: uuid('invited_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedUserId: uuid('accepted_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_uq').on(t.tokenHash),
    index('invitations_tenant_status_idx').on(t.tenantId, t.status),
    index('invitations_tenant_client_idx').on(t.tenantId, t.clientId).where(sql`${t.clientId} is not null`),
    foreignKey({
      name: 'invitations_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('invitations_role_client_ck', sql`(${t.role} = 'client') = (${t.clientId} is not null)`),
    ...tenantGuard('invitations', T(t.tenantId)),
    ...allow('invitations_owner', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${OWNER}`),
    ...allow('invitations_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF} and (${ME(t.invitedBy)} or (${t.role} = 'client' and ${ACCESS(t.clientId)}))`),
    ...allow('invitations_staff', ['insert'], sql`${T(t.tenantId)} and ${STAFF} and ${t.role} = 'client' and ${t.permissions} is null and ${ACCESS(t.clientId)}`),
    ...allow('invitations_staff', ['update'], sql`${T(t.tenantId)} and ${STAFF} and ${ME(t.invitedBy)} and ${t.role} = 'client'`),
  ],
).enableRLS();

export type BusinessSettings = {
  logoMediaId?: string;
  brandColor?: string;
  units: { weight: 'kg' | 'lb'; length: 'cm' | 'in' };
  exerciseCategories: string[];
  measurementTemplate: string[];
  weekStartsOn: 0 | 6 | 1;
  quietHours?: { start: string; end: string };
  checkinReviewTurnaroundHours: number;
  numerals: 'western' | 'arabic';
};

/** doc §5.2, §8: business_settings policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const businessSettings = pgTable(
  'business_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    settings: jsonb('settings').$type<BusinessSettings>().notNull(),
    clientModules: jsonb('client_modules').$type<ClientModules>().notNull().default(DEFAULT_CLIENT_MODULES),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [
    check('business_settings_client_modules_ck', sql`jsonb_typeof(${t.clientModules}) = 'object'
      and ${t.clientModules} - array['workouts','nutrition','checkins','progress_photos','measurements','messages','payments']::text[] = '{}'::jsonb
      and not jsonb_path_exists(${t.clientModules}, '$.* ? (@.type() != "boolean")')`),
    ...tenantGuard('business_settings', T(t.tenantId)),
    ...allow('business_settings_member', ['select'], sql`${T(t.tenantId)}`),
    ...allow('business_settings_owner', ['insert', 'update'], sql`${T(t.tenantId)} and ${OWNER}`),
  ],
).enableRLS();

export type UserPreferences = {
  numerals?: 'latn' | 'arab';
  locale?: 'ar' | 'en';
  timezone?: string;
  units?: { weight: 'kg' | 'lb'; length: 'cm' | 'in' };
  quietHours?: { start: string; end: string };
  channels?: Partial<Record<'inapp' | 'webpush' | 'email' | 'whatsapp', boolean>>;
};

/** doc §5.2, §8: user_preferences policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const userPreferences = pgTable(
  'user_preferences',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    preferences: jsonb('preferences').$type<UserPreferences>().notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_preferences_uq').on(t.tenantId, t.userId),
    ...tenantGuard('user_preferences', T(t.tenantId)),
    ...allow('user_preferences_self', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
  ],
).enableRLS();

/** Spec §44 / Egypt Law 151-2020: consent is per user, per kind, versioned, with withdrawal. */
/** doc §5.2, §8: consents policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    kind: consentKind('kind').notNull(),
    /** Version of the legal text accepted, e.g. `2026-11`. */
    version: text('version').notNull(),
    locale: text('locale').notNull(),
    accepted: boolean('accepted').notNull().default(true),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('consents_tenant_user_idx').on(t.tenantId, t.userId, t.kind),
    ...tenantGuard('consents', T(t.tenantId)),
    ...allow('consents_self', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
    ...allow('consents_owner', ['select'], sql`${T(t.tenantId)} and ${OWNER}`),
    ...allow('consents_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF} and ${t.userId} in (select app.accessible_user_ids())`),
  ],
).enableRLS();
