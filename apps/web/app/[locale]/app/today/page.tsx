import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const nav = await getTranslations("nav.client");
  const common = await getTranslations("common");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-start text-2xl font-semibold">{nav("today")}</h1>
      <Card>
        <CardContent>
          <p className="text-start text-sm text-muted-foreground">{common("noResults")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
