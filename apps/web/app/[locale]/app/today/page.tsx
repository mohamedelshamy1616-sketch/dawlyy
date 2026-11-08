import { CalendarCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/src/components/shell/empty-state";
import { PageHeader } from "@/src/components/shell/page-header";

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const nav = await getTranslations("nav.client");
  const t = await getTranslations("client.today");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={nav("today")} subtitle={t("subtitle")} />
      <EmptyState Icon={CalendarCheck} title={t("emptyTitle")} description={t("emptyBody")} />
    </div>
  );
}
