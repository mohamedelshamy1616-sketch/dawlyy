// Stylesheets first: layers.css fixes the cascade-layer order before any Astryx or theme CSS loads.
import "../layers.css";
import "../globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AstryxProvider } from "@/components/astryx-provider";
import { Toaster } from "@/components/ui/sonner";
import { UndoToast } from "@/components/control/undo-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isLocale, locales } from "@/i18n/routing";

// Self-hosted (OFL) so neither the build nor the dev server needs the network: Inter (latin, variable) and
// IBM Plex Sans Arabic (arabic subset, weights 400 to 700), as served by Google Fonts on 24 Nov 2026.
const inter = localFont({
  src: "../fonts/Inter-Variable-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const plexArabic = localFont({
  // next/font/local reads its options at build time, so the four weights are written out.
  src: [
    { path: "../fonts/IBMPlexSansArabic-400-arabic.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-500-arabic.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-600-arabic.woff2", weight: "600", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-700-arabic.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("appName"), applicationName: t("appName") };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${inter.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* cacheComponents: next-intl reads its request config and messages at request time, so the provider and
            everything under it stream behind this boundary instead of blocking the route's prerender. */}
        <Suspense fallback={null}>
          <NextIntlClientProvider>
            <AstryxProvider locale={locale}>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
              <UndoToast />
            </AstryxProvider>
          </NextIntlClientProvider>
        </Suspense>
      </body>
    </html>
  );
}
