import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CLIENT_MODULES, DEFAULT_CLIENT_MODULES, FormDocument } from '@dawlyy/core/types';
import { consents, formSubmissions, forms, formVersions, memberships, metricEntries } from '@dawlyy/db/schema';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { workoutFixture } from '../server/workout/test-fixture';
import { withAuthTx, type AuthContext } from '../server/db';
import { requireClientModule } from '../server/client-modules';
import { logMetric } from '../server/tracking/entries';
import { app } from './index';

describe('R0c client modules and numeral preferences', () => {
  let f: Awaited<ReturnType<typeof workoutFixture>>;
  beforeEach(async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined); vi.stubEnv('DAWLYY_DEV_LOGIN', '0');
    f = await workoutFixture(); await setupActiveSubscription(f.owner.tenantId, f.a.clientId);
  });
  afterEach(async () => { try { await f?.cleanup(); } finally { vi.unstubAllEnvs(); } });
  async function modules(patch: Partial<typeof DEFAULT_CLIENT_MODULES>) {
    const response = await call(app, 'PUT', '/api/v1/settings/client-modules', { as: f.owner.userId, body: { ...DEFAULT_CLIENT_MODULES, ...patch } });
    expect(response.status).toBe(200); return response;
  }
  async function clientAuth(): Promise<AuthContext> {
    const [member] = await setupApiData(f.owner.tenantId, 'module client identity', tx => tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, f.owner.tenantId), eq(memberships.userId, f.a.userId))));
    if (!member) throw new Error('Missing client membership');
    return { tenantId: f.owner.tenantId, membershipId: member.id, userId: f.a.userId, role: 'client', clientId: f.a.clientId, permissions: null };
  }
  it('defaults all on, owner round trip, staff refusal, strict seven keys and client bootstrap', async () => {
    expect((await call(app, 'GET', '/api/v1/settings/client-modules', { as: f.owner.userId })).json).toEqual(DEFAULT_CLIENT_MODULES);
    const changed = await modules({ workouts: false });
    expect((await call(app, 'GET', '/api/v1/settings/client-modules', { as: f.owner.userId })).json).toEqual(changed.json);
    expect((await call(app, 'GET', '/api/v1/me/app', { as: f.a.userId })).json).toMatchObject({ clientModules: { ...DEFAULT_CLIENT_MODULES, workouts: false } });
    const staff = randomUUID();
    await setupApiData(f.owner.tenantId, 'settings editor remains non-owner', tx => tx.insert(memberships).values({ tenantId: f.owner.tenantId, userId: staff, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { settings: ['view', 'edit'] } } }));
    expect((await call(app, 'GET', '/api/v1/settings/client-modules', { as: staff })).status).toBe(200);
    expect((await call(app, 'PUT', '/api/v1/settings/client-modules', { as: staff, body: DEFAULT_CLIENT_MODULES })).status).toBe(403);
    expect((await call(app, 'GET', '/api/v1/settings/client-modules', { as: f.a.userId })).status).toBe(403);
    for (const body of [{ ...DEFAULT_CLIENT_MODULES, unknown: true }, { workouts: true }]) {
      expect((await call(app, 'PUT', '/api/v1/settings/client-modules', { as: f.owner.userId, body })).status).toBe(400);
    }
  });
  it('existing override write/read stores modules; explicit false and true override the tenant', async () => {
    await modules({ workouts: false });
    const result = await call(app, 'PUT', `/api/v1/clients/${f.a.clientId}/overrides/chat`, {
      as: f.owner.userId, body: { enabled: true, modules: { workouts: true, messages: false } },
    });
    expect(result.status).toBe(200); expect(result.json).toMatchObject({ overrides: expect.arrayContaining([expect.objectContaining({ override: expect.objectContaining({ modules: { workouts: true, messages: false } }) })]) });
    expect((await call(app, 'GET', '/api/v1/me/app', { as: f.a.userId })).json).toMatchObject({ clientModules: { workouts: true, messages: false, nutrition: true } });
    expect((await call(app, 'GET', '/api/v1/me/app', { as: f.b.userId })).json).toMatchObject({ clientModules: { workouts: false, messages: true } });
  });
  for (const moduleName of CLIENT_MODULES) it(`${moduleName}: resolved gate passes on and refuses off; staff writes bypass it`, async () => {
    const auth = await clientAuth();
    await expect(withAuthTx(auth, tx => requireClientModule(tx, auth, moduleName))).resolves.toBeUndefined();
    await modules({ [moduleName]: false });
    await expect(withAuthTx(auth, tx => requireClientModule(tx, auth, moduleName))).rejects.toMatchObject({ status: 403, code: 'module_disabled' });
    await expect(withAuthTx(f.owner, tx => requireClientModule(tx, f.owner, moduleName))).resolves.toBeUndefined();
  });
  it('workout create, sync, patch and finish are gated', async () => {
    const body = { clientUuid: randomUUID(), programId: f.a.programId, programVersionId: f.a.versionId, dayId: f.dayId, workoutId: f.workoutId, localDate: '2026-11-13', timezone: 'Africa/Cairo' };
    const started = await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body }); expect(started.status).toBe(200);
    const id = z.object({ session: z.object({ id: z.string() }) }).parse(started.json).session.id;
    expect((await call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId, body: { sessions: [], sets: [] } })).status).toBe(200);
    await modules({ workouts: false });
    for (const [method, path, payload] of [
      ['POST', '/api/v1/workout-sessions', { ...body, clientUuid: randomUUID() }],
      ['POST', '/api/v1/workout-sessions/sync', { sessions: [], sets: [] }],
      ['PATCH', `/api/v1/workout-sessions/${id}`, { event: 'start' }],
      ['POST', `/api/v1/workout-sessions/${id}/finish`, { outcome: 'completed', endedAt: new Date().toISOString(), activeSeconds: 10 }],
    ] as const) {
      const response = await call(app, method, path, { as: f.a.userId, body: payload });
      expect(response.status).toBe(403); expect(response.json).toMatchObject({ error: { code: 'module_disabled' } });
    }
  });
  it('nutrition and measurement writes each honor their switch', async () => {
    const meal = () => ({ clientUuid: randomUUID(), localDate: '2026-11-13', status: 'eaten', freeEntry: { text: 'Lunch' }, clientUpdatedAt: new Date().toISOString() });
    const metric = () => ({ clientUuid: randomUUID(), metric: 'weight', value: 80, unit: 'kg', recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo' });
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as: f.a.userId, body: meal() })).status).toBe(200);
    expect((await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body: metric() })).status).toBe(201);
    await modules({ nutrition: false, measurements: false });
    for (const [path, body] of [['meal-logs', meal()], ['metrics', metric()], ['meal-logs/water', { clientUuid: randomUUID(), localDate: '2026-11-13', amountMl: 250 }]] as const) {
      const result = await call(app, 'POST', `/api/v1/${path}`, { as: f.a.userId, body });
      expect(result.status).toBe(403); expect(result.json).toMatchObject({ error: { code: 'module_disabled' } });
    }
  });
  for (const [disabled, blocked, allowed] of [
    ['nutrition', ['water', 'calories_in'], ['weight', 'steps', 'custom']],
    ['measurements', ['weight', 'steps', 'custom'], ['water', 'calories_in']],
  ] as const) {
    it(`${disabled}: generic metrics use their owning module in both API and service`, async () => {
      await modules({ [disabled]: false });
      const auth = await clientAuth();
      const units = { water: 'ml', calories_in: 'kcal', weight: 'kg', steps: 'steps', custom: 'cm' } as const;
      for (const metric of blocked) {
        const input = { metric, metricKey: metric === 'custom' ? 'waist' : undefined, value: 80,
          unit: units[metric], recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo', clientUuid: randomUUID() };
        const response = await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body: input });
        expect(response.status).toBe(403);
        expect(response.json).toMatchObject({ error: { code: 'module_disabled' } });
        await expect(withAuthTx(auth, tx => logMetric(tx, auth, input))).rejects.toMatchObject({ status: 403, code: 'module_disabled' });
      }
      for (const metric of allowed) {
        const response = await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body: {
          metric, metricKey: metric === 'custom' ? 'waist' : undefined, value: 80,
          unit: units[metric], recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo', clientUuid: randomUUID(),
        } });
        expect(response.status).toBe(201);
      }
      const stored = await setupApiData(f.owner.tenantId, 'inspect module-owned metrics', tx => tx.select({
        metric: metricEntries.metric,
      }).from(metricEntries).where(and(eq(metricEntries.tenantId, f.owner.tenantId), eq(metricEntries.clientId, f.a.clientId))));
      expect(stored.map(row => row.metric).sort()).toEqual([...allowed].sort());
    });
  }
  for (const [disabled, expected] of [
    ['nutrition', ['custom', 'weight']], ['measurements', ['calories_in', 'water']],
  ] as const) {
    it(`${disabled}: check-in submission preserves answers and skips only disabled derived metrics`, async () => {
      await modules({ [disabled]: false });
      const id = randomUUID(), formId = randomUUID(), versionId = randomUUID();
      const answers = { weight: 80, waist: 90, water: 250, calories: 2100 };
      const document = FormDocument.parse({ sections: [{ id: 'metrics', title: { en: 'Metrics' }, questions: [
        { id: 'weight', type: 'number', label: { en: 'Weight' }, metricKey: 'weight', unit: 'kg' },
        { id: 'waist', type: 'number', label: { en: 'Waist' }, metricKey: 'waist', unit: 'cm' },
        { id: 'water', type: 'number', label: { en: 'Water' }, metricKey: 'water', unit: 'ml' },
        { id: 'calories', type: 'number', label: { en: 'Calories' }, metricKey: 'calories_in', unit: 'kcal' },
      ] }] });
      await setupApiData(f.owner.tenantId, 'mixed-module check-in metrics', async tx => {
        await tx.insert(forms).values({ id: formId, tenantId: f.owner.tenantId, name: { en: 'Metrics' }, kind: 'template', formKind: 'checkin' });
        await tx.insert(formVersions).values({ id: versionId, tenantId: f.owner.tenantId, formId, versionNo: 1,
          status: 'published', publishedAt: new Date(), document });
        await tx.insert(formSubmissions).values({ id, tenantId: f.owner.tenantId, clientId: f.a.clientId,
          formId, formVersionId: versionId, formKind: 'checkin', state: 'due', answers });
      });
      const response = await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.a.userId, body: {} });
      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ state: 'submitted', answers });
      const stored = await setupApiData(f.owner.tenantId, 'inspect derived module metrics', tx => tx.select({
        metric: metricEntries.metric, metricKey: metricEntries.metricKey,
      }).from(metricEntries).where(and(eq(metricEntries.tenantId, f.owner.tenantId), eq(metricEntries.clientId, f.a.clientId))));
      expect(stored.map(row => row.metric).sort()).toEqual(expected);
      if (disabled === 'nutrition') expect(stored).toContainEqual({ metric: 'custom', metricKey: 'waist' });
    });
    it(`${disabled}: disabling the metric owner refuses a saved POST replay`, async () => {
      const body = { metric: disabled === 'nutrition' ? 'water' : 'weight', value: 80,
        unit: disabled === 'nutrition' ? 'ml' : 'kg', recordedAt: new Date().toISOString(),
        timezone: 'Africa/Cairo', clientUuid: randomUUID() };
      const options = { as: f.a.userId, body, headers: { 'Idempotency-Key': randomUUID() } };
      expect((await call(app, 'POST', '/api/v1/metrics', options)).status).toBe(201);
      await modules({ [disabled]: false });
      const replay = await call(app, 'POST', '/api/v1/metrics', options);
      expect(replay.status).toBe(403);
      expect(replay.json).toMatchObject({ error: { code: 'module_disabled' } });
    });
  }
  it('photo upload on/off; existing client payment-proof denial is preserved when on', async () => {
    await setupApiData(f.owner.tenantId, 'photo consent', tx => tx.insert(consents).values({ tenantId: f.owner.tenantId, userId: f.a.userId, kind: 'photos', version: 'r0c', locale: 'en', accepted: true }));
    const upload = (purpose: string) => call(app, 'POST', '/api/v1/media/uploads', { as: f.a.userId, body: { purpose, clientId: f.a.clientId, filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 20 } });
    expect((await upload('progress_photo')).status).toBe(201);
    expect((await upload('payment_proof')).status).toBe(403);
    await modules({ progress_photos: false, payments: false });
    for (const purpose of ['progress_photo', 'payment_proof']) {
      const result = await upload(purpose); expect(result.status).toBe(403); expect(result.json).toMatchObject({ error: { code: 'module_disabled' } });
    }
  });
  it('client message sends on/off', async () => {
    const opened = await call(app, 'POST', '/api/v1/conversations', { as: f.owner.userId, body: { clientId: f.a.clientId } }); expect(opened.status).toBe(201);
    const id = z.object({ id: z.string() }).parse(opened.json).id;
    const send = () => call(app, 'POST', `/api/v1/conversations/${id}/messages`, { as: f.a.userId, body: { clientUuid: randomUUID(), body: 'Hello coach' } });
    expect((await send()).status).toBe(201); await modules({ messages: false });
    const response = await send(); expect(response.status).toBe(403); expect(response.json).toMatchObject({ error: { code: 'module_disabled' } });
  });
  it('checkin answer save on/off, with source content stored in the same transaction', async () => {
    const id = randomUUID(), formId = randomUUID(), versionId = randomUUID();
    const document = FormDocument.parse({ sections: [{ id: 's', title: { en: 'Week' }, questions: [{ id: 'note', type: 'long_text', label: { en: 'Notes' } }] }] });
    await setupApiData(f.owner.tenantId, 'module checkin', async tx => {
      await tx.insert(forms).values({ id: formId, tenantId: f.owner.tenantId, name: { en: 'Checkin' }, kind: 'template', formKind: 'checkin' });
      await tx.insert(formVersions).values({ id: versionId, tenantId: f.owner.tenantId, formId, versionNo: 1, status: 'published', publishedAt: new Date(), document });
      await tx.insert(formSubmissions).values({ id, tenantId: f.owner.tenantId, clientId: f.a.clientId, formId, formVersionId: versionId, formKind: 'checkin', state: 'due' });
    });
    const body = { clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), answers: { note: 'A good week' } };
    expect((await call(app, 'PUT', `/api/v1/submissions/${id}/answers`, { as: f.a.userId, body })).status).toBe(200);
    await modules({ checkins: false });
    const response = await call(app, 'PUT', `/api/v1/submissions/${id}/answers`, { as: f.a.userId, body });
    expect(response.status).toBe(403); expect(response.json).toMatchObject({ error: { code: 'module_disabled' } });
  });
  it('numerals round trip merges only the caller preference row', async () => {
    expect((await call(app, 'GET', '/api/v1/me/app', { as: f.a.userId })).json).toMatchObject({ numerals: 'latn' });
    expect((await call(app, 'PUT', '/api/v1/settings/preferences', { as: f.a.userId, body: { locale: 'ar', channels: { email: false } } })).status).toBe(200);
    for (const numerals of ['arab', 'latn']) {
      const saved = await call(app, 'PUT', '/api/v1/settings/preferences', { as: f.a.userId, body: { numerals } });
      expect(saved.status).toBe(200); expect(saved.json).toMatchObject({ numerals, locale: 'ar', channels: { email: false } });
      expect((await call(app, 'GET', '/api/v1/me/app', { as: f.a.userId })).json).toMatchObject({ numerals, preferences: { numerals, locale: 'ar' } });
    }
    expect((await call(app, 'GET', '/api/v1/settings/preferences', { as: f.b.userId })).json).toEqual({});
    expect((await call(app, 'PUT', '/api/v1/settings/preferences', { as: f.a.userId, body: { numerals: 'western' } })).status).toBe(400);
  });

  it('a disabled measurements module refuses a previously successful metric void replay', async () => {
    const created = await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body: {
      clientUuid: randomUUID(), metric: 'weight', value: 80, unit: 'kg',
      recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo',
    } });
    expect(created.status).toBe(201);
    const id = z.object({ id: z.string() }).parse(created.json).id;
    const path = `/api/v1/metrics/${id}/void`;
    const options = { as: f.a.userId, body: {}, headers: { 'Idempotency-Key': randomUUID() } };
    expect((await call(app, 'POST', path, options)).status).toBe(200);
    await modules({ measurements: false });
    const replay = await call(app, 'POST', path, options);
    expect(replay.status).toBe(403);
    expect(replay.json).toMatchObject({ error: { code: 'module_disabled' } });
    expect((await call(app, 'GET', '/api/v1/metrics', { as: f.a.userId })).status).toBe(200);
  });

  it('disabling photos refuses upload URL replay and photo-set writes; staff uploads still work', async () => {
    await setupApiData(f.owner.tenantId, 'upload replay photo consent', tx => tx.insert(consents).values({
      tenantId: f.owner.tenantId, userId: f.a.userId, kind: 'photos', version: 'r0c', locale: 'en', accepted: true,
    }));
    const body = { purpose: 'progress_photo', clientId: f.a.clientId, filename: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 20 };
    const options = { as: f.a.userId, body, headers: { 'Idempotency-Key': randomUUID() } };
    const upload = await call(app, 'POST', '/api/v1/media/uploads', options);
    expect(upload.status).toBe(201);
    const mediaId = z.object({ mediaId: z.string() }).parse(upload.json).mediaId;
    const photo = { clientUuid: randomUUID(), localDate: '2026-11-13', clientUpdatedAt: new Date().toISOString(), poses: [{ pose: 'front', mediaId }] };
    expect((await call(app, 'POST', '/api/v1/photos', { as: f.a.userId, body: photo })).status).toBe(201);
    await modules({ progress_photos: false });
    for (const [path, request] of [['/api/v1/media/uploads', options], ['/api/v1/photos', { as: f.a.userId, body: photo }]] as const) {
      const refused = await call(app, 'POST', path, request);
      expect(refused.status).toBe(403);
      expect(refused.json).toMatchObject({ error: { code: 'module_disabled' } });
    }
    expect((await call(app, 'POST', '/api/v1/media/uploads', { as: f.owner.userId, body })).status).toBe(201);
    expect((await call(app, 'GET', '/api/v1/photos', { as: f.a.userId })).status).toBe(200);
  });
});
