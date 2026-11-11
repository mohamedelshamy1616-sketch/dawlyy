import { describe, expect, it } from 'vitest';
import { LocalFsStorage, validateMediaUpload, validateProof } from './index';

describe('Task 8 media purposes', () => {
  it('accepts form videos and private progress images while preserving proof limits', async () => {
    expect(validateMediaUpload('form_answer', 'video/mp4', 100)).toBe('mp4');
    expect(validateMediaUpload('progress_photo', 'image/jpeg', 100)).toBe('jpg');
    expect(() => validateMediaUpload('progress_photo', 'video/mp4', 100)).toThrow();
    expect(() => validateMediaUpload('unknown', 'image/jpeg', 100)).toThrow();
    expect(() => validateProof('video/mp4', 100)).toThrow();
    const path = '11111111-1111-4111-8111-111111111111/clients/22222222-2222-4222-8222-222222222222/form_answer/video.mp4';
    expect((await new LocalFsStorage().createUpload(path, 'video/mp4', 100)).method).toBe('PUT');
  });
});
