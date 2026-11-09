import { describe, expect, it } from 'vitest';
import { moneyMinor, moneyNumber } from './money';

describe('T3b decimal money boundary', () => {
  it('adds decimals in integer cents', () => {
    expect(moneyMinor('0.10') + moneyMinor('0.20')).toBe(30);
    expect(moneyNumber(30)).toBe(0.3);
    expect(moneyMinor(9999999999.99)).toBe(999999999999);
  });
  it.each(['1.001', '-1', '1e2', 'Infinity', '10000000000', '', ' 1', Number.NaN])(
    'rejects invalid numeric(12,2) input %s', (value) => expect(() => moneyMinor(value)).toThrow(),
  );
});
