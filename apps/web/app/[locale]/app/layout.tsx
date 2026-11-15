import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthGate } from "@/components/app/auth-gate";
import { ClientShell } from "@/src/components/shell/client-shell";
import { PageSkeleton } from "@/src/components/shell/page-skeleton";
import { ClientRuntimeMount } from "@/components/client-portal/runtime-mount";
import { ClientModuleProvider, ClientModuleSeed } from "@/components/client-today/client-module-provider";
import { requirePage } from "@/src/server/auth";
import { loadClientBootstrap } from "@/src/server/client-today/page-data";

/**
 * R2a: hands the resolved client modules to the provider above the shell. If the read fails the provider stays
 * in its translated loading/retry state rather than guessing all-on.
 */
async function ClientModuleBootstrap() {
  const auth = await requirePage();
  if (auth.role !== "client") return null;
  // Load inside try/catch, render outside it (react-hooks/error-boundaries).
  let loaded: Awaited<ReturnType<typeof loadClientBootstrap>> | null = null;
  try {
    loaded = await loadClientBootstrap(auth);
  } catch (error) {
    console.error("client module bootstrap failed", error instanceof Error ? error.name : "unknown");
  }
  if (!loaded) return null;
  const { userId, ...bootstrap } = loaded;
  return <ClientModuleSeed userId={userId} {...bootstrap} />;
}

export default async function ClientAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The shell holds no data, so it is sent first. The module settings, the session check and the page wait inside Suspense.
  return (
    <ClientModuleProvider>
      <ClientShell>
        <Suspense fallback={<PageSkeleton />}>
          <AuthGate roles={["client"]} fallback="/coach">
            <ClientModuleBootstrap />
            <ClientRuntimeMount>{children}</ClientRuntimeMount>
          </AuthGate>
        </Suspense>
      </ClientShell>
    </ClientModuleProvider>
  );
}