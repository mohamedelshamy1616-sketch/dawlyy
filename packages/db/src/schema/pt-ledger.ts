// 0009 follows the runtime role and tenant isolation established by 0006.
import { sql, type SQL } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { allow, CLIENT, OWNER, OWN, T, tenantGuard } from './_rls';
import { subscriptions } from './packages';
import { tenants } from './tenants';

const scope = () => ({
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull(),
  subscriptionId: uuid('subscription_id').notNull(),
});
const stamp = (name: string) => timestamp(name, { withTimezone: true }).notNull().default(sql`clock_timestamp()`);
const actor = (name: string) => uuid(name).notNull().default(sql`app.uid()`);
const coach = (client: unknown) => sql`${OWNER} or ${client} in (select app.assigned_client_ids())`;
const client = (id: unknown) => sql`${CLIENT} and ${OWN(id)}`;
function policies(name: string, t: { tenantId: unknown; clientId: unknown }, writer: SQL) {
  return [...tenantGuard(name, T(t.tenantId)), ...allow(name + '_read', ['select'], sql`${coach(t.clientId)} or (${client(t.clientId)})`),
    ...allow(name + '_write', ['insert'], writer)];
}

export const ptVisits = pgTable('pt_visits', {
  ...scope(), visitId: uuid('visit_id').notNull(), closedAt: stamp('closed_at'), closedBy: actor('closed_by'),
}, t => [
  primaryKey({ name: 'pt_visits_pkey', columns: [t.tenantId, t.visitId] }),
  unique('pt_visit_scope_uq').on(t.tenantId, t.clientId, t.subscriptionId, t.visitId),
  foreignKey({ name: 'pt_visit_sub_fk', columns: [t.tenantId, t.clientId, t.subscriptionId], foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id] }).onDelete('cascade'),
  ...policies('pt_visits', t, coach(t.clientId)),
]).enableRLS();

export const ptLedgerEntries = pgTable('pt_ledger_entries', {
  ...scope(), id: uuid('id').primaryKey().defaultRandom(), visitId: uuid('visit_id'), kind: text('kind').notNull(),
  delta: integer('delta').notNull(), position: integer('position').notNull(), reason: text('reason'),
  approvedBy: actor('approved_by'), createdAt: stamp('created_at'),
}, t => [
  unique('pt_entry_order_uq').on(t.subscriptionId, t.position), unique('pt_visit_kind_uq').on(t.tenantId, t.visitId, t.kind),
  uniqueIndex('pt_open_once').on(t.subscriptionId).where(sql`${t.kind} = 'credit'`),
  foreignKey({ name: 'pt_entry_sub_fk', columns: [t.tenantId, t.clientId, t.subscriptionId], foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id] }).onDelete('cascade'),
  foreignKey({ name: 'pt_entry_visit_fk', columns: [t.tenantId, t.clientId, t.subscriptionId, t.visitId], foreignColumns: [ptVisits.tenantId, ptVisits.clientId, ptVisits.subscriptionId, ptVisits.visitId] }).onDelete('cascade'),
  check('pt_entry_shape', sql`(kind = 'debit' and delta = (0 - 1) and visit_id is not null and reason is null)
    or (reason is not null and length(btrim(reason)) >= 1 and length(btrim(reason)) <= 500 and ((kind = 'credit' and delta >= 0 and visit_id is null)
    or (kind = 'correction' and delta = 1 and visit_id is not null)))`),
  ...policies('pt_ledger_entries', t, sql`${OWNER} or (${t.kind} = 'debit' and ${t.clientId} in (select app.assigned_client_ids()))`),
]).enableRLS();

export const ptReceiptActions = pgTable('pt_receipt_actions', {
  ...scope(), visitId: uuid('visit_id').notNull(), kind: text('kind').notNull(), note: text('note'), createdAt: stamp('created_at'),
}, t => [
  primaryKey({ name: 'pt_receipt_actions_pkey', columns: [t.tenantId, t.visitId, t.kind] }),
  uniqueIndex('pt_one_decision').on(t.tenantId, t.visitId).where(sql`${t.kind} <> 'view'`),
  check('pt_receipt_actions_kind_check', sql`kind in ('view','confirm','dispute')`),
  check('pt_receipt_actions_note_check', sql`length(note) <= 500 and kind <> 'view' or note is null`),
  foreignKey({ name: 'pt_action_visit_fk', columns: [t.tenantId, t.clientId, t.subscriptionId, t.visitId], foreignColumns: [ptVisits.tenantId, ptVisits.clientId, ptVisits.subscriptionId, ptVisits.visitId] }).onDelete('cascade'),
  ...policies('pt_receipt_actions', t, client(t.clientId)),
]).enableRLS();
