import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture as buildGraph, mkClient, mkMembership, mkPackage, mkSubscription, mkPayment, mkVersion } from './factories';
import { as, svc, q, one, expectCode, expectPrivilege, expectNoEffect, serviceRowWhere } from './helpers';
import { TABLE_GRANTS, makeRow, insertRow, keyWhere, type MatrixTable } from './matrix';

let activeGraph: Fixture | undefined;
async function buildPrivateFixture(): Promise<Fixture> { activeGraph = await buildGraph(); return activeGraph; }
beforeAll(async () => {
  if(!process.env.DATABASE_URL||!process.env.DATABASE_URL_SERVICE)throw new Error('Suite N requires DATABASE_URL and DATABASE_URL_SERVICE; security tests never skip.');
  await buildFixture();
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
type FK = { table: MatrixTable; name: string; columns: string[]; parent: MatrixTable; targets: string[]; action: string; clear: string[] };
const foreignKeys: FK[] = [];
function fk(table: MatrixTable, name: string, columns: string, parent: MatrixTable, targets: string, action = 'c', clear = ''): void {
  foreignKeys.push({ table, name, columns: columns.split(','), parent, targets: targets.split(','), action, clear: clear ? clear.split(',') : [] });
}
// §8.2, entered by hand. Retained tenant keys are explicit below, not discovered from migrations/catalog.
fk('memberships','memberships_client_fk','tenant_id,client_id','clients','tenant_id,id');
fk('staff_client_assignments','sca_membership_fk','tenant_id,membership_id','memberships','tenant_id,id');
fk('staff_client_assignments','sca_client_fk','tenant_id,client_id','clients','tenant_id,id');
for (const table of ['invitations','client_notes','client_flags','subscriptions','payments','programs','nutrition_plans','meal_logs','supplement_logs','forms','form_submissions','calendar_events','metric_entries','measurement_sets','progress_photo_sets','inbody_records','workout_sessions','conversations','notifications','tasks','media','ai_requests'] as const) fk(table,`${table}_client_fk`,'tenant_id,client_id','clients','tenant_id,id');
fk('subscriptions','subscriptions_package_fk','tenant_id,package_id','packages','tenant_id,id','a');
fk('subscription_events','sub_events_subscription_fk','tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id');
fk('client_entitlement_overrides','ceo_client_fk','tenant_id,client_id','clients','tenant_id,id');
fk('client_entitlement_overrides','ceo_subscription_fk','tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id');
fk('payments','payments_subscription_fk','tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id','a');
fk('payments','payments_proof_media_fk','tenant_id,client_id,proof_media_id','media','tenant_id,client_id,id','a');
fk('exercises','exercises_thumbnail_fk','tenant_id,thumbnail_media_id','media','tenant_id,id','a');
fk('exercises','exercises_based_on_fk','based_on_id','exercises','id','n'); fk('foods','foods_based_on_fk','based_on_id','foods','id','n');
for (const [head,versions,column] of [['programs','program_versions','program_id'],['nutrition_plans','nutrition_plan_versions','plan_id'],['forms','form_versions','form_id']] as const) {
  fk(head,`${head}_template_fk`,'tenant_id,template_id',head,'tenant_id,id','a');
  if (head !== 'forms') fk(head,`${head}_subscription_fk`,'tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id','a');
  fk(head,`${head}_current_version_fk`,'current_version_id,id',versions,`id,${column}`,'n','current_version_id');
  fk(versions,`${versions}_${head === 'programs' ? 'program' : head === 'forms' ? 'form' : 'plan'}_fk`,`tenant_id,${column}`,head,'tenant_id,id');
}
fk('meal_logs','meal_logs_plan_version_fk','tenant_id,client_id,plan_version_id','nutrition_plan_versions','tenant_id,client_id,id','a');
fk('supplement_logs','supplement_logs_plan_version_fk','tenant_id,client_id,plan_version_id','nutrition_plan_versions','tenant_id,client_id,id','a');
fk('form_submissions','form_submissions_version_fk','tenant_id,form_version_id','form_versions','tenant_id,id','a');
fk('form_submissions','form_submissions_event_fk','tenant_id,client_id,calendar_event_id','calendar_events','tenant_id,client_id,id','a');
fk('form_submissions','form_submissions_subscription_fk','tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id','a');
fk('calendar_events','calendar_events_subscription_fk','tenant_id,client_id,subscription_id','subscriptions','tenant_id,client_id,id');
fk('calendar_events','calendar_events_rescheduled_fk','tenant_id,client_id,rescheduled_from','calendar_events','tenant_id,client_id,id','a');
fk('metric_entries','metric_entries_correction_fk','tenant_id,client_id,correction_of','metric_entries','tenant_id,client_id,id','a');
fk('inbody_records','inbody_records_media_fk','tenant_id,client_id,raw_media_id','media','tenant_id,client_id,id','a');
fk('workout_sessions','workout_sessions_program_fk','tenant_id,client_id,program_id','programs','tenant_id,client_id,id','a');
fk('workout_sessions','workout_sessions_version_fk','tenant_id,client_id,program_id,program_version_id','program_versions','tenant_id,client_id,program_id,id','a');
fk('set_logs','set_logs_session_fk','tenant_id,client_id,session_id','workout_sessions','tenant_id,client_id,id');
fk('set_logs','set_logs_exercise_fk','exercise_id','exercises','id','a'); fk('set_logs','set_logs_substituted_fk','substituted_for','exercises','id','a');
fk('messages','messages_conversation_fk','tenant_id,conversation_id','conversations','tenant_id,id');
fk('messages','messages_reply_fk','tenant_id,conversation_id,reply_to_id','messages','tenant_id,conversation_id,id','a');
fk('message_revisions','message_revisions_message_fk','tenant_id,message_id','messages','tenant_id,id');
fk('notification_deliveries','notification_deliveries_notification_fk','tenant_id,notification_id','notifications','tenant_id,id');
fk('tasks','tasks_assignee_fk','tenant_id,assignee_membership_id','memberships','tenant_id,id','a');
const tenantTables: MatrixTable[] = ['memberships','staff_client_assignments','invitations','business_settings','user_preferences','consents','clients','client_notes','client_flags','tasks','ai_requests','packages','subscriptions','subscription_events','client_entitlement_overrides','payments','exercises','foods','tenant_hidden_items','programs','program_versions','nutrition_plans','nutrition_plan_versions','forms','form_versions','form_submissions','calendar_events','metric_entries','measurement_sets','progress_photo_sets','inbody_records','workout_sessions','set_logs','meal_logs','supplement_logs','conversations','messages','message_revisions','notifications','notification_deliveries','push_subscriptions','media'];
for (const table of tenantTables) fk(table,table === 'tenant_hidden_items' ? 'tenant_hidden_items_tenant_fk' : table === 'message_revisions' ? 'message_revisions_tenant_fk' : `${table}_tenant_id_tenants_id_fk`,'tenant_id','tenants','id');
type Unique = { table: MatrixTable; name: string; columns: string[]; predicate: string | null };
const uniques: Unique[] = [];
function unique(table: MatrixTable, name: string, columns: string, predicate: string | null = null): void { uniques.push({ table,name,columns:columns.split(','),predicate }); }
for (const table of Object.keys(TABLE_GRANTS) as MatrixTable[]) {
  if (['staff_client_assignments','user_preferences','tenant_hidden_items','idempotency_keys'].includes(table)) continue;
  unique(table,`${table}_pkey`,table === 'business_settings' ? 'tenant_id' : 'id');
}
unique('tenant_hidden_items','tenant_hidden_items_pk','tenant_id,kind,item_id');
for (const table of ['clients','memberships','packages','media','programs','nutrition_plans','forms','form_versions','conversations','messages','notifications'] as const) unique(table,`${table}_tenant_id_uq`,'tenant_id,id');
for (const table of ['subscriptions','media','programs','nutrition_plan_versions','calendar_events','metric_entries','workout_sessions'] as const) unique(table,`${table}_tenant_client_id_uq`,'tenant_id,client_id,id');
unique('program_versions','program_versions_tenant_client_program_id_uq','tenant_id,client_id,program_id,id');
unique('messages','messages_tenant_conversation_id_uq','tenant_id,conversation_id,id');
for (const [table,head,column] of [['program_versions','program','program_id'],['nutrition_plan_versions','plan','plan_id'],['form_versions','form','form_id']] as const) {
  unique(table,`${table}_${head}_no_uq`,`${column},version_no`); unique(table,`${table}_id_${head}_uq`,`id,${column}`); unique(table,`${table}_one_published_uq`,column,"status = 'published'");
}
for (const table of ['metric_entries','measurement_sets','progress_photo_sets','workout_sessions','set_logs','meal_logs','supplement_logs','form_submissions','messages'] as const) unique(table,`${table}_client_uuid_uq`,table === 'messages' ? 'tenant_id,sender_user_id,client_uuid' : 'tenant_id,client_id,client_uuid');
for (const [table,name,columns] of [
  ['tenants','tenants_slug_uq','slug'],['memberships','memberships_tenant_user_uq','tenant_id,user_id'],['staff_client_assignments','staff_client_assignments_uq','membership_id,client_id'],['invitations','invitations_token_hash_uq','token_hash'],['clients','clients_tenant_code_uq','tenant_id,code'],['exercises','exercises_tenant_slug_uq','tenant_id,slug'],['foods','foods_tenant_slug_uq','tenant_id,slug'],['conversations','conversations_tenant_client_uq','tenant_id,client_id'],['notifications','notifications_user_dedupe_uq','tenant_id,user_id,dedupe_key'],['tasks','tasks_tenant_dedupe_uq','tenant_id,dedupe_key'],['media','media_bucket_path_uq','bucket,path'],['user_preferences','user_preferences_uq','tenant_id,user_id'],['idempotency_keys','idempotency_keys_uq','tenant_id,user_id,key'],['calendar_events','calendar_events_sub_rule_uq','subscription_id,rule_key'],['payments','payments_tenant_receipt_uq','tenant_id,receipt_no'],['push_subscriptions','push_subscriptions_tenant_endpoint_uq','tenant_id,endpoint'],
] as const) unique(table,name,columns);
const checks: { table: string; name: string; expression: string }[] = [
  {table:'tenant_hidden_items',name:'tenant_hidden_items_kind_ck',expression:"kind IN ('exercise','food')"},
  ...['programs','nutrition_plans','forms'].map((table)=>({table,name:`${table}_kind_client_ck`,expression:"(kind = 'template') = (client_id IS NULL)"})),
  {table:'conversations',name:'conversations_kind_client_ck',expression:"(kind = 'internal') = (client_id IS NULL)"},
  ...['invitations','memberships'].map((table)=>({table,name:`${table}_role_client_ck`,expression:"(role = 'client') = (client_id IS NOT NULL)"})),
  {table:'calendar_events',name:'calendar_events_rule_ck',expression:"source <> 'package_rule' OR (rule_key IS NOT NULL AND subscription_id IS NOT NULL)"},
  ...['programs','nutrition_plans'].map((table)=>({table,name:`${table}_client_sub_ck`,expression:'client_id IS NOT NULL OR subscription_id IS NULL'})),
  {table:'workout_sessions',name:'workout_sessions_program_pair_ck',expression:'program_version_id IS NULL OR program_id IS NOT NULL'},
  {table:'payments',name:'payments_amount_ck',expression:"amount >= 0 AND amount < 'Infinity'::numeric AND (refund_amount IS NULL OR (refund_amount >= 0 AND refund_amount <= amount))"},
  {table:'payments',name:'payments_refund_state_ck',expression:"(state = 'refunded') = (refund_amount IS NOT NULL AND refund_amount = amount) AND (refund_amount IS NULL OR state IN ('verified','refunded'))"},
  {table:'payments',name:'payments_rejected_reason_ck',expression:"rejected_reason IS NULL OR state = 'rejected'"},
  {table:'media',name:'media_path_ck',expression:"bucket IN ('client-media','tenant-assets') AND (client_id IS NULL) = (bucket = 'tenant-assets') AND path ~ '^[A-Za-z0-9._/-]+$' AND path !~ '(^|/)[.]{1,2}(/|$)' AND path !~ '//' AND path !~ '/$' AND ((client_id IS NULL AND starts_with(path,tenant_id::text || '/assets/')) OR (client_id IS NOT NULL AND starts_with(path,tenant_id::text || '/clients/' || client_id::text || '/')))"},
  {table:'push_subscriptions',name:'push_subscriptions_endpoint_ck',expression:"endpoint ~ '^https://'"},
  ...['program_versions','nutrition_plan_versions','form_versions'].map((table)=>({table,name:`${table}_published_at_ck`,expression:"status NOT IN ('published','superseded') OR published_at IS NOT NULL"})),
  {table:'app.audit_actions',name:'audit_actions_action_ck',expression:"action ~ '^[a-z_]+[.][a-z_]+$'"},
  {table:'app.audit_actions',name:'audit_actions_roles_ck',expression:"cardinality(roles) > 0 AND roles <@ ARRAY['owner','staff','client']::text[]"},
  {table:'app.event_types',name:'event_types_type_ck',expression:"type ~ '^[a-z_]+[.][a-z_]+$'"},
  {table:'app.event_types',name:'event_types_roles_ck',expression:"cardinality(roles) > 0 AND roles <@ ARRAY['owner','staff','client']::text[]"},
];
// Keep boolean/equality grouping and quoted literal bytes; remove only deparser casts and redundant wrappers.
function canonical(source: string | null): string | null {
  if(source===null)return null;
  const literals:string[]=[];
  let s=source.replace(/'(?:''|[^'])*'/g,(value)=>{literals.push(value);return `@${literals.length-1}@`;}).replace(/"/g,'').toLowerCase()
    .replace(/::(?:[a-z_]+\.)?[a-z_]+(?:\[\])?/g,'').replace(/\bpublic\./g,'')
    .replace(/=\s*any\s*\(array\[([^\]]*)\]\)/g,' in ($1)').replace(/<>\s*all\s*\(array\[([^\]]*)\]\)/g,' not in ($1)').trim();
  function parse(input:string):unknown{
    let value=input.trim();
    while(value.startsWith('(')&&value.endsWith(')')){let depth=0;let wraps=true;for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(depth===0&&i<value.length-1){wraps=false;break;}}if(!wraps)break;value=value.slice(1,-1).trim();}
    for(const op of ['or','and','=']){let depth=0;let start=0;const parts:string[]=[];for(let i=0;i<value.length;i++){if(value[i]==='('||value[i]==='[')depth++;if(value[i]===')'||value[i]===']')depth--;const found=op==='='?value[i]==='='&&!/[<>!]/.test(value[i-1]??''):new RegExp(`^\\s+${op}\\s+`).test(value.slice(i));if(depth===0&&found){parts.push(value.slice(start,i));const size=op==='='?1:value.slice(i).match(new RegExp(`^\\s+${op}\\s+`))![0].length;i+=size-1;start=i+1;}}if(parts.length){parts.push(value.slice(start));return[op,...parts.map(parse)];}}
    return value.replace(/[\s()]/g,'').replace(/@(\d+)@/g,(_match,index:string)=>literals[Number(index)]!);
  }
  s=JSON.stringify(parse(s));return s;
}
async function state(): Promise<unknown> {
  return svc(async(tx)=>{
    const result:Record<string,unknown>={};
    for(const table of Object.keys(TABLE_GRANTS)) {
      const scope = !activeGraph || table==='tenants' ? sql`true` : sql`tenant_id in (${activeGraph.t1},${activeGraph.t2}) or tenant_id is null`;
      result[table]=await q(tx,sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where ${scope} order by to_jsonb(t)::text collate "C"`);
    }
    return result;
  });
}
async function refusal(work:()=>PromiseLike<unknown>, code:string, constraint:string, detail?:string, column?:string):Promise<void> {
  const before=await state();const error=await expectCode(work,code);
  if(detail) { expect(error.detail).toBe(`rule:app.${detail}`); if(column)expect(error.column_name).toBe(column); }
  else expect(error.constraint_name).toBe(constraint);
  expect(await state()).toEqual(before);
}
async function seeded(table:MatrixTable,f:Fixture,actor:AuthContext=f.o1,overrides:Record<string,unknown>={}):Promise<Record<string,unknown>> {
  const row={...await makeRow(table,f,actor),...overrides};
  return (await svc((tx)=>insertRow(tx,table,row)))[0]!;
}
async function remove(table:MatrixTable,row:Record<string,unknown>):Promise<void>{await svc((tx)=>tx.execute(sql`delete from ${sql.identifier(table)} where ${keyWhere(table,row)}`));}
function update(table:MatrixTable,row:Record<string,unknown>,values:Record<string,unknown>):SQL {
  return sql`update ${sql.identifier(table)} set ${sql.join(Object.entries(values).map(([k,v])=>sql`${sql.identifier(k)}=${v!==null&&typeof v==='object'?sql`${JSON.stringify(v)}::jsonb`:sql`${v}`}`),sql`, `)} where ${keyWhere(table,row)} returning *`;
}

describe('native integrity',()=>{
  it('N01 all tables svc SELECT exact FK definitions actions validation and pointer clear columns',async()=>{
    const actual=await svc((tx)=>q<{table:MatrixTable;name:string;columns:string[];parent:MatrixTable;targets:string[];action:string;clear:string[];definition:string;match:string;onupdate:string;validated:boolean;deferrable:boolean;deferred:boolean}>(tx,sql`select ch.relname as table,c.conname as name,pa.relname as parent,c.confdeltype::text as action,c.confupdtype::text as onupdate,c.confmatchtype::text as match,c.convalidated as validated,c.condeferrable as deferrable,c.condeferred as deferred,pg_get_constraintdef(c.oid,true)as definition,array(select a.attname::text from unnest(c.conkey)with ordinality k(num,ord)join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord)as columns,array(select a.attname::text from unnest(c.confkey)with ordinality k(num,ord)join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord)as targets,array(select a.attname::text from unnest(c.confdelsetcols)with ordinality k(num,ord)join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord)as clear from pg_constraint c join pg_class ch on ch.oid=c.conrelid join pg_class pa on pa.oid=c.confrelid where c.contype='f'and ch.relnamespace='public'::regnamespace order by ch.relname,c.conname`));
    expect(actual.map((r)=>`${r.table}.${r.name}`).sort()).toEqual(foreignKeys.map((r)=>`${r.table}.${r.name}`).sort());
    for(const expected of foreignKeys){const row=actual.find((r)=>r.name===expected.name)!;const {definition,match,onupdate,validated,deferrable,deferred,...shape}=row;expect(shape,expected.name).toEqual(expected);expect({match,onupdate,validated,deferrable,deferred}).toEqual({match:'s',onupdate:'a',validated:true,deferrable:false,deferred:false});
      const action=expected.action==='c'?' ON DELETE CASCADE':expected.action==='n'?` ON DELETE SET NULL${expected.clear.length?' ('+expected.clear.join(', ')+')':''}`:'';
      expect(canonical(definition),expected.name).toBe(canonical(`FOREIGN KEY (${expected.columns.join(', ')}) REFERENCES ${expected.parent}(${expected.targets.join(', ')})${action}`));
    }
    expect(await svc((tx)=>q(tx,sql`select conname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)where c.contype='f'and c.conrelid in ('programs'::regclass,'nutrition_plans'::regclass,'forms'::regclass)and a.attname='published_version_id'`))).toEqual([]);
  });
  it('N02 public svc SELECT complete unique/PK ordered-key predicates valid ready',async()=>{
    const actual=await svc((tx)=>q<{table:MatrixTable;name:string;columns:string[];predicate:string|null;valid:boolean;ready:boolean}>(tx,sql`select t.relname as table,c.relname as name,array(select a.attname::text from unnest(i.indkey::smallint[])with ordinality k(num,ord)join pg_attribute a on a.attrelid=t.oid and a.attnum=k.num where k.ord<=i.indnkeyatts order by k.ord)as columns,pg_get_expr(i.indpred,i.indrelid)as predicate,i.indisvalid as valid,i.indisready as ready from pg_index i join pg_class t on t.oid=i.indrelid join pg_class c on c.oid=i.indexrelid where t.relnamespace='public'::regnamespace and i.indisunique order by c.relname`));
    expect(actual.map((r)=>r.name).sort()).toEqual(uniques.map((r)=>r.name).sort());
    for(const expected of uniques){const row=actual.find((r)=>r.name===expected.name)!;expect({...row,predicate:canonical(row.predicate)}).toEqual({...expected,predicate:canonical(expected.predicate),valid:true,ready:true});}
  });
  it('N03 affected tables svc SELECT full CHECK set exact expressions validated',async()=>{
    const actual=await svc((tx)=>q<{table:string;name:string;expression:string;validated:boolean}>(tx,sql`select case when n.nspname='app'then 'app.'else ''end||t.relname as table,c.conname as name,pg_get_expr(c.conbin,c.conrelid)as expression,c.convalidated as validated from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='c'and n.nspname in ('public','app')order by c.conname`));
    expect(actual.map((r)=>r.name).sort()).toEqual(checks.map((r)=>r.name).sort());
    for(const expected of checks){const row=actual.find((r)=>r.name===expected.name)!;expect({...row,expression:canonical(row.expression)}).toEqual({...expected,expression:canonical(expected.expression),validated:true});}
  });

  // Trigger-owned relationships have an earlier, named refusal; their native definitions are still pinned by N01.
  const early:Record<string,string>={exercises_thumbnail_fk:'exercise_thumbnail_check',exercises_based_on_fk:'library_ref_check',foods_based_on_fk:'library_ref_check',programs_template_fk:'template_ref_check',nutrition_plans_template_fk:'template_ref_check',forms_template_fk:'template_ref_check',programs_current_version_fk:'head_rules',nutrition_plans_current_version_fk:'head_rules',forms_current_version_fk:'head_rules',program_versions_program_fk:'version_rules',nutrition_plan_versions_plan_fk:'version_rules',form_versions_form_fk:'version_rules',form_submissions_version_fk:'submission_rules',messages_conversation_fk:'message_rules',tasks_assignee_fk:'task_assignee_check',set_logs_exercise_fk:'set_logs_library_check',set_logs_substituted_fk:'set_logs_library_check'};
  const runtimeMutable=new Set(['payments_proof_media_fk','exercises_thumbnail_fk','exercises_based_on_fk','foods_based_on_fk','programs_current_version_fk','nutrition_plans_current_version_fk','forms_current_version_fk','meal_logs_plan_version_fk','supplement_logs_plan_version_fk','inbody_records_media_fk','set_logs_exercise_fk','set_logs_substituted_fk','tasks_assignee_fk']);
  for(const edge of foreignKeys.filter((e)=>e.parent!=='tenants')) for(const actorName of ['svc','o1']as const)for(const command of ['insert','update']as const)for(const parentClass of edge.targets.includes('client_id')?['foreign-tenant','other-client']:['incompatible-parent']){
    if(edge.clear.length>0&&command==='insert')continue; // A version can exist only after its head; pointer INSERT is unreachable.
    if(actorName==='o1'&&(!TABLE_GRANTS[edge.table].includes(command==='insert'?'I':'U')||command==='update'&&!runtimeMutable.has(edge.name)))continue;
    it(`N04 ${edge.table} ${actorName} ${command.toUpperCase()} ${edge.columns.join(',')} ${edge.name} ${parentClass}`,async()=>{
    const f=await buildPrivateFixture();let row=await makeRow(edge.table,f);let column=edge.columns.filter((c)=>c!=='tenant_id'&&c!=='client_id'&&c!=='id').at(-1)??'client_id';
    const execute=<T>(fn:(tx:Tx)=>Promise<T>):Promise<T>=>actorName==='svc'?svc(fn):as(f.o1,fn);
    let good:unknown;let bad:unknown;const rule=early[edge.name];
    if(edge.name.endsWith('_current_version_fk')){
      const family=edge.table==='programs'?'program':edge.table==='forms'?'form':'nutrition';const own=await mkVersion(f.t1,{family});const other=await mkVersion(f.t1,{family});
      row=(await serviceRowWhere(edge.table,sql`id=${own.headId}`))[0]!;column='current_version_id';good=own.versionId;bad=other.versionId;
      // A pointer cannot be set at head creation before its version exists. Its reachable operation is UPDATE (§7.3).
      const before=await state();const error=await expectCode(()=>execute(async(tx)=>tx.execute(update(edge.table,row,{[column]:bad}))),'23503');expect(error.detail).toBe('rule:app.head_rules');expect(error.column_name).toBe(column);expect(await state()).toEqual(before);
      const stored=await execute((tx)=>q(tx,update(edge.table,row,{[column]:good})));expect(stored[0]?.[column]).toBe(good);return;
    }
    if(edge.table.endsWith('_versions')&&edge.parent!=='messages'){
      const family=edge.table==='program_versions'?'program':edge.table==='form_versions'?'form':'nutrition';
      good=(await mkVersion(f.t1,{family})).headId;bad=randomUUID();row.version_no=2;
    }
    else if(column==='client_id'){good=edge.table==='conversations'?await mkClient(f.t1):f.clientA;bad=f.clientC;if(edge.table==='memberships'){row.role='client';row.client_id=f.clientA;}if(edge.table==='conversations'||edge.table==='programs'||edge.table==='nutrition_plans'||edge.table==='forms')row.kind='client';}
    else if(edge.parent==='memberships'){good=f.s2.membershipId;bad=f.o2.membershipId;}
    else if(edge.parent==='clients'){good=f.clientA;bad=f.clientC;}
    else if(edge.parent==='subscriptions'){good=f.subA;bad=f.subC;}
    else if(edge.parent==='packages'){good=f.packageT1;bad=f.packageT2;}
    else if(edge.parent==='media'){good=f.mediaA;bad=f.mediaC;if(column==='thumbnail_media_id'){const asset=await seeded('media',f,f.o1,{client_id:null,bucket:'tenant-assets',purpose:'branding',path:`${f.t1}/assets/${randomUUID()}.jpg`});good=asset.id;}}
    else if(edge.name.endsWith('_template_fk')){const family=edge.table==='programs'?'program':edge.table==='forms'?'form':'nutrition';good=(await mkVersion(f.t1,{family})).headId;bad=(await mkVersion(f.t2,{family})).headId;}
    else if(edge.parent==='programs'){good=f.copyProgramA2;bad=(await mkVersion(f.t2,{clientId:f.clientC})).headId;}
    else if(edge.parent==='nutrition_plans'||edge.parent==='forms'){const family=edge.parent==='forms'?'form':'nutrition';good=(await mkVersion(f.t1,{family})).headId;bad=randomUUID();}
    else if(edge.table.endsWith('_versions')){good=edge.table==='program_versions'?f.templateProgram:edge.table==='form_versions'?f.templateForm:(await mkVersion(f.t1,{family:'nutrition'})).headId;bad=randomUUID();row.version_no=edge.table==='form_versions'?3:2;}
    else if(edge.parent==='program_versions'){good=f.copyPubA;bad=f.copyPubB;row.program_id=f.copyProgramA2;}
    else if(edge.parent==='nutrition_plan_versions'){good=f.planPubA;bad=f.planPubB;}
    else if(edge.parent==='form_versions'){good=f.templateFormPub;bad=randomUUID();}
    else if(edge.parent==='workout_sessions'){const a=await seeded('workout_sessions',f);const b=await seeded('workout_sessions',f,f.ub);good=a.id;bad=b.id;}
    else if(edge.parent==='calendar_events'){good=f.eventA;bad=f.eventB;}
    else if(edge.parent==='metric_entries'){good=f.metricA;bad=f.metricB;}
    else if(edge.parent==='conversations'){good=f.convA;bad=f.convC;}
    else if(edge.parent==='messages'){const a=await seeded('messages',f);const b=await seeded('messages',f,edge.table==='message_revisions'?f.uc:f.ub);good=a.id;bad=b.id;}
    else if(edge.parent==='notifications'){good=f.notifA;bad=(await seeded('notifications',f,f.uc)).id;}
    else if(edge.parent==='exercises'||edge.parent==='foods'){good=edge.parent==='exercises'?f.exerciseSystem:f.foodSystem;bad=edge.parent==='exercises'?f.exerciseT2:f.foodT2;}
    else throw new Error(`N04 missing independent reference recipe ${edge.name}`);
    if(edge.targets.includes('client_id')){
      const other=parentClass==='other-client'?f.ub:f.uc;
      if(edge.parent==='subscriptions')bad=parentClass==='other-client'?f.subB:f.subC;
      else if(edge.parent==='media')bad=parentClass==='other-client'?f.mediaB:f.mediaC;
      else if(edge.parent==='programs')bad=parentClass==='other-client'?f.copyProgramB:(await mkVersion(f.t2,{clientId:f.clientC})).headId;
      else if(edge.parent==='program_versions')bad=parentClass==='other-client'?f.copyPubB:(await mkVersion(f.t2,{clientId:f.clientC,status:'published'})).versionId;
      else if(edge.parent==='nutrition_plan_versions')bad=parentClass==='other-client'?f.planPubB:(await mkVersion(f.t2,{family:'nutrition',clientId:f.clientC,status:'published'})).versionId;
      else if(edge.parent==='calendar_events')bad=parentClass==='other-client'?f.eventB:(await seeded('calendar_events',f,f.uc)).id;
      else if(edge.parent==='metric_entries')bad=parentClass==='other-client'?f.metricB:(await seeded('metric_entries',f,f.uc)).id;
      else if(edge.parent==='workout_sessions')bad=(await seeded('workout_sessions',f,other)).id;
    }
    if(edge.name==='workout_sessions_program_fk')row.program_version_id=null;
    if((edge.table==='programs'||edge.table==='nutrition_plans')&&edge.parent==='subscriptions'){row.kind='client';row.client_id=f.clientA;}
    row[column]=good;
    if(command==='update')row=(await svc((tx)=>insertRow(tx,edge.table,row)))[0]!;
    const before=await state();
    const forbidden:Record<string,unknown>={[column]:bad};
    if(edge.table==='media'&&column==='client_id')forbidden.path=`${f.t1}/clients/${String(bad)}/${randomUUID()}.jpg`;
    const work=()=>execute((tx)=>command==='insert'?insertRow(tx,edge.table,{...row,...forbidden}):q(tx,update(edge.table,row,forbidden)));
    const error=await expectCode(work,'23503');
    const visibleRef = actorName==='o1'&&parentClass==='foreign-tenant'&&['workout_sessions_version_fk','meal_logs_plan_version_fk','supplement_logs_plan_version_fk'].includes(edge.name);
    const refusalRule = visibleRef?'visible_refs':command==='update' && ['version_rules','submission_rules','message_rules'].includes(rule??'') ? undefined : rule;
    if(refusalRule){expect(error.detail).toBe(`rule:app.${refusalRule}`);expect(error.column_name).toBe(column);expect(error.table_name).toBe(edge.table);}else expect(error.constraint_name).toBe(edge.name);
    expect(await state()).toEqual(before);
    const stored=await execute((tx)=>command==='insert'?insertRow(tx,edge.table,row):q(tx,update(edge.table,row,{[column]:good})));
    expect(stored).toHaveLength(1);expect(stored[0]?.[column]).toBe(good);
    });
  }
  for(const table of ['clients','packages','business_settings','user_preferences','consents','push_subscriptions','tenant_hidden_items']as const) it(`N04 ${table} svc INSERT tenant_id nonexistent retained tenant FK`,async()=>{
    const f=await buildPrivateFixture();const row=await makeRow(table,f);const name=table==='tenant_hidden_items'?'tenant_hidden_items_tenant_fk':`${table}_tenant_id_tenants_id_fk`;
    if(table==='clients')row.code=(await svc((tx)=>one<{code:string}>(tx,sql`select app.next_client_code(${f.t1}::uuid)as code`))).code;
    await refusal(()=>svc((tx)=>insertRow(tx,table,{...row,tenant_id:randomUUID()})),'23503',name);
    expect((await svc((tx)=>insertRow(tx,table,row)))[0]?.tenant_id).toBe(f.t1);
  });
  for(const table of tenantTables)it(`N04 ${table} svc UPDATE tenant_id nonexistent tenant retained FK`,async()=>{
    const f=await buildPrivateFixture();const row=await seeded(table,f);const absent=randomUUID();const name=table==='tenant_hidden_items'?'tenant_hidden_items_tenant_fk':table==='message_revisions'?'message_revisions_tenant_fk':`${table}_tenant_id_tenants_id_fk`;
    const bad:Record<string,unknown>={tenant_id:absent};const good:Record<string,unknown>={tenant_id:f.t1};
    if(table==='media'){bad.path=`${absent}/clients/${String(row.client_id)}/${randomUUID()}.jpg`;good.path=row.path;}
    await refusal(()=>svc((tx)=>tx.execute(update(table,row,bad))),'23503',name);
    expect((await svc((tx)=>q(tx,update(table,row,good))))[0]?.tenant_id).toBe(f.t1);
  });

  type CheckCase={table:MatrixTable;name:string;bad:Record<string,unknown>;good:Record<string,unknown>;label:string};
  const checkCases:CheckCase[]=[
    ...(['programs','nutrition_plans','forms']as const).flatMap((table)=>[{table,name:`${table}_kind_client_ck`,bad:{kind:'client',client_id:null},good:{kind:'template',client_id:null},label:'client requires client'},{table,name:`${table}_kind_client_ck`,bad:{kind:'template',client_id:'A'},good:{kind:'client',client_id:'A'},label:'template excludes client'}]),
    ...(['invitations','memberships']as const).flatMap((table)=>[{table,name:`${table}_role_client_ck`,bad:{role:'client',client_id:null},good:{role:'staff',client_id:null},label:'client role requires client'},{table,name:`${table}_role_client_ck`,bad:{role:'staff',client_id:'A'},good:{role:'client',client_id:'A'},label:'staff excludes client'}]),
    {table:'conversations',name:'conversations_kind_client_ck',bad:{kind:'client',client_id:null},good:{kind:'internal',client_id:null},label:'client thread requires client'},
    {table:'conversations',name:'conversations_kind_client_ck',bad:{kind:'internal',client_id:'fresh'},good:{kind:'client',client_id:'fresh'},label:'internal excludes client'},
    {table:'calendar_events',name:'calendar_events_rule_ck',bad:{source:'package_rule',rule_key:null,subscription_id:'sub'},good:{source:'package_rule',rule_key:'matrix',subscription_id:'sub'},label:'rule missing key'},
    {table:'calendar_events',name:'calendar_events_rule_ck',bad:{source:'package_rule',rule_key:'matrix',subscription_id:null},good:{source:'package_rule',rule_key:'matrix',subscription_id:'sub'},label:'rule missing subscription'},
    ...(['programs','nutrition_plans']as const).map((table)=>({table,name:`${table}_client_sub_ck`,bad:{kind:'template',client_id:null,subscription_id:'sub'},good:{kind:'template',client_id:null,subscription_id:null},label:'template subscription'})),
    {table:'workout_sessions',name:'workout_sessions_program_pair_ck',bad:{program_id:null,program_version_id:'version'},good:{program_id:'program',program_version_id:'version'},label:'version without head'},
    ...[-1,'NaN'].map((amount)=>({table:'payments' as const,name:'payments_amount_ck',bad:{amount},good:{amount:100},label:`amount ${amount}`})),
    ...[-1,101,'NaN'].map((refund_amount)=>({table:'payments' as const,name:'payments_amount_ck',bad:{state:'verified',refund_amount},good:{state:'verified',refund_amount:50},label:`refund ${refund_amount}`})),
    {table:'payments',name:'payments_refund_state_ck',bad:{state:'refunded',refund_amount:50},good:{state:'refunded',refund_amount:100},label:'full refund required'},
    {table:'payments',name:'payments_refund_state_ck',bad:{state:'refunded',refund_amount:null},good:{state:'refunded',refund_amount:100},label:'refunded requires amount'},
    {table:'payments',name:'payments_refund_state_ck',bad:{state:'verified',refund_amount:100},good:{state:'verified',refund_amount:50},label:'full refund implies state'},
    {table:'payments',name:'payments_refund_state_ck',bad:{state:'pending',refund_amount:50},good:{state:'verified',refund_amount:50},label:'pending refund'},
    {table:'payments',name:'payments_rejected_reason_ck',bad:{state:'pending',rejected_reason:'reason'},good:{state:'rejected',rejected_reason:'reason'},label:'reason only rejected'},
    {table:'push_subscriptions',name:'push_subscriptions_endpoint_ck',bad:{endpoint:'http://push.example.test/x'},good:{endpoint:'https://push.example.test/x'},label:'https only'},
    {table:'tenant_hidden_items',name:'tenant_hidden_items_kind_ck',bad:{kind:'program'},good:{kind:'exercise'},label:'allowed kind'},
    ...(['program_versions','nutrition_plan_versions','form_versions']as const).flatMap((table)=>['published','superseded'].map((status)=>({table,name:`${table}_published_at_ck`,bad:{status,published_at:null},good:{status,published_at:'2026-11-09T00:00:00Z'},label:`${status} needs stamp`}))),
  ];
  for(const cell of checkCases)it(`N05 ${cell.table} svc INSERT ${Object.keys(cell.bad).join(',')} ${cell.label}`,async()=>{
    const f=await buildPrivateFixture();const row=await makeRow(cell.table,f);const fresh=await mkClient(f.t1);
    if(cell.table.endsWith('_versions'))row.published_by=f.o1.userId;
    const expand=(values:Record<string,unknown>)=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v==='A'?f.clientA:v==='fresh'?fresh:v==='sub'?f.subA:v==='version'?f.copyPubA:v==='program'?f.copyProgramA2:v]));
    await refusal(()=>svc((tx)=>insertRow(tx,cell.table,{...row,...expand(cell.bad)})),'23514',cell.name);
    const expected=expand(cell.good);const stored=(await svc((tx)=>insertRow(tx,cell.table,{...row,...expected})))[0]!;
    for(const [k,v]of Object.entries(expected))expect(stored[k]instanceof Date?(stored[k]as Date).toISOString():typeof v==='number'?Number(stored[k]):stored[k]).toEqual(k==='published_at'?new Date(String(v)).toISOString():v);
  });
  for(const badPath of ['foreign-tenant','foreign-client','dot','dotdot','backslash','percent','control','double-slash','trailing-slash','wrong-bucket','client-in-assets','asset-in-client'])it(`N05 media svc INSERT bucket/path ${badPath}`,async()=>{
    const f=await buildPrivateFixture();const row=await makeRow('media',f);const prefix=`${f.t1}/clients/${f.clientA}/`;
    const variants:Record<string,Record<string,unknown>>={ 'foreign-tenant':{path:`${f.t2}/clients/${f.clientA}/f.jpg`},'foreign-client':{path:`${f.t1}/clients/${f.clientB}/f.jpg`},dot:{path:prefix+'./f.jpg'},dotdot:{path:prefix+'../f.jpg'},backslash:{path:prefix+'x\\f.jpg'},percent:{path:prefix+'%2e.jpg'},control:{path:prefix+'x\u0001.jpg'},'double-slash':{path:prefix+'/f.jpg'},'trailing-slash':{path:prefix+'f.jpg/'},'wrong-bucket':{bucket:'other'},'client-in-assets':{bucket:'tenant-assets'},'asset-in-client':{client_id:null} };
    await refusal(()=>svc((tx)=>insertRow(tx,'media',{...row,...variants[badPath]})),'23514','media_path_ck');
    const stored=(await svc((tx)=>insertRow(tx,'media',row)))[0]!;expect(stored.path).toBe(row.path);expect(stored.bucket).toBe('client-media');
    const asset={...await makeRow('media',f),client_id:null,bucket:'tenant-assets',path:`${f.t1}/assets/${randomUUID()}.jpg`};expect((await svc((tx)=>insertRow(tx,'media',asset)))[0]?.path).toBe(asset.path);
  });
  for(const table of ['audit_actions','event_types']as const)for(const invalid of ['name','empty-roles','unknown-role']as const)it(`N05 app.${table} svc INSERT ${invalid} allow-list CHECK`,async()=>{
    const name=`n_test.${randomUUID().replace(/[0-9-]/g,'a')}`;const field=table==='audit_actions'?'action':'type';const constraint=invalid==='name'?`${table}_${field}_ck`:`${table}_roles_ck`;
    const roles=invalid==='empty-roles'?sql`array[]::text[]`:invalid==='unknown-role'?sql`array['root']::text[]`:sql`array['owner']::text[]`;
    const columns=table==='audit_actions'?sql`action,entity,roles`:sql`type,roles`;
    const values=table==='audit_actions'?sql`${invalid==='name'?'invalid':name},'clients',${roles}`:sql`${invalid==='name'?'invalid':name},${roles}`;
    const before=await svc((tx)=>q(tx,sql`select * from app.${sql.identifier(table)} order by ${sql.identifier(field)}`));
    const error=await expectCode(()=>svc((tx)=>tx.execute(sql`insert into app.${sql.identifier(table)}(${columns})values(${values})`)),'23514');expect(error.constraint_name).toBe(constraint);expect(await svc((tx)=>q(tx,sql`select * from app.${sql.identifier(table)} order by ${sql.identifier(field)}`))).toEqual(before);
    try{const goodValues=table==='audit_actions'?sql`${name},'clients',array['owner']::text[]`:sql`${name},array['owner']::text[]`;expect(await svc((tx)=>q(tx,sql`insert into app.${sql.identifier(table)}(${columns})values(${goodValues})returning ${sql.identifier(field)} as name,roles`))).toEqual([{name,roles:['owner']}]);}
    finally{await svc((tx)=>tx.execute(sql`delete from app.${sql.identifier(table)} where ${sql.identifier(field)}=${name}`));}
  });
  for(const uniqueRule of uniques.filter((u)=>!u.name.endsWith('_id_uq')&&!u.name.endsWith('_pkey')&&!u.name.endsWith('_pk')&&!u.name.includes('_id_program_')&&!u.name.includes('_id_plan_')&&!u.name.includes('_id_form_')&&!u.name.includes('_tenant_client_program_')&&!u.name.includes('_tenant_conversation_')&&!u.name.endsWith('_one_published_uq')))it(`N06 ${uniqueRule.table} svc INSERT ${uniqueRule.columns.join(',')} duplicate ${uniqueRule.name}`,async()=>{
    const f=await buildPrivateFixture();let row=await makeRow(uniqueRule.table,f);
    if(uniqueRule.table==='clients')row.code=(await svc((tx)=>one<{code:string}>(tx,sql`select app.next_client_code(${f.t1}::uuid)as code`))).code;
    if(uniqueRule.table==='conversations'){row.client_id=await mkClient(f.t1);row.kind='client';}
    if(uniqueRule.table==='notifications'||uniqueRule.table==='tasks')row.dedupe_key=randomUUID();
    if(uniqueRule.table==='calendar_events'){row.subscription_id=f.subA;row.rule_key=randomUUID();}
    if(uniqueRule.table==='payments'){row.state='verified';}
    row=(await svc((tx)=>insertRow(tx,uniqueRule.table,row)))[0]!;
    // Copy only input columns; the new physical id distinguishes the duplicate logical key.
    const duplicate:Record<string,unknown>={...row,id:randomUUID()};
    if(!('id'in row))delete duplicate.id;
    if(uniqueRule.table==='payments'){duplicate.receipt_no=row.receipt_no;duplicate.state='pending';duplicate.verified_at=null;duplicate.verified_by=null;}
    if(uniqueRule.table==='conversations')duplicate.last_message_at=null;
    const before=await state();const error=await expectCode(()=>svc((tx)=>insertRow(tx,uniqueRule.table,duplicate)),'23505');expect(error.constraint_name).toBe(uniqueRule.name);expect(await state()).toEqual(before);
    const changed=uniqueRule.columns[uniqueRule.columns.length-1]!;
    if(changed==='client_id')duplicate[changed]=await mkClient(f.t1);
    else if(changed==='membership_id')duplicate[changed]=(await mkMembership(f.s2)).membershipId;
    else if(changed==='user_id')duplicate[changed]=randomUUID();
    else if(changed==='version_no')duplicate[changed]=Number(row[changed])+1;
    else if(changed==='path')duplicate[changed]=String(row[changed]).replace(/[^/]+$/,`${randomUUID()}.jpg`);
    else if(changed==='endpoint')duplicate[changed]=`https://push.example.test/${randomUUID()}`;
    else if(changed==='code')duplicate[changed]=(await svc((tx)=>one<{code:string}>(tx,sql`select app.next_client_code(${f.t1}::uuid)as code`))).code;
    else duplicate[changed]=randomUUID();
    const stored=await svc((tx)=>insertRow(tx,uniqueRule.table,duplicate));expect(stored).toHaveLength(1);expect(stored[0]?.[changed]).toBe(duplicate[changed]);
  });
  for(const family of ['program','nutrition','form']as const)it(`N06 ${family} versions svc INSERT head status published unique partial predicate`,async()=>{
    const f=await buildPrivateFixture();const table=family==='program'?'program_versions':family==='nutrition'?'nutrition_plan_versions':'form_versions';const column=family==='program'?'program_id':family==='nutrition'?'plan_id':'form_id';
    const parent=await mkVersion(f.t1,{family,status:'published'});const row={...await makeRow(table,f),[column]:parent.headId,version_no:2,status:'published',published_at:'2026-11-09T00:00:00Z',published_by:f.o1.userId};
    await refusal(()=>svc((tx)=>insertRow(tx,table,row)),'23505',`${table}_one_published_uq`);
    const separate=await mkVersion(f.t1,{family});const control={...row,[column]:separate.headId};expect((await svc((tx)=>insertRow(tx,table,control)))[0]?.[column]).toBe(separate.headId);
  });
  it('N06 tenant_hidden_items svc INSERT tenant/kind/item duplicate composite primary key',async()=>{
    const f=await buildPrivateFixture();const row=await makeRow('tenant_hidden_items',f);await svc((tx)=>insertRow(tx,'tenant_hidden_items',row));await refusal(()=>svc((tx)=>insertRow(tx,'tenant_hidden_items',row)),'23505','tenant_hidden_items_pk');
    const control={...row,item_id:f.exerciseT1};expect((await svc((tx)=>insertRow(tx,'tenant_hidden_items',control)))[0]?.item_id).toBe(f.exerciseT1);
  });
  for(const table of ['clients','memberships','packages','media','programs','nutrition_plans','forms','calendar_events','metric_entries','workout_sessions','messages','notifications']as const)it(`N06 ${table} svc INSERT id redundant-target primary key refusal`,async()=>{
    const f=await buildPrivateFixture();const row=await seeded(table,f);const before=await state();
    const error=await expectCode(()=>svc((tx)=>insertRow(tx,table,row)),'23505');expect(error.constraint_name).toBe(`${table}_pkey`);expect(await state()).toEqual(before);
    const control=await makeRow(table,f);expect((await svc((tx)=>insertRow(tx,table,control)))[0]?.id).toBe(control.id);
  });
  for(const table of ['metric_entries','measurement_sets','progress_photo_sets','workout_sessions','set_logs','meal_logs','supplement_logs','form_submissions','messages']as const)it(`N07 ${table} ua/ub/uc INSERT client_uuid same uuid different client/sender tenant`,async()=>{
    const f=await buildPrivateFixture();const uuid=randomUUID();
    const expectedKeys:string[]=[];
    for(const actor of [f.ua,f.ub,f.uc]){
      const row:Record<string,unknown>={...await makeRow(table,f,actor),client_uuid:uuid};
      const stored=await as(actor,(tx)=>insertRow(tx,table,row));expect(stored[0]?.client_uuid).toBe(uuid);expectedKeys.push(String(row.id));
      const retry={...row,id:randomUUID()};const before=await state();
      if(table==='metric_entries'){
        expect(await as(actor,(tx)=>q(tx,sql`insert into metric_entries(id,tenant_id,client_id,metric,value,unit,source,recorded_at,local_date,timezone,client_uuid)values(${retry.id},${actor.tenantId},${actor.clientId},'weight',81,'kg','manual',now(),current_date,'Africa/Cairo',${uuid})on conflict(tenant_id,client_id,client_uuid)do nothing returning id`))).toEqual([]);
      }else{const error=await expectCode(()=>as(actor,(tx)=>insertRow(tx,table,retry)),'23505');expect(error.constraint_name).toBe(`${table}_client_uuid_uq`);}
      expect(await state()).toEqual(before);
      const control={...row,id:randomUUID(),client_uuid:randomUUID()};expect((await as(actor,(tx)=>insertRow(tx,table,control)))[0]?.client_uuid).toBe(control.client_uuid);
    }
    if(table==='messages')for(const actor of [f.o1,f.s2]){
      const row:Record<string,unknown>={...await makeRow(table,f,actor),conversation_id:f.convInternal,client_id:null,client_uuid:uuid};expect((await as(actor,(tx)=>insertRow(tx,table,row)))[0]?.sender_user_id).toBe(actor.userId);expectedKeys.push(String(row.id));
      await refusal(()=>as(actor,(tx)=>insertRow(tx,table,{...row,id:randomUUID()})),'23505','messages_client_uuid_uq');
      const control={...row,id:randomUUID(),client_uuid:randomUUID()};expect((await as(actor,(tx)=>insertRow(tx,table,control)))[0]?.client_uuid).toBe(control.client_uuid);
    }
    expect((await svc((tx)=>q<{id:string}>(tx,sql`select id from ${sql.identifier(table)} where client_uuid=${uuid}`))).map((r)=>r.id).sort()).toEqual(expectedKeys.sort());
  });
  it('N08 subscriptions svc DELETE dependent cascade and no-action payment/document/submission references',async()=>{
    const f=await buildPrivateFixture();const client=await mkClient(f.t1);const sub=await mkSubscription(f.t1,client);
    const ledger=await seeded('subscription_events',f,f.o1,{client_id:client,subscription_id:sub});const override=await seeded('client_entitlement_overrides',f,f.o1,{client_id:client,subscription_id:sub});const event=await seeded('calendar_events',f,f.o1,{client_id:client,subscription_id:sub});const payment=await mkPayment(f.t1,client,sub);
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from subscriptions where id=${sub}`)),'23503','payments_subscription_fk');
    await svc((tx)=>tx.execute(sql`delete from payments where id=${payment}`));
    const head=await seeded('programs',f,f.o1,{kind:'client',client_id:client,subscription_id:sub});
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from subscriptions where id=${sub}`)),'23503','programs_subscription_fk');await remove('programs',head);
    const plan=await seeded('nutrition_plans',f,f.o1,{kind:'client',client_id:client,subscription_id:sub});
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from subscriptions where id=${sub}`)),'23503','nutrition_plans_subscription_fk');await remove('nutrition_plans',plan);
    const submission=await seeded('form_submissions',f,f.o1,{client_id:client,calendar_event_id:event.id,subscription_id:sub});
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from calendar_events where id=${event.id}`)),'23503','form_submissions_event_fk');
    // The event cascade can expose the event FK first; deleting an event-free subscription isolates its own no-action key.
    await svc((tx)=>tx.execute(update('form_submissions',submission,{calendar_event_id:null})));
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from subscriptions where id=${sub}`)),'23503','form_submissions_subscription_fk');await remove('form_submissions',submission);
    await svc((tx)=>tx.execute(sql`delete from subscriptions where id=${sub}`));
    for(const [table,row]of [['subscription_events',ledger],['client_entitlement_overrides',override],['calendar_events',event]]as const)expect(await serviceRowWhere(table,keyWhere(table,row))).toEqual([]);
    const control=await mkSubscription(f.t1);await svc((tx)=>tx.execute(sql`delete from subscriptions where id=${control}`));expect(await serviceRowWhere('subscriptions',sql`id=${control}`)).toEqual([]);
  });
  it('N09 public svc SELECT every non-tenant FK child index and named partial indexes',async()=>{
    expect(await svc((tx)=>q(tx,sql`with fk as(select c.conrelid,c.conname,c.conkey,(select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='tenant_id')as tid from pg_constraint c where c.contype='f'and c.connamespace='public'::regnamespace)select fk.conrelid::regclass as child_table,fk.conname from fk where fk.conkey<>array[fk.tid]and not exists(select 1 from pg_index i where i.indrelid=fk.conrelid and i.indisvalid and((i.indkey[0]=any(fk.conkey)and i.indkey[0]<>fk.tid)or(i.indkey[0]=fk.tid and i.indnkeyatts>1 and i.indkey[1]=any(fk.conkey)and i.indkey[1]<>fk.tid)or(i.indisunique and i.indpred is null and(select array_agg(u.k)from unnest(string_to_array(i.indkey::text,' ')::int2[])with ordinality u(k,n)where u.n<=i.indnkeyatts)<@fk.conkey)))order by 1,2`))).toEqual([]);
    const expected:[string,string[],string|null][]=[['ai_requests_tenant_client_idx',['tenant_id','client_id'],'client_id IS NOT NULL'],['forms_tenant_client_idx',['tenant_id','client_id'],'client_id IS NOT NULL'],['invitations_tenant_client_idx',['tenant_id','client_id'],'client_id IS NOT NULL'],['notifications_tenant_client_idx',['tenant_id','client_id'],'client_id IS NOT NULL'],['subscriptions_tenant_package_idx',['tenant_id','package_id'],null],['tasks_tenant_assignee_idx',['tenant_id','assignee_membership_id'],'assignee_membership_id IS NOT NULL'],['programs_tenant_template_idx',['tenant_id','template_id'],'template_id IS NOT NULL'],['nutrition_plans_tenant_template_idx',['tenant_id','template_id'],'template_id IS NOT NULL'],['forms_tenant_template_idx',['tenant_id','template_id'],'template_id IS NOT NULL'],['form_submissions_tenant_version_idx',['tenant_id','form_version_id'],null],['exercises_tenant_thumbnail_idx',['tenant_id','thumbnail_media_id'],'thumbnail_media_id IS NOT NULL'],['exercises_based_on_idx',['based_on_id'],'based_on_id IS NOT NULL'],['foods_based_on_idx',['based_on_id'],'based_on_id IS NOT NULL'],['set_logs_exercise_idx',['exercise_id'],null],['set_logs_substituted_idx',['substituted_for'],'substituted_for IS NOT NULL'],['message_revisions_tenant_message_idx',['tenant_id','message_id','revised_at'],null],['audit_log_tenant_client_created_idx',['tenant_id','client_id','created_at'],'client_id IS NOT NULL'],['push_subscriptions_tenant_user_idx',['tenant_id','user_id'],null],['notification_deliveries_tenant_user_idx',['tenant_id','user_id','created_at'],null]];
    for(const [name,columns,predicate]of expected){const row=await svc((tx)=>one<{columns:string[];predicate:string|null;valid:boolean;options:number[]}>(tx,sql`select array(select a.attname::text from unnest(i.indkey::smallint[])with ordinality k(num,ord)join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.num where k.ord<=i.indnkeyatts order by k.ord)as columns,pg_get_expr(i.indpred,i.indrelid)as predicate,i.indisvalid as valid,i.indoption::smallint[] as options from pg_index i where i.indexrelid=${name}::regclass`));expect(row.columns).toEqual(columns);expect(canonical(row.predicate)).toBe(canonical(predicate));expect(row.valid).toBe(true);if(name==='audit_log_tenant_client_created_idx'||name==='notification_deliveries_tenant_user_idx')expect((row.options[2]??0)&1).toBe(1);}
  });
  for(const actorName of ['o1','s2']as const)it(`N30 packages ${actorName} DELETE id subscription/no-reference`,async()=>{
    const f=await buildPrivateFixture();const actor=actorName==='s2'?await mkMembership(f.s2,{permissions:{client_scope:'all',modules:{packages:['delete']}}}):f.o1;
    const pack=await mkPackage(f.t1);await mkSubscription(f.t1,undefined,pack);
    await refusal(()=>as(actor,(tx)=>tx.execute(sql`delete from packages where id=${pack}`)),'23503','subscriptions_package_fk');
    const free=await mkPackage(f.t1);expect(await as(actor,(tx)=>q(tx,sql`delete from packages where id=${free} returning id`))).toEqual([{id:free}]);expect(await serviceRowWhere('packages',sql`id=${free}`)).toEqual([]);
  });
  it('N31 memberships o1/svc DELETE id privilege then service assignment cascade/task refusal',async()=>{
    const f=await buildPrivateFixture();const member=await mkMembership(f.s2);const before=await state();
    const privilege=await expectPrivilege(()=>as(f.o1,(tx)=>tx.execute(sql`delete from memberships where id=${member.membershipId}`)));expect(privilege.message).toMatch(/^permission denied for table memberships\b/i);expect(await state()).toEqual(before);
    expect(await as(f.o1,(tx)=>q(tx,sql`update memberships set status='disabled' where id=${member.membershipId} returning id,status`))).toEqual([{id:member.membershipId,status:'disabled'}]);
    const cascaded=await mkMembership(f.s2,{assignedClientIds:[f.clientA]});await svc((tx)=>tx.execute(sql`delete from memberships where id=${cascaded.membershipId}`));expect(await serviceRowWhere('staff_client_assignments',sql`membership_id=${cascaded.membershipId}`)).toEqual([]);
    const busy=await mkMembership(f.s2,{assignedClientIds:[f.clientA]});await seeded('tasks',f,f.o1,{assignee_membership_id:busy.membershipId});
    await refusal(()=>svc((tx)=>tx.execute(sql`delete from memberships where id=${busy.membershipId}`)),'23503','tasks_assignee_fk');
    const free=await mkMembership(f.s2);await svc((tx)=>tx.execute(sql`delete from memberships where id=${free.membershipId}`));expect(await serviceRowWhere('memberships',sql`id=${free.membershipId}`)).toEqual([]);
  });
  it('N32 media svc/o1/ua DELETE id referenced proof versus tenant asset and own soft-delete',async()=>{
    const f=await buildPrivateFixture();const payment=await mkPayment(f.t1,f.clientA,f.subA);const proof=await seeded('media',f,f.ua,{purpose:'payment_proof'});
    await svc((tx)=>tx.execute(sql`update payments set proof_media_id=${proof.id} where id=${payment}`));
    await refusal(()=>remove('media',proof),'23503','payments_proof_media_fk');const free=await seeded('media',f);await remove('media',free);expect(await serviceRowWhere('media',keyWhere('media',free))).toEqual([]);
    for(const actor of [f.o1,f.ua]){
      await expectNoEffect(actor,sql`delete from media where id=${proof.id}`,'media',sql`id=${proof.id}`);
      if(actor.role==='owner'){const asset=await seeded('media',f,f.o1,{client_id:null,bucket:'tenant-assets',path:`${f.t1}/assets/${randomUUID()}.jpg`});expect(await as(actor,(tx)=>q(tx,sql`delete from media where id=${asset.id} returning id`))).toEqual([{id:asset.id}]);}
      else{const own=await seeded('media',f,f.ua);const stored=await as(actor,(tx)=>q<{id:string;deleted_at:Date}>(tx,sql`update media set deleted_at=now() where id=${own.id} returning id,deleted_at`));expect(stored[0]?.id).toBe(own.id);expect(stored[0]?.deleted_at).toBeInstanceOf(Date);}
    }
  });
  for(const family of ['program','nutrition','form']as const)it(`N33 ${family} heads o1 DELETE template_id all-draft referenced/unreferenced`,async()=>{
    const f=await buildPrivateFixture();const table=family==='program'?'programs':family==='nutrition'?'nutrition_plans':'forms';const versions=family==='program'?'program_versions':family==='nutrition'?'nutrition_plan_versions':'form_versions';
    const parent=await mkVersion(f.t1,{family});await seeded(table,f,f.o1,{kind:'client',client_id:f.clientA,template_id:parent.headId});
    await refusal(()=>as(f.o1,(tx)=>tx.execute(sql`delete from ${sql.identifier(table)} where id=${parent.headId}`)),'23503',`${table}_template_fk`);
    const free=await mkVersion(f.t1,{family});expect(await as(f.o1,(tx)=>q(tx,sql`delete from ${sql.identifier(table)} where id=${free.headId} returning id`))).toEqual([{id:free.headId}]);expect(await serviceRowWhere(versions,sql`id=${free.versionId}`)).toEqual([]);
  });
  it('N34 notifications ua/ub DELETE id own delivery cascade other users unchanged',async()=>{
    const f=await buildPrivateFixture();const own=await seeded('notifications',f,f.ua);const delivery=await seeded('notification_deliveries',f,f.ua,{notification_id:own.id});const otherBefore=await serviceRowWhere('notification_deliveries',sql`user_id<>${f.ua.userId}`);
    await expectNoEffect(f.ub,sql`delete from notifications where id=${own.id}`,'notifications',sql`id=${own.id}`);
    const b=await seeded('notifications',f,f.ub);expect(await as(f.ub,(tx)=>q(tx,sql`delete from notifications where id=${b.id} returning id`))).toEqual([{id:b.id}]);
    expect(await as(f.ua,(tx)=>q(tx,sql`delete from notifications where id=${own.id} returning id`))).toEqual([{id:own.id}]);expect(await serviceRowWhere('notification_deliveries',sql`id=${delivery.id}`)).toEqual([]);expect(await serviceRowWhere('notification_deliveries',sql`user_id<>${f.ua.userId}`)).toEqual(otherBefore);
  });
  for(const table of ['exercises','foods']as const)for(const actorName of ['o1','s2']as const)it(`N35 ${table} ${actorName}/svc DELETE id retirement based_on SET NULL`,async()=>{
    const f=await buildPrivateFixture();const row=await seeded(table,f);const before=await state();const privilege=await expectPrivilege(()=>as(f[actorName],(tx)=>tx.execute(sql`delete from ${sql.identifier(table)} where id=${row.id}`)));expect(privilege.message).toMatch(new RegExp(`^permission denied for table ${table}\\b`,'i'));expect(await state()).toEqual(before);
    expect(await as(f[actorName],(tx)=>q(tx,sql`update ${sql.identifier(table)} set hidden=true where id=${row.id} returning id,hidden`))).toEqual([{id:row.id,hidden:true}]);
    const copy=await seeded(table,f,f.o1,{based_on_id:row.id});await remove(table,row);expect((await serviceRowWhere(table,sql`id=${copy.id}`))[0]?.based_on_id).toBeNull();
    if(table==='exercises')for(const column of ['exercise_id','substituted_for']as const){const parent=await seeded('exercises',f);const based=await seeded('exercises',f,f.o1,{based_on_id:parent.id});const child=await seeded('set_logs',f,f.o1,{[column]:parent.id});await refusal(()=>remove('exercises',parent),'23503',column==='exercise_id'?'set_logs_exercise_fk':'set_logs_substituted_fk');expect((await serviceRowWhere('set_logs',sql`id=${child.id}`))[0]?.[column]).toBe(parent.id);expect((await serviceRowWhere('exercises',sql`id=${based.id}`))[0]?.based_on_id).toBe(parent.id);const free=await seeded('exercises',f);await remove('exercises',free);expect(await serviceRowWhere('exercises',sql`id=${free.id}`)).toEqual([]);}
  });
  for(const table of ['clients','payments','messages','consents','conversations','metric_entries','client_flags','ai_requests']as const)for(const actorName of ['o1','ua','s1']as const)it(`N36 ${table} ${actorName} DELETE id private physical history`,async()=>{
    const f=await buildPrivateFixture();const actor=f[actorName];let row:Record<string,unknown>;
    if(table==='clients')row=(await serviceRowWhere('clients',sql`id=${f.clientA}`))[0]!;else if(table==='conversations')row=(await serviceRowWhere('conversations',sql`id=${f.convA}`))[0]!;else row=await seeded(table,f,actor);
    const before=await state();const privilege=await expectPrivilege(()=>as(actor,(tx)=>tx.execute(sql`delete from ${sql.identifier(table)} where ${keyWhere(table,row)}`)));expect(privilege.message).toMatch(new RegExp(`^permission denied for table ${table}\\b`,'i'));expect(await state()).toEqual(before);
    if(table==='metric_entries'){const append=await makeRow(table,f,actor);expect((await as(actor,(tx)=>insertRow(tx,table,append)))[0]?.id).toBe(append.id);}
    else{const found=await as(actor,(tx)=>q(tx,sql`select * from ${sql.identifier(table)} where ${keyWhere(table,row)}`));const invisible=actor.role==='client'&&(table==='client_flags'||table==='ai_requests');expect(found).toHaveLength(invisible?0:1);if(!invisible)expect(found[0]?.id).toBe(row.id);else expect(await as(actor,(tx)=>q(tx,sql`select id from clients`))).toEqual([{id:f.clientA}]);}
  });
});
