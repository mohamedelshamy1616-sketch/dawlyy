import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { isAllowed, type Module } from '@dawlyy/core/authz';
import { formModule } from '../forms/read';
import type { AuthContext, Tx } from '../db';
import { ACTIVITY_ENTITY_NAMES, type ActivityEntity, type ActivityItem } from './types';

type Destination = 'client'|'notes'|'exercise'|'program'|'nutrition'|'form'|'submission'|'package'|'subscription'|'payment'|'message'|null;
type Entry = {readonly module:Module;readonly destination:Destination;readonly versionKind?:'program'|'nutrition'|'form'};
/** Fixed registry: no request value becomes a SQL identifier or route prefix. */
export const ENTITY_REGISTRY = {
  clients:{module:'clients',destination:'client'},client_notes:{module:'clients',destination:'notes'},
  exercises:{module:'exercises',destination:'exercise'},programs:{module:'programs',destination:'program'},
  program_versions:{module:'programs',destination:'program',versionKind:'program'},
  nutrition_plans:{module:'nutrition',destination:'nutrition'},nutrition_plan_versions:{module:'nutrition',destination:'nutrition',versionKind:'nutrition'},
  forms:{module:'forms',destination:'form'},form_versions:{module:'forms',destination:'form',versionKind:'form'},form_submissions:{module:'forms',destination:'submission'},
  packages:{module:'packages',destination:'package'},subscriptions:{module:'billing',destination:'subscription'},subscription_events:{module:'billing',destination:'subscription'},payments:{module:'billing',destination:'payment'},
  calendar_events:{module:'calendar',destination:null},meal_logs:{module:'nutrition',destination:null},measurement_sets:{module:'tracking',destination:null},metric_entries:{module:'tracking',destination:null},workout_sessions:{module:'clients',destination:null},
  messages:{module:'messages',destination:'message'},ai_drafts:{module:'ai',destination:null},red_flags:{module:'clients',destination:null},
} as const satisfies Record<ActivityEntity,Entry>;
export const ACTIVITY_ENTITIES=ACTIVITY_ENTITY_NAMES;
export function isActivityEntity(value:string):value is ActivityEntity{return Object.hasOwn(ENTITY_REGISTRY,value);}
export function validActivityId(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
const kinds=['intake','custom','checkin','assessment'] as const;
function formEntity(entity:string){return ['forms','form_versions','form_submissions'].includes(entity);}
export function allowedActivityEntities(auth:AuthContext):ActivityEntity[]{
  if(auth.role!=='owner'&&auth.role!=='staff')return [];
  return ACTIVITY_ENTITY_NAMES.filter(entity=>formEntity(entity)?kinds.some(kind=>isAllowed(auth,formModule(kind),'view')):entity==='ai_drafts'?isAllowed(auth,'ai','view')&&isAllowed(auth,'checkins','review'):isAllowed(auth,ENTITY_REGISTRY[entity].module,'view'));
}
/** Source permissions are SQL predicates before pagination; correlated reads retain RLS. */
export function authorizedEntityPredicate(auth:AuthContext):SQL{
  const ordinary=allowedActivityEntities(auth).filter(entity=>!formEntity(entity));const predicates:SQL[]=[];
  if(ordinary.length)predicates.push(sql`a.entity in (${sql.join(ordinary.map(entity=>sql`${entity}`),sql`, `)})`);
  const visible=kinds.filter(kind=>isAllowed(auth,formModule(kind),'view'));
  if(visible.length===kinds.length)predicates.push(sql`a.entity in ('forms','form_versions','form_submissions')`);
  else if(visible.length){const allow=sql.join(visible.map(kind=>sql`${kind}`),sql`, `);
    predicates.push(sql`(a.entity='forms' and exists(select 1 from public.forms f where f.tenant_id=${auth.tenantId}::uuid and f.id::text=lower(a.entity_id) and f.form_kind in (${allow})))`);
    predicates.push(sql`(a.entity='form_versions' and exists(select 1 from public.form_versions v join public.forms f on f.tenant_id=v.tenant_id and f.id=v.form_id where v.tenant_id=${auth.tenantId}::uuid and v.id::text=lower(a.entity_id) and f.form_kind in (${allow})))`);
    predicates.push(sql`(a.entity='form_submissions' and exists(select 1 from public.form_submissions s where s.tenant_id=${auth.tenantId}::uuid and s.id::text=lower(a.entity_id) and s.form_kind in (${allow})))`);
  }return predicates.length?sql`(${sql.join(predicates,sql` or `)})`:sql`false`;
}
export type LinkSource=Pick<ActivityItem,'id'|'entity'|'entityId'|'clientId'>;
export type ResolvedActivityLink=Pick<ActivityItem,'href'|'version'>;
type LinkRecord={entity:string;entityId:string;headId:string;clientId:string|null;formKind:string|null;versionNo:number|null};
const unavailable:ResolvedActivityLink={href:null,version:null};
export function versionDestination(kind:'program'|'nutrition'|'form',headId:string,versionNo:number):string|null{
  return ['program','nutrition','form'].includes(kind)&&validActivityId(headId)&&Number.isSafeInteger(versionNo)&&versionNo>0&&versionNo<=2147483647?`/coach/settings/activity/version/${kind}/${headId}/${versionNo}`:null;
}
/** A surviving RLS-visible record, never audit JSON, supplies each destination. */
export function activityLink(auth:AuthContext,source:LinkSource,record?:LinkRecord):ResolvedActivityLink{
  if(!record||!isActivityEntity(source.entity)||source.entity!==record.entity||!validActivityId(source.entityId)||!validActivityId(record.entityId)||source.entityId.toLowerCase()!==record.entityId.toLowerCase()||!validActivityId(record.headId))return unavailable;
  const entry:Entry=ENTITY_REGISTRY[source.entity];const entryModule=formEntity(source.entity)&&record.formKind?formModule(record.formKind):entry.module;
  if((auth.role!=='owner'&&auth.role!=='staff')||!isAllowed(auth,entryModule,'view')||(formEntity(source.entity)&&!kinds.includes(record.formKind as typeof kinds[number])))return unavailable;
  if(entry.versionKind&&record.versionNo!==null){const href=versionDestination(entry.versionKind,record.headId,record.versionNo);return href?{href,version:{kind:entry.versionKind,headId:record.headId,versionNo:record.versionNo,href,canRevert:record.formKind!=='custom'&&isAllowed(auth,entryModule,'edit')}}:unavailable;}
  const id=record.headId;let href:string|null=null;
  switch(entry.destination){
    case 'client':href=`/coach/clients/${id}`;break;
    case 'notes':if(validActivityId(record.clientId))href=`/coach/clients/${record.clientId}?tab=notes`;break;
    case 'exercise':href=`/coach/exercises/${id}`;break;
    case 'program':href=`/coach/programs/${id}`;break;
    case 'nutrition':href=`/coach/nutrition/${id}`;break;
    case 'form':if(record.formKind==='custom')break;href=`/coach/${record.formKind==='checkin'?'checkins':record.formKind==='assessment'?'assessments':'intake'}/${id}`;break;
    case 'submission':if(record.formKind==='checkin'||record.formKind==='assessment')href=`/coach/${record.formKind==='checkin'?'checkins':'assessments'}/review/${id}`;break;
    case 'package':href=`/coach/packages/${id}`;break;
    case 'subscription':if(validActivityId(record.clientId))href=`/coach/clients/${record.clientId}/subscription`;break;
    case 'payment':href=`/coach/billing/payments/${id}`;break;
    case 'message':if(validActivityId(record.clientId))href=`/coach/messages/${id}`;break;
  }return {href,version:null};
}
/** One metadata-only batch per page, with literal relations and parameterized UUID values. */
export async function resolveActivityLinks(tx:Tx,auth:AuthContext,rows:readonly LinkSource[]):Promise<Map<string,ResolvedActivityLink>>{
  const allowed=new Set(allowedActivityEntities(auth));const grouped=new Map<string,string[]>();
  for(const row of rows)if(isActivityEntity(row.entity)&&allowed.has(row.entity)&&validActivityId(row.entityId)){const group=grouped.get(row.entity)??[];group.push(row.entityId);grouped.set(row.entity,group);}
  const queries:SQL[]=[];
  const ids=(entity:string)=>{const found=grouped.get(entity);return found?.length?sql.join([...new Set(found)].map(id=>sql`${id}::uuid`),sql`, `):null;};
  const c=ids('clients');if(c)queries.push(sql`select 'clients'::text,id::text,id::text,id::text,null::text,null::int from public.clients where tenant_id=${auth.tenantId}::uuid and id in (${c})`);
  const n=ids('client_notes');if(n)queries.push(sql`select 'client_notes',n.id::text,n.id::text,n.client_id::text,null::text,null::int from public.client_notes n join public.clients c on c.tenant_id=n.tenant_id and c.id=n.client_id where n.tenant_id=${auth.tenantId}::uuid and n.id in (${n})`);
  const e=ids('exercises');if(e)queries.push(sql`select 'exercises',id::text,id::text,null::text,null::text,null::int from public.exercises where tenant_id=${auth.tenantId}::uuid and id in (${e})`);
  const p=ids('programs');if(p)queries.push(sql`select 'programs',id::text,id::text,client_id::text,null::text,null::int from public.programs where tenant_id=${auth.tenantId}::uuid and id in (${p})`);
  const pv=ids('program_versions');if(pv)queries.push(sql`select 'program_versions',v.id::text,p.id::text,p.client_id::text,null::text,v.version_no from public.program_versions v join public.programs p on p.tenant_id=v.tenant_id and p.id=v.program_id where v.tenant_id=${auth.tenantId}::uuid and v.id in (${pv})`);
  const np=ids('nutrition_plans');if(np)queries.push(sql`select 'nutrition_plans',id::text,id::text,client_id::text,null::text,null::int from public.nutrition_plans where tenant_id=${auth.tenantId}::uuid and id in (${np})`);
  const nv=ids('nutrition_plan_versions');if(nv)queries.push(sql`select 'nutrition_plan_versions',v.id::text,p.id::text,p.client_id::text,null::text,v.version_no from public.nutrition_plan_versions v join public.nutrition_plans p on p.tenant_id=v.tenant_id and p.id=v.plan_id where v.tenant_id=${auth.tenantId}::uuid and v.id in (${nv})`);
  const f=ids('forms');if(f)queries.push(sql`select 'forms',id::text,id::text,client_id::text,form_kind::text,null::int from public.forms where tenant_id=${auth.tenantId}::uuid and id in (${f})`);
  const fv=ids('form_versions');if(fv)queries.push(sql`select 'form_versions',v.id::text,f.id::text,f.client_id::text,f.form_kind::text,v.version_no from public.form_versions v join public.forms f on f.tenant_id=v.tenant_id and f.id=v.form_id where v.tenant_id=${auth.tenantId}::uuid and v.id in (${fv})`);
  const fs=ids('form_submissions');if(fs)queries.push(sql`select 'form_submissions',id::text,id::text,client_id::text,form_kind::text,null::int from public.form_submissions where tenant_id=${auth.tenantId}::uuid and id in (${fs})`);
  const pk=ids('packages');if(pk)queries.push(sql`select 'packages',id::text,id::text,null::text,null::text,null::int from public.packages where tenant_id=${auth.tenantId}::uuid and id in (${pk})`);
  const s=ids('subscriptions');if(s)queries.push(sql`select 'subscriptions',s.id::text,s.id::text,s.client_id::text,null::text,null::int from public.subscriptions s join public.clients c on c.tenant_id=s.tenant_id and c.id=s.client_id where s.tenant_id=${auth.tenantId}::uuid and s.id in (${s})`);
  const se=ids('subscription_events');if(se)queries.push(sql`select 'subscription_events',e.id::text,s.id::text,s.client_id::text,null::text,null::int from public.subscription_events e join public.subscriptions s on s.tenant_id=e.tenant_id and s.id=e.subscription_id join public.clients c on c.tenant_id=s.tenant_id and c.id=s.client_id where e.tenant_id=${auth.tenantId}::uuid and e.id in (${se})`);
  const pay=ids('payments');if(pay)queries.push(sql`select 'payments',id::text,id::text,client_id::text,null::text,null::int from public.payments where tenant_id=${auth.tenantId}::uuid and id in (${pay})`);
  const m=ids('messages');if(m)queries.push(sql`select 'messages',m.id::text,c.id::text,c.client_id::text,null::text,null::int from public.messages m join public.conversations c on c.tenant_id=m.tenant_id and c.id=m.conversation_id where m.tenant_id=${auth.tenantId}::uuid and c.kind='client' and m.id in (${m})`);
  const resolved=queries.length?Array.from(await tx.execute<LinkRecord>(sql`select * from (${sql.join(queries,sql` union all `)}) activity_links(entity,"entityId","headId","clientId","formKind","versionNo")`)):[];
  const lookup=new Map(resolved.map(record=>[`${record.entity}|${record.entityId.toLowerCase()}`,record]));
  return new Map(rows.map(row=>[row.id,activityLink(auth,row,lookup.get(`${row.entity}|${row.entityId?.toLowerCase()}`))]));
}
