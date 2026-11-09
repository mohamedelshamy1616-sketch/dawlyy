import {
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Package,
  Dumbbell,
  House,
  ListChecks,
  LayoutDashboard,
  MessageCircle,
  Settings,
  TrendingUp,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export type NavArea = "coach" | "client";

export type NavItem = {
  /** Key under `nav.coach` or `nav.client` in the message files. */
  key: string;
  /** Path without the locale prefix; the locale-aware Link adds it. */
  href: string;
  Icon: LucideIcon;
  /** Active only on this exact path (the dashboard), not on every path below it. */
  exact?: boolean;
};

/** Some of these routes do not exist yet; they land on the branded "not ready yet" page. */
export const COACH_NAV: readonly NavItem[] = [
  { key: "dashboard", href: "/coach", Icon: LayoutDashboard, exact: true },
  { key: "clients", href: "/coach/clients", Icon: Users },
  { key: "programs", href: "/coach/programs", Icon: Dumbbell },
  { key: "exercises", href: "/coach/exercises", Icon: ListChecks },
  { key: "packages", href: "/coach/packages", Icon: Package },
  { key: "nutrition", href: "/coach/nutrition", Icon: Utensils },
  { key: "checkins", href: "/coach/checkins", Icon: ClipboardCheck },
  { key: "calendar", href: "/coach/calendar", Icon: CalendarDays },
  { key: "messages", href: "/coach/messages", Icon: MessageCircle },
  { key: "billing", href: "/coach/billing", Icon: CreditCard },
  { key: "settings", href: "/coach/settings", Icon: Settings },
];

export const CLIENT_NAV: readonly NavItem[] = [
  { key: "today", href: "/app/today", Icon: House },
  { key: "program", href: "/app/program", Icon: Dumbbell },
  { key: "nutrition", href: "/app/nutrition", Icon: Utensils },
  { key: "progress", href: "/app/progress", Icon: TrendingUp },
  { key: "messages", href: "/app/messages", Icon: MessageCircle },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
