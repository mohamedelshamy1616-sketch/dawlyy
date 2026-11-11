import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthGate } from "@/components/app/auth-gate";
import { ClientShell } from "@/src/components/shell/client-shell";
import { PageSkeleton } from "@/src/components/shell/page-skeleton";
import { ClientRuntimeMount } from "@/components/client-portal/runtime-mount";

export default async function ClientAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The shell holds no data, so it is sent first. Only the session check and the page wait inside Suspense.
  return (
    <ClientShell>
      <Suspense fallback={<PageSkeleton />}>
        <AuthGate roles={["client"]} fallback="/coach">
          <ClientRuntimeMount>{children}</ClientRuntimeMount>
        </AuthGate>
      </Suspense>
    </ClientShell>
  );
}
