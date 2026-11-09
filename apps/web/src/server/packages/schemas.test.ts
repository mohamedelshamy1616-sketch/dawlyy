import { describe, expect, it } from 'vitest';
import { ScheduleRules } from '@dawlyy/core/types';
import { createPackageSchema, updatePackageSchema } from './schemas';
import { updateClientSchema } from '../clients/schemas';

describe('Task 3 input contracts', () => {
  it('applies schedule defaults on creation and preserves sparse edits', () => {
    const created = createPackageSchema.parse({ name: { en: 'Monthly' }, durationDays: 28 });
    expect(created.scheduleRules).toEqual(ScheduleRules.parse({}));
    expect(created.scheduleRules.dailyCheckin.enabled).toBe(false);
    expect(updatePackageSchema.parse({ priceAmount: 700 })).toEqual({ priceAmount: 700 });
    expect(updateClientSchema.parse({ firstName: 'Mona' })).toEqual({ firstName: 'Mona' });
  });

  it('rejects client codes, tenant ownership and unknown package fields', () => {
    expect(updateClientSchema.safeParse({ code: 'DW-999999' }).success).toBe(false);
    expect(updateClientSchema.safeParse({ tenantId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
    expect(updatePackageSchema.safeParse({ createdBy: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
  });
});
