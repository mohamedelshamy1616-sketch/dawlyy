import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';

/** Task 9: fixed email copy per language. Emails render outside next-intl, so the few strings live here. */
export const EMAIL_COPY = {
  ar: { open: 'افتح التطبيق', footer: 'وصلك الإيميل ده لأنك مفعّل إشعارات DAWLYY. تقدر تغيّر ده من صفحة الإشعارات في أي وقت.' },
  en: { open: 'Open the app', footer: 'You get this email because DAWLYY notifications are on. You can change that on the notifications page at any time.' },
} as const;

export type NotificationEmailProps = {
  lang: 'ar' | 'en';
  title: string;
  /** Omitted for private content (messages); the email then only points to the app. */
  body?: string | undefined;
  /** Absolute URL of the screen the notification points to. */
  url?: string | undefined;
};

/** Task 9: the one plain notification layout. `dir` follows the language so Arabic mail reads right to left. */
export function NotificationEmail({ lang, title, body, url }: NotificationEmailProps) {
  const copy = EMAIL_COPY[lang];
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  return (
    <Html lang={lang} dir={dir}>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#f6f7f8', fontFamily: 'Tahoma, Arial, sans-serif', margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', borderRadius: 12, maxWidth: 480, padding: 24, textAlign: align }}>
          <Heading as="h1" style={{ fontSize: 20, margin: '0 0 12px', textAlign: align }}>{title}</Heading>
          {body ? <Text style={{ fontSize: 15, lineHeight: '24px', margin: '0 0 16px', textAlign: align }}>{body}</Text> : null}
          {url ? (
            <Section style={{ margin: '8px 0 16px', textAlign: align }}>
              <Button href={url} style={{ backgroundColor: '#0f766e', borderRadius: 8, color: '#ffffff', fontSize: 15, padding: '12px 20px', textDecoration: 'none' }}>{copy.open}</Button>
            </Section>
          ) : null}
          <Hr />
          <Text style={{ color: '#6b7280', fontSize: 12, lineHeight: '18px', margin: 0, textAlign: align }}>{copy.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
