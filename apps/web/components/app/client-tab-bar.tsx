"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { activeClientTab, getClientDestinations } from "@/components/client-today/client-destinations";
import { useClientModules, useClientUnread } from "@/components/client-today/client-module-provider";

type Props = {
  /** `tabs`: the phone bottom bar. `top`: the horizontal links in the wide-screen header. */
  layout: "tabs" | "top";
  className?: string;
};

/**
 * R2a: the one client navigation. Today, Plan, Coach and Me, filtered by the client's resolved modules.
 * Without validated settings only Today and Me show, with a translated loading or retry state.
 */
export function ClientTabBar({ layout, className }: Props) {
  const t = useTranslations("clientToday");
  const common = useTranslations("common");
  const pathname = usePathname();
  const { modules, status, refresh, numerals } = useClientModules();
  const unread = useClientUnread();
  const locale = useLocale();
  const tabs = getClientDestinations(modules);
  const current = activeClientTab(pathname, tabs);

  return (
    <nav aria-label={common("mainNavigation")} aria-busy={status === "loading"} className={className}>
      {status === "error" ? (
        <HStack role="alert" align="center" justify="between" gap={2} className="min-h-11 px-3">
          <Text className="min-w-0 break-words text-xs">{t("bootstrap.error")}</Text>
          <Button size="sm" variant="secondary" label={t("bootstrap.retry")} className="min-h-11 shrink-0" onClick={() => { void refresh(); }} />
        </HStack>
      ) : null}
      {status === "loading" ? <span className="sr-only" role="status">{t("bootstrap.loading")}</span> : null}
      <ul className={cn(layout === "top" && "flex items-center gap-1", layout === "tabs" && "grid grid-flow-col auto-cols-fr")}>
        {tabs.map(({ key, href, Icon }) => {
          const active = current === key;
          return (
            <li key={key} className="min-w-0">
              <Link
                href={href}
                prefetch={false}
                transitionTypes={current && current !== key ? [
                  tabs.findIndex(tab => tab.key === key) > tabs.findIndex(tab => tab.key === current)
                    ? "tab-forward" : "tab-back",
                ] : undefined}
                aria-description={key === "coach" && unread ? t("tabsUnread", { count: new Intl.NumberFormat(locale, { numberingSystem: numerals }).format(unread) }) : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring relative flex items-center text-sm font-medium transition-colors",
                  layout === "top" && "min-h-11 gap-2 rounded-lg px-3",
                  layout === "tabs" && "min-h-16 flex-col justify-center gap-1 px-1 text-xs",
                  active ? "bg-brand-soft text-brand-soft-foreground" : "text-foreground/75 hover:bg-muted hover:text-foreground",
                  layout === "tabs" && active && "bg-transparent",
                )}
              >
                <span aria-hidden className={cn("grid shrink-0 place-items-center", layout === "tabs" && "h-7 w-12 rounded-full transition-colors", layout === "tabs" && active && "bg-brand-soft")}>
                  <Icon className={cn("size-5", active && "text-brand")} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="min-w-0 break-words text-center">{t(`tabs.${key}`)}{key === "coach" && unread !== undefined && unread > 0 ? (
                  <span className="ms-1 rounded-full bg-brand px-1.5 text-brand-foreground" aria-hidden>{new Intl.NumberFormat(locale, { numberingSystem: numerals }).format(unread)}</span>
                ) : null}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
