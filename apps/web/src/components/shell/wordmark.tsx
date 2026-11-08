import { Dumbbell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
  /** Render as a link to the start page (which sends each role to its own area). */
  asLink?: boolean;
  /** `lg` is for the landing and loading screens. */
  size?: "md" | "lg";
  className?: string;
};

/** The DAWLYY mark and name. The name comes from `common.appName`, so it reads دوليّ in Arabic and DAWLYY in English. */
export function Wordmark({ asLink = true, size = "md", className }: Props) {
  const t = useTranslations("common");
  const large = size === "lg";

  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center bg-brand text-brand-foreground shadow-sm",
          large ? "size-14 rounded-2xl" : "size-9 rounded-xl",
        )}
      >
        <Dumbbell className={large ? "size-7" : "size-5"} />
      </span>
      <span
        className={cn(
          "font-extrabold text-foreground ltr:tracking-[0.14em]",
          large ? "text-3xl rtl:text-4xl" : "text-lg rtl:text-xl",
        )}
      >
        {t("appName")}
      </span>
    </>
  );

  const classes = cn("inline-flex min-w-0 items-center gap-2.5", className);

  if (!asLink) return <span className={classes}>{content}</span>;
  return (
    <Link href="/" className={cn(classes, "focus-ring min-h-11 rounded-lg")}>
      {content}
    </Link>
  );
}
