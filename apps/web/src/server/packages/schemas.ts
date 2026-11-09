import { z } from '@hono/zod-openapi';
import { entitlementId } from '@dawlyy/core/entitlements';
import { Entitlement, LocalizedText, PackageEntitlements, ScheduleRules } from '@dawlyy/core/types';

/** Task 3: validate core entitlement rows and identities missing from core's structural schema. */
export const packageEntitlementsSchema = PackageEntitlements.superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (row.key === 'custom' && !row.customKey?.trim()) {
      ctx.addIssue({ code: 'custom', path: [index, 'customKey'], message: 'Custom entitlements require a name' });
      return;
    }
    const id = entitlementId(row);
    if (seen.has(id)) ctx.addIssue({ code: 'custom', path: [index, 'key'], message: 'Duplicate entitlement identity' });
    seen.add(id);
  });
});

const packageFields = z.object({
  name: LocalizedText,
  description: LocalizedText.nullable().optional(),
  priceAmount: z.number().finite().min(0).max(9999999999.99).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001),
  currency: z.string().regex(/^[A-Z]{3}$/),
  durationDays: z.number().int().min(1).max(36500),
  graceDays: z.number().int().min(0).max(36500),
  entitlements: packageEntitlementsSchema,
  scheduleRules: ScheduleRules,
}).strict();

/** Task 3: flat package create input; defaults never enter the sparse PATCH schema. */
export const createPackageSchema = packageFields.extend({
  priceAmount: packageFields.shape.priceAmount.default(0), currency: packageFields.shape.currency.default('EGP'),
  graceDays: packageFields.shape.graceDays.default(0), entitlements: packageEntitlementsSchema.default([]), scheduleRules: ScheduleRules.prefault({}),
});

/** Task 3: sparse package edits never alter subscription snapshots. */
export const updatePackageSchema = packageFields.partial().refine(value => Object.keys(value).length > 0);

/** Task 3: PUT replaces explicit override fields; key and custom identity come from the URL. */
export const overrideBodySchema = Entitlement.omit({ key: true, customKey: true }).strict();

/** Task 3: accepted package list query before the shared pagination parser. */
export const packageListSchema = z.object({ archived: z.enum(['0', '1']).optional(), limit: z.string().optional(), cursor: z.string().optional() });
