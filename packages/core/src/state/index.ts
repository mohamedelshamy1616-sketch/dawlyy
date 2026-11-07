import {
  SUBSCRIPTION_STATES,
  CHECKIN_STATES,
  SESSION_STATES,
  MEDIA_REVIEW_STATES,
  PUBLISH_STATES,
  AUTOMATION_RUN_STATES,
  type SubscriptionState,
  type CheckinState,
  type SessionState,
  type MediaReviewState,
  type PublishState,
  type AutomationRunState,
} from '../types';

export type MachineName = 'subscription' | 'checkin' | 'session' | 'mediaReview' | 'publish' | 'automationRun';

export type Machine<S extends string = string, E extends string = string> = {
  name: MachineName;
  initial: S;
  states: readonly S[];
  terminal: readonly S[];
  transitions: ReadonlyArray<{ from: readonly S[]; event: E; to: S; note?: string }>;
};

function freezeMachine<S extends string, E extends string>(machine: Machine<S, E>): Machine<S, E> {
  return Object.freeze({
    ...machine,
    states: Object.freeze([...machine.states]),
    terminal: Object.freeze([...machine.terminal]),
    transitions: Object.freeze(machine.transitions.map(edge => Object.freeze({ ...edge, from: Object.freeze([...edge.from]) }))),
  });
}

/** Spec §56: domain transitions only; the caller enforces permissions and persists history. */
export const machines: Readonly<Record<MachineName, Machine>> = Object.freeze({
  subscription: freezeMachine({
    name: 'subscription',
    initial: 'pending',
    states: SUBSCRIPTION_STATES,
    terminal: ['cancelled'],
    transitions: [
      { from: ['pending'], event: 'activate', to: 'active' },
      { from: ['active'], event: 'enter_grace', to: 'grace' },
      { from: ['active', 'grace'], event: 'expire', to: 'expired' },
      { from: ['active'], event: 'pause', to: 'paused' },
      { from: ['paused'], event: 'resume', to: 'active' },
      { from: ['active', 'grace', 'paused'], event: 'cancel', to: 'cancelled' },
      { from: ['pending', 'active', 'grace', 'paused', 'expired'], event: 'suspend', to: 'suspended' },
      { from: ['suspended'], event: 'reinstate', to: 'active' },
      { from: ['expired', 'grace'], event: 'renew', to: 'active' },
    ],
  } satisfies Machine<SubscriptionState>),
  checkin: freezeMachine({
    name: 'checkin',
    initial: 'scheduled',
    states: CHECKIN_STATES,
    terminal: ['reviewed', 'skipped', 'rescheduled', 'cancelled'],
    transitions: [
      { from: ['scheduled'], event: 'become_due', to: 'due' },
      { from: ['due'], event: 'overdue', to: 'overdue' },
      { from: ['due', 'overdue'], event: 'submit', to: 'submitted' },
      { from: ['submitted'], event: 'route_to_coach', to: 'waiting_for_coach' },
      { from: ['submitted', 'waiting_for_coach'], event: 'review', to: 'reviewed' },
      { from: ['scheduled', 'due', 'overdue'], event: 'skip', to: 'skipped' },
      { from: ['scheduled', 'due', 'overdue'], event: 'reschedule', to: 'rescheduled' },
      { from: ['scheduled', 'due', 'overdue'], event: 'cancel', to: 'cancelled' },
    ],
  } satisfies Machine<CheckinState>),
  session: freezeMachine({
    name: 'session',
    initial: 'not_started',
    states: SESSION_STATES,
    terminal: ['completed', 'partially_completed', 'abandoned', 'skipped'],
    transitions: [
      { from: ['not_started'], event: 'start', to: 'active' },
      { from: ['active'], event: 'pause', to: 'paused' },
      { from: ['paused'], event: 'resume', to: 'active' },
      { from: ['active', 'paused'], event: 'complete', to: 'completed' },
      { from: ['active', 'paused'], event: 'complete_partial', to: 'partially_completed' },
      { from: ['active', 'paused'], event: 'abandon', to: 'abandoned' },
      { from: ['not_started'], event: 'skip', to: 'skipped' },
    ],
  } satisfies Machine<SessionState>),
  mediaReview: freezeMachine({
    name: 'mediaReview',
    initial: 'requested',
    states: MEDIA_REVIEW_STATES,
    terminal: ['archived'],
    transitions: [
      { from: ['requested'], event: 'upload', to: 'uploaded' },
      { from: ['uploaded'], event: 'process', to: 'processing' },
      { from: ['uploaded', 'processing'], event: 'queue', to: 'queued_for_review' },
      { from: ['queued_for_review'], event: 'approve', to: 'approved' },
      { from: ['queued_for_review'], event: 'request_resubmission', to: 'needs_resubmission' },
      { from: ['queued_for_review'], event: 'reject', to: 'rejected' },
      { from: ['needs_resubmission'], event: 'resubmit', to: 'uploaded' },
      { from: ['approved', 'rejected', 'needs_resubmission'], event: 'archive', to: 'archived' },
    ],
  } satisfies Machine<MediaReviewState>),
  publish: freezeMachine({
    name: 'publish',
    initial: 'draft',
    states: PUBLISH_STATES,
    terminal: ['archived'],
    transitions: [
      { from: ['draft'], event: 'submit_review', to: 'in_review' },
      { from: ['in_review'], event: 'approve', to: 'approved' },
      { from: ['in_review'], event: 'reject', to: 'draft' },
      { from: ['approved'], event: 'publish', to: 'published' },
      { from: ['draft'], event: 'publish', to: 'published', note: 'Solo owner shortcut, spec §40.' },
      { from: ['published'], event: 'supersede', to: 'superseded' },
      { from: ['draft', 'in_review', 'approved', 'published', 'superseded'], event: 'archive', to: 'archived' },
    ],
  } satisfies Machine<PublishState>),
  automationRun: freezeMachine({
    name: 'automationRun',
    initial: 'pending',
    states: AUTOMATION_RUN_STATES,
    terminal: ['completed', 'cancelled'],
    transitions: [
      { from: ['pending'], event: 'start', to: 'running' },
      { from: ['running'], event: 'complete', to: 'completed' },
      { from: ['running'], event: 'fail', to: 'failed' },
      { from: ['failed'], event: 'retry', to: 'retrying' },
      { from: ['retrying'], event: 'rerun', to: 'running' },
      { from: ['pending', 'running', 'failed', 'retrying'], event: 'cancel', to: 'cancelled' },
    ],
  } satisfies Machine<AutomationRunState>),
});

