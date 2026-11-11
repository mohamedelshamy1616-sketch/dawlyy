import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LocaleSwitch } from '@/src/components/shell/locale-switch';
import { Wordmark } from '@/src/components/shell/wordmark';

function LegalNav() {
  const t = useTranslations('legal.nav');
  const link = 'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium underline-offset-4 hover:underline';
  return (
    <nav aria-label={t('label')} className="flex min-w-0 flex-wrap gap-1">
      <Link href="/terms" className={link}>{t('terms')}</Link>
      <Link href="/privacy" className={link}>{t('privacy')}</Link>
      <Link href="/consent" className={link}>{t('consent')}</Link>
    </nav>
  );
}

/** Task 11: shared frame of the public legal pages. No sign-in is needed to read them. */
export default async function LegalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-svh w-full max-w-full flex-col overflow-x-clip bg-background">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <Wordmark />
        <LocaleSwitch />
      </header>
      <main id="main" className="mx-auto w-full min-w-0 max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t px-4 py-3"><LegalNav /></footer>
    </div>
  );
}
