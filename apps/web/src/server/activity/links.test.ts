import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AuthContext, Tx } from '../db';
import { ACTIVITY_ENTITIES, ENTITY_REGISTRY, activityLink, allowedActivityEntities, authorizedEntityPredicate, isActivityEntity, resolveActivityLinks, validActivityId, versionDestination, type LinkSource } from './links';
const tenantId='61c775ae-740d-4b8b-9aa3-f5d5be344fc0',sourceId='3c8d530f-f8d0-462a-8a41-e438e67743ca',headId='4b17a071-8cce-4487-a7c3-cc8b09bb6d7b',clientId='871dc208-6b5e-405a-8462-5ee412ebcd03';
const owner={tenantId,userId:sourceId,role:'owner',membershipId:headId,permissions:null} as AuthContext;
const staff=(modules:Record<string,string[]>)=>({...owner,role:'staff',permissions:{client_scope:'assigned',modules}}) as AuthContext;
const source=(entity='program_versions',id='9007199254740993'):LinkSource=>({id,entity,entityId:sourceId,clientId});
const record=(entity='program_versions',formKind:string|null=null)=>({entity,entityId:sourceId,headId,clientId,formKind,versionNo:7});

describe('fixed activity entity registry',()=>{
  it('registers supported producers and fails closed for unknown entities',()=>{
    expect(Object.keys(ENTITY_REGISTRY)).toEqual([...ACTIVITY_ENTITIES]);
    for(const entity of ['clients','exercises','program_versions','nutrition_plan_versions','form_versions','form_submissions','packages','subscription_events','payments','calendar_events','meal_logs','measurement_sets','metric_entries','workout_sessions','messages','ai_drafts','red_flags'])expect(isActivityEntity(entity)).toBe(true);
    for(const entity of ['users','audit_log','__proto__','client_flags','ai_requests','tenants'])expect(isActivityEntity(entity)).toBe(false);
  });
  it('requires matching source view grants and additional AI checkins review',()=>{
    const visible=allowedActivityEntities(staff({clients:['view'],programs:['view'],ai:['view']}));
    expect(visible).toContain('program_versions');expect(visible).toContain('red_flags');expect(visible).toContain('workout_sessions');expect(visible).not.toContain('nutrition_plans');expect(visible).not.toContain('ai_drafts');
    expect(allowedActivityEntities(staff({clients:['view'],ai:['view'],checkins:['review']}))).toContain('ai_drafts');expect(allowedActivityEntities({...owner,role:'client'} as AuthContext)).toEqual([]);
  });
  it('filters actual formKind before LIMIT without granting assessments through forms',()=>{
    const query=new PgDialect().sqlToQuery(authorizedEntityPredicate(staff({clients:['view'],forms:['view']})));
    expect(query.sql).toContain('public.form_versions');expect(query.sql).toContain('public.form_submissions');expect(query.sql).toContain('f.form_kind');expect(query.sql).toContain('a.entity_id');
    expect(query.params).toContain('intake');expect(query.params).toContain('custom');expect(query.params).not.toContain('checkin');expect(query.params).not.toContain('assessment');
  });
  it('keeps orphan form history when all possible source modules are authorized',()=>{
    const query=new PgDialect().sqlToQuery(authorizedEntityPredicate(owner));expect(query.sql).toContain("a.entity in ('forms','form_versions','form_submissions')");expect(query.sql).not.toContain('public.form_versions');
  });
});

describe('allowlisted internal destinations',()=>{
  it('resolves validated uppercase audit UUID text to the real canonical record',()=>{
    const auditSource={...source(),entityId:sourceId.toUpperCase()};
    expect(activityLink(owner,auditSource,record()).version).toMatchObject({headId,versionNo:7});
  });
  it('rejects unsafe text IDs and browser/audit JSON hrefs',()=>{
    for(const id of ['javascript:alert(1)','https://other.invalid','../settings',sourceId+'/x',JSON.stringify({href:'/coach/programs/'+headId}),'<svg onload=alert(1)>']){
      expect(validActivityId(id)).toBe(false);expect(versionDestination('program',id,1)).toBeNull();expect(activityLink(owner,{...source(),entityId:id},{...record(),entityId:id})).toEqual({href:null,version:null});
    }expect(versionDestination('program',headId,0)).toBeNull();expect(versionDestination('program',headId,1.1)).toBeNull();expect(versionDestination('form',headId,2147483648)).toBeNull();
  });
  it.each(['program','nutrition','form'] as const)('builds exact immutable %s version route',kind=>expect(versionDestination(kind,headId,7)).toBe(`/coach/settings/activity/version/${kind}/${headId}/7`));
  it('requires source edit for revert; audit visibility or publish alone do not grant it',()=>{
    expect(activityLink(staff({clients:['view'],programs:['view','publish']}),source(),record()).version?.canRevert).toBe(false);expect(activityLink(staff({clients:['view'],programs:['view','edit']}),source(),record()).version?.canRevert).toBe(true);expect(activityLink(staff({clients:['view']}),source(),record())).toEqual({href:null,version:null});
  });
  it('authorizes forms by stored checkins/assessments module',()=>{
    const form=source('form_versions');expect(activityLink(staff({forms:['view','edit']}),form,record('form_versions','checkin')).version).toBeNull();expect(activityLink(staff({checkins:['view']}),form,record('form_versions','checkin')).version?.canRevert).toBe(false);expect(activityLink(staff({assessments:['view','edit']}),form,record('form_versions','assessment')).version?.canRevert).toBe(true);expect(activityLink(owner,form,record('form_versions','untrusted')).href).toBeNull();
  });
  it('uses real kind-specific builders and review routes',()=>{
    for(const [kind,path] of [['intake','intake'],['checkin','checkins'],['assessment','assessments']])expect(activityLink(owner,source('forms'),{...record('forms',kind),versionNo:null}).href).toBe(`/coach/${path}/${headId}`);
    expect(activityLink(owner,source('form_submissions'),record('form_submissions','intake')).href).toBeNull();expect(activityLink(owner,source('form_submissions'),record('form_submissions','checkin')).href).toBe(`/coach/checkins/review/${headId}`);
  });
  it('supports custom immutable preview while refusing a nonexistent custom builder or revert destination',()=>{
    expect(activityLink(staff({forms:['view','edit']}),source('form_versions'),record('form_versions','custom')).version).toMatchObject({kind:'form',canRevert:false});expect(activityLink(owner,source('forms'),record('forms','custom')).href).toBeNull();
  });
  it('retains internal-message history without inventing a client-thread destination',()=>{
    expect(activityLink(owner,source('messages'),{...record('messages'),clientId:null})).toEqual({href:null,version:null});
    expect(activityLink(owner,source('messages'),record('messages')).href).toBe(`/coach/messages/${headId}`);
  });
  it('keeps missing records and sources lacking item routes without invented links',()=>{
    expect(activityLink(owner,source())).toEqual({href:null,version:null});for(const entity of ['calendar_events','meal_logs','measurement_sets','metric_entries','workout_sessions','ai_drafts','red_flags'])expect(activityLink(owner,source(entity),record(entity))).toEqual({href:null,version:null});
  });
});

