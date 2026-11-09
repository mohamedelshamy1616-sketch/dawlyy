import { validationError } from '../../api/errors';

/** T3b: parse numeric(12,2) major units without floating-point arithmetic. */
export function moneyMinor(value: string | number): number {
  const text = String(value);
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw validationError(undefined, 'Invalid money amount');
  const [whole = '', fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > 999999999999) throw validationError(undefined, 'Money amount exceeds numeric(12,2)');
  return minor;
}

/** T3b: convert integer cents only at the schema's mode:number boundary. */
export function moneyNumber(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > 999999999999) throw validationError(undefined, 'Invalid minor units');
  return Number(`${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`);
}
