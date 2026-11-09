import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/components/app/login-form";
import { LocaleSwitch } from "@/src/components/shell/locale-switch";
import { PageHeader } from "@/src/components/shell/page-header";
import { Wordmark } from "@/src/components/shell/wordmark";

/** doc §14 / P2B local testing: normal sign-in plus a development-only seeded-user panel. */
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  let devPanel = null;
  if (process.env.NODE_ENV !== 'production') {
    const dev = await import('@/src/server/dev-login');
    if (dev.devLoginEnabled()) {
      const { DevLoginPanel } = await import('@/components/app/dev-login-panel');
      devPanel = <DevLoginPanel locale={locale} users={await dev.listDemoUsers()} />;
    }
  }

  // Logical utilities only (px, ms, start/end): the page must not clip or scroll sideways in RTL at 360 to 420 px.
  // `min-w-0` and `max-w-full` stop any child from forcing the column wider than the screen, and
  // `overflow-x-clip` is the safety net. The form controls sit on 44 px targets.
  return (
    <main
      id="main"
      className="flex min-h-svh w-full max-w-full flex-col overflow-x-clip bg-linear-to-b from-brand-soft to-background px-4 py-6"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-sm flex-1 flex-col justify-center gap-6">
        <div className="flex items-center justify-between gap-2">
          <Wordmark asLink={false} className="min-w-0" />
          <LocaleSwitch />
        </div>
        <PageHeader title={t("login")} subtitle={t("loginSubtitle")} />
        <Card className="w-full min-w-0 max-w-full shadow-sm">
          <CardContent className="[&_button]:h-11 [&_input]:h-11">
            <LoginForm />
          </CardContent>
        </Card>
        {devPanel}
      </div>
    </main>
  );
}
