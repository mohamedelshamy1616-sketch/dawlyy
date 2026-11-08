import { Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/src/components/shell/empty-state";
import { PageHeader } from "@/src/components/shell/page-header";

const STATS = ["due", "overdue", "needsReview", "waitingForClient", "waitingForCoach", "complete"] as const;

export default async function CoachDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const nav = await getTranslations("nav.coach");
  const status = await getTranslations("status");
  const t = await getTranslations("coach.dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={nav("dashboard")} subtitle={t("subtitle")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        {STATS.map((key) => (
          <Card key={key} size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground/75">{status(key)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-brand tabular-nums">0</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <EmptyState Icon={Users} title={t("emptyTitle")} description={t("emptyBody")} />
    </div>
  );
}
