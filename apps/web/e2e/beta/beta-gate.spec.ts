import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { localize, type NutritionDocument, type ProgramDocument } from '@dawlyy/core/types';
import type { BillingPayment, BillingSubscription } from '../../components/billing/types';
import type { SessionDetail, PortalToday } from '../../src/server/workout/contracts';
import type { FormBundle } from '../../components/form-runner/contracts';
import {
  api, billingDate, browserHealth, button, cairoToday, devLogin, labels,
  labelPrefix, mutation, plusDays, proofPng, responseJson, visit, type Locale,
} from './helpers';

// Public demo ID, retained from screens.spec.ts and seed/demo/ids.ts. No seeded client is repurposed.
const OWNER = 'd0250000-0000-4000-8000-000000000101';
const CHECKIN_FORM = 'd0250000-0000-4000-8000-000000000382';
const mobile = { width: 390, height: 844 };
const desktop = { width: 1366, height: 900 };
type Sale = { subscription: BillingSubscription; payment: BillingPayment | null; renewalDate: string };
type Program = { head: { id: string }; currentVersion: { status: string; document: ProgramDocument } };
type LibraryRow = { id: string; name: { ar?: string; en?: string }; hidden: boolean };
type SubscriptionDetail = { subscription: BillingSubscription; events: Array<{ kind: string; days: number | null; oldEndsOn: string | null; newEndsOn: string | null }>; upcoming: Array<{ id: string; type: string; state: string; localDate: string; subscriptionId: string | null }> };

