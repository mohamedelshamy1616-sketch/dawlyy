import { and, eq } from 'drizzle-orm';
import { FormDocument, type Answers } from '@dawlyy/core/types';
import { validateAnswers } from '@dawlyy/core/forms';
import { addDays, localDateOf, zonedDueAt } from '@dawlyy/core/schedule';
import type { Tx } from '../../src/client';
import { calendarEvents, forms, formSubmissions, formVersions } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import type { Demo } from './model';
import { exists } from './helpers';

/** doc §7.3, §7.5 / Task 12: published default templates with valid, fictional example answers. */
export const DEMO_FORMS: Array<{ id: string; versionId: string; kind: 'intake' | 'checkin' | 'assessment'; name: string; document: FormDocument; answers: Answers }> = [
  { id: I.intakeForm, versionId: I.intakeVersion, kind: 'intake' as const, name: 'خلينا نتعرف عليك',
    document: FormDocument.parse({ estimatedMinutes: 5, intro: { ar: 'إجاباتك هتساعدنا نعمل خطة تناسب يومك' }, sections: [{ id: 'about', title: { ar: 'عن يومك وهدفك' }, questions: [
      { id: 'goal', type: 'long_text', label: { ar: 'حابب توصل لإيه؟' }, required: true },
      { id: 'days', type: 'number', label: { ar: 'تقدر تتمرن كام يوم في الأسبوع؟' }, required: true, min: 1, max: 7 },
      { id: 'injury', type: 'yes_no', label: { ar: 'فيه إصابة أو ألم محتاجين ناخد بالنا منه؟' }, required: true },
    ] }] }), answers: { goal: 'عايز أتحرك أحسن وأقلل الدهون بالتدريج', days: 3, injury: false } satisfies Answers },
  { id: I.checkinForm, versionId: I.checkinVersion, kind: 'checkin' as const, name: 'متابعة الأسبوع',
    document: FormDocument.parse({ estimatedMinutes: 3, sections: [{ id: 'week', title: { ar: 'الأسبوع كان عامل إيه؟' }, questions: [
      { id: 'adherence', type: 'scale', label: { ar: 'التزامك بالخطة من ١ لـ١٠؟' }, required: true, scale: { min: 1, max: 10 } },
      { id: 'sleep', type: 'number', label: { ar: 'متوسط نومك كام ساعة؟' }, required: true, min: 0, max: 24 },
      { id: 'notes', type: 'long_text', label: { ar: 'إيه اللي محتاج نعدله مع بعض؟' }, required: true },
    ] }] }), answers: { adherence: 8, sleep: 7, notes: 'المواعيد بقت أسهل، محتاج بديل سريع للعشا' } satisfies Answers },
  { id: I.assessmentForm, versionId: I.assessmentVersion, kind: 'assessment' as const, name: 'تقييم الحركة واللياقة',
    document: FormDocument.parse({ estimatedMinutes: 5, sections: [{ id: 'movement', title: { ar: 'تقييم بسيط' }, questions: [
      { id: 'squat', type: 'number', label: { ar: 'كام سكوات مريح بوزن الجسم؟' }, required: true, min: 0, max: 100 },
      { id: 'walk', type: 'number', label: { ar: 'تقدر تمشي كام دقيقة براحة؟' }, required: true, min: 0, max: 240 },
      { id: 'pain', type: 'yes_no', label: { ar: 'ظهر أي ألم أثناء التقييم؟' }, required: true },
    ] }] }), answers: { squat: 15, walk: 30, pain: false } satisfies Answers },
];

