import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { ClientScope } from '@dawlyy/core/types';
import { authenticated, isStaff, tenantMatch, userOwnedPolicies } from './_rls';
import { clientScope, consentKind, invitationStatus, membershipRole, membershipStatus } from './enums';

/** Spec §3 (multi-tenant), §5 (roles), §41 (team), §46 (settings). */

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Prefix for persistent client ids, e.g. DW → DW-000123 (spec §10). */
    clientCodePrefix: text('client_code_prefix').notNull().default('DW'),
    clientCounter: integer('client_counter').notNull().default(0),
    defaultLocale: text('default_locale').notNull().default('ar'),
    timezone: text('timezone').notNull().default('Africa/Cairo'),
    currency: text('currency').notNull().default('EGP'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tenants_slug_uq').on(t.slug),
    pgPolicy('tenants_member_select', { for: 'select', to: authenticated, using: sql`${t.id} = (select app.tenant_id())` }),
    pgPolicy('tenants_owner_update', {
      for: 'update',
      to: authenticated,
      using: sql`${t.id} = (select app.tenant_id()) and (select app.role()) = 'owner'`,
      withCheck: sql`${t.id} = (select app.tenant_id()) and (select app.role()) = 'owner'`,
    }),
  ],
);

export type StaffPermissions = {
  client_scope: ClientScope;
  /** module → allowed actions, e.g. { programs: ['view','edit','publish'] }. Shape owned by @dawlyy/core/authz. */
  modules: Record<string, string[]>;
  preset?: string;
};

/** One row per (user, tenant). `user_id` is the Supabase auth user id. */
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
    // A user always sees their own memberships (needed before a tenant context exists).
    pgPolicy('memberships_self_select', { for: 'select', to: authenticated, using: sql`${t.userId} = (select app.uid())` }),
    // Owner and staff see the tenant's memberships; owner manages them.
    pgPolicy('memberships_staff_select', {
      for: 'select',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${isStaff}`,
    }),
    pgPolicy('memberships_owner_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
      withCheck: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
    }),
  ],
);

/** Staff with client_scope = assigned see only these clients. */
export const staffClientAssignments = pgTable(
  'staff_client_assignments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    assignedBy: uuid('assigned_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('staff_client_assignments_uq').on(t.membershipId, t.clientId),
    index('staff_client_assignments_tenant_client_idx').on(t.tenantId, t.clientId),
    pgPolicy('staff_client_assignments_staff_select', {
      for: 'select',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${isStaff}`,
    }),
    pgPolicy('staff_client_assignments_owner_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
      withCheck: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
    }),
  ],
);

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
    // Only staff see or manage invitations; acceptance happens through a service transaction.
    pgPolicy('invitations_staff_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${isStaff}`,
      withCheck: sql`${tenantMatch(t.tenantId)} and ${isStaff}`,
    }),
  ],
);

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

export const businessSettings = pgTable(
  'business_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    settings: jsonb('settings').$type<BusinessSettings>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [
    pgPolicy('business_settings_member_select', { for: 'select', to: authenticated, using: tenantMatch(t.tenantId) }),
    pgPolicy('business_settings_owner_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
      withCheck: sql`${tenantMatch(t.tenantId)} and (select app.role()) = 'owner'`,
    }),
  ],
);

export type UserPreferences = {
  locale?: 'ar' | 'en';
  timezone?: string;
  units?: { weight: 'kg' | 'lb'; length: 'cm' | 'in' };
  quietHours?: { start: string; end: string };
  channels?: Partial<Record<'inapp' | 'webpush' | 'email' | 'whatsapp', boolean>>;
};

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
  (t) => [uniqueIndex('user_preferences_uq').on(t.tenantId, t.userId), ...userOwnedPolicies('user_preferences', t)],
);

/** Spec §44 / Egypt Law 151-2020: consent is per user, per kind, versioned, with withdrawal. */
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
    ...userOwnedPolicies('consents', t),
    pgPolicy('consents_staff_select', { for: 'select', to: authenticated, using: sql`${tenantMatch(t.tenantId)} and ${isStaff}` }),
  ],
);
