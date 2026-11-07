"use client";

import { Activity, ClipboardCheck, Dumbbell, House, MessageCircle, User, Utensils } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "today", href: "/app/today", Icon: House },
  { key: "program", href: "/app/program", Icon: Dumbbell },
  { key: "nutrition", href: "/app/nutrition", Icon: Utensils },
  { key: "tracking", href: "/app/tracking", Icon: Activity },
  { key: "checkins", href: "/app/checkins", Icon: ClipboardCheck },
  { key: "messages", href: "/app/messages", Icon: MessageCircle },
  { key: "profile", href: "/app/profile", Icon: User },
] as const;

export function ClientTabBar() {
  const t = useTranslations("nav.client");
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ key, href, Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={key} className="min-w-0 flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="w-full truncate text-center">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
