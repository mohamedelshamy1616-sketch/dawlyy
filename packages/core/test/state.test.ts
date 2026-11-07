import { describe, it, expect } from 'vitest';
import { machines, transition, canTransition, eventsFrom, isTerminal, type MachineName } from '../src/state';
import { SUBSCRIPTION_STATES, CHECKIN_STATES, SESSION_STATES, MEDIA_REVIEW_STATES, PUBLISH_STATES, AUTOMATION_RUN_STATES } from '../src/types';

const names: MachineName[] = ['subscription', 'checkin', 'session', 'mediaReview', 'publish', 'automationRun'];

describe('machine tables', () => {
  it('uses the exact shared state vocabularies', () => {
    expect(machines.subscription.states).toEqual(SUBSCRIPTION_STATES);
    expect(machines.checkin.states).toEqual(CHECKIN_STATES);
    expect(machines.session.states).toEqual(SESSION_STATES);
    expect(machines.mediaReview.states).toEqual(MEDIA_REVIEW_STATES);
    expect(machines.publish.states).toEqual(PUBLISH_STATES);
    expect(machines.automationRun.states).toEqual(AUTOMATION_RUN_STATES);
  });

  it.each(names)('%s has valid endpoints, reachable states, and terminal states without outgoing transitions', name => {
    const machine = machines[name];
    expect(machine.name).toBe(name);
    expect(machine.states).toContain(machine.initial);
    for (const state of machine.terminal) expect(machine.states).toContain(state);
    const seen = new Set([machine.initial]);
    const queue = [machine.initial];
    while (queue.length > 0) {
      const from = queue.shift()!;
      for (const edge of machine.transitions.filter(t => t.from.includes(from))) {
        if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
      }
    }
    expect([...seen].sort()).toEqual([...machine.states].sort());
    const pairs = new Set<string>();
    for (const edge of machine.transitions) {
      expect(machine.states).toContain(edge.to);
      for (const from of edge.from) {
        expect(machine.states).toContain(from);
        expect(machine.terminal).not.toContain(from);
        const pair = `${from}:${edge.event}`;
        expect(pairs.has(pair)).toBe(false);
        pairs.add(pair);
        expect(transition(name, from, edge.event)).toEqual({ ok: true, to: edge.to });
        expect(canTransition(name, from, edge.event)).toBe(true);
      }
    }
    for (const terminal of machine.terminal) {
      expect(eventsFrom(name, terminal)).toEqual([]);
      expect(isTerminal(name, terminal)).toBe(true);
      for (const edge of machine.transitions) {
        expect(transition(name, terminal, edge.event)).toMatchObject({ ok: false, reason: 'terminal' });
      }
    }
  });

  it('exposes immutable transition tables', () => {
    expect(Object.isFrozen(machines)).toBe(true);
    for (const name of names) {
      const machine = machines[name];
      expect(Object.isFrozen(machine)).toBe(true);
      expect(Object.isFrozen(machine.states)).toBe(true);
      expect(Object.isFrozen(machine.terminal)).toBe(true);
      expect(Object.isFrozen(machine.transitions)).toBe(true);
      for (const edge of machine.transitions) {
        expect(Object.isFrozen(edge)).toBe(true);
        expect(Object.isFrozen(edge.from)).toBe(true);
      }
    }
  });
});

describe('transition paths', () => {
  const paths: Array<{ name: MachineName; events: string[]; states: string[] }> = [
    { name: 'subscription', events: ['activate', 'pause', 'resume', 'enter_grace', 'expire', 'renew', 'suspend', 'reinstate', 'cancel'], states: ['active', 'paused', 'active', 'grace', 'expired', 'active', 'suspended', 'active', 'cancelled'] },
    { name: 'checkin', events: ['become_due', 'overdue', 'submit', 'route_to_coach', 'review'], states: ['due', 'overdue', 'submitted', 'waiting_for_coach', 'reviewed'] },
    { name: 'session', events: ['start', 'pause', 'resume', 'complete_partial'], states: ['active', 'paused', 'active', 'partially_completed'] },
    { name: 'mediaReview', events: ['upload', 'process', 'queue', 'request_resubmission', 'resubmit', 'queue', 'approve', 'archive'], states: ['uploaded', 'processing', 'queued_for_review', 'needs_resubmission', 'uploaded', 'queued_for_review', 'approved', 'archived'] },
    { name: 'publish', events: ['submit_review', 'reject', 'submit_review', 'approve', 'publish', 'supersede', 'archive'], states: ['in_review', 'draft', 'in_review', 'approved', 'published', 'superseded', 'archived'] },
    { name: 'automationRun', events: ['start', 'fail', 'retry', 'rerun', 'complete'], states: ['running', 'failed', 'retrying', 'running', 'completed'] },
  ];
  it.each(paths)('follows the $name lifecycle', ({ name, events, states }) => {
    let current = machines[name].initial;
    events.forEach((event, i) => {
      const result = transition(name, current, event);
      expect(result).toEqual({ ok: true, to: states[i] });
      if (result.ok) current = result.to;
    });
  });

  it('allows the solo owner publish shortcut and documents its intent', () => {
    expect(transition('publish', 'draft', 'publish')).toEqual({ ok: true, to: 'published' });
    expect(machines.publish.transitions.find(t => t.from.includes('draft') && t.event === 'publish')?.note).toContain('§40');
  });
});

describe('transition helpers', () => {
  it('prioritizes terminal rejection, including an unrecognized event on a terminal state', () => {
    expect(transition('subscription', 'cancelled', 'activate')).toMatchObject({ ok: false, reason: 'terminal' });
    expect(transition('subscription', 'cancelled', 'unknown')).toMatchObject({ ok: false, reason: 'terminal' });
    expect(canTransition('subscription', 'cancelled', 'activate')).toBe(false);
  });

  it('distinguishes unknown machines, unknown states, unknown events and disallowed known events', () => {
    for (const machine of ['missing', 'toString', '__proto__']) {
      expect(transition(machine as MachineName, 'active', 'pause')).toMatchObject({ ok: false, reason: 'unknown_machine' });
      expect(eventsFrom(machine as MachineName, 'active')).toEqual([]);
      expect(isTerminal(machine as MachineName, 'active')).toBe(false);
    }
    expect(transition('subscription', 'missing', 'pause')).toMatchObject({ ok: false, reason: 'unknown_state' });
    expect(transition('subscription', 'active', 'missing')).toMatchObject({ ok: false, reason: 'unknown_event' });
    expect(transition('subscription', 'pending', 'pause')).toMatchObject({ ok: false, reason: 'not_allowed' });
    expect(eventsFrom('subscription', 'missing')).toEqual([]);
    expect(isTerminal('subscription', 'missing')).toBe(false);
    expect(isTerminal('subscription', 'active')).toBe(false);
    const failure = transition('session', 'not_started', 'complete');
    if (!failure.ok) expect(failure.message.length).toBeGreaterThan(0);
  });

  it('returns available events in declaration order and a fresh result each call', () => {
    const events = eventsFrom('checkin', 'due');
    expect(events).toEqual(['overdue', 'submit', 'skip', 'reschedule', 'cancel']);
    events.reverse();
    expect(eventsFrom('checkin', 'due')).toEqual(['overdue', 'submit', 'skip', 'reschedule', 'cancel']);
  });
});
