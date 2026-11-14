import { z } from '@hono/zod-openapi';
import { normalizeEmail, normalizePhone } from '@dawlyy/core/text';
import { clientStatus } from '@dawlyy/db/schema';

const phone = z.string().trim().max(40).transform((value, ctx) => {
  const normalized = normalizePhone(value);
  if (normalized === null) { ctx.addIssue({ code: 'custom', message: 'Invalid phone number' }); return z.NEVER; }
  return normalized;
});
const email = z.string().trim().max(320).transform((value, ctx) => {
  const normalized = normalizeEmail(value);
  if (normalized === null) { ctx.addIssue({ code: 'custom', message: 'Invalid email address' }); return z.NEVER; }
  return normalized;
});

const clientFields = z.object({
  firstName: z.string().trim().min(1).max(200),
  lastName: z.string().trim().max(200).nullable().optional(),
  displayName: z.string().trim().max(400).nullable().optional(),
  phone: phone.nullable().optional(),
  email: email.nullable().optional(),
  locale: z.enum(['ar', 'en']),
  tags: z.array(z.string().trim().min(1).max(80)).max(50),
  source: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(10000).optional(),
  packageId: z.string().uuid().optional(),
}).strict();

/** Task 3: editable client fields with create-only defaults and private client_notes text. */
export const createClientSchema = clientFields.extend({ locale: clientFields.shape.locale.default('ar'), tags: clientFields.shape.tags.default([]) });

/** Task 3: status transitions use archive/unarchive; request input cannot set server-owned fields. */
export const updateClientSchema = clientFields.omit({ packageId: true }).partial().refine(value => Object.keys(value).length > 0);

/** Task 3: scoped client filters and raw pagination values. */
export const clientListSchema = z.object({
  q: z.string().trim().max(300).optional(), status: z.enum(clientStatus.enumValues).optional(),
  packageId: z.string().uuid().optional(), tag: z.string().trim().min(1).max(80).optional(),
  archived: z.enum(['true', 'false']).optional(), limit: z.string().optional(), cursor: z.string().optional(),
});
