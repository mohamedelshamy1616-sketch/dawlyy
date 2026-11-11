import type { QueueKind, TimelineKind } from '@/src/server/dashboard/logic';

/** Task 10: JSON shapes the dashboard pages hand to client components (dates are ISO strings). */
export type CountItem = { kind: QueueKind; count: number; href: string };
export type QueueItem = { id: string; clientId: string; clientName: string | null; clientCode: string; at: string; label: string | null; href: string };
export type QueuePage = { items: QueueItem[]; nextCursor: string | null };
export type TaskItem = {
  id: string; clientId: string | null; clientName: string | null; title: string; detail: string | null; priority: 'low' | 'normal' | 'high' | 'urgent';
  state: 'open' | 'snoozed' | 'done' | 'cancelled'; dueAt: string | null; snoozedUntil: string | null; assigneeMembershipId: string | null;
  source: string; completedAt: string | null;
};
export type TaskPage = { items: TaskItem[]; nextCursor: string | null };
export type TimelineItem = { id: string; kind: TimelineKind; at: string; private: boolean; href: string; summary: Record<string, unknown> };
export type TimelinePage = { items: TimelineItem[]; nextCursor: string | null };
