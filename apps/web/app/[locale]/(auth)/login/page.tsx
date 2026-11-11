import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/app/login-form";
import { AuthFrame } from "@/components/auth/auth-frame";

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

  return (
    <AuthFrame title={t("login")} subtitle={t("loginSubtitle")}>
      <LoginForm />
      {devPanel}
    </AuthFrame>
  );
}
