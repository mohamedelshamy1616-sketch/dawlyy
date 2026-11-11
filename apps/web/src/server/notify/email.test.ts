import { describe, expect, it } from 'vitest';
import { renderEmail } from '../../../emails/render';

describe('Task 9 renderEmail', () => {
  it('renders Arabic right to left with the Arabic copy', async () => {
    const mail = await renderEmail({ lang: 'ar', title: 'رسالة جديدة من الكابتن', url: 'https://app.example.test/ar/app/messages' });
    expect(mail.dir).toBe('rtl');
    expect(mail.html).toMatch(/<html[^>]*dir="rtl"/);
    expect(mail.html).toMatch(/<html[^>]*lang="ar"/);
    expect(mail.html).toContain('افتح التطبيق');
    expect(mail.html).toContain('https://app.example.test/ar/app/messages');
    expect(mail.subject).toBe('رسالة جديدة من الكابتن');
    expect(mail.text).toContain('رسالة جديدة من الكابتن');
  });

  it('renders English left to right', async () => {
    const mail = await renderEmail({ lang: 'en', title: 'New message from Coach', body: 'See you at 6.' });
    expect(mail.dir).toBe('ltr');
    expect(mail.html).toMatch(/<html[^>]*dir="ltr"/);
    expect(mail.html).toContain('See you at 6.');
    expect(mail.html).not.toContain('Open the app');
    expect(mail.text.toLowerCase()).toContain('new message from coach');
  });

  it('renders the open button with the link and no body text when only a url is given', async () => {
    const mail = await renderEmail({ lang: 'en', title: 'New message from Coach', body: undefined, url: 'https://app.example.test/en/app/messages' });
    expect(mail.html).toContain('Open the app');
    expect(mail.html).toContain('https://app.example.test/en/app/messages');
  });
});
