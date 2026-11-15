import { describe, expect, it } from 'vitest';
import ar from '../../../messages/ar/activity.json';
import en from '../../../messages/en/activity.json';
import { actionKey, actorLabel, activityTimestamp, activityUrl, appendActivity, beginActivity, failActivity, settleActivity, versionNumber, revertBody } from './presentation';
import type { ActivityItem } from './types';
const item = (id: string): ActivityItem => ({ id, createdAt: '2026-11-14T23:30:00.123456Z', clientId: null, actor: { userId: null, displayName: null, role: null }, action: 'update', entity: 'clients', entityId: null, href: null, version: null });
describe('activity localized presentation', () => {
  it('matches Arabic/English keys and distinguishes recovery and approval actions', () => {
    const paths = (value: object, prefix = ''): string[] => Object.entries(value).flatMap(([key, child]) => typeof child === 'object' && child ? paths(child, `${prefix}${key}.`) : [`${prefix}${key}`]);
    expect(paths(ar).sort()).toEqual(paths(en).sort());
    expect(new Set(['archive', 'restore', 'void', 'correct', 'approve'].map(actionKey)).size).toBe(5);
    expect(actionKey('ai.approved')).toBe('approve'); expect(actionKey('program.unarchive')).toBe('restore');
    for (const value of ['__proto__', 'constructor', 'toString', '<script>untrusted</script>']) expect(actionKey(value)).toBe('update'); expect(actionKey('totally_unknown.archive')).toBe('update');
  });
  it('uses safe visible actor names and localized role/system fallbacks', () => {
    const labels: Record<string,string> = { systemActor: ar.systemActor, 'roles.staff': ar.roles.staff, 'roles.owner': ar.roles.owner, 'roles.client': ar.roles.client, 'roles.unknown': ar.roles.unknown };
    const t = (key: string) => labels[key]!;
    expect(actorLabel({ userId: null, displayName: null, role: null }, t)).toBe(ar.systemActor);
    expect(actorLabel({ userId: null, displayName: null, role: 'service' }, t)).toBe(ar.systemActor);
    expect(actorLabel({ userId: null, displayName: null, role: 'system' }, t)).toBe(ar.systemActor);
    expect(actorLabel({ userId: 'id', displayName: null, role: 'staff' }, t)).toBe(ar.roles.staff);
    expect(actorLabel({ userId: 'id', displayName: 'A long actor name', role: 'owner' }, t)).toBe('A long actor name');
    expect(actorLabel({ userId: 'id', displayName: null, role: 'untrusted' }, t)).toBe(ar.roles.unknown);
  });
  it('uses tenant timezone and explicit Western default or preferred Arabic numerals', () => {
    const at='2026-11-14T23:30:00.123456Z'; const opts={ locale:'ar' as const, timezone:'Africa/Cairo', preferences:{} };
    expect(activityTimestamp(at,opts)).toContain('15'); expect(activityTimestamp(at,opts)).not.toMatch(/[\u0660-\u0669]/);
    expect(activityTimestamp(at,{...opts,preferences:{numerals:'arab'}})).toMatch(/[\u0660-\u0669]/);
    expect(activityTimestamp(at,{...opts,timezone:'UTC'})).toContain('14');
    expect(versionNumber(12,opts)).toBe('12'); expect(versionNumber(12,{...opts,preferences:{numerals:'arab'}})).toBe('\u0661\u0662');
    expect(activityTimestamp('bad-date',opts)).toBe(null);
  });
  it('builds GET filter URLs without stale cursors', () => {
    expect(activityUrl({clientId:'client',entity:'clients'})).toBe('/api/v1/activity?limit=50&clientId=client&entity=clients');
    expect(activityUrl({cursor:'opaque+/'})).toContain('cursor=opaque%2B%2F'); expect(activityUrl({entity:''})).not.toContain('entity=');
  });
});
describe('activity request state', () => {
  it('deduplicates appended IDs preserving order', () => {
    expect(appendActivity([item('3'),item('2')],[item('2'),item('1')]).map(row=>row.id)).toEqual(['3','2','1']);
  });
  it('clears rows and cursor on filter/client changes and ignores stale responses', () => {
    const first=settleActivity(beginActivity(undefined,'client-a|',false),'client-a|',{items:[item('1')],nextCursor:'old'});
    const second=beginActivity(first,'client-a|clients',false); expect(second.items).toEqual([]); expect(second.nextCursor).toBe(null);
    expect(settleActivity(second,'client-a|',{items:[item('bad')],nextCursor:'old'})).toBe(second);
    expect(beginActivity(first,'client-b|',false).items).toEqual([]);
  });
  it('retains rows and failed cursor for explicit pagination Retry', () => {
    const first=settleActivity(beginActivity(undefined,'|',false),'|',{items:[item('1')],nextCursor:'retry-me'});
    const failed=failActivity(beginActivity(first,'|',true),'|','requestFailed');
    expect(failed.items.map(row=>row.id)).toEqual(['1']); expect(failed.nextCursor).toBe('retry-me'); expect(failed.loading).toBe(false); expect(failed.append).toBe(true);
    expect(failActivity(failed,'old-scope','forbidden')).toBe(failed);
  });
});
describe('existing revert payload schemas', () => {
  it('uses strict existing payloads and kind-specific change-note caps', () => {
    expect(revertBody('program',2,' reason ')).toEqual({toVersionNo:2,changeNote:'reason'});
    expect(revertBody('form',2,'x'.repeat(2000))).toBeTruthy(); expect(revertBody('form',2,'x'.repeat(2001))).toBe(null);
    expect(revertBody('program',0,'')).toBe(null); expect(revertBody('nutrition',2,'x'.repeat(4000))).toBeTruthy(); expect(revertBody('nutrition',2,'x'.repeat(4001))).toBe(null);
  });
});
