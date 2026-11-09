import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFsStorage, validateStoragePath, validateProof } from './index';

const tenant = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
describe('T3b storage boundary', () => {
  afterEach(() => vi.useRealTimers());
  it('accepts only the authenticated tenant prefix', () => {
    expect(validateStoragePath(`${tenant}/clients/${client}/payments/a.pdf`, tenant)).toContain('/payments/');
    expect(validateStoragePath(`${tenant}/assets/logo.png`, tenant)).toContain('/assets/');
  });
  it.each(['../x', '/tmp/x', 'C:\\x', `${tenant}/assets/../x`, `${tenant}/assets//x`, `${client}/assets/x`, `${tenant}/clients/no-client/x`, `${tenant}/assets/%2e%2e/x`])(
    'rejects unsafe path %s', (path) => expect(() => validateStoragePath(path, tenant)).toThrow(),
  );
  it('accepts proof types and enforces the eight MiB ceiling', () => {
    expect(validateProof('application/pdf', 8 * 1024 * 1024)).toBe('pdf');
    expect(() => validateProof('text/html', 10)).toThrow();
    expect(() => validateProof('image/png', 8 * 1024 * 1024 + 1)).toThrow();
    expect(() => validateProof('image/png', 0)).toThrow();
  });
  it('binds signed capabilities to tenant, method, MIME, size and expiry', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    const provider = new LocalFsStorage();
    const instruction = await provider.createUpload(`${tenant}/clients/${client}/payments/a.png`, 'image/png', 20);
    const token = instruction.url.split('/').at(-1)!;
    expect(provider.decode(token, 'upload', tenant)).toMatchObject({ contentType: 'image/png', maxBytes: 20 });
    expect(() => provider.decode(token, 'upload', client)).toThrow();
    expect(() => provider.decode(token, 'download', tenant)).toThrow();
    vi.advanceTimersByTime(900000);
    expect(() => provider.decode(token, 'upload', tenant)).toThrow();
  });
});
