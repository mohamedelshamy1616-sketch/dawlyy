import { Suspense } from "react";
import { getLocale, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getAuthContext } from "@/src/server/auth";

async function RoleRedirect() {
  const locale = await getLocale();
  const auth = await getAuthContext();
  if (!auth) redirect({ href: "/login", locale });
  else if (auth.role === "client") redirect({ href: "/app/today", locale });
  else redirect({ href: "/coach", locale });
  return null;
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <RoleRedirect />
    </Suspense>
  );
}
