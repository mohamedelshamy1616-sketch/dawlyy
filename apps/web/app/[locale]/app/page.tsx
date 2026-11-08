import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// /app has no content of its own: the client portal starts at Today.
export default async function ClientAppIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: "/app/today", locale });
}