/** doc §6.3, §7.5 / Task 12: submit/review valid forms, with visible coach feedback and linked manual appointments. */
export async function seedForms(tx: Tx, demo: Demo): Promise<void> {
  const publishedAt = new Date(zonedDueAt(addDays(demo.today, -65), '09:00', 'Africa/Cairo'));
  for (const form of DEMO_FORMS) {
    if (!await exists(tx, forms, form.id)) await tx.insert(forms).values({ id: form.id, tenantId: I.tenant, kind: 'template',
      formKind: form.kind, name: { ar: form.name }, isDefault: 1, createdBy: I.ownerUser, createdAt: publishedAt });
    if (!await exists(tx, formVersions, form.versionId)) {
      await tx.insert(formVersions).values({ id: form.versionId, tenantId: I.tenant, formId: form.id, versionNo: 1, status: 'published',
        document: form.document, publishedAt, publishedBy: I.ownerUser, createdBy: I.ownerUser, createdAt: publishedAt });
      await tx.update(forms).set({ currentVersionId: form.versionId }).where(and(eq(forms.tenantId, I.tenant), eq(forms.id, form.id)));
    }
  }
  const submissions = [
    { clientIndex: 0, formIndex: 0, day: -60, reviewed: true, feedback: 'تمام، هنبدأ بأوزان مريحة ونزود خطوة خطوة' },
    { clientIndex: 1, formIndex: 0, day: -24, reviewed: true, feedback: 'هنظبط مواعيد الأكل على الشغل، ابعتي لو فيه حاجة مش مناسبة' },
    { clientIndex: 0, formIndex: 1, day: -7, reviewed: true, feedback: 'تقدم حلو، هنزود الحمل ٢٫٥ كيلو لو الحركة ثابتة' },
    { clientIndex: 1, formIndex: 1, day: -1, reviewed: false, feedback: null },
    { clientIndex: 2, formIndex: 2, day: -20, reviewed: true, feedback: 'الحركة مريحة، نكمل نفس التدرج من غير استعجال' },
  ];
  for (const spec of submissions) {
    const form = DEMO_FORMS[spec.formIndex]!;
    const sub = demo.subscriptions[spec.clientIndex]!;
    const id = demoId(`submission:${sub.clientId}:${form.kind}`);
    if (await exists(tx, formSubmissions, id)) continue;
    // Use the stored immutable version, including any operator-edited draft that was published before the seed.
    const [version] = await tx.select().from(formVersions).where(and(eq(formVersions.tenantId, I.tenant), eq(formVersions.id, form.versionId))).limit(1);
    if (!version || validateAnswers(version.document, form.answers).length) throw new Error('Demo form answers no longer match the stored template.');
    const dueAt = new Date(zonedDueAt(addDays(demo.today, spec.day), '09:00', 'Africa/Cairo'));
    const eventId = form.kind === 'intake' ? null : demoId(`form-event:${id}`);
    if (eventId && !await exists(tx, calendarEvents, eventId)) await tx.insert(calendarEvents).values({ id: eventId, tenantId: I.tenant,
      clientId: sub.clientId, subscriptionId: sub.id, type: form.kind, source: 'manual', state: 'due', dueAt,
      localDate: localDateOf(dueAt.toISOString(), 'Africa/Cairo'), timezone: 'Africa/Cairo', title: { ar: form.name },
      payload: { formId: form.id, formVersionId: form.versionId }, createdBy: I.ownerUser, createdAt: dueAt });
    const scope = and(eq(formSubmissions.tenantId, I.tenant), eq(formSubmissions.id, id));
    await tx.insert(formSubmissions).values({ id, tenantId: I.tenant, clientId: sub.clientId, formId: form.id, formVersionId: form.versionId,
      formKind: form.kind, subscriptionId: sub.id, calendarEventId: eventId, state: 'due', answers: form.answers,
      clientUuid: id, clientUpdatedAt: dueAt, createdAt: dueAt });
    const submittedAt = new Date(dueAt.getTime() + 20 * 60000);
    await tx.update(formSubmissions).set({ state: 'submitted', submittedAt, updatedAt: submittedAt }).where(scope);
    if (eventId) await tx.update(calendarEvents).set({ state: 'completed', completedAt: submittedAt }).where(and(eq(calendarEvents.tenantId, I.tenant), eq(calendarEvents.id, eventId)));
    if (spec.reviewed) await tx.update(formSubmissions).set({ state: 'reviewed', reviewedAt: new Date(submittedAt.getTime() + 3600000),
      reviewedBy: I.ownerUser, coachFeedback: spec.feedback, updatedAt: new Date(submittedAt.getTime() + 3600000) }).where(scope);
  }
  // Form UI currently resolves manual `checkin` events, while generated `weekly_checkin` events feed dashboard queues.
  // Keep both valid app paths represented until the integrator unifies those type names.
  const dueId = demoId('form-event:due');
  if (!await exists(tx, calendarEvents, dueId)) {
    const dueAt = new Date(demo.now.getTime() - 30 * 60000);
    await tx.insert(calendarEvents).values({ id: dueId, tenantId: I.tenant, clientId: I.thirdClient, subscriptionId: demo.subscriptions[2]!.id,
      type: 'checkin', source: 'manual', state: 'due', dueAt, localDate: localDateOf(dueAt.toISOString(), 'Africa/Cairo'), timezone: 'Africa/Cairo',
      title: { ar: 'متابعة مستنية إجاباتك' }, payload: { formId: I.checkinForm, formVersionId: I.checkinVersion }, createdBy: I.ownerUser, createdAt: demo.now });
  }
}
