import { addDays, buildSubscriptionSchedule, generateSchedule, localDateOf, zonedDueAt } from '@dawlyy/core';
import { PackageEntitlements, ScheduleRules, type CalendarEventState, type SubscriptionState } from '@dawlyy/core/types';
import { DEMO_IDS as I, demoId } from './ids';

/** doc §14 / Task 12: fictional identities; active memberships are the dev-login identity directory. */
export const DEMO_CLIENTS = [
  { id: I.firstClient, userId: I.firstClientUser, membershipId: I.firstClientMembership, firstName: 'أحمد', lastName: 'حسن', locale: 'ar' },
  { id: I.secondClient, userId: I.secondClientUser, membershipId: I.secondClientMembership, firstName: 'سارة', lastName: 'علي', locale: 'ar' },
  { id: I.thirdClient, userId: I.thirdClientUser, membershipId: I.thirdClientMembership, firstName: 'محمود', lastName: 'عادل', locale: 'ar' },
  { id: I.fourthClient, userId: I.fourthClientUser, membershipId: I.fourthClientMembership, firstName: 'ندى', lastName: 'فؤاد', locale: 'ar' },
  { id: I.fifthClient, userId: I.fifthClientUser, membershipId: I.fifthClientMembership, firstName: 'كريم', lastName: 'سامي', locale: 'ar' },
  { id: I.sixthClient, userId: I.sixthClientUser, membershipId: I.sixthClientMembership, firstName: 'مريم', lastName: 'طارق', locale: 'ar' },
  { id: I.seventhClient, userId: I.seventhClientUser, membershipId: I.seventhClientMembership, firstName: 'Adam', lastName: 'Nour', locale: 'en' },
  { id: I.eighthClient, userId: I.eighthClientUser, membershipId: I.eighthClientMembership, firstName: 'Emily', lastName: 'Sami', locale: 'en' },
].map((c, i) => ({ ...c, locale: c.locale as 'ar' | 'en', displayName: `${c.firstName} ${c.lastName}`,
  email: `client${i + 1}@demo.dawlyy.test`, phone: `+2010000000${String(i + 3).padStart(2, '0')}` }));