export type TransitionResult =
  | { ok: true; to: string }
  | { ok: false; reason: 'unknown_machine' | 'unknown_state' | 'unknown_event' | 'not_allowed' | 'terminal'; message: string };

function getMachine(name: MachineName): Machine | undefined {
  return Object.hasOwn(machines, name) ? machines[name] : undefined;
}

/** Diagnostic messages are for API callers; presentation labels live in the UI catalogs. */
export function transition(machine: MachineName, from: string, event: string): TransitionResult {
  const definition = getMachine(machine);
  if (!definition) return { ok: false, reason: 'unknown_machine', message: `Unknown machine: ${machine}.` };
  if (!definition.states.includes(from)) return { ok: false, reason: 'unknown_state', message: `Unknown state for ${machine}: ${from}.` };
  if (definition.terminal.includes(from)) return { ok: false, reason: 'terminal', message: `${machine}.${from} is terminal.` };
  if (!definition.transitions.some(edge => edge.event === event)) return { ok: false, reason: 'unknown_event', message: `Unknown event for ${machine}: ${event}.` };
  const edge = definition.transitions.find(candidate => candidate.event === event && candidate.from.includes(from));
  if (!edge) return { ok: false, reason: 'not_allowed', message: `${event} is not allowed from ${machine}.${from}.` };
  return { ok: true, to: edge.to };
}

export function canTransition(machine: MachineName, from: string, event: string): boolean {
  return transition(machine, from, event).ok;
}

/** Declaration order is stable; unknown machines/states have no available events. */
export function eventsFrom(machine: MachineName, from: string): string[] {
  const definition = getMachine(machine);
  if (!definition || !definition.states.includes(from) || definition.terminal.includes(from)) return [];
  return [...new Set(definition.transitions.filter(edge => edge.from.includes(from)).map(edge => edge.event))];
}

export function isTerminal(machine: MachineName, state: string): boolean {
  return getMachine(machine)?.terminal.includes(state) ?? false;
}
