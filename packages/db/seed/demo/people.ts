import { and, eq } from 'drizzle-orm';
import { permissionsFromPreset } from '@dawlyy/core/authz';
import { searchKey } from '@dawlyy/core/text';
import type { Tx } from '../../src/client';
import { businessSettings, clients, consents, memberships, staffClientAssignments, tenants, userPreferences } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import { DEMO_CLIENTS, type Demo } from './model';
import { exists } from './helpers';

async function membership(tx: Tx, row: typeof memberships.$inferInsert & { id: string }): Promise<void> {
  const [existing] = await tx.select().from(memberships).where(and(eq(memberships.tenantId, I.tenant), eq(memberships.id, row.id))).limit(1);
  if (existing) {
    if (existing.userId !== row.userId || existing.role !== row.role || existing.clientId !== (row.clientId ?? null)) {
      throw new Error('Demo membership identity conflicts; refusing to repurpose an identity.');
    }
    return;
  }
  await tx.insert(memberships).values(row);
}

/** doc §14, §7.7 / Task 12: create the demo tenant and local membership identities, retaining existing people. */
export async function seedPeople(tx: Tx, demo: Demo): Promise<void> {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, I.tenant)).limit(1);
  if (tenant && tenant.slug !== 'demo-coach') throw new Error('Demo tenant UUID belongs to another slug.');
  if (!tenant) await tx.insert(tenants).values({ id: I.tenant, slug: 'demo-coach', name: 'فريق الكابتن — تجربة',
    defaultLocale: 'ar', timezone: 'Africa/Cairo', currency: 'EGP', createdAt: demo.now });

  const coaches = [
    { id: I.ownerMembership, userId: I.ownerUser, role: 'owner' as const, displayName: 'كابتن محمد', email: 'owner@demo.dawlyy.test', phone: '+201000000001', permissions: null },
    { id: I.staffMembership, userId: I.staffUser, role: 'staff' as const, displayName: 'كابتن منى', email: 'staff@demo.dawlyy.test', phone: '+201000000002', permissions: permissionsFromPreset('coach', { client_scope: 'all' }) },
  ];
  for (const coach of coaches) await membership(tx, { ...coach, tenantId: I.tenant, status: 'active', locale: 'ar', clientId: null, createdAt: demo.now });

  for (const [index, client] of DEMO_CLIENTS.entries()) {
    if (!await exists(tx, clients, client.id)) {
      // clients_90_code takes the code exactly once. Never use ON CONFLICT on clients (§12.1(13)).
      await tx.insert(clients).values({ id: client.id, tenantId: I.tenant, membershipId: client.membershipId,
        firstName: client.firstName, lastName: client.lastName, displayName: client.displayName, email: client.email, phone: client.phone,
        locale: client.locale, timezone: 'Africa/Cairo', status: index === 5 ? 'lead' : index === 3 ? 'inactive' : 'active',
        searchKey: searchKey(`${client.displayName} ${client.email} ${client.phone}`),
        profile: { goal: index === 0 ? 'زيادة القوة والعضل بهدوء' : 'نزول دهون وتحسين اللياقة', trainingLevel: index === 0 ? 'intermediate' : 'beginner',
          heightCm: [178, 164, 175, 162, 180, 165, 176, 168][index]!, units: { weight: 'kg', length: 'cm' } },
        source: 'تجربة محلية — كل البيانات وهمية', tags: ['تجربة'], createdBy: I.ownerUser, createdAt: demo.now,
        startedOn: demo.subscriptions[index]!.startsOn });
    }
    await membership(tx, { id: client.membershipId, tenantId: I.tenant, userId: client.userId, clientId: client.id,
      role: 'client', status: 'active', displayName: client.displayName, email: client.email, phone: client.phone, locale: client.locale, permissions: null, createdAt: demo.now });
    await tx.insert(staffClientAssignments).values({ tenantId: I.tenant, clientId: client.id, membershipId: I.staffMembership, assignedBy: I.ownerUser })
      .onConflictDoNothing();
    await tx.insert(userPreferences).values({ tenantId: I.tenant, userId: client.userId,
      preferences: { locale: client.locale, timezone: 'Africa/Cairo', channels: { inapp: true, email: false, webpush: false, whatsapp: false } }, updatedAt: demo.now }).onConflictDoNothing();
    // Match apps/web/src/server/settings/constants.ts. Health/photo consent stays unaccepted for the consent UI.
    if (index !== 5) for (const kind of ['terms', 'privacy'] as const) {
      const id = demoId(`consent:${client.userId}:${kind}`);
      if (!await exists(tx, consents, id)) await tx.insert(consents).values({ id, tenantId: I.tenant, userId: client.userId,
        kind, version: '2026-11-draft', locale: client.locale, accepted: true, acceptedAt: demo.now });
    }
  }
  await tx.insert(businessSettings).values({ tenantId: I.tenant, settings: { units: { weight: 'kg', length: 'cm' },
    exerciseCategories: [], measurementTemplate: ['waist', 'chest', 'hips'], weekStartsOn: 6,
    checkinReviewTurnaroundHours: 48, numerals: 'western' }, updatedAt: demo.now, updatedBy: I.ownerUser }).onConflictDoNothing();
}
