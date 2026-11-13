import { Suspense } from "react";
import { getLocale, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requirePage } from "@/src/server/auth";
import { LandingState } from "@/src/components/shell/landing-state";

async function RoleRedirect() {
  const locale = await getLocale();
  // requirePage sends signed-out visitors to /login and signed-in users without a membership to /onboarding.
  // getAuthContext alone returned null for the second group too, so a fresh account looped back to /login.
  const auth = await requirePage();
  redirect({ href: auth.role === "client" ? "/app/today" : "/coach", locale });
  return null;
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // The redirect needs the session, which streams. Until it resolves the visitor sees the branded
  // landing state instead of an empty body; the fallback is replaced the moment the redirect fires.
  return (
    <Suspense fallback={<LandingState />}>
      <RoleRedirect />
    </Suspense>
  );
}
