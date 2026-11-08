"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CLIENT_NAV, COACH_NAV, isActive, type NavArea } from "./nav-items";

type Props = {
  area: NavArea;
  /**
   * `sidebar`: vertical list (coach desktop and the mobile menu).
   * `top`: horizontal links (client desktop header).
   * `tabs`: bottom tab bar (client on mobile).
   */
  layout: "sidebar" | "top" | "tabs";
  /** Called after a link is chosen, so the mobile menu can close. */
  onNavigate?: () => void;
  className?: string;
};

export function NavLinks({ area, layout, onNavigate, className }: Props) {
  const t = useTranslations(area === "coach" ? "nav.coach" : "nav.client");
  const common = useTranslations("common");
  const pathname = usePathname();
  const items = area === "coach" ? COACH_NAV : CLIENT_NAV;

  return (
    <nav aria-label={common("mainNavigation")} className={className}>
      <ul
        className={cn(
          layout === "sidebar" && "flex flex-col gap-1",
          layout === "top" && "flex items-center gap-1",
          layout === "tabs" && "grid grid-cols-5",
        )}
      >
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.key} className="min-w-0">
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "focus-ring relative flex items-center text-sm font-medium transition-colors",
                  layout === "sidebar" &&
                    "min-h-11 gap-3 rounded-lg px-3 text-start",
                  layout === "top" && "min-h-11 gap-2 rounded-lg px-3",
                  layout === "tabs" &&
                    "min-h-16 flex-col justify-center gap-1 px-1 text-xs",
                  active
                    ? "bg-brand-soft text-brand-soft-foreground"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                  layout === "tabs" && active && "bg-transparent",
                )}
              >
                {layout === "tabs" && active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "grid shrink-0 place-items-center",
                    layout === "tabs" &&
                      "h-7 w-12 rounded-full transition-colors",
                    layout === "tabs" && active && "bg-brand-soft",
                  )}
                >
                  <item.Icon
                    className={cn("size-5", active && "text-brand")}
                    strokeWidth={active ? 2.4 : 2}
                  />
                </span>
                <span className="min-w-0 truncate">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
