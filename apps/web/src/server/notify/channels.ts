import 'server-only';
import { Resend } from 'resend';
import webpush from 'web-push';
import { isAllowedPushEndpoint } from './push-endpoints';

/** Task 9: delivery channels sit behind small interfaces so tests and local runs never send anything. */

export type EmailMessage = { to: string | null; subject: string; html: string; text: string; idempotencyKey: string };
export type EmailSendResult = { providerRef: string };

/** Task 9: the email sender interface. */
export interface EmailSender {
  readonly mode: 'live' | 'local-log';
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body?: string | undefined; url?: string | undefined; tag?: string | undefined };

/** Task 9: a push endpoint that is gone (404 or 410) must be retired, any other failure retried. */
export class PushGoneError extends Error {
  constructor() { super('push subscription is gone'); this.name = 'PushGoneError'; }
}

/** Task 9: the Web Push sender interface; resolves when the push service accepted the message. */
export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<void>;
}

/** Task 9: log-only email sender used whenever `RESEND_API_KEY` is missing. It records a reference and sends nothing. */
export const localLogEmailSender: EmailSender = {
  mode: 'local-log',
  async send() { return { providerRef: 'local-log' }; },
};

/** Task 9: Resend sender; any provider error is thrown so the processor can retry within its bounded schedule. */
export function createResendSender(apiKey: string, from: string): EmailSender {
  const client = new Resend(apiKey);
  return {
    mode: 'live',
    async send(message) {
      if (!message.to) throw new Error('recipient has no email address');
      const { data, error } = await client.emails.send(
        { from, to: message.to, subject: message.subject, html: message.html, text: message.text },
        { idempotencyKey: message.idempotencyKey },
      );
      if (error || !data) throw new Error(`email provider error: ${error?.name ?? 'unknown'}`);
      return { providerRef: data.id };
    },
  };
}

/** Task 9: email sender from the environment: Resend with a key and a from address, otherwise the log-only fake. */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const key = env.RESEND_API_KEY?.trim(); const from = env.EMAIL_FROM?.trim();
  return key && from ? createResendSender(key, from) : localLogEmailSender;
}

/** Task 9: Web Push sender over VAPID keys. */
export function createWebPushSender(publicKey: string, privateKey: string, subject: string): PushSender {
  return {
    async send(target, payload) {
      // Retire legacy/refused subscriptions through the processor's existing 404/410 path.
      if (!isAllowedPushEndpoint(target.endpoint)) throw new PushGoneError();
      try {
        await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, JSON.stringify(payload), {
          vapidDetails: { subject, publicKey, privateKey }, TTL: 60 * 60 * 24,
        });
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'statusCode' in error ? (error as { statusCode?: number }).statusCode : undefined;
        if (status === 404 || status === 410) throw new PushGoneError();
        throw error;
      }
    },
  };
}

/** Task 9: push sender from the environment, or null without VAPID keys (deliveries are then cancelled). */
export function createPushSender(env: NodeJS.ProcessEnv = process.env): PushSender | null {
  const publicKey = env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim(); const privateKey = env.WEB_PUSH_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  return publicKey && privateKey && subject ? createWebPushSender(publicKey, privateKey, subject) : null;
}
