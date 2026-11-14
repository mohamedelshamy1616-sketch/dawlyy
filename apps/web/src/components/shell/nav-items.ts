import {
  Bell, BookOpen, CalendarDays, ClipboardCheck, CreditCard, Dumbbell, House,
  Inbox, ListChecks, MessageCircle, Settings, TrendingUp, UserPlus, Users, Utensils,
  type LucideIcon,
} from 'lucide-react';

export type NavArea = 'coach' | 'client';
export type NavItem = { key: string; href: string; Icon: LucideIcon; exact?: boolean; activePaths?: readonly string[] };

/** R1b: the same four destinations drive the coach rail and phone bottom bar. */
export const COACH_NAV: readonly NavItem[] = [
  { key: 'inbox', href: '/coach', Icon: Inbox, exact: true },
  { key: 'clients', href: '/coach/clients', Icon: Users },
  { key: 'library', href: '/coach/library', Icon: BookOpen, activePaths: ['/coach/programs', '/coach/exercises', '/coach/foods', '/coach/nutrition', '/coach/packages'] },
  { key: 'money', href: '/coach/money', Icon: CreditCard, activePaths: ['/coach/billing'] },
];

/** R1b: secondary tools and every static settings page remain reachable in the profile menu. */
export const COACH_PROFILE_NAV: readonly NavItem[] = [
  { key: 'settings', href: '/coach/settings', Icon: Settings, exact: true },
  { key: 'calendar', href: '/coach/calendar', Icon: CalendarDays },
  { key: 'team', href: '/coach/settings/team', Icon: Users },
  { key: 'notifications', href: '/coach/notifications', Icon: Bell },
  { key: 'tasks', href: '/coach/tasks', Icon: ListChecks },
  { key: 'assessments', href: '/coach/assessments', Icon: ClipboardCheck },
  { key: 'intake', href: '/coach/intake', Icon: ClipboardCheck },
  { key: 'checkins', href: '/coach/checkins', Icon: ClipboardCheck },
  { key: 'messages', href: '/coach/messages', Icon: MessageCircle },
  { key: 'newClient', href: '/coach/clients/new', Icon: UserPlus },
  { key: 'business', href: '/coach/settings/business', Icon: Settings },
  { key: 'branding', href: '/coach/settings/branding', Icon: Settings },
  { key: 'language', href: '/coach/settings/language', Icon: Settings },
  { key: 'legal', href: '/coach/settings/legal', Icon: Settings },
];

export const CLIENT_NAV: readonly NavItem[] = [
  { key: 'today', href: '/app/today', Icon: House },
  { key: 'program', href: '/app/program', Icon: Dumbbell },
  { key: 'nutrition', href: '/app/nutrition', Icon: Utensils },
  { key: 'progress', href: '/app/progress', Icon: TrendingUp },
  { key: 'messages', href: '/app/messages', Icon: MessageCircle },
];

/** R1b: a hub stays active while its tools are open, with exact matching for Inbox. */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.activePaths ?? [])].some(path => pathname === path || pathname.startsWith(`${path}/`));
}