for (const locale of ['ar', 'en'] as const satisfies readonly Locale[]) {
  test.describe(`beta gate @${locale}`, () => {
    test.describe.configure({ mode: 'serial' });
    let ownerContext: BrowserContext;
    let clientContext: BrowserContext;
    let owner: Page;
    let client: Page;
    let t: Awaited<ReturnType<typeof labels>>;
    let ownerHealth: () => Promise<void>;
    let clientHealth: () => Promise<void>;
    let clientId = '';
    let packageId = '';
    let programId = '';
    let nutritionId = '';
    let sale: Sale;
    let sessionId = '';
    let submittedId = '';
    const runId = `${locale}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const clientName = `Beta ${runId}`;
    const packageName = `Beta package ${runId}`;
    const programName = `Beta program ${runId}`;
    const nutritionName = `Beta nutrition ${runId}`;
    const workoutName = `Beta workout ${runId}`;
    const email = `beta-${runId}@example.test`;
    const inviteeUserId = randomUUID();
    let today = '';
    let startsOn = '';

    test.beforeAll(async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use playwright.e2e.config.ts with its local baseURL.');
      today = cairoToday();
      // A fully elapsed freeze can be resumed without reducing its seven approved days.
      startsOn = plusDays(today, -7);
      t = await labels(locale);
      const options = { baseURL, viewport: mobile, locale: locale === 'ar' ? 'ar-EG' : 'en-EG',
        timezoneId: 'Africa/Cairo', reducedMotion: 'reduce' as const };
      ownerContext = await browser.newContext(options);
      clientContext = await browser.newContext(options);
      ownerContext.setDefaultTimeout(20_000); clientContext.setDefaultTimeout(20_000);
      ownerContext.setDefaultNavigationTimeout(240_000); clientContext.setDefaultNavigationTimeout(240_000);
      ownerHealth = browserHealth(ownerContext, locale); clientHealth = browserHealth(clientContext, locale);
      owner = await ownerContext.newPage(); client = await clientContext.newPage();
      await devLogin(ownerContext, OWNER, locale);
    });

    test.afterEach(async () => {
      await Promise.all([ownerHealth?.(), clientHealth?.()]);
    });
    test.afterAll(async () => {
      // Keep run artifacts in the seeded local DB for inspection; never erase a shared demo tenant.
      await Promise.all([ownerContext?.close(), clientContext?.close()]);
    });

    async function step(name: string, wideOwner: boolean, work: () => Promise<void>) {
      await test.step(name, async () => {
        await owner.setViewportSize(wideOwner ? desktop : mobile);
        try { await work(); }
        finally {
          await Promise.all([ownerHealth(), clientHealth()]);
          if (wideOwner) {
            await owner.setViewportSize(mobile);
            await ownerHealth();
          }
        }
      });
    }

    async function assertEndDate(date: string) {
      // The ledger repeats historical dates; scope to the paragraph labelled Ends on.
      const line = owner.getByRole('paragraph').filter({ hasText: `${t('billing.endsOn')}:` });
      await expect(line).toHaveText(`${t('billing.endsOn')}: ${billingDate(date, locale)}`);
    }

    async function lifecycle(action: 'freeze' | 'resume' | 'extend', reason: string) {
      await owner.getByRole('combobox', { name: t('billing.action'), exact: true }).selectOption({ label: t(`billing.actions.${action}`) });
      if (action !== 'resume') await owner.getByRole('spinbutton', { name: t('billing.days'), exact: true }).fill('7');
      if (action === 'freeze') await owner.getByLabel(t('billing.fromDate'), { exact: true }).fill(startsOn);
      await owner.getByRole('textbox', { name: t('billing.reason'), exact: true }).fill(reason);
      const result = await mutation<{ subscription: BillingSubscription }>(owner, 'POST', `/subscriptions/${sale.subscription.id}/${action}`, 200,
        () => button(owner, t('billing.apply')).click());
      await expect(owner.getByRole('textbox', { name: t('billing.reason'), exact: true })).toHaveValue('');
      return result.subscription;
    }

    test('01 owner creates an EGP package with duration and access', async () => {
      await step('1. Create the package through Packages', true, async () => {
        await visit(owner, locale, '/coach/packages');
        await owner.getByRole('main').getByRole('link', { name: t('packages.add'), exact: true }).click();
        await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/packages/new$`));
        const fields = owner.getByRole('group').filter({ has: owner.getByRole('textbox', { name: t('packages.name.en'), exact: true }) });
        await fields.getByRole('textbox', { name: t('packages.name.ar'), exact: true }).fill(packageName);
        await fields.getByRole('textbox', { name: t('packages.name.en'), exact: true }).fill(packageName);
        await fields.getByRole('spinbutton', { name: t('packages.price'), exact: true }).fill('100');
        await fields.getByRole('textbox', { name: t('packages.currency'), exact: true }).fill('EGP');
        await fields.getByRole('spinbutton', { name: t('packages.durationDays'), exact: true }).fill('28');
        for (const key of ['workout_program', 'nutrition_plan', 'weekly_checkin']) {
          await owner.getByRole('group', { name: t(`packages.entitlements.${key}`), exact: true })
            .getByRole('switch', { name: t('packages.enabled'), exact: true }).check();
        }
        const created = await mutation<{ id: string; price: number; currency: string; durationDays: number }>(owner, 'POST', '/packages', 201,
          () => button(owner, t('packages.add')).click());
        packageId = created.id;
        expect(created).toMatchObject({ price: 100, currency: 'EGP', durationDays: 28 });
        await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/packages/${packageId}$`));
        await expect(owner.getByRole('textbox', { name: t('packages.name.en'), exact: true })).toHaveValue(packageName);
      });
    });

    test('02 owner creates and invites a unique client; client accepts', async () => {
      await step('2. Create client, issue invitation and explicitly accept', false, async () => {
        await visit(owner, locale, '/coach/clients/new');
        await owner.getByRole('textbox', { name: t('clients.fields.firstName'), exact: true }).fill(clientName);
        await owner.getByRole('textbox', { name: t('clients.fields.displayName'), exact: true }).fill(clientName);
        await owner.getByRole('textbox', { name: t('clients.fields.email'), exact: true }).fill(email);
        await owner.getByRole('combobox', { name: t('clients.fields.locale'), exact: true }).selectOption(locale);
        const created = await mutation<{ id: string }>(owner, 'POST', '/clients', 201,
          () => button(owner, t('clients.add')).click());
        clientId = created.id;
        await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/clients/${clientId}$`));
        // GAP: ClientDetail has no client-invitation control; the documented invitation API is the available path.
        const invitation = await api<{ token: string }>(owner, 'POST', '/invitations', 201,
          { role: 'client', clientId, displayName: clientName, email });
        expect(typeof invitation.token, 'Invitation API must return its one-time token').toBe('string');
        // Do not include the bearer token in assertion output or visit()'s diagnostic path.
        const preview = await client.goto(`/${locale}/invite/${invitation.token}`, { waitUntil: 'load' });
        expect(preview?.ok(), 'Invitation preview must load').toBe(true);
        await expect(client.getByRole('heading', { name: t('auth.invite.title'), exact: true })).toBeVisible();
        await clientHealth();
        // GAP: POST /api/dev-login currently allows only ACTIVE demo memberships. A new invitee has none.
        // Keep the beta gate red at this real boundary; never forge a cookie, reuse an existing client or seed a membership.
        const identity = await clientContext.request.post('/api/dev-login', {
          data: { userId: inviteeUserId, locale }, maxRedirects: 0,
        });
        try {
          expect(identity.status(), 'GAP: dev-login needs a supported membership-free invitee identity path before local acceptance can pass.').toBe(303);
        } finally { await identity.dispose(); }
        await client.reload();
        await mutation<{ role: string; redirectTo: string }>(client, 'POST', '/invitations/accept', 200,
          () => client.getByRole('button', { name: t('auth.invite.accept'), exact: true }).click());
        await expect(client).toHaveURL(new RegExp(`/${locale}/app/today$`));
        expect(await api<{ role: string; clientId: string }>(client, 'GET', '/me'))
          .toMatchObject({ role: 'client', clientId });
      });
    });

    test('03 owner sells package, uploads real local PNG proof and leaves payment pending', async () => {
      await step('3. Sell the package with an uploaded payment proof', true, async () => {
        await visit(owner, locale, '/coach/billing/sell');
        await owner.getByRole('combobox', { name: t('billing.client'), exact: true }).selectOption({ label: clientName });
        await owner.getByRole('combobox', { name: t('billing.package'), exact: true }).selectOption({ label: packageName });
        await owner.getByLabel(t('billing.startsOn'), { exact: true }).fill(startsOn);
        await owner.getByRole('combobox', { name: t('billing.method'), exact: true }).selectOption({ label: t('billing.methods.instapay') });
        await owner.getByRole('spinbutton', { name: t('billing.amount'), exact: true }).fill('100');
        await expect(owner.getByRole('switch', { name: t('billing.markPaid'), exact: true })).not.toBeChecked();
        const png = proofPng();
        // The Astryx file field is a labelled button plus a hidden input carrying the same label, so target the input itself.
        await owner.locator('#sale-proof[type="file"]').setInputFiles({ name: 'beta-proof.png', mimeType: 'image/png', buffer: png });
        const upload = owner.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/v1/media/local-upload/') && response.request().method() === 'PUT');
        const [created, stored] = await Promise.all([
          mutation<Sale>(owner, 'POST', '/subscriptions', 201, () => button(owner, t('billing.sell')).click()),
          upload,
        ]);
        const uploadResult = await responseJson<{ mediaId: string; uploaded: boolean }>(stored, 200);
        sale = created;
        expect(sale.payment).toMatchObject({ state: 'pending', receiptNo: null, proofMediaId: uploadResult.mediaId });
        expect(uploadResult.uploaded).toBe(true);
        expect(sale.subscription.state).toBe('pending');
        expect(sale.subscription.endsOn).toBe(plusDays(startsOn, 28));
        await expect(owner.getByRole('heading', { name: t('billing.saleComplete'), exact: true })).toBeVisible();
        // Astryx adds its own live regions (file field, buttons), so pick the sale result by its text.
        await expect(owner.getByRole('status').filter({ hasText: t('billing.awaitingVerification') })).toBeVisible();
        if (!sale.payment?.proofMediaId) throw new Error('The sale must retain its uploaded proof.');
        const download = await api<{ url: string }>(owner, 'GET', `/media/${sale.payment.proofMediaId}/url`);
        expect(download.url.startsWith('/api/v1/media/local-download/'), 'Proof must use local filesystem storage').toBe(true);
        const bytes = await owner.request.get(download.url);
        try { expect(bytes.status()).toBe(200); expect(await bytes.body()).toEqual(png); }
        finally { await bytes.dispose(); }
      });
    });

    test('04 verification issues receipt, activates subscription and grants client access', async () => {
      await step('4. Verify payment, inspect receipt and client Today access', true, async () => {
        if (!sale.payment) throw new Error('The first sale requires a payment.');
        await visit(owner, locale, `/coach/billing/payments/${sale.payment.id}`);
        await expect(owner.getByRole('main')).toContainText(t('billing.states.pending'));
        await expect(owner.getByRole('link', { name: t('billing.openProof'), exact: true })).toBeVisible();
        const verified = await mutation<BillingPayment>(owner, 'POST', `/payments/${sale.payment.id}/verify`, 200,
          () => button(owner, t('billing.verify')).click());
        expect(verified.state).toBe('verified');
        expect(verified.receiptNo).toBeTruthy();
        await expect(owner.getByRole('paragraph').filter({ hasText: `${t('billing.receipt')}:` }))
          .toHaveText(`${t('billing.receipt')}: ${verified.receiptNo}`);
        await visit(owner, locale, `/coach/clients/${clientId}/subscription`);
        await expect(owner.getByRole('main')).toContainText(t('status.active'));
        await assertEndDate(sale.subscription.endsOn);
        await visit(client, locale, '/app/today');
        expect((await api<PortalToday>(client, 'GET', '/me/today')).subscription.state).toBe('active');
        await visit(client, locale, '/app/subscription');
        await expect(client.getByRole('main')).toContainText(t('status.active'));
        await expect(client.getByRole('paragraph').filter({ hasText: `${t('billing.endsOn')}:` }))
          .toHaveText(`${t('billing.endsOn')}: ${billingDate(sale.subscription.endsOn, locale)}`);
        await visit(client, locale, '/app/today');
      });
    });

    test('05 owner publishes and assigns a workout program and two-food nutrition plan', async () => {
      await step('5. Build, publish and assign program and nutrition through the UI', true, async () => {
        await visit(owner, locale, '/coach/programs/new');
        await owner.getByRole('textbox', { name: labelPrefix(t('programs.name')) }).fill(programName);
        await owner.getByRole('spinbutton', { name: labelPrefix(t('programs.weeks')) }).fill('1');
        for (const day of [2, 4]) {
          const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + day)));
          await button(owner, weekday).click();
        }
        const program = await mutation<Program>(owner, 'POST', '/programs', 201,
          () => button(owner, t('programs.createTemplate')).click());
        programId = program.head.id;
        await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/programs/${programId}$`));
        const library = await api<{ items: LibraryRow[] }>(owner, 'GET', '/exercises?limit=100');
        const exercise = library.items.find(item => !item.hidden);
        if (!exercise) throw new Error('System seed must provide an exercise.');
        await owner.getByRole('textbox', { name: labelPrefix(t('programs.workoutName')) }).fill(workoutName);
        await owner.getByRole('textbox', { name: labelPrefix(t('programs.workoutName')) }).press('Tab');
        // A new program already holds one empty block (clicking add block made a second, empty one that publish refuses with 422).
        await button(owner, t('programs.addExercise')).click();
        const picker = owner.getByRole('dialog', { name: t('programs.chooseExercise'), exact: true });
        const exerciseName = localize(exercise.name, locale);
        await picker.getByRole('textbox', { name: labelPrefix(t('programs.exerciseSearch')) }).fill(exerciseName);
        await picker.getByRole('button', { name: exerciseName, exact: true }).click();
        await expect(picker).not.toBeVisible();
        // Item creation defaults to three sets. Keep one set, selected by its localized legend.
        for (const setNo of [3, 2]) {
          const row = owner.getByRole('group', { name: t('programs.setNumber', { number: new Intl.NumberFormat(locale).format(setNo) }), exact: true });
          await row.getByRole('button', { name: t('programs.removeSet'), exact: true }).click();
        }
        const planned = owner.getByRole('group', { name: t('programs.setNumber', { number: new Intl.NumberFormat(locale).format(1) }), exact: true });
        await planned.getByRole('textbox', { name: labelPrefix(t('programs.reps')) }).fill('8');
        await planned.getByRole('textbox', { name: labelPrefix(t('programs.reps')) }).press('Tab');
        await planned.getByRole('spinbutton', { name: labelPrefix(t('programs.load')) }).fill('20');
        await planned.getByRole('spinbutton', { name: labelPrefix(t('programs.load')) }).press('Tab');
        await button(owner, t('programs.publish')).click();
        const publish = owner.getByRole('dialog', { name: t('programs.publishTitle'), exact: true });
        await mutation(owner, 'POST', `/programs/${programId}/publish`, 200,
          () => publish.getByRole('button', { name: t('programs.publish'), exact: true }).click());
        await expect(publish).not.toBeVisible();
        const published = await api<Program>(owner, 'GET', `/programs/${programId}`);
        expect(published.currentVersion.status).toBe('published');
        const training = published.currentVersion.document.phases.flatMap(phase => phase.weeks.flatMap(week => week.days)).filter(day => day.kind === 'training');
        expect(training).toHaveLength(1);
        expect(training.flatMap(day => day.workout?.blocks.flatMap(block => block.items) ?? [])).toHaveLength(1);
        await owner.getByRole('main').getByRole('link', { name: t('programs.assign'), exact: true }).click();
        await owner.getByRole('textbox', { name: labelPrefix(t('programs.clientSearch')) }).fill(clientName);
        await owner.getByRole('group', { name: t('programs.chooseClient'), exact: true })
          .getByRole('button', { name: new RegExp(`^${clientName} · `) }).click();
        await owner.getByLabel(labelPrefix(t('programs.startDate'))).fill(today = cairoToday()); // fresh: a run can cross midnight in Cairo
        await mutation(owner, 'POST', `/programs/${programId}/assign`, 201,
          () => button(owner, t('programs.assign')).click());
        await expect(owner.getByRole('heading', { name: t('programs.assignSuccess'), exact: true })).toBeVisible();

        await visit(owner, locale, '/coach/nutrition/new');
        for (const lang of ['ar', 'en']) {
          await owner.getByRole('textbox', { name: labelPrefix(`${t('nutrition.common.name')} · ${t(`nutrition.common.${lang}`)}`) }).fill(nutritionName);
        }
        const nutrition = await mutation<{ head: { id: string } }>(owner, 'POST', '/nutrition', 201,
          () => button(owner, t('nutrition.plans.create')).click());
        nutritionId = nutrition.head.id;
        await expect(owner).toHaveURL(new RegExp(`/${locale}/coach/nutrition/${nutritionId}$`));
        const foodPage = await api<{ items: LibraryRow[] }>(owner, 'GET', '/foods?limit=100');
        const foods = foodPage.items.filter(item => !item.hidden).slice(0, 2);
        expect(foods).toHaveLength(2);
        // GAP: empty nutrition renders two identical Add meal buttons with no named containing region.
        // Seed only the first meal via the documented draft API; add the second food, publish and assign in the UI.
        const detail = await api<{ currentVersion: { versionNo: number; document: NutritionDocument }; revision: string }>(owner, 'GET', `/nutrition/${nutritionId}`);
        const firstFood = foods[0];
        if (!firstFood) throw new Error('Two foods must be seeded.');
        const document = detail.currentVersion.document;
        document.targets.kcal = 2000; document.targets.proteinG = 120;
        document.meals = [{ id: randomUUID(), name: { ar: nutritionName, en: nutritionName }, options: [{ id: randomUUID(),
          items: [{ id: randomUUID(), foodId: firstFood.id, quantity: 100, measure: { kind: 'g' }, approx: false }],
          macros: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } }] }];
        await api(owner, 'PUT', `/nutrition/${nutritionId}/draft`, 200,
          { document, baseVersionNo: detail.currentVersion.versionNo, baseRevision: detail.revision });
        await owner.reload();
        await button(owner, t('nutrition.builder.addFood')).click();
        const foodDialog = owner.getByRole('dialog', { name: t('nutrition.builder.addFood'), exact: true });
        const secondFood = foods[1];
        if (!secondFood) throw new Error('Two foods must be seeded.');
        const secondName = localize(secondFood.name, locale);
        await foodDialog.getByRole('textbox', { name: labelPrefix(t('nutrition.foods.search')) }).fill(secondName);
        await foodDialog.getByRole('button', { name: secondName, exact: true }).click();
        await expect(foodDialog).not.toBeVisible();
        await button(owner, t('nutrition.builder.publish')).click();
        const nutritionPublish = owner.getByRole('dialog', { name: t('nutrition.builder.publish'), exact: true });
        await mutation(owner, 'POST', `/nutrition/${nutritionId}/publish`, 200,
          () => nutritionPublish.getByRole('button', { name: t('nutrition.builder.publish'), exact: true }).click());
        await expect(nutritionPublish).not.toBeVisible();
        await owner.getByRole('main').getByRole('link', { name: t('nutrition.assign.title'), exact: true }).click();
        await owner.getByRole('searchbox', { name: labelPrefix(t('nutrition.assign.clientSearch')) }).fill(clientName);
        await owner.getByRole('group', { name: t('nutrition.assign.chooseClient'), exact: true })
          .getByRole('button', { name: new RegExp(`^${clientName} · `) }).click();
        await mutation(owner, 'POST', `/nutrition/${nutritionId}/assign`, 201,
          () => button(owner, t('nutrition.assign.submit')).click());
        await expect(owner.getByRole('main')).toContainText(t('nutrition.assign.success'));
        await visit(client, locale, '/app/nutrition');
        await expect(client.getByRole('heading', { name: nutritionName, level: 2, exact: true })).toBeVisible();
        for (const food of foods) await expect(client.getByRole('main')).toContainText(localize(food.name, locale));
        await visit(client, locale, '/app/today');
        await expect(client.getByRole('link', { name: t('client.today.start'), exact: true })).toBeVisible();
      });
    });

    test('06 client starts and finishes an online workout and logs one meal', async () => {
      await step('6. Client workout and meal logging stay online', false, async () => {
        await visit(client, locale, '/app/program');
        await expect(client.getByRole('heading', { name: programName, exact: true })).toBeVisible();
        await visit(client, locale, '/app/today');
        await client.getByRole('link', { name: t('client.today.start'), exact: true }).click();
        await expect(client).toHaveURL(new RegExp(`/${locale}/app/workout/[0-9a-f-]{36}$`), { timeout: 240_000 });
        sessionId = new URL(client.url()).pathname.split('/').at(-1) ?? '';
        const row = client.getByRole('group', { name: t('workout.setNumber', { count: 1 }), exact: true });
        const reps = row.getByRole('spinbutton', { name: t('workout.reps'), exact: true });
        const load = row.getByRole('spinbutton', { name: t('workout.loadWithUnit', { unit: t('workout.units.kg') }), exact: true });
        await reps.fill('8'); await reps.press('Tab');
        await load.fill('20'); await load.press('Tab');
        await row.getByRole('button', { name: t('workout.completeSet'), exact: true }).click();
        await expect(row.getByRole('button', { name: t('workout.setDone'), exact: true })).toBeVisible();
        await button(client, t('workout.finish')).click();
        await expect(client.getByRole('region', { name: t('workout.summary'), exact: true })).toBeVisible();
        await expect.poll(async () => {
          const detail = await api<SessionDetail>(client, 'GET', `/workout-sessions/${sessionId}`);
          return { state: detail.session.state, sets: detail.sets.map(set => ({ reps: set.reps, load: set.load, completed: set.completed })) };
        }).toEqual({ state: 'completed', sets: [{ reps: 8, load: 20, completed: true }] });
        await visit(client, locale, '/app/nutrition');
        const meal = await mutation<{ id: string; clientId: string; mealId: string; status: string }>(client, 'POST', '/meal-logs', 200,
          () => button(client, t('nutrition.client.status.eaten')).click());
        expect(meal).toMatchObject({ clientId, status: 'eaten' });
        expect(meal.mealId).toBeTruthy();
        await client.reload();
        await expect(client.getByRole('main')).toContainText(t('nutrition.client.status.eaten'));
        const logged = await api<{ items: Array<{ id: string; status: string }> }>(client, 'GET', `/meal-logs?date=${cairoToday()}`);
        expect(logged.items).toEqual([expect.objectContaining({ id: meal.id, status: 'eaten' })]);
        expect(await client.evaluate(() => navigator.onLine)).toBe(true);
      });
    });

    test('07 client submits a weekly check-in and owner comments and reviews', async () => {
      await step('7. Send, answer and review the weekly form', true, async () => {
        await visit(owner, locale, '/coach/checkins');
        // GAP: generated weekly_checkin events are not accepted by the form runner (it reads checkin).
        // Use the visible Send check-in action to send the seeded weekly template as a manual event.
        await button(owner, t('forms.hub.send.checkin')).click();
        const send = owner.getByRole('dialog', { name: t('forms.actions.sendTitle'), exact: true });
        await send.getByRole('searchbox', { name: t('forms.actions.searchClient'), exact: true }).fill(clientName);
        // The Astryx Selector trigger is named "<label> <selected value or placeholder>", so match the label as a substring.
        await send.getByRole('combobox', { name: t('forms.actions.client') }).click();
        await owner.getByRole('option', { name: clientName, exact: true }).click();
        const event = await mutation<{ id: string }>(owner, 'POST', '/forms/send', 201,
          () => send.getByRole('button', { name: t('forms.actions.send'), exact: true }).click());
        await send.getByRole('button', { name: t('forms.builder.cancel'), exact: true }).click();
        const bundle = await api<FormBundle>(client, 'GET', `/forms/for-client/${event.id}`);
        expect(bundle.head.id, 'Send the seeded weekly check-in template').toBe(CHECKIN_FORM);
        await visit(client, locale, `/app/checkins/${event.id}`);
        // Questions are user-authored data, not catalog strings: derive names from the pinned form response.
        const questions = bundle.version.document.sections.flatMap(section => section.questions);
        const sleep = questions.find(question => question.id === 'sleep');
        const notes = questions.find(question => question.id === 'notes');
        if (!sleep || !notes) throw new Error('Demo weekly template must contain sleep and notes questions.');
        await button(client, new Intl.NumberFormat(locale).format(8)).click();
        // Required fields carry a "required" suffix in their accessible name, so match the question label as a substring.
        await client.getByRole('spinbutton', { name: localize(sleep.label, locale) }).fill('7');
        await client.getByRole('textbox', { name: localize(notes.label, locale) }).fill(`Beta check-in ${runId}`);
        const submitted = client.waitForResponse(response => /\/api\/v1\/submissions\/[^/]+\/submit$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST');
        await button(client, t('forms.runner.submit')).click();
        const response = await submitted;
        const submission = await responseJson<{ id: string; state: string }>(response, 200);
        submittedId = submission.id;
        expect(submission.state).toBe('submitted');
        await expect(client.getByRole('main')).toContainText(t('forms.runner.sent'));
        await visit(owner, locale, '/coach/checkins');
        await expect(owner.getByRole('heading', { name: clientName, exact: true })).toBeVisible();
        // All review links share the catalog label. Resolve the new submission's identity by its href,
        // never by card order or presentation markup.
        let opened = false;
        for (const link of await owner.getByRole('link', { name: t('forms.queue.review'), exact: true }).all()) {
          const href = await link.getAttribute('href');
          if (href && new URL(href, owner.url()).pathname === `/${locale}/coach/checkins/review/${submittedId}`) {
            await link.click(); opened = true; break;
          }
        }
        expect(opened, 'Review queue must link to this client submission').toBe(true);
        const feedback = `Beta review ${runId}`;
        await owner.getByRole('textbox', { name: t('forms.review.feedback'), exact: true }).fill(feedback);
        await mutation(owner, 'POST', `/submissions/${submittedId}/review`, 200,
          () => button(owner, t('forms.review.reviewed')).click());
        await expect(owner.getByRole('main')).toContainText(t('forms.review.done'));
        const reviewed = await api<{ submission: { state: string; coachFeedback: string } }>(owner, 'GET', `/submissions/${submittedId}`);
        expect(reviewed.submission).toMatchObject({ state: 'reviewed', coachFeedback: feedback });
        await client.reload();
        await expect(client.getByRole('main')).toContainText(feedback);
        await expect(client.getByRole('main')).toContainText(t('status.complete'));
      });
    });

    test('08 owner verifies then refunds a second small payment', async () => {
      await step('8. Record, verify and refund a second payment', false, async () => {
        // GAP: no standalone Record payment UI exists; SellForm creates another subscription.
        // Record against the existing subscription with the documented API, then verify/refund in the UI.
        const payment = await api<BillingPayment>(owner, 'POST', '/payments', 201,
          { subscriptionId: sale.subscription.id, amount: '10', currency: 'EGP', method: 'cash' });
        expect(payment.state).toBe('pending');
        await visit(owner, locale, `/coach/billing/payments/${payment.id}`);
        const verified = await mutation<BillingPayment>(owner, 'POST', `/payments/${payment.id}/verify`, 200,
          () => button(owner, t('billing.verify')).click());
        expect(verified.state).toBe('verified'); expect(verified.receiptNo).toBeTruthy();
        await owner.getByRole('spinbutton', { name: t('billing.refundAmount'), exact: true }).fill('10');
        const refunded = await mutation<BillingPayment>(owner, 'POST', `/payments/${payment.id}/refund`, 200,
          () => button(owner, t('billing.refund')).click());
        expect(refunded).toMatchObject({ state: 'refunded', refundAmount: 10, receiptNo: verified.receiptNo });
        await expect(owner.getByRole('main')).toContainText(t('billing.states.refunded'));
        await owner.reload();
        await expect(owner.getByRole('main')).toContainText(t('billing.states.refunded'));
      });
    });

    test('09 owner freezes seven days, extends seven days, recalculates schedule and renews', async () => {
      await step('9. Freeze, resume, extend and renew with exact date assertions', false, async () => {
        await visit(owner, locale, `/coach/clients/${clientId}/subscription`);
        const originalEnd = plusDays(startsOn, 28);
        await assertEndDate(originalEnd);
        const before = await api<SubscriptionDetail>(owner, 'GET', `/subscriptions/${sale.subscription.id}`);
        const reminder = before.upcoming.find(event => event.type === 'renewal_reminder' && event.state === 'scheduled');
        if (!reminder) throw new Error('Package default schedule must create a future renewal reminder.');
        const frozen = await lifecycle('freeze', `Seven-day travel ${runId}`);
        expect(frozen).toMatchObject({ state: 'paused', endsOn: plusDays(originalEnd, 7) });
        await assertEndDate(plusDays(originalEnd, 7));
        await expect(owner.getByRole('main')).toContainText(t('status.paused'));
        // GAP: neither the screen nor state machine permits extension while paused.
        // Resume the fully elapsed seven-day freeze in the UI, preserving all seven frozen days, before extending.
        const resumed = await lifecycle('resume', `Return after seven days ${runId}`);
        expect(resumed).toMatchObject({ state: 'active', endsOn: plusDays(originalEnd, 7) });
        await assertEndDate(plusDays(originalEnd, 7));
        const extended = await lifecycle('extend', `Seven-day extension ${runId}`);
        expect(extended.endsOn).toBe(plusDays(originalEnd, 14));
        await assertEndDate(plusDays(originalEnd, 14));
        const after = await api<SubscriptionDetail>(owner, 'GET', `/subscriptions/${sale.subscription.id}`);
        expect(after.events).toEqual(expect.arrayContaining([
          expect.objectContaining({ kind: 'freeze', days: 7, oldEndsOn: originalEnd, newEndsOn: plusDays(originalEnd, 7) }),
          expect.objectContaining({ kind: 'extension', days: 7, newEndsOn: plusDays(originalEnd, 14) }),
        ]));
        // Schedule keys contain dates: reconciliation cancels obsolete occurrences and inserts replacements.
        expect(after.upcoming.find(event => event.id === reminder.id)?.state).toBe('cancelled');
        expect(after.upcoming).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'renewal_reminder', state: 'scheduled', localDate: plusDays(reminder.localDate, 14) }),
        ]));
        await expect(owner.getByRole('main')).toContainText(billingDate(plusDays(reminder.localDate, 14), locale));
        await owner.getByRole('main').getByRole('link', { name: t('billing.sell'), exact: true }).click();
        await owner.getByRole('combobox', { name: t('billing.package'), exact: true }).selectOption({ label: packageName });
        const renewalStart = plusDays(extended.endsOn, 1);
        await owner.getByLabel(t('billing.startsOn'), { exact: true }).fill(renewalStart);
        await owner.getByRole('switch', { name: t('billing.markPaid'), exact: true }).check();
        const renewal = await mutation<Sale>(owner, 'POST', '/subscriptions', 201,
          () => button(owner, t('billing.sell')).click());
        expect(renewal.subscription.id).not.toBe(sale.subscription.id);
        expect(renewal.subscription).toMatchObject({ startsOn: renewalStart, endsOn: plusDays(renewalStart, 28), state: 'active' });
        expect(renewal.payment?.state).toBe('verified'); expect(renewal.payment?.receiptNo).toBeTruthy();
        // Core: renewalDate is the day after the last covered day (endsOn + 1), as asserted in subscriptions.test.ts.
        expect(renewal.renewalDate).toBe(plusDays(renewalStart, 29));
        await expect(owner.getByRole('status').filter({ hasText: billingDate(renewal.renewalDate, locale) })).toBeVisible();
        const renewed = await api<SubscriptionDetail>(owner, 'GET', `/subscriptions/${renewal.subscription.id}`);
        expect(renewed.upcoming.some(event => event.type === 'weekly_checkin' && event.localDate === plusDays(renewalStart, 7))).toBe(true);
      });
    });

    test('10 final mobile locale, direction, overflow and browser-error gate', async () => {
      await step('10. Final owner and client mobile browser gate (also enforced at every preceding step)', false, async () => {
        await visit(owner, locale, `/coach/clients/${clientId}/subscription`);
        await visit(client, locale, '/app/today');
        await Promise.all([ownerHealth(), clientHealth()]);
      });
    });
  });
}
