import webpush from 'web-push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebPushSender, PushGoneError } from './channels';

vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }));
afterEach(() => { vi.resetAllMocks(); });

const keys = { p256dh: 'public', auth: 'auth' };
const payload = { title: 'Reminder' };
const sender = () => createWebPushSender('public', 'private', 'mailto:admin@example.test');

describe('Web Push endpoint validation at dispatch', () => {
  it.each([
    'https://internal.example.test:8443/admin',
    'https://evilfcm.googleapis.com/device',
    'https://fcm.googleapis.com.evil.test/device',
    'http://fcm.googleapis.com/device',
    'https://user@fcm.googleapis.com/device',
    'https://fcm.googleapis.com:8443/device',
    'https://127.0.0.1/device',
    'https://localhost/device',
    'not a URL',
  ])('treats stored refused endpoint %s as gone without a provider call', async endpoint => {
    await expect(sender().send({ endpoint, keys }, payload)).rejects.toBeInstanceOf(PushGoneError);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sends to an allowed provider with the original subscription and payload', async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const target = { endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys };
    await expect(sender().send(target, payload)).resolves.toBeUndefined();
    expect(webpush.sendNotification).toHaveBeenCalledWith(target, JSON.stringify(payload), {
      vapidDetails: { subject: 'mailto:admin@example.test', publicKey: 'public', privateKey: 'private' }, TTL: 86_400,
    });
  });

  it.each([404, 410])('keeps the existing expired-subscription behavior for provider status %s', async statusCode => {
    vi.mocked(webpush.sendNotification).mockRejectedValue({ statusCode });
    await expect(sender().send({ endpoint: 'https://fcm.googleapis.com/device', keys }, payload)).rejects.toBeInstanceOf(PushGoneError);
  });

  it('keeps other provider failures retryable', async () => {
    const error = new Error('temporary provider failure');
    vi.mocked(webpush.sendNotification).mockRejectedValue(error);
    await expect(sender().send({ endpoint: 'https://fcm.googleapis.com/device', keys }, payload)).rejects.toBe(error);
  });
});
