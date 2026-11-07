import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthGate } from "@/components/app/auth-gate";
import { ClientTabBar } from "@/components/app/client-tab-bar";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ClientAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={<Skeleton className="m-4 h-40" />}>
      <AuthGate roles={["client"]} fallback="/coach">
        <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col">
          <main className="flex-1 px-4 pt-6 pb-24">{children}</main>
          <ClientTabBar />
        </div>
      </AuthGate>
    </Suspense>
  );
}