/** doc §14 / Task 12: pure fixture graph from one seed instant; persisted first-subscription date anchors reruns. */
export function buildDemo(now: Date) {
  const today = localDateOf(now.toISOString(), 'Africa/Cairo');
  const at = (offset: number, time = '12:00') => new Date(zonedDueAt(addDays(today, offset), time, 'Africa/Cairo'));
  const full = PackageEntitlements.parse([
    { key: 'workout_program', enabled: true }, { key: 'nutrition_plan', enabled: true },
    { key: 'weekly_checkin', enabled: true, frequency: 'weekly', limit: 1, turnaroundHours: 48 },
    { key: 'chat', enabled: true, frequency: 'unlimited' },
    { key: 'measurements', enabled: true, frequency: 'monthly', limit: 1 },
    { key: 'progress_photos', enabled: true, frequency: 'monthly', limit: 1 },
    { key: 'assessments', enabled: true, frequency: 'per_subscription', limit: 1 },
    { key: 'program_updates', enabled: true, frequency: 'monthly', limit: 1 },
  ]);
  const rules = ScheduleRules.parse({ weighIn: { kind: 'daily_fasted' }, measurements: { everyDays: 28 }, progressPhotos: { everyDays: 28 } });
  const packages = [
    { id: I.package, name: { ar: 'متابعة أونلاين شهر', en: 'Monthly online coaching' }, durationDays: 30, price: 1500, graceDays: 7,
      entitlements: full, scheduleRules: rules },
    { id: I.threeMonthPackage, name: { ar: 'برنامج ٣ شهور', en: 'Three-month coaching' }, durationDays: 90, price: 3900, graceDays: 7,
      entitlements: PackageEntitlements.parse([...full, { key: 'technique_review', enabled: true, frequency: 'weekly', limit: 1, durationDays: 28, mediaTypes: ['video'] }]),
      scheduleRules: ScheduleRules.parse({ ...rules, techniqueReview: { enabled: true, firstWeeks: 4, maxPerWeek: 1 }, programReviewEveryDays: 28 }) },
    { id: I.nutritionPackage, name: { ar: 'متابعة أكل بس', en: 'Nutrition coaching' }, durationDays: 30, price: 900, graceDays: 3,
      entitlements: PackageEntitlements.parse(full.filter(e => !['workout_program', 'program_updates', 'assessments'].includes(e.key))),
      scheduleRules: ScheduleRules.parse({ ...rules, progressPhotos: undefined }) },
  ];
  const situations: Array<{ packageIndex: number; start: number; state: SubscriptionState; situation: string }> = [
    { packageIndex: 1, start: -63, state: 'active', situation: 'منتظم وبيزود الأوزان' },
    { packageIndex: 0, start: -25, state: 'active', situation: 'اشتراكها يخلص كمان ٥ أيام' },
    { packageIndex: 0, start: -32, state: 'grace', situation: 'في فترة السماح من يومين' },
    { packageIndex: 0, start: -42, state: 'expired', situation: 'الاشتراك وفترة السماح خلصوا' },
    { packageIndex: 0, start: -14, state: 'paused', situation: 'مجمد أسبوع عشان السفر' },
    { packageIndex: 0, start: 0, state: 'pending', situation: 'عميلة جديدة ومستنيين تأكيد الدفع' },
    { packageIndex: 2, start: -10, state: 'active', situation: 'متابعة أكل بس، لسه مفيش برنامج تمرين' },
    { packageIndex: 1, start: -63, state: 'active', situation: 'فاتها متابعتين ومبطلة تمرين الأسبوع ده' },
  ];
  const subscriptions = DEMO_CLIENTS.map((client, index) => {
    const situation = situations[index]!;
    const pack = packages[situation.packageIndex]!;
    const startsOn = addDays(today, situation.start);
    const freezes = situation.state === 'paused' ? [{ fromDate: addDays(today, -2), days: 7 }] : [];
    const timeline = { startsOn, durationDays: pack.durationDays, extensionDays: 0, freezes, graceDays: pack.graceDays, timezone: 'Africa/Cairo' };
    const schedule = freezes.length ? buildSubscriptionSchedule(timeline, pack.scheduleRules)
      : { endsOn: addDays(startsOn, pack.durationDays), graceEndsOn: addDays(startsOn, pack.durationDays + pack.graceDays),
        events: generateSchedule({ startDate: startsOn, endDate: addDays(startsOn, pack.durationDays), timezone: 'Africa/Cairo', rules: pack.scheduleRules }) };
    return { id: demoId(`subscription:${client.id}`), clientId: client.id, packageId: pack.id,
      packageSnapshot: { name: pack.name, durationDays: pack.durationDays, price: pack.price, currency: 'EGP', entitlements: pack.entitlements, scheduleRules: pack.scheduleRules },
      startsOn, endsOn: schedule.endsOn, graceEndsOn: schedule.graceEndsOn, state: situation.state,
      price: pack.price, frozenDays: freezes.length ? 7 : 0, pausedAt: freezes.length ? at(-2, '00:00') : null,
      situation: situation.situation, schedule: schedule.events.filter(e => !freezes.some(f => e.localDate >= f.fromDate && e.localDate < addDays(f.fromDate, f.days))) };
  });
  // The app generates the package calendar at sale time, including pending sales.
  const calendar = subscriptions.flatMap((sub, clientIndex) => sub.schedule.map(event => {
    const dueAt = new Date(event.dueAt);
    const daysOld = (Date.parse(today) - Date.parse(event.localDate)) / 86400000;
    const missed = clientIndex === 7 && daysOld >= 1 && daysOld <= 16;
    let state: CalendarEventState = dueAt > now ? 'scheduled' : daysOld > event.windowDays ? 'overdue' : 'due';
    if (daysOld > 1 && !missed) state = 'completed';
    return { ...event, id: demoId(`calendar:${sub.id}:${event.ruleKey}`), subscriptionId: sub.id, clientId: sub.clientId, dueAt, state,
      completedAt: state === 'completed' ? new Date(dueAt.getTime() + 30 * 60000) : null };
  }));
  const payments: Array<{ id: string; clientId: string; subscriptionId: string; amount: number; state: 'verified' | 'pending' | 'refunded' | 'rejected'; paidAt: Date; proofMediaId: string | null }> = subscriptions.map((sub, i) => ({
    id: demoId(`payment:${sub.id}`), clientId: sub.clientId, subscriptionId: sub.id, amount: sub.price,
    state: sub.state === 'pending' ? 'pending' : 'verified', paidAt: i === 5 ? new Date(now.getTime() - 3600000) : at(situations[i]!.start, '09:00'),
    proofMediaId: sub.state === 'pending' ? I.pendingProof : null,
  }));
  // A duplicate charge was refunded, leaving one verified subscription-price payment. A rejected attempt paid nothing.
  const expired = subscriptions[3]!;
  payments.push({ id: demoId('payment:refunded'), clientId: expired.clientId, subscriptionId: expired.id, amount: expired.price,
    state: 'refunded', paidAt: at(-43, '09:00'), proofMediaId: null });
  const lead = subscriptions[5]!;
  payments.push({ id: demoId('payment:rejected'), clientId: lead.clientId, subscriptionId: lead.id, amount: lead.price,
    state: 'rejected', paidAt: at(-1, '09:00'), proofMediaId: null });
  return { now, today, packages, subscriptions, calendar, payments };
}

/** doc §14 / Task 12: shared, inferred fixture type consumed by the area seed modules. */
export type Demo = ReturnType<typeof buildDemo>;
