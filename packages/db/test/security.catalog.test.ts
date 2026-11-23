import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb } from '../src/client';
import { clientColumns } from '../src/client-columns';
import { buildFixture, truncateAll } from './fixtures';
import { buildPrivateFixture } from './factories';
import { as, svc, q, one, withProbe } from './helpers';
import { TABLE_GRANTS, POLICY_CONTRACTS, makeRow, insertRow, type MatrixTable } from './matrix';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const tables = Object.keys(TABLE_GRANTS) as MatrixTable[];
const read = (path: string) => readFileSync(join(root, path), 'utf8');
function files(path: string): string[] {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(`${path}/${e.name}`) : [`${path}/${e.name}`]);
}
function querySources(roots: string[], sourceReader: (file: string) => string = read) {
  const sources = new Map<string, string>();
  const violations: string[] = [];
  const routers: { file: string; staffOnly: boolean }[] = [];
  const found = new Set<string>();
  const pending = [...roots];
  const source = (file: string): string | undefined => {
    if (sources.has(file)) return sources.get(file)!;
    if (sourceReader === read && !existsSync(join(root, file))) return undefined;
    try { const value = sourceReader(file); sources.set(file, value); return value; } catch { return undefined; }
  };
  const parse = (file: string, value: string) => ts.createSourceFile(file, value, ts.ScriptTarget.Latest, true);
  const localTarget = (file: string, module: string) =>
    module.startsWith('.') ? posix.normalize(posix.join(dirname(file).replace(/\\/g, '/'), module))
      : module === '@dawlyy/db' ? 'packages/db/src/index'
        : module.startsWith('@dawlyy/db/') ? 'packages/db/src/' + module.slice('@dawlyy/db/'.length)
          : module.startsWith('@/') ? 'apps/web/' + module.slice(2) : undefined;
  const resolve = (file: string, module: string) => {
    const target = localTarget(file, module);
    if (!target) return undefined;
    const stem = target.replace(/\.js$/, '');
    const resolved = [target, stem + '.ts', stem + '.tsx', stem + '/index.ts', stem + '/index.tsx']
      .find(candidate => /\.tsx?$/.test(candidate) && source(candidate) !== undefined);
    if (!resolved) violations.push(file + ': unresolved local import ' + module);
    return resolved;
  };
  const runtimeImport = (node: ts.ImportDeclaration | ts.ExportDeclaration) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) return true;
      if (clause.isTypeOnly) return false;
      const bindings = clause.namedBindings;
      return !!clause.name || !bindings || !ts.isNamedImports(bindings) || bindings.elements.some(element => !element.isTypeOnly);
    }
    if (node.isTypeOnly) return false;
    return !node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.some(element => !element.isTypeOnly);
  };
  const imported = (ast: ts.SourceFile, name: string, moduleFile: string, exported = name) =>
    ast.statements.some(node => ts.isImportDeclaration(node) && runtimeImport(node)
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      && resolve(ast.fileName, node.moduleSpecifier.text) === moduleFile
      && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some(element => !element.isTypeOnly
        && element.name.text === name && (element.propertyName?.text ?? element.name.text) === exported));
  const methodName = (node: ts.Expression): string | undefined =>
    ts.isPropertyAccessExpression(node) ? node.name.text
      : ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : undefined;
  const registration = (node: ts.Node, receiver: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === receiver;
  const staffOnly = (ast: ts.SourceFile, receiver: string) => {
    if (!imported(ast, 'requireStaffRole', 'apps/web/src/api/middleware/auth.ts')
      && !imported(ast, 'requireStaffRole', 'apps/web/src/api/middleware/staff-only.ts')) return false;
    let firstHandler = Infinity; let guard = Infinity; let auth = Infinity;
    const visit = (node: ts.Node): void => {
      if (registration(node, receiver)) {
        const method = methodName(node.expression);
        if (['openapi', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all', 'on', 'route', 'mount'].includes(method ?? '')) firstHandler = Math.min(firstHandler, node.pos);
        // Only unconditional top-level wildcard middleware establishes the boundary.
        const [path, middleware] = node.arguments;
        if (method === 'use' && ts.isExpressionStatement(node.parent) && ts.isSourceFile(node.parent.parent)
          && node.arguments.length === 2 && path && ts.isStringLiteral(path) && path.text === '*'
          && middleware && ts.isIdentifier(middleware)) {
          if (middleware.text === 'requireStaffRole') guard = Math.min(guard, node.pos);
          if (middleware.text === 'requireAuthMiddleware'
            && imported(ast, 'requireAuthMiddleware', 'apps/web/src/api/middleware/auth.ts')) auth = Math.min(auth, node.pos);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    return auth < guard && guard < firstHandler;
  };
  while (pending.length) {
    const file = pending.pop()!;
    if (found.has(file)) continue;
    found.add(file);
    const value = source(file);
    if (value === undefined) { violations.push(file + ': missing source'); continue; }
    const ast = parse(file, value);
    const imports = new Map<string, { file: string; exported: string }>();
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !runtimeImport(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const target = resolve(file, node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (target && bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (!binding.isTypeOnly) imports.set(binding.name.text, { file: target, exported: binding.propertyName?.text ?? binding.name.text });
      }
    }
    const excluded = new Set<string>();
    const mounts = (node: ts.Node): void => {
      if (registration(node, 'app') && (node.expression as ts.PropertyAccessExpression).name.text === 'route') {
        const mounted = node.arguments[1];
        const binding = mounted && ts.isIdentifier(mounted) ? imports.get(mounted.text) : undefined;
        if (!binding) violations.push(file + ': unresolved mounted router ' + (mounted?.getText(ast) ?? '<missing>'));
        else {
          const routerAst = parse(binding.file, source(binding.file)!);
          const staff = staffOnly(routerAst, binding.exported);
          routers.push({ file: binding.file, staffOnly: staff });
          if (staff) excluded.add(binding.file);
          else pending.push(binding.file);
        }
      }
      ts.forEachChild(node, mounts);
    };
    mounts(ast);
    const enqueue = (module: string) => { const target = resolve(file, module); if (target && !excluded.has(target)) pending.push(target); };
    for (const node of ast.statements) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && runtimeImport(node)
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) enqueue(node.moduleSpecifier.text);
    }
    const dynamicImports = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) enqueue(argument.text);
        else violations.push(file + ': nonliteral runtime import');
      }
      ts.forEachChild(node, dynamicImports);
    };
    dynamicImports(ast);
    const unwrap = (node: ts.Expression): ts.Expression =>
      ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) ? unwrap(node.expression) : node;
    const rootName = (node: ts.Expression): string | undefined =>
      ts.isIdentifier(node) ? node.text
        : ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? rootName(node.expression) : undefined;
    const mutated = new Set<string>();
    const mutations = (node: ts.Node): void => {
      let target: ts.Expression | undefined;
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) target = node.left;
      if (ts.isDeleteExpression(node)) target = node.expression;
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) target = node.operand;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && ['Object', 'Reflect'].includes(node.expression.expression.text)
        && ['assign', 'defineProperty', 'defineProperties', 'set', 'setPrototypeOf'].includes(node.expression.name.text)) target = node.arguments[0];
      const name = target ? rootName(target) : undefined;
      if (name) mutated.add(name);
      ts.forEachChild(node, mutations);
    };
    mutations(ast);
    const binds = (name: ts.BindingName, target: string): boolean => ts.isIdentifier(name) ? name.text === target
      : name.elements.some(element => ts.isBindingElement(element) && binds(element.name, target));
    const binding = (name: string, at: ts.Node): { constant: boolean; initializer?: ts.Expression } | undefined => {
      for (let scope: ts.Node | undefined = at; scope; scope = scope.parent) {
        if (ts.isFunctionLike(scope) && scope.parameters.some(parameter => binds(parameter.name, name))) return { constant: false };
        if ((ts.isFunctionExpression(scope) || ts.isClassExpression(scope)) && scope.name?.text === name) return { constant: false };
        if (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) {
          const declarations = scope.initializer;
          if (declarations && ts.isVariableDeclarationList(declarations)
            && declarations.declarations.some(declaration => binds(declaration.name, name))) return { constant: false };
        }
        if (ts.isCatchClause(scope) && scope.variableDeclaration && binds(scope.variableDeclaration.name, name)) return { constant: false };
        if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
        for (const statement of scope.statements) {
          if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return { constant: false };
          if (!ts.isVariableStatement(statement)) continue;
          for (const declaration of statement.declarationList.declarations) {
            if (binds(declaration.name, name)) return {
              constant: !!(statement.declarationList.flags & ts.NodeFlags.Const) && ts.isIdentifier(declaration.name),
              ...(declaration.initializer ? { initializer: declaration.initializer } : {}),
            };
          }
        }
      }
      return undefined;
    };
    const members = (node: ts.Expression): string[] | undefined => {
      if (ts.isIdentifier(node)) return [node.text];
      if (!ts.isPropertyAccessExpression(node)) return undefined;
      const parent = members(node.expression);
      return parent ? [...parent, node.name.text] : undefined;
    };
    // Static SQL may contain functions, casts, keywords and literals, but no unregistered column identifiers.
    const sqlWords = new Set(['count', 'to_char', 'coalesce', 'case', 'when', 'then', 'else', 'end',
      'at', 'time', 'zone', 'is', 'null', 'not', 'distinct', 'filter', 'where', 'and', 'or', 'as', 'cast',
      'integer', 'int', 'int2', 'int4', 'int8', 'bigint', 'numeric', 'decimal', 'text', 'varchar',
      'boolean', 'bool', 'date', 'timestamp', 'timestamptz', 'double', 'precision', 'real',
      'current_timestamp', 'current_date', 'true', 'false', 'sum', 'avg', 'min', 'max', 'lower', 'upper',
      'length', 'concat', 'round', 'abs', 'ceil', 'ceiling', 'floor', 'greatest', 'least', 'nullif',
      'trim', 'ltrim', 'rtrim', 'btrim', 'replace', 'timezone', 'date_trunc']);
    const sqlTextSafe = (value: string) => {
      const executable = value.replace(/'(?:''|[^'])*'/g, '').replace(/\b\d+\.\d+\b/g, '0');
      return !/["$.]/.test(executable) && (executable.match(/[a-z_][a-z_0-9]*/gi) ?? []).every(word => sqlWords.has(word.toLowerCase()));
    };
    const projectionImported = imported(ast, 'clientColumns', 'packages/db/src/index.ts')
      || imported(ast, 'clientColumns', 'packages/db/src/client-columns.ts');
    const sqlImported = ast.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text === 'drizzle-orm' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && node.importClause.namedBindings.elements.some(element => !element.isTypeOnly && element.name.text === 'sql' && !element.propertyName));
    const projection = (input: ts.Expression, seen = new Set<ts.Node>(), columnOnly = false): boolean => {
      const node = unwrap(input);
      if (seen.has(node)) return false;
      const next = new Set(seen).add(node);
      if (ts.isIdentifier(node)) {
        const local = binding(node.text, node);
        return !!local?.constant && !mutated.has(node.text) && !!local.initializer && projection(local.initializer, next, columnOnly);
      }
      if (ts.isPropertyAccessExpression(node)) {
        const parts = members(node);
        if (!projectionImported || !parts || parts[0] !== 'clientColumns' || binding('clientColumns', node) || mutated.has('clientColumns')) return false;
        const map = (clientColumns as Record<string, object>)[parts[1] ?? ''];
        if (!Object.hasOwn(clientColumns, parts[1] ?? '') || !map) return false;
        return parts.length === 2 ? !columnOnly : parts.length === 3 && Object.hasOwn(map, parts[2]!);
      }
      if (ts.isObjectLiteralExpression(node) && !columnOnly) return node.properties.length > 0 && node.properties.every(property =>
        ts.isSpreadAssignment(property) ? projection(property.expression, next)
          : ts.isPropertyAssignment(property) && projection(property.initializer, next, true));
      if (ts.isTaggedTemplateExpression(node) && sqlImported && ts.isIdentifier(node.tag) && node.tag.text === 'sql' && !binding('sql', node)) {
        if (ts.isNoSubstitutionTemplateLiteral(node.template)) return sqlTextSafe(node.template.text);
        return node.template.templateSpans.every(span => projection(span.expression, next, true))
          && [node.template.head.text, ...node.template.templateSpans.map(span => span.literal.text)].every(sqlTextSafe);
      }
      return false;
    };
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
        const method = methodName(node.expression) ?? '';
        if (['select', 'selectDistinct', 'selectDistinctOn'].includes(method)) {
          const index = method === 'selectDistinctOn' ? 1 : 0;
          if (node.arguments.length !== index + 1 || !projection(node.arguments[index]!)) {
            const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
            violations.push(file + ':' + line + ': forbidden SELECT projection ' + node.getText(ast).slice(0, 220));
          }
        }
        if (/^find(?:First|Many)$/.test(method)) violations.push(file + ': client relational select-all is forbidden');
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (/select\s+\*/i.test(value)) violations.push(file + ': select * is forbidden');
  }
  return { files: [...found], violations: [...new Set(violations)], routers };
}
beforeAll(async () => {
  if(!process.env.DATABASE_URL||!process.env.DATABASE_URL_SERVICE)throw new Error('Suite C requires DATABASE_URL and DATABASE_URL_SERVICE; security tests never skip.');
  await buildFixture();
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
const extensionFree = sql`not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`;
const functionSignatures = [
  'app.uid()', 'app.membership()', 'app.membership_id()', 'app.tenant_id()', 'app.role()', 'app.client_id()',
  'app.is_staff()', 'app.is_owner()', 'app.is_client()', 'app.sees_all_clients()', 'app.assigned_client_ids()',
  'app.accessible_user_ids()', 'app.can_access_client(uuid)', 'app.can_access_user(uuid)', 'app.has_perm(text, text)',
  'app.guard_resolve(jsonb, text)', 'app.audit(text, text, text, jsonb, jsonb, text, text)',
  // 0008: F grants only these three new callable definer signatures.
  'app.void_entry(text, uuid, text)', 'app.approve_ai_draft(uuid, text)', 'app.raise_red_flag(text, uuid, text, text)',
  'app.emit_event(text, text, text, jsonb)', 'app.register_push(text, jsonb, text)', 'app.advance_due(uuid)', 'app.team_directory()',
].sort();

// Preserve boolean grouping while normalizing deparser casts, aliases, IN/ANY and redundant atom parentheses.
function expression(source: string | null): unknown {
  if (source === null) return null;
  let s = source.replace(/"/g, '').replace(/::(?:[a-z_]+\.)?[a-z_]+(?:\[\])?/gi, '')
    .replace(/\b(?:public\.)?[a-z_]+\.(?!(?:uid|tenant_id|client_id|is_staff|is_owner|is_client|membership_id|sees_all_clients|assigned_client_ids|accessible_user_ids|has_perm)\b)([a-z_]+)\b/gi, (all, col: string) => /^(?:app|old|new)\./i.test(all) ? all : col)
    .replace(/\s+AS\s+[a-z_]+/gi, '').replace(/=\s*ANY\s*\(ARRAY\[([^\]]*)\]\)/gi, ' IN ($1)')
    .replace(/<>\s*ALL\s*\(ARRAY\[([^\]]*)\]\)/gi, ' NOT IN ($1)').trim();
  function unwrap(value: string): string {
    while (value.startsWith('(') && value.endsWith(')')) {
      let depth = 0; let quoted = false; let wraps = true;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === "'") { if (quoted && value[i + 1] === "'") { i++; continue; } quoted = !quoted; }
        if (quoted) continue;
        if (value[i] === '(') depth++; if (value[i] === ')') depth--;
        if (depth === 0 && i < value.length - 1) { wraps = false; break; }
      }
      if (!wraps) break; value = value.slice(1, -1).trim();
    }
    return value;
  }
  s = unwrap(s);
  for (const operator of ['OR', 'AND']) {
    let depth = 0; let quoted = false; let start = 0; const parts: string[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "'") { if (quoted && s[i + 1] === "'") { i++; continue; } quoted = !quoted; }
      if (quoted) continue;
      if (s[i] === '(' || s[i] === '[') depth++; if (s[i] === ')' || s[i] === ']') depth--;
      const token = s.slice(i).match(new RegExp(`^\\s+${operator}\\s+`, 'i'));
      if (depth === 0 && token) { parts.push(s.slice(start, i)); i += token[0].length - 1; start = i + 1; }
    }
    if (parts.length) { parts.push(s.slice(start)); return [operator, ...parts.map((p) => expression(p))]; }
  }
  return s.replace(/[()\s]/g, '').toLowerCase();
}

