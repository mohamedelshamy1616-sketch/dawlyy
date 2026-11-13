import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { ProgramDocument } from '@dawlyy/core/types';
import type { SessionDetail } from '../src/server/workout/contracts';

// Task 5 / G2/G3: run with NEXT_PUBLIC_ENABLE_SW=1 and the migrated, demo-seeded test database.
test('offline reload, three durable sets, previous values, rest controls and duplicate-safe double flush', async ({ browser, baseURL }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 } });
  const coach = await browser.newContext({ baseURL });
  try {
    for (const [actor, userId] of [[context, 'd0250000-0000-4000-8000-000000000103'], [coach, 'd0250000-0000-4000-8000-000000000101']] as const) {
      const login = await actor.request.post('/api/dev-login', { data: { userId, locale: 'en' }, maxRedirects: 0 });
      expect(login.status()).toBe(303);
    }
    const me = await context.request.get('/api/v1/me'); expect(me.ok()).toBe(true);
    const { clientId } = await me.json() as { clientId: string };
    const library = await coach.request.get('/api/v1/exercises?limit=1'); expect(library.ok()).toBe(true);
    const exerciseId = (await library.json() as { items: Array<{ id: string }> }).items[0]!.id;
    const template = await coach.request.post('/api/v1/programs', { data: { name: { en: `Offline QA ${randomUUID()}`, ar: 'اختبار التمرين أوفلاين' }, weeks: 1, trainingDays: [0] } });
    expect(template.status()).toBe(201);
    const created = await template.json() as { head: { id: string }; currentVersion: { document: ProgramDocument } };
    const document = created.currentVersion.document; const day = document.phases[0]!.weeks[0]!.days[0]!;
    day.workout!.blocks = [{ id: randomUUID(), kind: 'main', items: [{ id: randomUUID(), exerciseId, order: 0,
      coachNote: { en: 'Keep your chest up', ar: 'خلّي صدرك مرفوع' }, sets: [1, 2, 3].map(setNo => ({ setNo, reps: '8', restSec: 60, load: { value: 20, unit: 'kg' as const } })) }] }];
    const saved = await coach.request.put(`/api/v1/programs/${created.head.id}/draft`, { data: { baseVersionNo: 1, document } }); expect(saved.ok()).toBe(true);
    const published = await coach.request.post(`/api/v1/programs/${created.head.id}/publish`, { data: {} }); expect(published.ok()).toBe(true);
    const dateParts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (kind: string) => dateParts.find(p => p.type === kind)!.value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const assigned = await coach.request.post(`/api/v1/programs/${created.head.id}/assign`, { data: { clientId, publish: true, replace: true, startDate: today } }); expect(assigned.status()).toBe(201);
    const copy = await assigned.json() as { head: { id: string }; currentVersion: { id: string; document: ProgramDocument } };
    const plannedDay = copy.currentVersion.document.phases[0]!.weeks[0]!.days[0]!;
    const references = { programId: copy.head.id, programVersionId: copy.currentVersion.id, dayId: plannedDay.id, workoutId: plannedDay.workout!.id, timezone: 'Africa/Cairo' };
    const priorResponse = await context.request.post('/api/v1/workout-sessions', { data: { ...references, clientUuid: randomUUID(), localDate: yesterday } }); expect(priorResponse.ok()).toBe(true);
    const prior = await priorResponse.json() as SessionDetail;
    const priorSync = await context.request.post('/api/v1/workout-sessions/sync', { data: { sessions: [], sets: [{ clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), sessionClientUuid: prior.session.clientUuid, exerciseId, setNo: 1, reps: 8, load: 30, loadUnit: 'kg', completed: true }] } }); expect(priorSync.ok()).toBe(true);
    expect((await priorSync.json() as { rejected: unknown[] }).rejected).toEqual([]);
    const priorFinish = await context.request.post(`/api/v1/workout-sessions/${prior.session.id}/finish`, { data: { outcome: 'completed', endedAt: new Date().toISOString(), activeSeconds: 60 } }); expect(priorFinish.ok()).toBe(true);
    const start = await context.request.post('/api/v1/workout-sessions', { data: { ...references, clientUuid: randomUUID(), localDate: today } }); expect(start.ok()).toBe(true);
    const current = await start.json() as SessionDetail;
    const page = await context.newPage(); await page.goto('/en/app/workout/start');
    await expect(page).toHaveURL(new RegExp(`/en/app/workout/${current.session.id}$`));
    await expect(page.getByTestId('workout-screen')).toBeVisible();
    // Opt-in SW registration is required for the full offline-reopen acceptance check.
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.reload(); await expect(page.getByTestId('workout-screen')).toBeVisible();
    await expect(page.getByTestId('last-time').first()).toContainText('30');
    await expect(page.getByRole('spinbutton', { name: 'Load (kg)', exact: true }).first()).toHaveValue('30');
    await context.setOffline(true);
    await page.reload(); await expect(page.getByTestId('workout-screen')).toBeVisible();
    const rows = page.getByTestId('set-row'); await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      const reps = row.getByRole('spinbutton', { name: 'Reps', exact: true });
      const load = row.getByRole('spinbutton', { name: 'Load (kg)', exact: true });
      await reps.fill(String(8 + i)); await reps.press('Tab');
      await load.fill('30'); await load.press('Tab');
      await expect(row.getByTestId('complete-set')).toBeEnabled();
      await row.getByTestId('complete-set').click();
      await expect(row.getByTestId('complete-set')).toHaveText('Complete');
    }
    await expect(page.getByTestId('rest-seconds')).toBeVisible();
    const before = Number(await page.getByTestId('rest-seconds').textContent());
    await page.getByRole('button', { name: 'Add 15 seconds of rest' }).click();
    await expect.poll(async () => Number(await page.getByTestId('rest-seconds').textContent())).toBeGreaterThan(before + 10);
    await page.getByRole('button', { name: 'Reduce rest by 15 seconds' }).click();
    await expect.poll(async () => Number(await page.getByTestId('rest-seconds').textContent())).toBeLessThanOrEqual(before);
    await expect(page.getByTestId('unsynced-count')).not.toContainText('Unsynced: 0');
    await context.setOffline(false);
    await page.getByTestId('sync-now').click();
    async function serverSets() {
      const result = await context.request.get(`/api/v1/workout-sessions/${current.session.id}`); expect(result.ok()).toBe(true);
      return (await result.json() as SessionDetail).sets;
    }
    await expect.poll(async () => (await serverSets()).length).toBe(3);
    // Reinvent plan R0b item 3: the sync card (and its sync-now button) shows only while pending is above 0.
    await expect(page.getByTestId('sync-now')).toHaveCount(0);
    expect(await serverSets()).toHaveLength(3);
    expect(new Set((await serverSets()).map(s => s.clientUuid)).size).toBe(3);
    expect((await serverSets()).map(s => s.reps)).toEqual([8, 9, 10]);
    await page.getByTestId('finish-workout').click(); await expect(page.getByTestId('finish-summary')).toBeVisible();
    await expect(page.getByTestId('unsynced-count')).toHaveText('Everything is synced');
    await page.getByRole('button', { name: 'Exercise history', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Your last five sessions');
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.goto(`/ar/app/history/${current.session.id}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } finally { await context.setOffline(false); await context.close(); await coach.close(); }
});