describe('RLS-visible set-based resolution',()=>{
  it('matches canonical database UUIDs to uppercase persisted audit IDs in a batch',async()=>{
    const execute=vi.fn().mockResolvedValue([record()]);
    const auditSource={...source(),entityId:sourceId.toUpperCase()};
    const result=await resolveActivityLinks({execute} as unknown as Tx,owner,[auditSource]);
    expect(result.get(auditSource.id)?.version).toMatchObject({kind:'program',headId,versionNo:7});
  });
  it('compares form audit UUID text case-insensitively before pagination without unsafe casts',()=>{
    const query=new PgDialect().sqlToQuery(authorizedEntityPredicate(staff({clients:['view'],checkins:['view']})));
    expect(query.sql).toContain('f.id::text=lower(a.entity_id)');
    expect(query.sql).toContain('v.id::text=lower(a.entity_id)');
    expect(query.sql).toContain('s.id::text=lower(a.entity_id)');
    expect(query.sql).not.toContain('a.entity_id::uuid');
  });
  it('resolves all three actual version table IDs in one safe metadata batch',async()=>{
    const execute=vi.fn().mockResolvedValue([record(),record('nutrition_plan_versions'),record('form_versions','assessment')]);const rows=[source(),source('nutrition_plan_versions','2'),source('form_versions','3')];const result=await resolveActivityLinks({execute} as unknown as Tx,owner,rows);
    expect(execute).toHaveBeenCalledTimes(1);const query=new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);for(const table of ['public.program_versions','public.nutrition_plan_versions','public.form_versions'])expect(query.sql).toContain(table);
    expect(query.sql).toContain('union all');expect(query.sql).toContain('activity_links(entity,');expect(query.sql).not.toMatch(/\bdocument\b|\bbefore\b|\bafter\b|\bbody\b|\breason\b/);expect(query.params).toContain(sourceId);expect(query.params).toContain(tenantId);
    expect(result.get(rows[0]!.id)?.version?.kind).toBe('program');expect(result.get('2')?.version?.kind).toBe('nutrition');expect(result.get('3')?.version?.kind).toBe('form');
  });
  it('resolves message destinations only through supported client conversations',async()=>{
    const execute=vi.fn().mockResolvedValue([]);const row={...source('messages'),clientId:null};
    const result=await resolveActivityLinks({execute} as unknown as Tx,owner,[row]);
    expect(result.get(row.id)).toEqual({href:null,version:null});
    const query=new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain("c.kind='client'");expect(query.sql).toContain('public.conversations');
  });
  it('omits actions for deleted/inaccessible RLS version or head',async()=>{
    const execute=vi.fn().mockResolvedValue([]);expect((await resolveActivityLinks({execute} as unknown as Tx,owner,[source()])).get(source().id)).toEqual({href:null,version:null});
  });
  it('deduplicates IDs and never queries unsafe IDs, unknown entities, or denied modules',async()=>{
    const execute=vi.fn().mockResolvedValue([]),tx={execute} as unknown as Tx;await resolveActivityLinks(tx,staff({clients:['view']}),[source(),{...source('clients'),entityId:'unsafe'},source('unknown')]);expect(execute).not.toHaveBeenCalled();await resolveActivityLinks(tx,owner,[source(),source('program_versions','duplicate')]);expect(execute).toHaveBeenCalledTimes(1);const query=new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);expect(query.params.filter(value=>value===sourceId)).toHaveLength(1);expect(query.sql).not.toMatch(/\b(update|delete|insert)\b/i);
  });
});
