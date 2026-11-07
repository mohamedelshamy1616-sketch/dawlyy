import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthGate } from "@/components/app/auth-gate";
import { CoachNav } from "@/components/app/coach-nav";
import { LocaleSwitcher } from "@/components/app/locale-switcher";
import { SignOutButton } from "@/components/app/sign-out-button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default async function CoachLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");

  return (
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <AuthGate roles={["owner", "staff"]} fallback="/app/today">
        <div className="flex min-h-svh">
          <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-4 border-e bg-sidebar p-4 text-sidebar-foreground md:flex">
            <span className="px-3 text-lg font-semibold">{t("appName")}</span>
            <CoachNav />
            <div className="mt-auto flex flex-col gap-2">
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <LocaleSwitcher />
                <SignOutButton />
              </div>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-2 border-b p-3 md:hidden">
              <span className="font-semibold">{t("appName")}</span>
              <div className="flex items-center gap-2">
                <LocaleSwitcher />
                <SignOutButton />
              </div>
            </header>
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </div>
        </div>
      </AuthGate>
    </Suspense>
  );
}
