import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-xl bg-brand-soft motion-safe:animate-pulse", className)}
    />
  );
}

/**
 * A calm placeholder for page content while it streams in. It sits inside the app shell (the layout),
 * so the header and navigation stay on screen. `dashboard` shows stat tiles; `list` shows rows.
 */
export function PageSkeleton({ variant = "list" }: { variant?: "dashboard" | "list" }) {
  const t = useTranslations("common");

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-2">
        <Block className="h-8 w-40 rounded-lg" />
        <Block className="h-4 w-64 max-w-full rounded-md opacity-70" />
      </div>
      {variant === "dashboard" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Block key={i} className="h-24" />
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {Array.from({ length: variant === "dashboard" ? 2 : 4 }, (_, i) => (
          <Block key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
