import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../src/client';
import { clientFlags, clientNotes, conversations, messages, notifications, tasks } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import { DEMO_CLIENTS, type Demo } from './model';
import { exists } from './helpers';

/** doc §7.4, §12.1(6) / Task 12: three Arabic conversations, trigger-owned unread counters and coach action queues. */
export async function seedActivity(tx: Tx, demo: Demo): Promise<void> {
  for (const index of [0, 1, 7]) {
    const client = DEMO_CLIENTS[index]!;
    const id = demoId(`conversation:${client.id}`);
    if (await exists(tx, conversations, id)) continue;
    await tx.insert(conversations).values({ id, tenantId: I.tenant, clientId: client.id, kind: 'client', subject: 'متابعتنا مع بعض',
      createdAt: new Date(demo.now.getTime() - 3 * 86400000) });
    const bodies = index === 7
      ? ['الأسبوع اللي فات كان زحمة ومقدرتش أتمرن', 'ولا يهمك، نرجع بيومين خفاف الأول', 'ينفع نبدأ بكرة بعد الشغل؟', 'ينفع طبعًا، ابعتيلي الوقت اللي يناسبك']
      : ['صباح الخير يا كابتن، خلصت التمرين', 'صباح النور، الحركة مريحة ولا فيه حاجة مضايقاك؟', 'تمام الحمد لله، محتاج بديل للعشا', 'ممكن جبنة قريش وبطاطس مسلوقة، وقوليلي لو مش مناسب'];
    for (let m = 0; m < 4; m++) {
      const messageId = demoId(`message:${id}:${m}`);
      const fromClient = m % 2 === 0;
      const createdAt = new Date(demo.now.getTime() - (4 - m) * 3600000);
      await tx.insert(messages).values({ id: messageId, tenantId: I.tenant, clientId: client.id, conversationId: id,
        senderUserId: fromClient ? client.userId : I.ownerUser, senderRole: fromClient ? 'client' : 'owner',
        body: bodies[m]!, clientUuid: messageId, createdAt });
      if (m < 2) await tx.update(messages).set(fromClient ? { readByCoachAt: new Date(createdAt.getTime() + 60000) }
        : { readByClientAt: new Date(createdAt.getTime() + 60000) }).where(and(eq(messages.tenantId, I.tenant), eq(messages.id, messageId)));
      // Reset the read exchange; final messages increment both counters to one through the trigger.
      if (m === 1) await tx.update(conversations).set({ unreadForCoach: 0, unreadForClient: 0 })
        .where(and(eq(conversations.tenantId, I.tenant), eq(conversations.id, id)));
    }
  }
  const taskRows = [
    { key: 'review', clientId: I.secondClient, title: 'راجعي متابعة سارة وردي على سؤال العشا', source: 'rule:checkin_review', due: -1, priority: 'high' as const, assignee: I.staffMembership, link: '/coach/checkins' },
    { key: 'renew', clientId: I.secondClient, title: 'كلمي سارة بخصوص التجديد', source: 'rule:renewal_reminder', due: 1, priority: 'normal' as const, assignee: I.ownerMembership, link: `/coach/clients/${I.secondClient}` },
    { key: 'payment', clientId: I.sixthClient, title: 'راجعي إثبات دفع مريم', source: 'rule:pending_payment', due: 0, priority: 'high' as const, assignee: I.ownerMembership, link: '/coach/billing' },
    { key: 'risk', clientId: I.eighthClient, title: 'اطمني على إيميلي وحددي بداية سهلة', source: 'manual', due: 0, priority: 'high' as const, assignee: I.staffMembership, link: `/coach/clients/${I.eighthClient}` },
    { key: 'program', clientId: I.seventhClient, title: 'اسألي آدم لو حابب يضيف تمارين لخطة الأكل', source: 'manual', due: 2, priority: 'normal' as const, assignee: I.staffMembership, link: `/coach/clients/${I.seventhClient}` },
  ];
  for (const row of taskRows) {
    const id = demoId(`task:${row.key}`);
    if (!await exists(tx, tasks, id)) await tx.insert(tasks).values({ id, tenantId: I.tenant, clientId: row.clientId, title: row.title,
      detail: 'مهمة توضيحية للتجربة المحلية', state: 'open', priority: row.priority, source: row.source,
      dedupeKey: row.source === 'manual' ? null : `demo:${row.key}`, dueAt: new Date(demo.now.getTime() + row.due * 86400000),
      assigneeMembershipId: row.assignee, link: row.link, createdBy: row.source === 'manual' ? I.ownerUser : null, createdAt: demo.now });
  }
  for (const [clientId, kind, detail] of [
    [I.eighthClient, 'missed_checkins', { missed: 2, note: 'فاتتها متابعتين ورا بعض' }],
    [I.eighthClient, 'adherence_drop', { note: 'مفيش تمرين مكتمل الأسبوع ده' }],
    [I.sixthClient, 'pending_payment', { note: 'مستنيين تأكيد الدفع' }],
  ] as const) {
    const id = demoId(`flag:${clientId}:${kind}`);
    if (!await exists(tx, clientFlags, id)) await tx.insert(clientFlags).values({ id, tenantId: I.tenant, clientId, kind,
      severity: 'normal', detail, raisedAt: demo.now });
  }
  const noteId = demoId('note:first-client');
  if (!await exists(tx, clientNotes, noteId)) await tx.insert(clientNotes).values({ id: noteId, tenantId: I.tenant, clientId: I.firstClient,
    body: 'ملتزم بالمواعيد. نراجع السكوات قبل أي زيادة كبيرة في الوزن.', authorUserId: I.ownerUser, createdAt: demo.now });
  for (const [key, userId, clientId, title, link] of [
    ['coach-review', I.ownerUser, I.secondClient, 'متابعة سارة مستنية مراجعتك', '/coach/checkins'],
    ['staff-risk', I.staffUser, I.eighthClient, 'إيميلي محتاجة متابعة منك', `/coach/clients/${I.eighthClient}`],
    ['client-reply', I.firstClientUser, I.firstClient, 'الكابتن رد على رسالتك', '/app/messages'],
    ['client-renew', I.secondClientUser, I.secondClient, 'اشتراكك يخلص كمان ٥ أيام', '/app/subscription'],
  ] as const) {
    const id = demoId(`notification:${key}`);
    if (!await exists(tx, notifications, id)) await tx.insert(notifications).values({ id, tenantId: I.tenant, userId, clientId,
      type: key === 'client-reply' ? 'message' : key === 'client-renew' ? 'subscription_expiring' : 'checkin_due',
      title: { ar: title }, body: { ar: 'افتح التفاصيل وشوف الخطوة الجاية' }, link, dedupeKey: `demo:${key}`, createdAt: demo.now });
  }
}
