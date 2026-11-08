import { Hammer } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { Wordmark } from "./wordmark";

const TARGETS = {
  coach: { href: "/coach", label: "backCoach" },
  client: { href: "/app/today", label: "backClient" },
  root: { href: "/", label: "backHome" },
} as const;

/**
 * Shown for any URL that has no page yet (many navigation links point at screens still to be built) and for
 * real 404s. Inside the coach or client area it renders in the content slot, so the shell stays visible.
 */
export function NotFoundState({ area }: { area: keyof typeof TARGETS }) {
  const t = useTranslations("notFound");
  const target = TARGETS[area];

  const state = (
    <EmptyState
      Icon={Hammer}
      title={t("title")}
      description={t("body")}
      action={
        <Link
          href={target.href}
          className={cn(buttonVariants({ size: "lg" }), "focus-ring min-h-11 px-5")}
        >
          {t(target.label)}
        </Link>
      }
    />
  );

  if (area !== "root") return state;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-8 overflow-x-clip px-4 py-10"
    >
      <Wordmark />
      {state}
    </main>
  );
}
