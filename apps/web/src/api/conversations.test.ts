import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { clients, conversations, events, memberships, messageRevisions, messages, notificationDeliveries, notifications, staffClientAssignments } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';

const conversationSchema = z.object({ id: z.string().uuid(), clientId: z.string().uuid() });
const messageSchema = z.object({ id: z.string().uuid(), body: z.string().nullable(), senderRole: z.string(), editedAt: z.string().nullable(), deletedAt: z.string().nullable(), mine: z.boolean().optional() });
const listSchema = z.object({ items: z.array(z.object({ id: z.string() }).passthrough()), nextCursor: z.string().nullable() });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });

describe('Task 9 conversations API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  let tenantId: string; let owner: string;
  let clientA: string; let clientB: string; let userA: string; let userB: string; let staffUser: string;
  beforeEach(async () => {
    fixture = await setupApiFixture();
    tenantId = fixture.owner.tenantId; owner = fixture.owner.userId;
    userA = randomUUID(); userB = randomUUID(); staffUser = randomUUID();
    await setupApiData(tenantId, 'messaging fixture', async tx => {
      const [a, b] = await tx.insert(clients).values([{ tenantId, firstName: 'Alice' }, { tenantId, firstName: 'Bola' }]).returning({ id: clients.id });
      if (!a || !b) throw new Error('Missing clients');
      clientA = a.id; clientB = b.id;
      const staffMembership = randomUUID();
      await tx.insert(memberships).values([
        { tenantId, userId: userA, role: 'client', status: 'active', clientId: clientA, displayName: 'Alice' },
        { tenantId, userId: userB, role: 'client', status: 'active', clientId: clientB, displayName: 'Bola' },
        { id: staffMembership, tenantId, userId: staffUser, role: 'staff', status: 'active', displayName: 'Assistant', permissions: { client_scope: 'assigned', modules: { messages: ['view', 'create'] } } },
      ]);
      await tx.insert(staffClientAssignments).values({ tenantId, membershipId: staffMembership, clientId: clientA });
    });
  });
  afterEach(async () => { await fixture?.cleanup(); });

  const base = '/api/v1/conversations';
  async function open(as: string, clientId?: string) {
    return call(app, 'POST', base, { as, body: clientId ? { clientId } : {} });
  }
  async function openFor(as: string, clientId?: string) {
    const response = await open(as, clientId);
    expect([200, 201]).toContain(response.status);
    return conversationSchema.parse(response.json);
  }
  async function send(as: string, conversationId: string, body: Record<string, unknown>) {
    return call(app, 'POST', `${base}/${conversationId}/messages`, { as, body: { clientUuid: randomUUID(), ...body } });
  }
  const select = <T>(fn: (tx: Parameters<Parameters<typeof setupApiData>[2]>[0]) => Promise<T>) => setupApiData(tenantId, 'messaging read-back', fn);

  it('opens one conversation per client and returns it the second time', async () => {
    const first = await open(owner, clientA);
    expect(first.status).toBe(201);
    const second = await open(owner, clientA);
    expect(second.status).toBe(200);
    expect(conversationSchema.parse(second.json).id).toBe(conversationSchema.parse(first.json).id);
    expect(await select(tx => tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.clientId, clientA)))).toHaveLength(1);
    expect((await open(owner)).status).toBe(422);
  });

  it('creates exactly one in-app notification and one email delivery for the recipient, and emits message.sent once', async () => {
    const conversation = await openFor(owner, clientA);
    const sent = await send(owner, conversation.id, { body: 'Welcome aboard' });
    expect(sent.status).toBe(201);
    const message = messageSchema.parse(sent.json);
    const rows = await select(tx => tx.select().from(notifications).where(eq(notifications.userId, userA)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'message', clientId: clientA, link: '/app/messages', dedupeKey: `message:${message.id}` });
    expect(rows[0]?.title.en).toBe('New message from API test owner');
    expect(rows[0]?.payload).toMatchObject({ conversationId: conversation.id, shareBody: false });
    const deliveries = await select(tx => tx.select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, userA)));
    expect(deliveries.filter(row => row.channel === 'email')).toHaveLength(1);
    expect(deliveries.find(row => row.channel === 'email')).toMatchObject({ state: 'queued', attempts: 0 });
    expect(deliveries.find(row => row.channel === 'inapp')).toMatchObject({ state: 'delivered' });
    expect(deliveries.filter(row => row.channel === 'webpush')).toHaveLength(0);
    const emitted = await select(tx => tx.select({ type: events.type, aggregateId: events.aggregateId }).from(events).where(and(eq(events.tenantId, tenantId), eq(events.type, 'message.sent'))));
    expect(emitted).toEqual([{ type: 'message.sent', aggregateId: message.id }]);
  });

  it('does not duplicate a message, notification or delivery when the same clientUuid is sent twice', async () => {
    const conversation = await openFor(userA, undefined);
    const clientUuid = randomUUID();
    const first = await send(userA, conversation.id, { body: 'Hello coach', clientUuid });
    const second = await send(userA, conversation.id, { body: 'Hello coach', clientUuid });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(messageSchema.parse(second.json).id).toBe(messageSchema.parse(first.json).id);
    expect(await select(tx => tx.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversation.id)))).toHaveLength(1);
    const owned = await select(tx => tx.select().from(notifications).where(eq(notifications.userId, owner)));
    expect(owned).toHaveLength(1);
    expect(owned[0]?.link).toBe(`/coach/messages/${conversation.id}`);
    expect(await select(tx => tx.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(and(eq(notificationDeliveries.userId, owner), eq(notificationDeliveries.channel, 'email'))))).toHaveLength(1);
    expect(await select(tx => tx.select({ id: events.id }).from(events).where(and(eq(events.tenantId, tenantId), eq(events.type, 'message.sent'))))).toHaveLength(1);
  });

  it('refuses an empty message and an attachment that is not the client\'s', async () => {
    const conversation = await openFor(owner, clientA);
    const empty = await send(owner, conversation.id, { body: '   ' });
    expect(empty.status).toBe(422);
    expect(errorSchema.parse(empty.json).error.code).toBe('empty_message');
    const foreign = await send(owner, conversation.id, { mediaIds: [randomUUID()] });
    expect(foreign.status).toBe(422);
    expect(errorSchema.parse(foreign.json).error.code).toBe('invalid_attachment');
    expect((await call(app, 'POST', `${base}/${conversation.id}/messages`, { as: owner, body: { body: 'x' } })).status).toBe(400);
  });

  it('keeps client A out of client B\'s conversation and out of conversations with other clients', async () => {
    const conversationB = await openFor(userB, undefined);
    expect((await send(userB, conversationB.id, { body: 'private' })).status).toBe(201);
    expect((await call(app, 'GET', `${base}/${conversationB.id}/messages`, { as: userA })).status).toBe(404);
    expect((await send(userA, conversationB.id, { body: 'intrusion' })).status).toBe(404);
    expect((await call(app, 'POST', `${base}/${conversationB.id}/read`, { as: userA })).status).toBe(404);
    expect((await open(userA, clientB)).status).toBe(403);
    const inbox = listSchema.parse((await call(app, 'GET', base, { as: userA })).json);
    expect(inbox.items).toHaveLength(0);
    const own = await openFor(userA, clientA);
    expect(listSchema.parse((await call(app, 'GET', base, { as: userA })).json).items.map(item => item.id)).toEqual([own.id]);
  });

  it('shows assigned-scope staff only the assigned clients\' threads', async () => {
    const forA = await openFor(owner, clientA);
    const forB = await openFor(owner, clientB);
    const inbox = listSchema.parse((await call(app, 'GET', base, { as: staffUser })).json);
    expect(inbox.items.map(item => item.id)).toEqual([forA.id]);
    expect((await call(app, 'GET', `${base}/${forB.id}/messages`, { as: staffUser })).status).toBe(404);
    expect((await open(staffUser, clientB)).status).toBe(404);
    expect((await send(staffUser, forA.id, { body: 'On it' })).status).toBe(201);
    const ownerInbox = listSchema.parse((await call(app, 'GET', base, { as: owner })).json);
    expect(ownerInbox.items).toHaveLength(2);
  });

  it('notifies the owner and the assigned staff, but not unassigned staff, when a client writes', async () => {
    const conversation = await openFor(userA, undefined);
    expect((await send(userA, conversation.id, { body: 'Question' })).status).toBe(201);
    const recipients = (await select(tx => tx.select({ userId: notifications.userId }).from(notifications).where(eq(notifications.tenantId, tenantId)))).map(row => row.userId).sort();
    expect(recipients).toEqual([owner, staffUser].sort());
  });

  it('lists messages newest first with keyset pages and hides deleted content', async () => {
    const conversation = await openFor(owner, clientA);
    const ids: string[] = [];
    for (const text of ['one', 'two', 'three']) ids.push(messageSchema.parse((await send(owner, conversation.id, { body: text })).json).id);
    const firstPage = listSchema.parse((await call(app, 'GET', `${base}/${conversation.id}/messages?limit=2`, { as: userA })).json);
    expect(firstPage.items.map(item => item.id)).toEqual([ids[2], ids[1]]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = listSchema.parse((await call(app, 'GET', `${base}/${conversation.id}/messages?limit=2&cursor=${firstPage.nextCursor}`, { as: userA })).json);
    expect(secondPage.items.map(item => item.id)).toEqual([ids[0]]);
    expect((await call(app, 'GET', `${base}/${conversation.id}/messages?cursor=garbage`, { as: owner })).status).toBe(400);
    expect((await call(app, 'DELETE', `${base}/${conversation.id}/messages/${ids[0]}`, { as: userA })).status).toBe(403);
    expect((await call(app, 'DELETE', `${base}/${conversation.id}/messages/${ids[0]}`, { as: owner })).status).toBe(200);
    const after = listSchema.parse((await call(app, 'GET', `${base}/${conversation.id}/messages?limit=5`, { as: userA })).json);
    expect(after.items.find(item => item.id === ids[0])).toMatchObject({ body: null, attachments: [] });
    const row = await select(tx => tx.select({ body: messages.body, deletedAt: messages.deletedAt }).from(messages).where(eq(messages.id, ids[0] ?? '')));
    expect(row[0]?.body).toBe('one');
    expect(row[0]?.deletedAt).not.toBeNull();
  });

  it('edits within 15 minutes and keeps a revision, then refuses after the window', async () => {
    const conversation = await openFor(owner, clientA);
    const message = messageSchema.parse((await send(owner, conversation.id, { body: 'Original' })).json);
    const url = `${base}/${conversation.id}/messages/${message.id}`;
    const edited = await call(app, 'PATCH', url, { as: owner, body: { body: 'Corrected' } });
    expect(edited.status).toBe(200);
    expect(messageSchema.parse(edited.json)).toMatchObject({ body: 'Corrected' });
    expect(messageSchema.parse(edited.json).editedAt).not.toBeNull();
    const revisions = await select(tx => tx.select({ body: messageRevisions.body }).from(messageRevisions).where(eq(messageRevisions.messageId, message.id)));
    expect(revisions).toEqual([{ body: 'Original' }]);
    expect((await call(app, 'PATCH', url, { as: userA, body: { body: 'Hijack' } })).status).toBe(403);
    await setupApiData(tenantId, 'backdate message', async tx => { await tx.update(messages).set({ createdAt: new Date(Date.now() - 16 * 60_000) }).where(eq(messages.id, message.id)); });
    const late = await call(app, 'PATCH', url, { as: owner, body: { body: 'Too late' } });
    expect(late.status).toBe(422);
    expect(errorSchema.parse(late.json).error.code).toBe('edit_window_closed');
  });

  it('keeps read markers per side and clears the unread counter and message notifications', async () => {
    const conversation = await openFor(userA, undefined);
    await send(userA, conversation.id, { body: 'Ping' });
    await send(userA, conversation.id, { body: 'Ping again' });
    const unreadFor = async (as: string) => (listSchema.parse((await call(app, 'GET', `${base}?unread=true`, { as })).json)).items.length;
    expect(await unreadFor(owner)).toBe(1);
    const read = await call(app, 'POST', `${base}/${conversation.id}/read`, { as: owner });
    expect(read.status).toBe(200);
    expect(read.json).toMatchObject({ markedMessages: 2, unread: 0 });
    expect(await unreadFor(owner)).toBe(0);
    const stored = await select(tx => tx.select({ byCoach: messages.readByCoachAt, byClient: messages.readByClientAt }).from(messages).where(eq(messages.conversationId, conversation.id)));
    expect(stored.every(row => row.byCoach !== null && row.byClient === null)).toBe(true);
    const ownerNotes = await select(tx => tx.select({ readAt: notifications.readAt }).from(notifications).where(eq(notifications.userId, owner)));
    expect(ownerNotes.every(row => row.readAt !== null)).toBe(true);
    expect((await call(app, 'POST', `${base}/${conversation.id}/read`, { as: owner })).json).toMatchObject({ markedMessages: 0 });
    await send(owner, conversation.id, { body: 'Reply' });
    expect(await unreadFor(userA)).toBe(1);
    await call(app, 'POST', `${base}/${conversation.id}/read`, { as: userA });
    expect(await unreadFor(userA)).toBe(0);
  });

  it('refuses callers without a session', async () => {
    expect((await call(app, 'GET', base)).status).toBe(401);
  });
});
