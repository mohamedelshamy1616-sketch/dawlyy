import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { businessSettings, memberships, tenants, userPreferences } from '@dawlyy/db/schema';
import { ApiError } from '@/src/api/errors';
import { clientColumns } from '@dawlyy/db';
import { withServiceTx, type Tx } from './db';

/** Task 2: bootstrap accepts profile settings only; identity always comes from the session. */
export const bootstrapInputSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  displayName: z.string().trim().min(1).max(160),
  locale: z.enum(['ar', 'en']),
  timezone: z.string().refine((value) => Intl.supportedValuesOf('timeZone').includes(value), 'Invalid timezone'),
}).strict();

/** Task 2: bootstrap request contract shared with its service. */
export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

/** Task 2: deterministic ASCII slug base; suffix allocation happens atomically in the transaction. */
export function deriveTenantSlug(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '') || 'business';
}

/** Task 2: serialize bootstrap and invite acceptance for the same verified session identity. */
export async function lockUnassignedUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'identity:' + userId}, 0))`);
  // Deliberately cross-tenant: beta permits only one active membership per session user.
  const [existing] = await tx.select({ id: clientColumns.memberships.id }).from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'))).limit(1);
  if (existing) throw new ApiError(409, 'already_member', 'This user already has an active membership');
}

/** Task 2: create the business, owner, defaults and preferences in the caller's single service transaction. */
export async function bootstrapTenant(tx: Tx, userId: string, input: BootstrapInput) {
  await lockUnassignedUser(tx, userId);
  const base = deriveTenantSlug(input.businessName);
  for (let suffix = 1; ; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    // ON CONFLICT is permitted for tenants. A collision never aborts the surrounding transaction.
    const [tenant] = await tx.insert(tenants).values({
      name: input.businessName, slug, defaultLocale: input.locale, timezone: input.timezone,
    }).onConflictDoNothing({ target: tenants.slug }).returning({ id: tenants.id });
    if (!tenant) continue;
    const [membership] = await tx.insert(memberships).values({
      tenantId: tenant.id, userId, role: 'owner', status: 'active', displayName: input.displayName, locale: input.locale,
    }).returning({ id: memberships.id });
    if (!membership) throw new Error('Owner membership insert returned no row');
    await tx.insert(businessSettings).values({
      tenantId: tenant.id,
      settings: {
        units: { weight: 'kg', length: 'cm' }, numerals: 'western',
        weekStartsOn: input.locale === 'ar' ? 6 : 1,
        exerciseCategories: [], measurementTemplate: [], checkinReviewTurnaroundHours: 48,
      },
    });
    await tx.insert(userPreferences).values({
      tenantId: tenant.id, userId, preferences: { locale: input.locale, timezone: input.timezone },
    });
    return { tenantId: tenant.id, membershipId: membership.id };
  }
}

/** Task 2: no membership exists yet, so bootstrap is the explicitly authorized identity-scoped service boundary. */
export async function startCoachingBusiness(userId: string, input: BootstrapInput) {
  return withServiceTx(null, 'auth bootstrap', (tx) => bootstrapTenant(tx, userId, input));
}
