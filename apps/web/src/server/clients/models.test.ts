import { describe, expect, it } from 'vitest';
import { buildClientSearchKey, entitlementDisplay } from './models';

describe('Task 3 client search and entitlement display', () => {
  it('folds Arabic diacritics and Alef variants and includes every name and contact field', () => {
    expect(buildClientSearchKey({ firstName: 'أَحْمَد', lastName: 'إبراهيم', displayName: 'Ahmed', phone: '٠١٠١٢٣٤٥٦٧٨', email: 'AHMED@example.com' }))
      .toBe('احمد ابراهيم ahmed 01012345678 ahmed example com');
    expect(buildClientSearchKey({ firstName: 'آدم', lastName: null, phone: null, email: null }))
      .toBe('ادم');
  });

  it('shows inherited fields and override fields without changing either input', () => {
    const base = [{ key: 'technique_review' as const, enabled: true, frequency: 'weekly' as const, limit: 1, turnaroundHours: 48 }];
    const overrides = [{ key: 'technique_review' as const, limit: 3 }];
    const [row] = entitlementDisplay(base, overrides);
    expect(row).toMatchObject({ limit: 3, frequency: 'weekly', turnaroundHours: 48, source: 'override', overridden: true,
      sources: { limit: 'override', frequency: 'package', turnaroundHours: 'package' } });
    expect(base[0]?.limit).toBe(1);
    expect(overrides[0]).toEqual({ key: 'technique_review', limit: 3 });
    expect(entitlementDisplay(base, [])[0]).toMatchObject({ limit: 1, source: 'package', overridden: false });
  });

  it('does not mark an equal override value as differing from the package', () => {
    expect(entitlementDisplay([{ key: 'chat', enabled: true }], [{ key: 'chat', enabled: true }])[0])
      .toMatchObject({ source: 'override', overridden: false });
  });
});
