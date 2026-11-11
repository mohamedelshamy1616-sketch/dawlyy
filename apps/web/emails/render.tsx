import { render } from '@react-email/components';
import { NotificationEmail, type NotificationEmailProps } from './notification-email';

/** Task 9: a rendered email, ready for a sender. Nothing here sends anything. */
export type RenderedEmail = { subject: string; html: string; text: string; dir: 'rtl' | 'ltr' };

/** Task 9: pure render of the notification email to HTML and plain text; RTL for Arabic. Tested without sending. */
export async function renderEmail(props: NotificationEmailProps): Promise<RenderedEmail> {
  const element = <NotificationEmail {...props} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: props.title, html, text, dir: props.lang === 'ar' ? 'rtl' : 'ltr' };
}
