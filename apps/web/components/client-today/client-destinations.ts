import {
  Activity, Bell, CalendarDays, ClipboardCheck, ClipboardList, Dumbbell, History, House, MessageCircle,
  ShieldCheck, TrendingUp, User, Utensils, UtensilsCrossed, WalletCards, type LucideIcon,
} from 'lucide-react';
import type { ClientModules } from '@dawlyy/core/types';

export type ClientTabKey = 'today' | 'plan' | 'coach' | 'me';
export type ClientTab = {
  key: ClientTabKey; href: string; Icon: LucideIcon;
  /** Routes that keep this tab active while open (the tab href always counts). */
  activePaths: readonly string[];
  visible: (modules: ClientModules) => boolean;
};

/** R2a: the single source of client navigation. Legacy deep links stay valid and map to a tab here. */
export const CLIENT_TABS: readonly ClientTab[] = [
  { key: 'today', href: '/app/today', Icon: House, activePaths: ['/app/workout'], visible: () => true },
  { key: 'plan', href: '/app/plan', Icon: CalendarDays, activePaths: ['/app/program', '/app/nutrition'], visible: m => m.workouts || m.nutrition },
  { key: 'coach', href: '/app/coach', Icon: MessageCircle, activePaths: ['/app/messages'], visible: m => m.messages },
  { key: 'me', href: '/app/me', Icon: User, activePaths: ['/app/progress', '/app/tracking', '/app/history', '/app/checkins', '/app/assessment', '/app/intake', '/app/subscription', '/app/notifications', '/app/consent'], visible: () => true },
];

/**
 * Tabs a client may see. Unknown settings (null) show only the two tabs that never depend on a module,
 * so a missing bootstrap can never flash a module the coach switched off.
 */
export function getClientDestinations(modules: ClientModules | null): ClientTab[] {
  if (!modules) return CLIENT_TABS.filter(tab => tab.key === 'today' || tab.key === 'me');
  return CLIENT_TABS.filter(tab => tab.visible(modules));
}

const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/** The tab that owns this pathname among the given tabs, or null (for example a hidden module's route). */
export function activeClientTab(pathname: string, tabs: readonly ClientTab[] = CLIENT_TABS): ClientTabKey | null {
  const hit = tabs.find(tab => [tab.href, ...tab.activePaths].some(path => under(pathname, path)));
  return hit?.key ?? null;
}

export type DestinationLink = { key: string; href: string; Icon: LucideIcon; enabled: (modules: ClientModules) => boolean };

/** Plan hub: published program and nutrition, each independent. */
export const PLAN_LINKS: readonly DestinationLink[] = [
  { key: 'program', href: '/app/program', Icon: Dumbbell, enabled: m => m.workouts },
  { key: 'nutrition', href: '/app/nutrition', Icon: Utensils, enabled: m => m.nutrition },
  { key: 'quickMeal', href: '/app/nutrition/log', Icon: UtensilsCrossed, enabled: m => m.nutrition },
];

/** The two tracking destinations gate their measurement and photo sections independently. */
export const ME_LINKS: readonly DestinationLink[] = [
  { key: 'progress', href: '/app/progress', Icon: TrendingUp, enabled: m => m.measurements || m.progress_photos },
  { key: 'tracking', href: '/app/tracking', Icon: Activity, enabled: m => m.measurements || m.progress_photos },
  { key: 'workoutHistory', href: '/app/history', Icon: History, enabled: m => m.workouts },
  { key: 'nutritionHistory', href: '/app/nutrition/history', Icon: Utensils, enabled: m => m.nutrition },
  { key: 'checkins', href: '/app/checkins', Icon: ClipboardCheck, enabled: m => m.checkins },
  { key: 'assessments', href: '/app/assessment', Icon: ClipboardList, enabled: m => m.checkins },
  { key: 'intake', href: '/app/intake', Icon: ClipboardList, enabled: m => m.checkins },
  { key: 'subscription', href: '/app/subscription', Icon: WalletCards, enabled: m => m.payments },
  { key: 'notifications', href: '/app/notifications', Icon: Bell, enabled: () => true },
  { key: 'consent', href: '/app/consent', Icon: ShieldCheck, enabled: () => true },
];

export const getPlanLinks = (modules: ClientModules | null) => (modules ? PLAN_LINKS.filter(l => l.enabled(modules)) : []);
export const getMeLinks = (modules: ClientModules | null) => (modules ? ME_LINKS.filter(l => l.enabled(modules)) : ME_LINKS.filter(l => l.key === 'notifications' || l.key === 'consent'));
