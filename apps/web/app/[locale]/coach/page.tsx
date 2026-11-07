import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATS = ["due", "overdue", "needsReview", "waitingForClient", "waitingForCoach", "complete"] as const;

export default async function CoachDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const nav = await getTranslations("nav.coach");
  const status = await getTranslations("status");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-start text-2xl font-semibold">{nav("dashboard")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STATS.map((key) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{status(key)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">0</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
