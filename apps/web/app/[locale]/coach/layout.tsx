import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthGate } from "@/components/app/auth-gate";
import { CoachShell } from "@/src/components/shell/coach-shell";
import { PageSkeleton } from "@/src/components/shell/page-skeleton";

export default async function CoachLayout({
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
    <CoachShell>
      <Suspense fallback={<PageSkeleton variant="dashboard" />}>
        <AuthGate roles={["owner", "staff"]} fallback="/app/today">
          {children}
        </AuthGate>
      </Suspense>
    </CoachShell>
  );
}