// §6.3 golden: entered from the frozen document, with shared literal shapes factored only for readability.
const base = { stamp_insert: { created_by: 'uid' }, immutable: ['id', 'tenant_id', 'created_by', 'created_at'], stamp_update: { updated_at: 'now' } };
const head = { ...base, insert_eq: { published_version_id: null }, immutable: ['id', 'tenant_id', 'kind', 'client_id', 'template_id', 'created_by', 'created_at', 'published_version_id'] };
const publishEdges = [['draft','in_review'],['in_review','approved'],['in_review','draft'],['approved','published'],['draft','published'],['published','superseded'],['draft','archived'],['in_review','archived'],['approved','archived'],['published','archived'],['superseded','archived']];
function version(headColumn: string, module: string): Record<string, unknown> {
  return { stamp_insert: { created_by: 'uid' }, insert_eq: { published_at: null, published_by: null, superseded_at: null },
    immutable: ['id','tenant_id','client_id',headColumn,'version_no','created_by','created_at','published_at','published_by','superseded_at'],
    editable_in: [{ column: 'status', states: ['draft'], cols: ['document','change_note'] }],
    transitions: { column: 'status', insert: ['draft','published'], edges: publishEdges }, perm_transitions: { published: [module,'publish'] },
    on_transition: { column: 'status', stamps: { published: { published_at: 'now', published_by: 'uid' }, superseded: { superseded_at: 'now' } } }, delete_when: { column: 'status', states: ['draft'] } };
}
const golden: Record<string, Record<string, unknown>> = {
  tenants: { immutable: ['id','client_counter','receipt_counter','created_at'], stamp_update: { updated_at: 'now' } },
  memberships: { immutable: ['id','tenant_id','user_id','client_id','created_at'], stamp_update: { updated_at: 'now' }, client_update: ['display_name','phone','locale','last_seen_at'], staff_update: ['display_name','phone','locale','last_seen_at'] },
  staff_client_assignments: { stamp_insert: { assigned_by: 'uid' } },
  invitations: { stamp_insert: { invited_by: 'uid' }, insert_eq: { status: 'pending', accepted_at: null, accepted_user_id: null }, immutable: ['id','tenant_id','token_hash','role','client_id','invited_by','accepted_at','accepted_user_id','created_at'], staff_update: ['status'], transitions: { column: 'status', insert: ['pending'], edges: [['pending','revoked'],['pending','expired']] } },
  business_settings: { stamp_insert: { updated_by: 'uid' }, immutable: ['tenant_id'], stamp_update: { updated_by: 'uid', updated_at: 'now' } },
  user_preferences: { immutable: ['tenant_id','user_id'], update_allow: ['preferences'], stamp_update: { updated_at: 'now' } },
  consents: { stamp_insert: { accepted_at: 'now' }, insert_eq: { withdrawn_at: null }, update_allow: ['withdrawn_at'], set_once: ['withdrawn_at'], on_set: { withdrawn_at: { withdrawn_at: 'now' } } },
  clients: { stamp_insert: { created_by: 'uid' }, insert_eq: { code: '', membership_id: null }, immutable: ['id','tenant_id','code','membership_id','created_by','created_at'], stamp_update: { updated_at: 'now' }, client_update: ['first_name','last_name','display_name','email','phone','whatsapp','birth_date','locale','timezone','profile','search_key'] },
  client_notes: { stamp_insert: { author_user_id: 'uid' }, immutable: ['id','tenant_id','client_id','author_user_id','created_at'], stamp_update: { updated_at: 'now' } },
  client_flags: { stamp_insert: { raised_at: 'now' }, insert_eq: { resolved_by: null }, immutable: ['id','tenant_id','client_id','raised_at','resolved_by'], on_set: { resolved_at: { resolved_at: 'now', resolved_by: 'uid' } }, on_clear: { resolved_at: { resolved_by: 'null' } } },
  tasks: { stamp_insert: { created_by: 'uid' }, insert_eq: { completed_at: null, completed_by: null, source: 'manual', source_event_id: null, dedupe_key: null }, immutable: ['id','tenant_id','client_id','created_by','created_at','completed_at','completed_by','source','source_event_id','dedupe_key'], stamp_update: { updated_at: 'now' }, transitions: { column: 'state', insert: ['open'], edges: [['open','snoozed'],['snoozed','open'],['open','done'],['snoozed','done'],['open','cancelled'],['snoozed','cancelled'],['done','open'],['cancelled','open']] }, on_transition: { column: 'state', stamps: { done: { completed_at: 'now', completed_by: 'uid' }, open: { completed_at: 'null', completed_by: 'null' }, snoozed: { completed_at: 'null', completed_by: 'null' }, cancelled: { completed_at: 'null', completed_by: 'null' } } } },
  ai_requests: { stamp_insert: { created_by: 'uid' }, insert_eq: { approved_by: null, approved_at: null }, immutable: ['id','tenant_id','client_id','kind','input','created_by','created_at','approved_by','approved_at'], editable_in: [{ column: 'state', states: ['draft'], cols: ['output','model'] }], transitions: { column: 'state', insert: ['draft'], edges: [['draft','approved'],['draft','rejected']] }, perm_transitions: { approved: ['ai','publish'] }, on_transition: { column: 'state', stamps: { approved: { approved_at: 'now', approved_by: 'uid' } } } },
  // 0008: D ai_drafts_50_guard JSON, copied verbatim.
  ai_drafts: JSON.parse('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"status":"draft","approved_by":null,"approved_at":null},"immutable":["id","tenant_id","client_id","kind","input_hash","input_version","provider","created_by","created_at","approved_by","approved_at"],"stamp_update":{"updated_at":"now"},"transitions":{"column":"status","insert":["draft"],"edges":[["draft","rejected"]]},"editable_in":[{"column":"status","states":["draft"],"cols":["body"]}]}') as Record<string, unknown>,
  // 0008: E red_flags_50_guard JSON, copied verbatim.
  red_flags: JSON.parse('{"immutable":["id","tenant_id","client_id","source","source_id","category","matched","evidence_hash","created_at","handled_by","handled_at"],"transitions":{"column":"status","insert":["open"],"edges":[["open","handled"]]},"on_transition":{"column":"status","stamps":{"handled":{"handled_by":"uid","handled_at":"now"}}}}') as Record<string, unknown>,
  packages: { ...base, require_perm: { insert: ['packages','create'], update: ['packages','edit'], delete: ['packages','delete'] } },
  subscriptions: { ...base, immutable: ['id','tenant_id','client_id','package_id','package_snapshot','price','currency','created_by','created_at'], require_perm: { insert: ['billing','create'], update: ['billing','edit'] }, transitions: { column: 'state', insert: ['pending','active'], edges: [['pending','active'],['active','grace'],['active','expired'],['grace','expired'],['active','paused'],['paused','active'],['active','cancelled'],['grace','cancelled'],['paused','cancelled'],['pending','cancelled'],['suspended','cancelled'],['pending','suspended'],['active','suspended'],['grace','suspended'],['paused','suspended'],['expired','suspended'],['suspended','active'],['expired','active'],['grace','active']] } },
  subscription_events: { stamp_insert: { actor_user_id: 'uid' }, require_perm: { insert: ['billing','edit'] } },
  client_entitlement_overrides: { stamp_insert: { created_by: 'uid' }, insert_eq: { revoked_at: null }, update_allow: ['revoked_at'], set_once: ['revoked_at'], on_set: { revoked_at: { revoked_at: 'now' } }, require_perm: { insert: ['billing','edit'], update: ['billing','edit'] } },
  payments: { stamp_insert: { created_by: 'uid' }, insert_eq: { verified_at: null, verified_by: null, receipt_no: null, refunded_at: null, refund_amount: null, rejected_reason: null }, client_insert_eq: { state: 'pending', notes: null, provider: null, provider_ref: null }, immutable: ['id','tenant_id','client_id','created_by','created_at','verified_at','verified_by','receipt_no','refunded_at','provider','provider_ref'], set_once: ['subscription_id'], monotonic: ['refund_amount'], stamp_update: { updated_at: 'now' }, client_update: ['proof_media_id','reference','paid_at'], editable_in: [{ column: 'state', states: ['pending'], cols: ['amount','currency','method','proof_media_id','reference','paid_at'] }, { column: 'state', states: ['verified'], cols: ['refund_amount'] }, { column: 'state', states: ['pending'], cols: ['rejected_reason'] }], transitions: { column: 'state', insert: ['pending','verified'], edges: [['pending','verified'],['pending','rejected'],['verified','refunded']] }, perm_transitions: { verified: ['billing','verify'], rejected: ['billing','verify'], refunded: ['billing','verify'] }, require_perm: { insert: ['billing','create'], update: ['billing','edit'] }, on_transition: { column: 'state', stamps: { verified: { verified_at: 'now', verified_by: 'uid' } } }, on_set: { refund_amount: { refunded_at: 'now' } } },
  exercises: base, foods: base, tenant_hidden_items: { stamp_insert: { hidden_by: 'uid' } },
  programs: head, nutrition_plans: head, forms: { ...head, immutable: ['id','tenant_id','kind','form_kind','client_id','template_id','created_by','created_at','published_version_id'] },
  program_versions: version('program_id','programs'), nutrition_plan_versions: version('plan_id','nutrition'), form_versions: version('form_id','forms'),
  metric_entries: { client_insert_eq: { source: 'manual' } },
  measurement_sets: { client_insert_eq: { taken_by: 'client' }, immutable: ['id','tenant_id','client_id','client_uuid','taken_by','created_at'], monotonic: ['client_updated_at'], client_update: [] },
  progress_photo_sets: { immutable: ['id','tenant_id','client_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: ['local_date','poses','weight_kg','note','client_updated_at'] },
  inbody_records: { stamp_insert: { created_by: 'uid' }, client_insert_eq: { source: 'manual' }, immutable: ['id','tenant_id','client_id','created_by','created_at','normalized'], client_update: ['local_date','raw_media_id','fields','note'], insert_eq: { normalized: {} } },
  workout_sessions: { immutable: ['id','tenant_id','client_id','program_id','program_version_id','phase_id','week_id','day_id','workout_id','planned_workout','client_uuid','created_at','summary'], monotonic: ['client_updated_at'], stamp_update: { updated_at: 'now' }, client_update: ['state','local_date','timezone','started_at','ended_at','active_seconds','rpe_overall','mood','pain_note','client_note','client_updated_at'], insert_eq: { summary: null } },
  set_logs: { immutable: ['id','tenant_id','client_id','session_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: ['exercise_id','block_id','item_id','set_no','tag','reps','load','load_unit','duration_sec','distance_m','rpe','rir','rest_sec','completed','skipped','substituted_for','pain_flag','note','client_updated_at','deleted_at'] },
  meal_logs: { immutable: ['id','tenant_id','client_id','client_uuid','created_at'], monotonic: ['client_updated_at'], client_update: [] },
  supplement_logs: { immutable: ['id','tenant_id','client_id','client_uuid'], monotonic: ['client_updated_at'], client_update: [] },
  form_submissions: { insert_eq: { reviewed_at: null, reviewed_by: null, submitted_at: null }, client_insert_eq: { coach_feedback: null, results: null }, immutable: ['id','tenant_id','client_id','form_id','form_version_id','form_kind','calendar_event_id','subscription_id','client_uuid','created_at','submitted_at','reviewed_at','reviewed_by'], monotonic: ['client_updated_at'], stamp_update: { updated_at: 'now' }, client_update: ['answers','missing_required','state','client_updated_at'], editable_in: [{ column: 'state', states: ['scheduled','due','overdue'], cols: ['answers','missing_required'] }], transitions: { column: 'state', insert: ['scheduled','due','submitted'], edges: [['scheduled','due'],['due','overdue'],['due','submitted'],['overdue','submitted'],['submitted','waiting_for_coach'],['submitted','reviewed'],['waiting_for_coach','reviewed'],['scheduled','skipped'],['due','skipped'],['overdue','skipped'],['scheduled','rescheduled'],['due','rescheduled'],['overdue','rescheduled'],['scheduled','cancelled'],['due','cancelled'],['overdue','cancelled']] }, client_transitions: { column: 'state', insert: ['due','submitted'], edges: [['due','submitted'],['overdue','submitted']] }, on_transition: { column: 'state', stamps: { submitted: { submitted_at: 'now' }, reviewed: { reviewed_at: 'now', reviewed_by: 'uid' } } } },
  // 0008: B calendar_events_50_guard JSON, copied verbatim with the cancelled_by additions.
  calendar_events: JSON.parse('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"skipped_at":null,"cancelled_at":null,"cancelled_by":null,"source":"manual","rule_key":null},"immutable":["id","tenant_id","client_id","subscription_id","source","rule_key","created_by","created_at","completed_at","skipped_at","cancelled_at","cancelled_by"],"stamp_update":{"updated_at":"now"},"client_update":["state"],"client_transitions":{"column":"state","edges":[["scheduled","completed"],["due","completed"],["overdue","completed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"]]},"on_transition":{"column":"state","stamps":{"scheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"due":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"overdue":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"rescheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"completed":{"completed_at":"now","skipped_at":"null","cancelled_at":"null","cancelled_by":"null"},"skipped":{"skipped_at":"now","completed_at":"null","cancelled_at":"null","cancelled_by":"null"},"cancelled":{"cancelled_at":"now","completed_at":"null","skipped_at":"null","cancelled_by":"uid"}}}}') as Record<string, unknown>,
  conversations: { immutable: ['id','tenant_id','kind','client_id','created_at','last_message_at','last_message_preview'], insert_eq: { last_message_at: null, last_message_preview: null, unread_for_coach: 0, unread_for_client: 0 }, client_insert_eq: { kind: 'client', subject: null, archived_at: null }, update_to: { unread_for_client: 0, unread_for_coach: 0 }, client_update: ['unread_for_client'], staff_update: ['subject','archived_at','unread_for_coach'] },
  notifications: { update_allow: ['read_at'] }, push_subscriptions: { immutable: ['id','tenant_id','user_id','endpoint','created_at','last_used_at','failed_at'], update_allow: ['keys','user_agent'], insert_eq: { last_used_at: null, failed_at: null } },
  media: { stamp_insert: { owner_user_id: 'uid' }, insert_eq: { reviewed_by: null, reviewed_at: null }, client_insert_eq: { review_note: null }, immutable: ['id','tenant_id','client_id','owner_user_id','bucket','path','kind','purpose','created_at','reviewed_by','reviewed_at'], set_once: ['deleted_at'], client_update: ['mime_type','uploaded_at','bytes','width','height','duration_sec','metadata','deleted_at','review_state'], editable_in: [{ column: 'review_state', states: ['requested','needs_resubmission'], cols: ['mime_type'] }, { column: 'review_state', states: [null,'requested','uploaded','processing','queued_for_review','needs_resubmission','archived'], cols: ['bytes','width','height','duration_sec','metadata','uploaded_at','deleted_at'] }], transitions: { column: 'review_state', insert: [null,'requested','uploaded'], edges: [[null,'uploaded'],['requested','uploaded'],['uploaded','processing'],['uploaded','queued_for_review'],['processing','queued_for_review'],['queued_for_review','approved'],['queued_for_review','needs_resubmission'],['queued_for_review','rejected'],['needs_resubmission','uploaded'],['approved','archived'],['rejected','archived'],['needs_resubmission','archived']] }, client_transitions: { column: 'review_state', insert: [null,'requested','uploaded'], edges: [[null,'uploaded'],['requested','uploaded'],['uploaded','processing'],['uploaded','queued_for_review'],['processing','queued_for_review'],['needs_resubmission','uploaded']] }, on_transition: { column: 'review_state', stamps: { approved: { reviewed_at: 'now', reviewed_by: 'uid' }, needs_resubmission: { reviewed_at: 'now', reviewed_by: 'uid' }, rejected: { reviewed_at: 'now', reviewed_by: 'uid' } } } },
};
type Trigger = { table: string; name: string; fn: string; bits: number; columns: string[]; when: string | null; args: string[] };
const triggers: Trigger[] = [];
function trigger(table: string, suffix: string, fn: string, bits: number, args: string[] = [], columns: string[] = [], when: string | null = null): void {
  triggers.push({ table, name: `${table}_${suffix}`, fn: `app.${fn}()`, bits, columns: [...columns].sort(), when, args });
}
for (const [table, config] of Object.entries(golden)) trigger(table, '50_guard', 'guard_row', 31, [JSON.stringify(config)]);
for (const [headTable, versions, column] of [['programs','program_versions','program_id'],['nutrition_plans','nutrition_plan_versions','plan_id'],['forms','form_versions','form_id']] as const) {
  trigger(headTable, '10_head', 'head_rules', 31, [versions,column]); trigger(headTable, '10_template', 'template_ref_check', 23);
  trigger(versions, '10_version', 'version_rules', 23, [headTable,column]); trigger(versions, '20_protect', 'protect_published_version', 27, [column]);
  trigger(versions, '90_pointers', 'version_pointers', 29, [headTable,column], ['status']);
  trigger(versions, 'audit', 'audit_row', 13, ['document']); trigger(versions, 'audit_update', 'audit_row', 17, ['document'], ['status','published_at','superseded_at']);
}
trigger('messages', '10_message', 'message_rules', 23);
triggers.push({ table: 'messages', name: 'messages_after_insert', fn: 'app.on_message_insert()', bits: 5, args: [], columns: [], when: null });
triggers.push({ table: 'messages', name: 'messages_after_update', fn: 'app.on_message_update()', bits: 17, args: [], columns: ['body','deleted_at'], when: 'old.body IS DISTINCT FROM new.body OR old.deleted_at IS DISTINCT FROM new.deleted_at' });
trigger('messages', '95_revision', 'message_revision', 17, [], ['body','attachments'], 'old.body IS DISTINCT FROM new.body OR old.attachments IS DISTINCT FROM new.attachments');
trigger('form_submissions','10_submission','submission_rules',7); trigger('set_logs','10_library','set_logs_library_check',23);
for (const table of ['exercises','foods']) trigger(table,'10_library','library_ref_check',23,[table,'based_on_id']);
trigger('exercises','10_thumbnail','exercise_thumbnail_check',23);
for (const table of ['workout_sessions','meal_logs','supplement_logs']) trigger(table,'10_refs','visible_refs',23);
trigger('tasks','20_assignee','task_assignee_check',23,[],['assignee_membership_id']); trigger('media','20_proof','media_proof_rules',19,[],['deleted_at']);
trigger('memberships','40_owner','keep_one_owner',27); trigger('clients','80_assign_creator','assign_creator',5); trigger('clients','90_code','assign_client_code',7);
trigger('payments','60_refund_perm','payment_refund_permission',19,[],['refund_amount']); trigger('payments','90_receipt','payment_receipt',23);
for (const table of ['clients','client_notes','packages','invitations','consents','programs','nutrition_plans','forms','ai_requests','client_flags','media','subscriptions','subscription_events','payments','client_entitlement_overrides','memberships','staff_client_assignments','business_settings']) trigger(table,'audit','audit_row',29);
trigger('tenants','audit','audit_row',13); trigger('tenants','audit_update','audit_row',17,[],['name','slug','client_code_prefix','default_locale','timezone','currency','archived_at']);


// 0008: A archive triggers, including the tenant-exercise audit WHEN clause.
for (const [table, module] of [['clients','clients'],['programs','programs'],['nutrition_plans','nutrition'],['forms','forms'],['packages','packages'],['exercises','exercises']]) trigger(table!, '55_archive', 'guard_archive', 23, [module!]);
trigger('exercises', 'audit', 'audit_row', 17, [], ['archived_at'], 'new.tenant_id IS NOT NULL');
// 0008: B cancellation audit, BEFORE void guards and AFTER correction/audit triggers.
trigger('calendar_events', 'audit', 'audit_row', 17, [], ['state']);
for (const table of ['meal_logs','metric_entries','measurement_sets','workout_sessions']) {
  trigger(table, '45_void', 'guard_void', 31);
  trigger(table, 'void_audit', 'audit_row', 17, [], ['voided_at']);
}
trigger('set_logs', '45_parent_live', 'set_logs_parent_live', 31);
for (const table of ['meal_logs','measurement_sets']) trigger(table, '46_correct', 'apply_correction', 5, [], [], 'new.replaces_id IS NOT NULL');
// 0008: D/E audit both INSERT and UPDATE OF status; the two guards are included above.
for (const table of ['ai_drafts','red_flags']) trigger(table, 'audit', 'audit_row', 21, [], ['status']);

async function livePolicies() {
  return svc((tx) => q<{ table: MatrixTable; name: string; command: string; permissive: boolean; roles: string[]; using: string | null; check: string | null }>(tx, sql`
    select c.relname as table, p.polname as name, p.polcmd as command, p.polpermissive as permissive,
      array(select r::regrole::text from unnest(p.polroles) r) as roles,
      pg_get_expr(p.polqual,p.polrelid) as using, pg_get_expr(p.polwithcheck,p.polrelid) as check
    from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by p.polname collate "C"`));
}
async function liveTriggers() {
  const live = await svc((tx) => q<Omit<Trigger, 'args'> & { enabled: string; hex: string; nargs: number }>(tx, sql`select c.relname as table, t.tgname as name,
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
    t.tgtype::int as bits, t.tgenabled as enabled,
    array(select a.attname::text from unnest(t.tgattr::smallint[]) k join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=k order by a.attname) as columns,
    (regexp_match(pg_get_triggerdef(t.oid,true),'WHEN [(](.*)[)] EXECUTE FUNCTION'))[1] as when,
    encode(t.tgargs,'hex') as hex, t.tgnargs::int as nargs
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal and c.relnamespace='public'::regnamespace order by c.relname collate "C",t.tgname collate "C"`));
  return live.map(({hex,nargs,...t}) => ({ ...t, args: nargs === 0 ? [] : Buffer.from(hex,'hex').toString('utf8').split('\0').slice(0,-1) }));
}
// bytea tgargs contains NUL, which PostgreSQL text cannot represent; decode in JS instead (see C10 query below).
const nativeCommands: Record<string, string> = { select: 'r', insert: 'a', update: 'w', delete: 'd', all: '*' };

describe('security catalog', () => {
  it('C01 public svc SELECT table inventory migrated', async () => {
    const actual = await svc((tx) => q(tx, sql`select c.relname as name,c.relrowsecurity as rls,c.relforcerowsecurity as force from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') order by c.relname collate "C"`));
    expect(actual).toEqual(tables.sort().map((name) => ({ name, rls: true, force: false })));
  });
  it('C02 public svc SELECT every exact policy expression migrated', async () => {
    const actual = await livePolicies();
    expect(actual.map((p) => p.name)).toEqual(POLICY_CONTRACTS.map((p) => p.name).sort());
    for (const expected of POLICY_CONTRACTS) {
      const live = actual.find((p) => p.name === expected.name)!;
      expect({ table: live.table, command: live.command, permissive: live.permissive, roles: live.roles, using: expression(live.using), check: expression(live.check) }, expected.name)
        .toEqual({ table: expected.table, command: nativeCommands[expected.command], permissive: expected.permissive, roles: ['dawlyy_rls'], using: expression(expected.using), check: expression(expected.check) });
    }
    expect(await svc((tx) => q(tx, sql`select polname from pg_policy where polrelid in ('app.audit_actions'::regclass,'app.event_types'::regclass)`))).toEqual([]);
  });
  it('C03 public svc SELECT restrictive USING/WITH CHECK migrated', async () => {
    const actual = (await livePolicies()).filter((p) => !p.permissive);
    expect(actual.map((p) => p.name)).toEqual(tables.map((t) => `${t}_tenant_guard`).sort());
    for (const policy of actual) {
      const expected = POLICY_CONTRACTS.find((p) => p.name === policy.name)!;
      expect(policy.command).toBe('*'); expect(expression(policy.using)).toEqual(expression(expected.using)); expect(expression(policy.check)).toEqual(expression(expected.check));
    }
  });
  for (const table of tables) it(`C04 ${table} dawlyy_rls SELECT/INSERT/UPDATE/DELETE table and column grants migrated`, async () => {
    const privileges = await svc((tx) => q<{ privilege: string; table_grant: boolean; column_grant: boolean | null }>(tx, sql`select v as privilege,has_table_privilege('dawlyy_rls',${'public.' + table},v) as table_grant,
      case when v in ('SELECT','INSERT','UPDATE','REFERENCES') then has_any_column_privilege('dawlyy_rls',${'public.' + table},v) end as column_grant
      from unnest(array['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRUNCATE','TRIGGER']) v`));
    for (const p of privileges) {
      const expected = ['SELECT','INSERT','UPDATE','DELETE'].includes(p.privilege) && TABLE_GRANTS[table].includes(p.privilege[0]!);
      expect(p.table_grant, `${table}.${p.privilege}`).toBe(expected);
      if (p.column_grant !== null) expect(p.column_grant, `${table} column ${p.privilege}`).toBe(expected);
    }
    expect(await svc((tx) => q(tx, sql`select c.relname from pg_class c where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) and c.relkind='S' and case when c.relkind='S' then has_sequence_privilege('dawlyy_rls',c.oid,'USAGE,SELECT,UPDATE') else false end`))).toEqual([]);
    expect(await svc((tx) => q(tx, sql`select c.relname from pg_class c where c.oid in ('app.audit_actions'::regclass,'app.event_types'::regclass) and (has_table_privilege('dawlyy_rls',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('dawlyy_rls',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))`))).toEqual([]);
  });
  it('C05 app/public svc SELECT effective denial and PUBLIC ACL migrated', async () => {
    const roles = await svc((tx) => q<{ name: string }>(tx, sql`select rolname as name from pg_roles where rolname in ('dawlyy_app','anon','authenticated','service_role') or (rolname <> 'dawlyy_rls' and pg_has_role('dawlyy_app',oid,'MEMBER'))`));
    for (const role of roles) {
      expect(await svc((tx) => q(tx, sql`select c.oid::regclass::text as object from pg_class c where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) and c.relkind in ('r','p','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and case when c.relkind='S' then has_sequence_privilege(${role.name},c.oid,'USAGE,SELECT,UPDATE') else has_table_privilege(${role.name},c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(${role.name},c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end`)), role.name).toEqual([]);
      expect(await svc((tx) => q(tx, sql`select p.oid::regprocedure::text from pg_proc p where p.pronamespace in ('app'::regnamespace,'public'::regnamespace) and ${extensionFree} and has_function_privilege(${role.name},p.oid,'EXECUTE')`)), role.name).toEqual([]);
    }
    expect(await svc((tx) => q(tx, sql`select c.relname from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) and c.relkind in ('r','p','S') and a.grantee=0 union all select c.relname from pg_attribute at join pg_class c on c.oid=at.attrelid cross join lateral aclexplode(at.attacl) a where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) and a.grantee=0`))).toEqual([]);
  });
  it('C05b public/app runtime CREATE schema migrated', async () => {
    expect(await svc((tx) => q(tx, sql`select n.nspname,r.rolname from pg_namespace n cross join pg_roles r where n.nspname in ('public','app') and r.rolname in ('dawlyy_app','dawlyy_rls') and has_schema_privilege(r.oid,n.oid,'CREATE') union all select n.nspname,'PUBLIC' from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname in ('public','app') and a.grantee=0 and a.privilege_type='CREATE'`))).toEqual([]);
  });
  it('C06 app/public dawlyy_rls EXECUTE exact signatures migrated', async () => {
    const actual = await svc((tx) => q<{ signature: string }>(tx, sql`select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and ${extensionFree} and has_function_privilege('dawlyy_rls',p.oid,'EXECUTE') order by 1`));
    expect(actual.map((r) => r.signature).sort()).toEqual(functionSignatures);
  });
  it('C06b app/public PUBLIC EXECUTE ACL migrated', async () => {
    expect(await svc((tx) => q(tx, sql`select p.oid::regprocedure::text from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace in ('app'::regnamespace,'public'::regnamespace) and ${extensionFree} and a.grantee=0`))).toEqual([]);
  });
  it('C07 app svc SELECT function owner search_path and invoker contract migrated', async () => {
    const definers = ['membership','membership_id','tenant_id','role','client_id','is_staff','is_owner','is_client','sees_all_clients','assigned_client_ids','accessible_user_ids','can_access_client','can_access_user','has_perm','version_pointers','on_message_insert','on_message_update','message_revision','advance_due','set_logs_library_check','exercise_thumbnail_check','next_client_code','next_receipt_no','assign_client_code','payment_receipt','audit_row','entity_client','audit','emit_event','erase_client','close_tenant','team_directory','register_push','assign_creator','task_assignee_check','media_proof_rules'];
    // 0008: B/D/E create these SECURITY DEFINER helpers; archive/void/correction guards stay invokers.
    definers.push('void_entry', 'approve_ai_draft', 'raise_red_flag');
    const actual = await svc((tx) => q<{ name: string; definer: boolean; owner: string; config: string[] | null }>(tx, sql`select p.proname as name,p.prosecdef as definer,p.proowner::regrole::text as owner,p.proconfig as config from pg_proc p where p.pronamespace='app'::regnamespace order by p.proname`));
    for (const p of actual) { expect(p.owner).toBe('postgres'); expect(p.definer,p.name).toBe(definers.includes(p.name)); if (p.definer) expect(p.config).toContain('search_path=""'); }
    expect(await svc((tx) => q(tx, sql`select p.proname from pg_proc p where p.pronamespace='app'::regnamespace and p.prosecdef and p.proowner<>(select relowner from pg_class where oid='memberships'::regclass)`))).toEqual([]);
  });
  it('C08 public svc SELECT exact guard JSON and reachable config migrated', async () => {
    const actual = await svc((tx) => q<{ table: string; hex: string; nargs: number }>(tx, sql`select c.relname as table,encode(t.tgargs,'hex') as hex,t.tgnargs as nargs from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where c.relnamespace='public'::regnamespace and p.pronamespace='app'::regnamespace and p.proname='guard_row' order by c.relname`));
    expect(actual.map((t) => t.table)).toEqual(Object.keys(golden).sort());
    for (const t of actual) {
      expect(t.nargs).toBe(1); const config: unknown = JSON.parse(Buffer.from(t.hex,'hex').toString('utf8').replace(/\0$/, ''));
      expect(config,t.table).toEqual(golden[t.table]);
      const g = golden[t.table]!;
      const columns = new Set((await svc((tx)=>q<{name:string}>(tx,sql`select attname as name from pg_attribute where attrelid=${'public.'+t.table}::regclass and attnum>0 and not attisdropped`))).map((c)=>c.name));
      for(const key of ['immutable','set_once','monotonic','client_update','staff_update','update_allow'])if(g[key]!==undefined){expect(Array.isArray(g[key]),key).toBe(true);for(const column of g[key] as string[])expect(columns.has(column),`${t.table}.${column}`).toBe(true);}
      for(const key of ['insert_eq','client_insert_eq','update_to'])for(const column of Object.keys((g[key]??{})as object))expect(columns.has(column),`${t.table}.${column}`).toBe(true);
      const stamps=(value:unknown):void=>{expect(value!==null&&typeof value==='object'&&!Array.isArray(value)).toBe(true);for(const [column,token]of Object.entries(value as Record<string,unknown>)){expect(columns.has(column),`${t.table}.${column}`).toBe(true);expect(['uid','role','now','null']).toContain(token);}};
      for(const key of ['stamp_insert','stamp_update'])if(g[key]!==undefined)stamps(g[key]);
      for(const key of ['on_set','on_clear'])for(const [column,spec]of Object.entries((g[key]??{})as Record<string,unknown>)){expect(columns.has(column)).toBe(true);stamps(spec);}
      if(g.on_transition){const spec=g.on_transition as {column:string;stamps:Record<string,unknown>};expect(columns.has(spec.column)).toBe(true);for(const values of Object.values(spec.stamps))stamps(values);}
      const immutable = g.immutable as string[] | undefined;
      for (const column of Object.keys((g.stamp_update ?? {}) as object)) {
        for (const key of ['immutable','set_once','monotonic']) expect((g[key] as string[] | undefined) ?? []).not.toContain(column);
        expect(Object.keys((g.update_to ?? {}) as object)).not.toContain(column);
      }
      for (const command of Object.keys((g.require_perm ?? {}) as object)) expect(TABLE_GRANTS[t.table as MatrixTable]).toContain(({ insert:'I',update:'U',delete:'D' } as Record<string,string>)[command]);
      if (g.editable_in !== undefined) expect(Array.isArray(g.editable_in)).toBe(true);
      if (g.transitions) { const machine = g.transitions as { column: string }; expect(immutable ?? []).not.toContain(machine.column); expect(TABLE_GRANTS[t.table as MatrixTable]).toContain('U'); }
    }
    expect(golden.payments).not.toHaveProperty('client_transitions'); expect(golden.client_entitlement_overrides?.require_perm).not.toHaveProperty('delete');
  });
  for (const table of Object.keys(golden).filter((t) => TABLE_GRANTS[t as MatrixTable].includes('I'))) it(`C08b ${table} permitted actor INSERT created_at/updated_at forged server time`, async () => {
    const f = await buildPrivateFixture();
    const actor = table === 'conversations' ? f.ua : f.o1;
    const row = await makeRow(table as MatrixTable,f,actor);
    if (table === 'conversations') { row.kind='client'; row.client_id=f.clientA; await svc((tx) => tx.execute(sql`delete from conversations where id=${f.convA}`)); }
    const columns = await svc((tx) => q<{ name: string }>(tx, sql`select attname as name from pg_attribute where attrelid=${'public.'+table}::regclass and attname in ('created_at','updated_at') and not attisdropped`));
    for (const c of columns) row[c.name]='2001-01-01T00:00:00Z';
    await as(actor,async (tx) => {
      const now = await one<{ now: Date }>(tx,sql`select now() as now`);
      const stored = (await insertRow(tx,table as MatrixTable,row))[0]!;
      for (const c of columns) expect(stored[c.name]).toEqual(now.now);
      for (const c of ['recorded_at','local_date','client_updated_at']) if (row[c] !== undefined) {
        const value=stored[c];const expected=String(row[c]);
        expect(value instanceof Date ? (c==='local_date'?value.toISOString().slice(0,10):value.toISOString()) : String(value)).toBe(c==='local_date'?expected:new Date(expected).toISOString());
      }
    });
  });
  it('C09 public svc SELECT complete runtime cascade/set-null map migrated', async () => {
    const deletable=tables.filter((t)=>TABLE_GRANTS[t].includes('D'));
    const actual=await svc((tx)=>q(tx,sql`select child.relname as child,parent.relname as parent,c.confdeltype::text as action from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid where c.contype='f' and c.confdeltype in ('c','n','d') and child.relnamespace='public'::regnamespace and parent.relnamespace='public'::regnamespace and parent.relname=any(array[${sql.join(deletable.map((name)=>sql`${name}`),sql`,`)}]::text[]) order by 1,2,3`));
    const ordered=actual.sort((a,b)=>JSON.stringify([a.child,a.parent,a.action])<JSON.stringify([b.child,b.parent,b.action])?-1:1);
    expect(ordered).toEqual([['form_versions','forms','c'],['forms','form_versions','n'],['notification_deliveries','notifications','c'],['nutrition_plan_versions','nutrition_plans','c'],['nutrition_plans','nutrition_plan_versions','n'],['program_versions','programs','c'],['programs','program_versions','n']].map(([child,parent,action])=>({child,parent,action})));
  });
  it('C10 public svc SELECT complete trigger inventory args order columns WHEN migrated', async () => {
    const live=await liveTriggers();
    expect(live.map((t)=>t.name).sort()).toEqual(triggers.map((t)=>t.name).sort());
    for (const t of live) {
      const expected=triggers.find((e)=>e.name===t.name)!;
      expect(t.enabled,t.name).toBe('O');
      expect({table:t.table,fn:t.fn,bits:t.bits,columns:t.columns,when:expression(t.when)},t.name).toEqual({table:expected.table,fn:expected.fn,bits:expected.bits,columns:expected.columns,when:expression(expected.when)});
      if(t.name.endsWith('_50_guard')) expect(t.args.map((v)=>JSON.parse(v) as unknown)).toEqual(expected.args.map((v)=>JSON.parse(v) as unknown)); else expect(t.args,t.name).toEqual(expected.args);
    }
    for(const table of tables) for(const before of [true,false]) {
      const expected=triggers.filter((t)=>t.table===table&&Boolean(t.bits&2)===before).map((t)=>t.name).sort();
      expect(live.filter((t)=>t.table===table&&Boolean(t.bits&2)===before).map((t)=>t.name)).toEqual(expected);
    }
  });
  it('C11 runtime roles svc SELECT flags membership routes ADMIN OPTION migrated', async () => {
    const actual=await svc((tx)=>q(tx,sql`select rolname as name,rolsuper as super,rolcreaterole as createrole,rolcreatedb as createdb,rolreplication as replication,rolbypassrls as bypass,rolinherit as inherit,rolcanlogin as login from pg_roles where rolname in ('dawlyy_app','dawlyy_rls') order by 1`));
    expect(actual).toEqual(['dawlyy_app','dawlyy_rls'].map((name)=>({name,super:false,createrole:false,createdb:false,replication:false,bypass:false,inherit:false,login:name==='dawlyy_app'})));
    expect(await svc((tx)=>one(tx,sql`select pg_has_role('dawlyy_app','dawlyy_rls','MEMBER') as member,pg_has_role('dawlyy_app','dawlyy_rls','USAGE') as inherited`))).toEqual({member:true,inherited:false});
    expect(await svc((tx)=>q(tx,sql`select r.rolname from pg_auth_members m join pg_roles r on r.oid=m.roleid where m.member in ('dawlyy_app'::regrole,'dawlyy_rls'::regrole) and m.admin_option`))).toEqual([]);
    expect(await svc((tx)=>q(tx,sql`select r.rolname,p.proname from pg_roles r join pg_proc p on p.pronamespace in ('public'::regnamespace,'app'::regnamespace) where r.rolname<>'dawlyy_rls' and (pg_has_role('dawlyy_app',r.oid,'MEMBER') or pg_has_role('dawlyy_rls',r.oid,'MEMBER')) and ${extensionFree} and has_function_privilege(r.oid,p.oid,'EXECUTE')`))).toEqual([]);
  });
  it('C12 public/app svc SELECT table sequence function ownership FORCE migrated', async () => {
    expect(await svc((tx)=>q(tx,sql`select c.relname from pg_class c where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) and c.relkind in ('r','p','S') and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') and (c.relowner<>'postgres'::regrole or c.relforcerowsecurity)`))).toEqual([]);
    expect(await svc((tx)=>q(tx,sql`select p.proname from pg_proc p where p.pronamespace in ('app'::regnamespace,'public'::regnamespace) and ${extensionFree} and p.proowner<>'postgres'::regrole`))).toEqual([]);
  });
  it('C13 source application SQL construction executable syntax and comments', () => {
    for(const file of [...files('apps/web/src'),...files('packages/db/src')].filter((p)=>/\.tsx?$/.test(p)&&!/(?:\.test\.|\/test\/)/.test(p))) {
      const source=read(file); const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,source); let executable=''; let comments='';
      for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan()) {
        if(token===ts.SyntaxKind.SingleLineCommentTrivia||token===ts.SyntaxKind.MultiLineCommentTrivia) comments+=scanner.getTokenText()+'\n'; else executable+=scanner.getTokenText();
      }
      expect(executable,file).not.toMatch(/\bsql\s*\.\s*raw\b|\.unsafe\s*\(|sql\s*\[/);
      const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
      const visit=(node:ts.Node):void=>{
        if(ts.isCallExpression(node)&&/\.(?:execute|query|unsafe)$/.test(node.expression.getText(ast))) for(const arg of node.arguments) {
          expect(ts.isBinaryExpression(arg)||ts.isTemplateExpression(arg),file+': request-built SQL').toBe(false);
        }
        ts.forEachChild(node,visit);
      };visit(ast); expect(typeof comments).toBe('string');
    }
  });
  it('C14 postgres svc CREATE throwaway function default ACL after final migration', async () => {
    expect(await svc((tx)=>one(tx,sql`select count(*)::int as n from pg_default_acl d where d.defaclrole='postgres'::regrole and d.defaclnamespace=0 and d.defaclobjtype='f' and not exists(select 1 from aclexplode(d.defaclacl) a where a.grantee=0 and a.privilege_type='EXECUTE')`))).toEqual({n:1});
    await withProbe({},async()=>{
      const rollback=new Error('C14 rollback');
      await expect(svc(async(tx)=>{
        await tx.execute(sql`create function dawlyy_probe.c14() returns integer language sql as 'select 1'`);
        expect(await one(tx,sql`select has_function_privilege('dawlyy_rls','dawlyy_probe.c14()','EXECUTE') as runtime`)).toEqual({runtime:false});
        throw rollback;
      })).rejects.toBe(rollback);
    });
  });
  it('C15 client-facing routes SELECT projections explicit internal-field exclusion', () => {
    const internal=['createdBy','changeNote'];
    for(const [table,projection] of Object.entries(clientColumns)) {
      const denied=[...internal,...(table==='clients'?['tags','source']:[]),...(table==='subscriptions'||table==='payments'?['notes']:[]),...(table==='programs'||table==='nutritionPlans'?['tags']:[]),...(table==='calendarEvents'?['payload']:[])];
      for(const column of denied) expect(Object.keys(projection),`${table}.${column}`).not.toContain(column);
    }
    expect(clientColumns.payments).toHaveProperty('rejectedReason'); expect(clientColumns.media).toHaveProperty('reviewNote');
    expect(clientColumns.formSubmissions).toHaveProperty('coachFeedback');expect(clientColumns.formSubmissions).toHaveProperty('results');
    const calendarKeys = Object.keys(clientColumns.calendarEvents);
    expect(calendarKeys).toContain('attachedFormId');
    expect(calendarKeys).toContain('pinnedVersionId');
    expect(calendarKeys).not.toContain('payload');
    // Notification payload is already client-visible; all other payload access must derive only the form IDs.
    const notificationPayload = /^\s*payload: schema\.notifications\.payload,\s*$/;
    const payloadLines = read('packages/db/src/client-columns.ts').split(/\r?\n/).filter(line => line.includes('.payload') && !notificationPayload.test(line));
    expect(payloadLines).toHaveLength(2);
    for (const line of payloadLines) {
      expect(line).toMatch(/^\s*(?:attachedFormId: sql<string \| null>`\$\{schema\.calendarEvents\.payload\}->>'formId'`|pinnedVersionId: sql<string \| null>`\$\{schema\.calendarEvents\.payload\}->>'formVersionId'`),\s*$/);
    }
    const scan = querySources(['apps/web/src/api/index.ts']);
    expect(scan.routers.length, 'mounted routers must be classified').toBeGreaterThan(0);
    expect(scan.violations).toEqual([]);
  });
  it('C15 scanner rejects leaks and fails closed over mounted routers and imports', () => {
    const entry = 'apps/web/src/api/index.ts';
    const route = 'apps/web/src/api/probe.ts';
    const middleware = 'apps/web/src/api/middleware/auth.ts';
    const fixture = (body: string, extra: Record<string, string> = {}) => {
      const sources: Record<string, string> = {
        [entry]: "import { router } from './probe'; app.route('/probe', router);",
        [route]: "import { clientColumns } from '@dawlyy/db'; import { sql } from 'drizzle-orm';\n" + body,
        'packages/db/src/index.ts': "export { clientColumns } from './client-columns';",
        'packages/db/src/client-columns.ts': '',
        ...extra,
      };
      return querySources([entry], file => {
        if (!Object.hasOwn(sources, file)) throw new Error('missing ' + file);
        return sources[file]!;
      });
    };
    for (const expression of [
      'clients', '', 'getTableColumns(clients)', '{ id: clients.id }',
      '{ tags: clientColumns.clients.tags }', '{ createdBy: clientColumns.clients.createdBy }',
      '{ ...clients }', '{ id: c.id }', '{ id: sql`${clients.id}` }',
    ]) expect(fixture('tx.select(' + expression + ');').violations, expression).not.toEqual([]);
    expect(fixture('tx.query.clients.findMany();').violations).not.toEqual([]);
    expect(fixture('tx.query.clients.findFirst();').violations).not.toEqual([]);
    expect(fixture("import './missing';").violations).toContain(route + ': unresolved local import ./missing');
    expect(fixture("import type { Missing } from './missing'; import { type AlsoMissing } from './absent';").violations).toEqual([]);
    for (const body of [
      'tx.select(clientColumns.clients);',
      'tx.select({ id: clientColumns.clients.id });',
      'tx.select({ ...clientColumns.clients });',
      'const fields = { id: clientColumns.clients.id }; tx.select(fields);',
      'const fields = clientColumns.clients; tx.select(fields);',
      'tx.select({ n: sql<number>`count(*)::int`, id: sql<string>`${clientColumns.clients.id}::text` });',
      'tx.selectDistinct(clientColumns.clients);',
      'tx.selectDistinctOn([clientColumns.clients.id], { id: clientColumns.clients.id });',
    ]) expect(fixture(body).violations, body).toEqual([]);
    expect(fixture('tx.selectDistinct(clients);').violations).not.toEqual([]);
    expect(fixture('tx.selectDistinctOn([clients.id], clients);').violations).not.toEqual([]);
    expect(fixture('const a = b; const b = a; tx.select(a);').violations).not.toEqual([]);
    expect(fixture('let fields = clientColumns.clients; tx.select(fields);').violations).not.toEqual([]);
    expect(fixture('function leak(clientColumns) { tx.select(clientColumns.clients); }').violations).not.toEqual([]);
    expect(fixture('const fields = clientColumns.clients; function leak(fields) { tx.select(fields); }').violations).not.toEqual([]);
    expect(fixture('tx.select({ id: sql`tags` });').violations).not.toEqual([]);
    expect(fixture('tx.select({ id: sql`clients.tags` });').violations).not.toEqual([]);
    expect(fixture('tx.select({ at: sql<string>`to_char(${clientColumns.clients.createdAt}, \'YYYY-MM-DD HH24:MI:SS.US\')` });').violations).toEqual([]);
    expect(fixture("tx['select'](clients);").violations).not.toEqual([]);
    expect(fixture("tx.query.clients['findMany']();").violations).not.toEqual([]);
    expect(fixture('tx.select({ n: sql<number>`0.5 * sum(${clientColumns.payments.amount})` });').violations).toEqual([]);
    expect(fixture("import('./missing');").violations).toContain(route + ': unresolved local import ./missing');
    expect(fixture("export * from './missing';").violations).toContain(route + ': unresolved local import ./missing');
    expect(fixture("export type { Missing } from './missing';").violations).toEqual([]);
    expect(fixture('for (const clientColumns of sources) { tx.select(clientColumns.clients); }').violations).not.toEqual([]);
    expect(fixture('const fields = { id: clientColumns.clients.id }; fields.id = clients.tags; tx.select(fields);').violations).not.toEqual([]);
    expect(fixture('const fields = { id: clientColumns.clients.id }; Object.assign(fields, { tags: clients.tags }); tx.select(fields);').violations).not.toEqual([]);
    const unguarded = fixture('router.get("/", () => tx.select(clients));');
    expect(unguarded.routers).toEqual([{ file: route, staffOnly: false }]);
    expect(unguarded.violations).not.toEqual([]);
    const imports = "import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';\n";
    const guarded = fixture(imports + "router.use('*', requireAuthMiddleware); router.use('*', requireStaffRole); router.get('/', () => tx.select(clients));", { [middleware]: '' });
    expect(guarded.routers).toEqual([{ file: route, staffOnly: true }]);
    expect(guarded.violations).toEqual([]);
    expect(fixture(imports + "router.get('/', () => tx.select(clients)); router.use('*', requireStaffRole);", { [middleware]: '' }).violations).not.toEqual([]);
    expect(fixture("import { requireStaffRole } from './fake'; router.use('*', requireStaffRole); tx.select(clients);", { 'apps/web/src/api/fake.ts': '' }).violations).not.toEqual([]);
    expect(fixture(imports + "router['get']('/', () => tx.select(clients)); router.use('*', requireAuthMiddleware); router.use('*', requireStaffRole);", { [middleware]: '' }).violations).not.toEqual([]);
    expect(fixture(imports + "router.use('*', requireStaffRole); router.get('/', () => tx.select(clients));", { [middleware]: '' }).violations).not.toEqual([]);
    expect(fixture(imports + "router.use('*', requireAuthMiddleware); if (false) router.use('*', requireStaffRole); router.get('/', () => tx.select(clients));", { [middleware]: '' }).violations).not.toEqual([]);
    const helper = 'apps/web/src/server/probe.ts';
    for (const alias of ['@/src/server/probe', '@/src/server/probe.ts', '../server/probe']) {
      expect(fixture("import '" + alias + "';", { [helper]: 'tx.select();' }).violations.some(issue => issue.startsWith(helper + ':'))).toBe(true);
    }
    expect(fixture("import '@/probe';", { 'apps/web/probe.ts': 'tx.select();' }).violations).not.toEqual([]);
    expect(fixture("import '@dawlyy/db/client';", { 'packages/db/src/client.ts': 'tx.select();' }).violations).not.toEqual([]);
    // A staff router's closure is scanned if another client-facing module imports it.
    expect(fixture(imports + "router.use('*', requireAuthMiddleware); router.use('*', requireStaffRole); tx.select(clients);", {
      [middleware]: '',
      [entry]: "import { router } from './probe'; import './consumer'; app.route('/probe', router);",
      'apps/web/src/api/consumer.ts': "import './probe';",
    }).violations).not.toEqual([]);
  });
  it('C16 source snapshots catalog all database object names UTF8 limit', async () => {
    const actual=await svc((tx)=>q<{name:string}>(tx,sql`select conname::text as name from pg_constraint where connamespace in ('public'::regnamespace,'app'::regnamespace) union all select relname from pg_class where relnamespace in ('public'::regnamespace,'app'::regnamespace) union all select p.proname from pg_proc p where p.pronamespace in ('public'::regnamespace,'app'::regnamespace) and ${extensionFree} union all select polname from pg_policy union all select tgname from pg_trigger where not tgisinternal`));
    for(const row of actual) expect(Buffer.byteLength(row.name,'utf8'),row.name).toBeLessThanOrEqual(63);
    for(const file of files('packages/db/migrations').filter((f)=>f.endsWith('_snapshot.json'))) {
      const snapshot:unknown=JSON.parse(read(file));
      const visit=(value:unknown):void=>{if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){if(k==='name'&&typeof v==='string') { const legacy=v==='client_entitlement_overrides_subscription_id_subscriptions_id_fk'&&/000[0-3]_snapshot/.test(file); if(!legacy)expect(Buffer.byteLength(v,'utf8'),file+':'+v).toBeLessThanOrEqual(63); }else visit(v);}};visit(snapshot);
    }
    for(const file of files('packages/db/src/schema').filter((f)=>f.endsWith('.ts'))) for(const match of read(file).matchAll(/(?:name\s*:\s*|(?:uniqueIndex|index|check|pgPolicy)\s*\(\s*)['"]([^'"]+)['"]/g)) expect(Buffer.byteLength(match[1]!,'utf8'),file).toBeLessThanOrEqual(63);
    for(const file of files('packages/db/migrations').filter((f)=>f.endsWith('.sql')))for(const match of read(file).matchAll(/create\s+(?:or\s+replace\s+)?(?:function|trigger|policy|(?:unique\s+)?index)\s+(?:[a-z_]+\.)?"?([a-z_][a-z_0-9]*)"?/gi))expect(Buffer.byteLength(match[1]!,'utf8'),file+':'+match[1]).toBeLessThanOrEqual(63);
  });
  it('C17 public svc SELECT policy scope helpers and missing FK indexes migrated', async () => {
    expect(await svc((tx)=>q(tx,sql`select policyname from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,''))~'can_access_(client|user)'`))).toEqual([]);
    expect(await svc((tx)=>q(tx,sql`select proname,provolatile::text as volatility,prosecdef as definer,prorows::int as rows from pg_proc where pronamespace='app'::regnamespace and proname in ('assigned_client_ids','accessible_user_ids') order by proname`))).toEqual([{proname:'accessible_user_ids',volatility:'s',definer:true,rows:600},{proname:'assigned_client_ids',volatility:'s',definer:true,rows:100}]);
    expect(await svc((tx)=>q(tx,sql`with fk as(select c.conrelid,c.conname,c.conkey,(select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='tenant_id')as tid from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace) select fk.conrelid::regclass as child_table,fk.conname from fk where fk.conkey<>array[fk.tid] and not exists(select 1 from pg_index i where i.indrelid=fk.conrelid and i.indisvalid and ((i.indkey[0]=any(fk.conkey)and i.indkey[0]<>fk.tid)or(i.indkey[0]=fk.tid and i.indnkeyatts>1 and i.indkey[1]=any(fk.conkey)and i.indkey[1]<>fk.tid)or(i.indisunique and i.indpred is null and(select array_agg(u.k)from unnest(string_to_array(i.indkey::text,' ')::int2[])with ordinality u(k,n)where u.n<=i.indnkeyatts)<@fk.conkey))) order by 1,2`))).toEqual([]);
  });
  it('C18 additions svc SELECT column/default/nullability and bigint roundtrip migrated', async () => {
    const expected=[['tenants','receipt_counter','integer',true,'0'],['clients','code','text',true,"''::text"],['clients','search_key','text',true,"''::text"],['invitations','display_name','text',false,null],['events','actor_user_id','uuid',false,null],['events','actor_role','text',false,null],['set_logs','deleted_at','timestamp with time zone',false,null],['exercises','based_on_id','uuid',false,null],['foods','based_on_id','uuid',false,null],['tasks','source_event_id','bigint',false,null]];
    for(const [table,column,type,notnull,def]of expected) expect(await svc((tx)=>one(tx,sql`select format_type(a.atttypid,a.atttypmod)as type,a.attnotnull as notnull,pg_get_expr(d.adbin,d.adrelid)as default from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=${'public.'+String(table)}::regclass and a.attname=${String(column)} and not a.attisdropped`))).toEqual({type,notnull,default:def});
    const newColumns:[string,string,string,boolean,string|null][]=[
      ['tenant_hidden_items','tenant_id','uuid',true,null],['tenant_hidden_items','kind','text',true,null],['tenant_hidden_items','item_id','uuid',true,null],['tenant_hidden_items','hidden_by','uuid',false,null],['tenant_hidden_items','created_at','timestamp with time zone',true,'now()'],
      ['message_revisions','id','uuid',true,'gen_random_uuid()'],['message_revisions','tenant_id','uuid',true,null],['message_revisions','message_id','uuid',true,null],['message_revisions','client_id','uuid',false,null],['message_revisions','body','text',false,null],['message_revisions','attachments','jsonb',true,"'[]'::jsonb"],['message_revisions','revised_at','timestamp with time zone',true,'now()'],['message_revisions','revised_by','uuid',false,null],
    ];
    for(const table of ['tenant_hidden_items','message_revisions']){
      const actual=await svc((tx)=>q(tx,sql`select attname as name,format_type(a.atttypid,a.atttypmod)as type,a.attnotnull as notnull,pg_get_expr(d.adbin,d.adrelid)as default from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=${'public.'+table}::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`));
      expect(actual).toEqual(newColumns.filter((c)=>c[0]===table).map(([,name,type,notnull,def])=>({name,type,notnull,default:def})));
      expect(await svc((tx)=>q(tx,sql`select conname as name from pg_constraint where conrelid=${table}::regclass and contype='p'`))).toEqual([{name:table==='tenant_hidden_items'?'tenant_hidden_items_pk':'message_revisions_pkey'}]);
    }
    const privateGraph=await buildPrivateFixture();const id=randomUUID(); await svc((tx)=>tx.execute(sql`insert into tasks(id,tenant_id,title,source_event_id)values(${id},${privateGraph.t1},'bigint',5000000000)`));
    expect(await svc((tx)=>one(tx,sql`select source_event_id::text as id from tasks where id=${id}`))).toEqual({id:'5000000000'});
    expect(await svc((tx)=>q(tx,sql`select conname from pg_constraint where conrelid='tasks'::regclass and contype='f' and confrelid='events'::regclass`))).toEqual([]);
  });
  it('C19 app svc SELECT exact audit and outbox seed roles and API callers migrated', async () => {
    const auditGroups: [string,string,string[]][]=[['program','program_versions',['publish','archive']],['nutrition_plan','nutrition_plan_versions',['publish','archive']],['form','form_versions',['publish','archive']],['payment','payments',['verify','reject','refund']],['subscription','subscriptions',['extend','freeze','resume','cancel','suspend','reinstate']],['media','media',['review']],['ai','ai_requests',['approve','reject']]];
    const audits=auditGroups.flatMap(([prefix,entity,actions])=>actions.map((a)=>({action:`${prefix}.${a}`,entity,roles:['owner','staff']})));
    audits.push({action:'client.erase',entity:'clients',roles:['owner']},{action:'checkin.submit',entity:'form_submissions',roles:['client']},{action:'checkin.review',entity:'form_submissions',roles:['owner','staff']},{action:'workout.complete',entity:'workout_sessions',roles:['client']},{action:'team.permissions',entity:'memberships',roles:['owner']},{action:'team.disable',entity:'memberships',roles:['owner']});
    expect(await svc((tx)=>q(tx,sql`select action,entity,roles from app.audit_actions order by action`))).toEqual(audits.sort((a,b)=>a.action.localeCompare(b.action,'en')));
    const events=['program.published','nutrition_plan.published','form.published','payment.verified','payment.rejected','payment.refunded','subscription.extended','subscription.frozen','subscription.resumed','subscription.cancelled','checkin.reviewed','media.reviewed','ai.approved'].map((type)=>({type,roles:['owner','staff']}));
    events.push(...['payment.submitted','checkin.submitted','workout.completed'].map((type)=>({type,roles:['client']})),...['message.sent','media.uploaded'].map((type)=>({type,roles:['owner','staff','client']})));
    expect(await svc((tx)=>q(tx,sql`select type,roles from app.event_types order by type`))).toEqual(events.sort((a,b)=>a.type.localeCompare(b.type,'en')));
    expect(await svc((tx)=>q(tx,sql`select relname from pg_class where oid in ('app.audit_actions'::regclass,'app.event_types'::regclass) and(not relrowsecurity or relforcerowsecurity)`))).toEqual([]);
    const f=await buildPrivateFixture();
    for(const table of [...new Set(audits.map((a)=>a.entity))]as MatrixTable[]){
      const input=await makeRow(table,f);const row=(await svc((tx)=>insertRow(tx,table,input)))[0]!;
      const expectedClient=table==='clients'?row.id:row.client_id??null;
      expect(await svc((tx)=>one(tx,sql`select app.entity_client(${table},${String(row.id)},${f.t1}::uuid)as client_id`)),table).toEqual({client_id:expectedClient});
    }
    for(const file of files('apps/web/src').filter((f)=>f.endsWith('.ts')&&!f.includes('.test.'))) for(const match of read(file).matchAll(/app\.(audit|emit_event)\(\s*'([^']+)'/g)) expect(match[1]==='audit'?audits.map((a)=>a.action):events.map((e)=>e.type),file).toContain(match[2]);
  });
  it('C20 migration source functions triggers breakpoints and terminal privilege block', () => {
    for(const tag of ['0003_rls_role_and_helpers','0006_guards_and_grants','0007_push_tenant_scope']) {
      const source=read(`packages/db/migrations/${tag}.sql`);
      expect(source).toMatch(/set\s+check_function_bodies\s*=\s*on/i);
      expect(source).toMatch(/alter default privileges\s+(?:for role postgres\s+)?revoke execute on functions from public/i);
      for(const part of source.split('--> statement-breakpoint').filter((p)=>p.trim())) expect(part.trim(),tag).toMatch(/;$/);
      expect(source.trim()).toMatch(/--> statement-breakpoint$/);
    }
    const source=read('packages/db/migrations/0006_guards_and_grants.sql');
    const creates=[...source.matchAll(/create\s+(?:or\s+replace\s+)?function\b/gi)].map((m)=>m.index);
    expect(source.toLowerCase().lastIndexOf('grant execute on function')).toBeGreaterThan(Math.max(...creates));
    expect(read('packages/db/migrations/0004_policies_off.sql')).toMatch(/create table\s+(?:"?public"?\.)?"tenant_hidden_items"/i);
    for(const command of ['insert','delete'])expect(source).toMatch(new RegExp(`grant\\s+${command}\\s+on\\s+[^;]*\\btenant_hidden_items\\b[^;]*to\\s+dawlyy_rls\\s*;`,'i'));
  });
  it('C21 environment README client source PowerShell and lazy runtime pool contract', () => {
    for(const file of ['.env.example','packages/db/README.md','packages/db/src/client.ts']) {expect(read(file),file).toContain('dawlyy_rls');expect(read(file),file).toContain('DAWLYY_DB_POOL_MAX');}
    for(const file of ['packages/db/README.md']) for(const block of read(file).matchAll(/```powershell([^]*?)```/g)) {
      expect(block[1]).not.toMatch(/^\s*[A-Z_]+=\S+\s+\w+/m); if(block[1]?.includes('$env:')) { expect(block[1]).toMatch(/finally/); expect(block[1]).toMatch(/Remove-Item\s+Env:/); }
    }
    expect(read('packages/db/src/client.ts')).toMatch(/function connect[^]*?process\.env\.DAWLYY_DB_POOL_MAX/);
  });
  it('C22 source CI PostgreSQL17 serial database validation and fail-on-missing contract', () => {
    const pkg=JSON.parse(read('package.json')) as {scripts?:Record<string,string>};
    expect(pkg.scripts?.['test:db']).toBe('pnpm --filter @dawlyy/db exec vitest run');
    const ci=files('.github/workflows').map(read).join('\n'); expect(ci).toMatch(/postgres:17\b/); expect(ci).toContain('DATABASE_URL_SERVICE');expect(ci).toContain('DATABASE_URL');expect(ci).toContain('test:db');expect(ci).toContain('db-migration-check.ps1');
    expect(read('packages/db/vitest.config.ts')).toMatch(/fileParallelism\s*:\s*false/);
    for(const file of files('packages/db/test').filter((f)=>f.endsWith('.test.ts'))) expect(read(file),file).not.toMatch(/(?:describe|it|test)\.(?:skip|skipIf|runIf|todo)\b/);
  });
  // C23/C98/C99 require disposable CI infrastructure. Their executable assertions live in scripts/db-migration-check.ps1 (§13.5).
  it('C24 migration source H1/H2/H3 policy-only 0005 and journal ordering', () => {
    // Applied 0000–0002 hashes are checked against the genuine 0002 dump journal by C23/C98 in the CI script.
    const m4=read('packages/db/migrations/0004_policies_off.sql');
    expect(m4).toMatch(/ALTER TABLE "tasks" ALTER COLUMN "source_event_id" SET DATA TYPE bigint USING NULL::bigint;/i);
    for(const table of ['programs','nutrition_plans','forms']) expect(m4).toMatch(new RegExp(`ADD CONSTRAINT "${table}_current_version_fk"[^;]+ON DELETE set null \\("current_version_id"\\)`, 'i'));
    const targetIndexes:[string,string][]=[['program_versions_id_program_uq','programs_current_version_fk'],['nutrition_plan_versions_id_plan_uq','nutrition_plans_current_version_fk'],['form_versions_id_form_uq','forms_current_version_fk'],['program_versions_tenant_client_program_id_uq','workout_sessions_version_fk'],['messages_tenant_id_uq','message_revisions_message_fk']];
    for(const [index,constraint]of targetIndexes){const position=m4.indexOf(`CREATE UNIQUE INDEX "${index}"`);expect(position,index).toBeGreaterThanOrEqual(0);expect(m4.indexOf(`ADD CONSTRAINT "${constraint}"`),constraint).toBeGreaterThan(position);}
    const m5=read('packages/db/migrations/0005_policies.sql').replace(/--[^\n]*/g,'');
    for(const statement of m5.split(';').map((s)=>s.trim()).filter(Boolean)) expect(statement).toMatch(/^CREATE POLICY\b/i);
    for(const file of files('packages/db/migrations').filter((f)=>/000[3-6][^/]*\.sql$/.test(f))) expect(read(file),file).not.toMatch(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|\bVACUUM\b|ALTER\s+SYSTEM|ALTER\s+TYPE[^;]+ADD\s+VALUE/i);
    const journal=JSON.parse(read('packages/db/migrations/meta/_journal.json')) as {entries:{idx:number;when:number;tag:string}[]};
    // 0008: journal appends reinvent_control at idx 8.
    expect(journal.entries.map((e)=>e.idx)).toEqual([0,1,2,3,4,5,6,7,8]);
    expect(journal.entries[8]!.tag).toBe('0008_reinvent_control');
    for(let i=1;i<journal.entries.length;i++) expect(journal.entries[i]!.when).toBeGreaterThan(journal.entries[i-1]!.when);
    for(const file of files('packages/db/src/schema').filter((f)=>f.endsWith('.ts')&&/pgTable\(/.test(read(f)))) expect(read(file),file).toMatch(/0006/);
  });
});
