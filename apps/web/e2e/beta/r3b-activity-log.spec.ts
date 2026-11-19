import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { withServiceTx, closeDb } from '@dawlyy/db';
import { memberships, staffClientAssignments, tenants } from '@dawlyy/db/schema';
import type { ProgramDocument, NutritionDocument, FormDocument } from '@dawlyy/core/types';
import type { ActivityItem, ActivityPage } from '../../src/server/activity/types';
import { api, browserHealth, button, devLogin, labels, labelPrefix, mutation, visit, type Locale } from './helpers';

type Version<T> = { id: string; versionNo: number; status: string; document: T };
type Detail<T> = { head: { id: string; publishedVersionId: string | null }; currentVersion: Version<T> };

// P9 only. Fixtures have their own demo-prefixed tenant/identities and never repurpose shared seeded people.
// R3a owns the mutation/undo/Archived UI flow; here real API setup produces its independent history evidence.
// Composed P9 additionally checks R4b's approval row in this same log. This spec does not require R4b.
for (const locale of ['ar', 'en'] as const satisfies readonly Locale[]) {
  test.describe(`R3b activity and immutable versions @${locale}`, () => {
    let ownerContext: BrowserContext, staffContext: BrowserContext;
    let owner: Page, staff: Page;
    let ownerHealth: () => Promise<void>, staffHealth: () => Promise<void>;
    let clientId: string, otherClientId: string;
    const tenantId = randomUUID(), ownerUserId = randomUUID(), staffUserId = randomUUID(), staffMembershipId = randomUUID();
    const run = `${locale}-${randomUUID()}`, ownerName = `R3b owner ${run}`;
    const translate = createTranslator({ locale, messages: JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, 'activity.json'), 'utf8')) });
    let common: Awaited<ReturnType<typeof labels>>;

    test.beforeAll(async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      await withServiceTx(tenantId, 'P9 R3b isolated local browser fixture', async tx => {
        await tx.insert(tenants).values({ id: tenantId, slug: `demo-r3b-${run}`, name: `R3b ${run}`, defaultLocale: locale, timezone: 'Africa/Cairo' });
        await tx.insert(memberships).values([
          { tenantId, userId: ownerUserId, role: 'owner', status: 'active', displayName: ownerName },
          { id: staffMembershipId, tenantId, userId: staffUserId, role: 'staff', status: 'active', displayName: `R3b staff ${run}`,
            permissions: { client_scope: 'assigned', modules: { clients: ['view'] } } },
        ]);
      });
      const options = { baseURL, viewport: { width: 390, height: 844 }, locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo', reducedMotion: 'reduce' as const };
      ownerContext = await browser.newContext(options); staffContext = await browser.newContext(options);
      ownerContext.setDefaultTimeout(60_000); staffContext.setDefaultTimeout(60_000);
      ownerContext.setDefaultNavigationTimeout(240_000); staffContext.setDefaultNavigationTimeout(240_000);
      ownerHealth = browserHealth(ownerContext, locale); staffHealth = browserHealth(staffContext, locale);
      owner = await ownerContext.newPage(); staff = await staffContext.newPage();
      await devLogin(ownerContext, ownerUserId, locale); await devLogin(staffContext, staffUserId, locale);
      common = await labels(locale);
      clientId = (await api<{ id: string }>(owner, 'POST', '/clients', 201, { firstName: `Assigned ${run}`, displayName: `Assigned ${run}`, locale })).id;
      otherClientId = (await api<{ id: string }>(owner, 'POST', '/clients', 201, { firstName: `Unassigned ${run}`, displayName: `Unassigned ${run}`, locale })).id;
      await withServiceTx(tenantId, 'P9 R3b assign only its own first browser fixture client', async tx => {
        await tx.insert(staffClientAssignments).values({ tenantId, membershipId: staffMembershipId, clientId, assignedBy: ownerUserId });
      });
    });
    test.afterEach(async () => { await Promise.all([ownerHealth(), staffHealth()]); });
    test.afterAll(async () => {
      // Retain this isolated tenant as P9 evidence, as the existing beta gate retains its run artifacts.
      await Promise.all([ownerContext?.close(), staffContext?.close()]); await closeDb();
    });

    async function filter(page: Page, entity: string) {
      const pending = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/v1/activity' && url.searchParams.get('entity') === entity && response.request().method() === 'GET';
      });
      await page.getByRole('combobox', { name: translate('filterLabel'), exact: true }).click();
      await page.getByRole('option', { name: translate(`entities.${entity}`), exact: true }).click();
      expect((await pending).status()).toBe(200);
    }
    async function assertRow(page: Page, item: ActivityItem, action: string) {
      const row = page.locator(`[data-activity-id="${item.id}"]`);
      await expect(row).toBeVisible(); await expect(row).toContainText(translate(`actions.${action}`));
      await expect(row).toContainText(ownerName);
      await expect(row.locator('time')).toHaveAttribute('datetime', item.createdAt);
      await expect(row.locator('time')).not.toHaveText('');
      if (item.href) await expect(row.getByRole('link', { name: translate('itemLink'), exact: true })).toHaveAttribute('href', `/${locale}${item.href}`);
      return row;
    }

    test('client Notes and Settings show ordered archive/restore actor, time, links and assigned scope', async () => {
      await api(owner, 'POST', `/clients/${clientId}/archive`, 200);
      await api(owner, 'POST', `/clients/${clientId}/unarchive`, 200);
      await api(owner, 'POST', `/clients/${otherClientId}/archive`, 200);
      await api(owner, 'POST', `/clients/${otherClientId}/unarchive`, 200);
      const history = await api<ActivityPage>(owner, 'GET', `/activity?clientId=${clientId}&entity=clients`);
      const restored = history.items.find(row => row.action === 'restore'), archived = history.items.find(row => row.action === 'archive');
      if (!restored || !archived) throw new Error('Real archive and restore operations must each produce an activity row.');
      expect(history.items.indexOf(restored)).toBeLessThan(history.items.indexOf(archived));
      await visit(owner, locale, `/coach/clients/${clientId}`);
      await owner.getByRole('tab', { name: common('clients.tabs.notes'), exact: true }).click();
      await expect(owner.getByRole('heading', { name: translate('title'), exact: true })).toBeVisible();
      await assertRow(owner, restored, 'restore'); await assertRow(owner, archived, 'archive');
      const ids = await owner.locator('[data-activity-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-activity-id')));
      expect(ids.indexOf(restored.id)).toBeLessThan(ids.indexOf(archived.id));
      await visit(owner, locale, '/coach/settings');
      // A hub card is one link named by its title and its body, so match the title as a substring inside main.
      await owner.getByRole('main').getByRole('link', { name: translate('title') }).click();
      await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/settings/activity$`));
      await filter(owner, 'clients'); await assertRow(owner, restored, 'restore');
      for (const width of [360, 375, 390, 430, 1440]) {
        await owner.setViewportSize({ width, height: 900 }); await ownerHealth();
        await expect(owner.locator('[aria-busy="true"]')).toHaveCount(0);
      }
      await visit(staff, locale, '/coach/settings/activity');
      await expect(staff.getByRole('main')).toContainText(translate('staffScope'));
      const staffPage = await api<ActivityPage>(staff, 'GET', '/activity?limit=100');
      expect(staffPage.items.some(row => row.clientId === clientId)).toBe(true);
      expect(staffPage.items.every(row => row.clientId === clientId)).toBe(true);
      await expect(staff.locator(`[data-activity-id="${restored.id}"]`)).toBeVisible();
      const otherRows = (await api<ActivityPage>(owner, 'GET', `/activity?clientId=${otherClientId}`)).items;
      for (const row of otherRows) await expect(staff.locator(`[data-activity-id="${row.id}"]`)).toHaveCount(0);
    });

    test('program, nutrition and form log links open exact snapshots and explicit revert creates only a fresh draft', async () => {
      const program = await api<Detail<ProgramDocument>>(owner, 'POST', '/programs', 201, { name: { en: `R3b program ${run}`, ar: `R3b program ${run}` }, weeks: 1, trainingDays: [] });
      await api(owner, 'POST', `/programs/${program.head.id}/publish`, 200, {});
      const nutrition = await api<Detail<NutritionDocument>>(owner, 'POST', '/nutrition', 201, { name: { en: `R3b nutrition ${run}`, ar: `R3b nutrition ${run}` } });
      const foods = await api<{ items: Array<{ id: string }> }>(owner, 'GET', '/foods?limit=1');
      if (!foods.items[0]) throw new Error('P9 must load the existing system food seed.');
      nutrition.currentVersion.document.meals = [{ id: 'meal', name: { en: 'Lunch', ar: 'Lunch' }, options: [{ id: 'option', items: [{ id: 'food', foodId: foods.items[0].id, quantity: 100, measure: { kind: 'g' }, approx: false }] }] }];
      await api(owner, 'PUT', `/nutrition/${nutrition.head.id}/draft`, 200, { document: nutrition.currentVersion.document, baseVersionNo: 1 });
      await api(owner, 'POST', `/nutrition/${nutrition.head.id}/publish`, 200, {});
      const form = await api<Detail<FormDocument>>(owner, 'POST', '/forms', 201, { name: { en: `R3b form ${run}`, ar: `R3b form ${run}` }, formKind: 'intake' });
      const document = { schemaVersion: 1, sections: [{ id: 'section', title: { en: 'Activity history', ar: 'Activity history' }, questions: [{ id: 'ready', type: 'yes_no', label: { en: 'Ready?', ar: 'Ready?' }, required: false }] }] };
      await api(owner, 'PUT', `/forms/${form.head.id}/draft`, 200, { document, baseVersionNo: 1 });
      await api(owner, 'POST', `/forms/${form.head.id}/publish`, 200, {});
      const sources = [
        { kind: 'program', route: 'programs', entity: 'program_versions', id: program.head.id, builder: 'programs' },
        { kind: 'nutrition', route: 'nutrition', entity: 'nutrition_plan_versions', id: nutrition.head.id, builder: 'nutrition' },
        { kind: 'form', route: 'forms', entity: 'form_versions', id: form.head.id, builder: 'intake' },
      ] as const;
      for (const source of sources) await test.step(`${source.kind}: immutable version and explicit fresh draft`, async () => {
        const frozen = await api<Version<unknown>>(owner, 'GET', `/${source.route}/${source.id}/versions/1`);
        expect(frozen.status).toBe('published');
        const before = await api<Detail<unknown>>(owner, 'GET', `/${source.route}/${source.id}`);
        const log = await api<ActivityPage>(owner, 'GET', `/activity?entity=${source.entity}&limit=100`);
        const item = log.items.find(row => row.version?.headId === source.id && row.version.versionNo === 1);
        if (!item?.version) throw new Error(`Published ${source.kind} must resolve to its real head/version link.`);
        expect(item.version.href).toBe(`/coach/settings/activity/version/${source.kind}/${source.id}/1`);
        await visit(owner, locale, '/coach/settings/activity'); await filter(owner, source.entity);
        const row = owner.locator(`[data-activity-id="${item.id}"]`);
        const posts: Request[] = [], observe = (request: Request) => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/v1/')) posts.push(request); };
        owner.on('request', observe);
        try {
          await row.getByRole('link', { name: translate('revertLink'), exact: true }).click();
          await expect(owner).toHaveURL(new RegExp(`/${locale}${item.version.href}$`));
          await expect(owner.getByRole('main')).toContainText(translate('immutableNotice'));
          await expect(owner.getByRole('main')).toContainText(translate('confirmDescription'));
          expect(posts).toHaveLength(0);
          await owner.getByRole('textbox', { name: labelPrefix(translate('changeNote')) }).fill(`R3b restore ${run}`);
          await mutation(owner, 'POST', `/${source.route}/${source.id}/revert`, 201, () => button(owner, translate('confirmRevert')).click());
          await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/${source.builder}/${source.id}$`));
          const revert = posts.filter(request => new URL(request.url()).pathname.endsWith('/revert'));
          expect(revert).toHaveLength(1); expect(revert[0]!.postDataJSON()).toEqual({ toVersionNo: 1, changeNote: `R3b restore ${run}` });
          expect(revert[0]!.headers()['idempotency-key']).toBeTruthy();
          expect(posts.some(request => new URL(request.url()).pathname.endsWith('/publish'))).toBe(false);
          const draft = await api<Detail<unknown>>(owner, 'GET', `/${source.route}/${source.id}`);
          expect(draft.currentVersion).toMatchObject({ versionNo: 2, status: 'draft', document: frozen.document });
          expect(draft.currentVersion.id).not.toBe(frozen.id); expect(draft.head.publishedVersionId).toBe(before.head.publishedVersionId);
          expect(await api(owner, 'GET', `/${source.route}/${source.id}/versions/1`)).toEqual(frozen);
        } finally { owner.off('request', observe); }
      });
    });
  });
}
