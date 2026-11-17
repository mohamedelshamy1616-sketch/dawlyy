import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { weekReview, type WeekReviewInput } from '@dawlyy/core/review';
import { createAnthropicProvider } from './anthropic';
import { createNoneProvider } from './none';
import { createOpenRouterProvider } from './openrouter';
import { getAiProvider, AiProviderError, type AiDraftRequest, type AiProvider, type AiProviderEnv } from './index';

let network: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  network = vi.fn<typeof fetch>().mockRejectedValue(new Error('Global transport is forbidden in R4d tests'));
  vi.stubGlobal('fetch', network);
});
afterEach(() => {
  try { expect(network).not.toHaveBeenCalled(); }
  finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});

function input(): WeekReviewInput {
  return {
    client: { id: '10000000-0000-4000-8000-000000000001', firstName: 'TemplateName', goal: null },
    coach: { firstName: 'Coach', dialect: 'egyptian', signaturePhrases: [] },
    period: { from: '2026-11-01', to: '2026-11-07' },
    workouts: { planned: 0, done: 0, previousPlanned: 0, previousDone: 0 },
    exercises: [], meals: { nutritionAssigned: false, daysLogged: 0, daysInPeriod: 7, avgKcal: null, targetKcal: null },
    checkin: { current: null, previous: null }, weights: [], measurements: [], redFlags: [], attention: null, nutrition: null,
  };
}
function request(locale: 'ar' | 'en' = 'en', filled = false): AiDraftRequest {
  const value = input();
  if (filled) value.workouts = { planned: 4, done: 3, previousPlanned: 4, previousDone: 2 };
  return { review: weekReview(value, { locale }), locale, dialect: 'egyptian', signaturePhrases: [] };
}

const adapters = [
  { name: 'anthropic', create: createAnthropicProvider, url: 'https://api.anthropic.com/v1/messages' },
  { name: 'openrouter', create: createOpenRouterProvider, url: 'https://openrouter.ai/api/v1/chat/completions' },
] as const;
type ExternalName = typeof adapters[number]['name'];
const sentinel = 'inert-transport-sentinel';
const model = 'explicit-fixture-model';
function successBody(name: ExternalName, text = 'Coach-owned draft'): unknown {
  return name === 'anthropic'
    ? { role: 'assistant', content: [{ type: 'text', text }] }
    : { choices: [{ message: { role: 'assistant', content: text } }] };
}
function fakeResponse(name: ExternalName, body: unknown = successBody(name)) {
  return vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body));
}
function assertPrivacy(name: ExternalName, transport: ReturnType<typeof vi.fn<typeof fetch>>) {
  if (name !== 'openrouter') return;
  for (const [, init] of transport.mock.calls) {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.provider).toEqual({ data_collection: 'deny', allow_fallbacks: false });
    expect(body).not.toHaveProperty('models');
  }
}
async function expectError(provider: AiProvider, expected: AiProviderError['code'], value = request()) {
  const error: unknown = await provider.draft(value).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiProviderError);
  if (!(error instanceof AiProviderError)) throw new Error('Expected sanitized AiProviderError');
  expect(error.code).toBe(expected);
  expect(error.message).toBe(expected);
  expect(error.message.length).toBeLessThan(80);
  expect(error).not.toHaveProperty('cause');
  expect(JSON.stringify(error)).not.toMatch(/inert|TemplateName|authorization|x-api-key|private-prompt|private-body/);
}

describe('R4d none provider', () => {
  it.each(['ar', 'en'] as const)('returns the real R4a %s empty and populated drafts byte for byte', async locale => {
    for (const filled of [false, true]) {
      const value = request(locale, filled);
      const provider = createNoneProvider();
      expect(await provider.draft(value)).toEqual({ provider: 'none', text: value.review.draft.text });
      value.review.mustHandleFlags = true;
      expect(await getAiProvider({ env: {} }).draft(value)).toEqual({ provider: 'none', text: value.review.draft.text });
    }
  });
});

describe.each(adapters)('R4d $name fake transport', adapter => {
  it('selects synchronously, then uses the injected transport and fixed endpoint/headers/model', async () => {
    const transport = fakeResponse(adapter.name);
    const env: AiProviderEnv = {
      DAWLYY_AI_PROVIDER: adapter.name, DAWLYY_AI_MODEL: model,
      ...(adapter.name === 'anthropic' ? { ANTHROPIC_API_KEY: sentinel } : { OPENROUTER_API_KEY: sentinel }),
    };
    const provider = getAiProvider({ env, transport });
    expect(transport).not.toHaveBeenCalled();
    expect(await provider.draft(request())).toEqual({ provider: adapter.name, text: 'Coach-owned draft' });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe(adapter.url);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toEqual(adapter.name === 'anthropic'
      ? { 'x-api-key': sentinel, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
      : { authorization: `Bearer ${sentinel}`, 'content-type': 'application/json' });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe(model);
    if (adapter.name === 'anthropic') {
      expect(body.max_tokens).toBe(1000);
      expect(body.system).toEqual(expect.any(String));
      expect(body.messages).toEqual([{ role: 'user', content: expect.any(String) }]);
    } else {
      expect(body.max_tokens).toBe(1000);
      expect(body.messages).toEqual([{ role: 'system', content: expect.any(String) }, { role: 'user', content: expect.any(String) }]);
    }
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('stream');
    assertPrivacy(adapter.name, transport);
  });

  it('does not let extra configuration override the fixed endpoint or privacy routing on any request', async () => {
    const transport = fakeResponse(adapter.name);
    const options = {
      apiKey: sentinel, model, transport, baseUrl: 'https://invalid.example',
      provider: { data_collection: 'allow', allow_fallbacks: true }, models: ['unexpected-fallback'],
    };
    const provider = adapter.create(options);
    for (const locale of ['ar', 'en'] as const) await provider.draft(request(locale));
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [url] of transport.mock.calls) expect(url).toBe(adapter.url);
    assertPrivacy(adapter.name, transport);
  });

  it.each([
    { apiKey: undefined, model }, { apiKey: ' \t', model },
    { apiKey: sentinel, model: undefined }, { apiKey: sentinel, model: ' \t' },
  ])('rejects incomplete configuration without a request: %j', async options => {
    const transport = fakeResponse(adapter.name);
    await expectError(adapter.create({ ...options, transport }), 'provider_not_configured');
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects selected but incomplete configuration without disguising it as template success', async () => {
    const transport = fakeResponse(adapter.name);
    const env = { DAWLYY_AI_PROVIDER: adapter.name, DAWLYY_AI_MODEL: model };
    const provider = getAiProvider({ env, transport });
    expect(provider.name).toBe(adapter.name);
    await expectError(provider, 'provider_not_configured');
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects open safety flags before any transport', async () => {
    const transport = fakeResponse(adapter.name);
    const value = request();
    value.review.mustHandleFlags = true;
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'red_flags_open', value);
    expect(transport).not.toHaveBeenCalled();
  });

  it('sanitizes a rejected transport, with no retry or fallback', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(`${sentinel} private-prompt authorization private-body`));
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'transport_failed');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it.each([400, 401, 429, 500])('sanitizes HTTP %s without parsing its error body or retrying', async status => {
    const response = new Response(`${sentinel} private-body authorization`, { status });
    const text = vi.spyOn(response, 'text');
    const json = vi.spyOn(response, 'json');
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'transport_failed');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(response.bodyUsed).toBe(false);
    assertPrivacy(adapter.name, transport);
  });

  it('rejects invalid JSON without surfacing or retrying its body', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(`${sentinel} private-body`));
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it.each([null, {}, { content: [] }, { choices: [] }])('rejects malformed response %j once', async body => {
    const transport = fakeResponse(adapter.name, body);
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it.each(['', ' \n\t ', 'x'.repeat(8_001)])('rejects empty or oversized output once (case %#)', async text => {
    const transport = fakeResponse(adapter.name, successBody(adapter.name, text));
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it('accepts the 8,000-character boundary without trimming valid output', async () => {
    const text = ` ${'x'.repeat(7_998)} `;
    const transport = fakeResponse(adapter.name, successBody(adapter.name, text));
    expect(await adapter.create({ apiKey: sentinel, model, transport }).draft(request())).toEqual({ provider: adapter.name, text });
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it('bounds the JSON envelope before accepting output', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(65_537)));
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it('aborts at 15 seconds even when the injected transport ignores its signal', async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    const provider = adapter.create({ apiKey: sentinel, model, transport });
    const observed = expectError(provider, 'transport_failed');
    await vi.advanceTimersByTimeAsync(14_999);
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await observed;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it('keeps the deadline active while the response body stalls', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    const observed = expectError(adapter.create({ apiKey: sentinel, model, transport }), 'transport_failed');
    await vi.advanceTimersByTimeAsync(15_000);
    await observed;
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });

  it('sanitizes response-stream failures', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(`${sentinel} private-body`)); } });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expectError(adapter.create({ apiKey: sentinel, model, transport }), 'transport_failed');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy(adapter.name, transport);
  });
});

describe('R4d provider-specific response validation', () => {
  it('joins nonempty Anthropic text blocks only', async () => {
    const transport = fakeResponse('anthropic', { role: 'assistant', content: [{ type: 'text', text: 'First' }, { type: 'text', text: 'Second' }] });
    expect(await createAnthropicProvider({ apiKey: sentinel, model, transport }).draft(request())).toEqual({ provider: 'anthropic', text: 'First\nSecond' });
  });

  it.each([
    { role: 'assistant', content: [{ type: 'text', text: 'Text' }, { type: 'tool_use', name: 'send_message', input: {} }] },
    { role: 'assistant', content: [{ type: 'text', text: 42 }] },
    { role: 'user', content: [{ type: 'text', text: 'Text' }] },
    { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Text' }] },
  ])('rejects Anthropic tool/non-text responses (case %#)', async body => {
    const transport = fakeResponse('anthropic', body);
    await expectError(createAnthropicProvider({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    { role: 'assistant', content: ['not text'] },
    { role: 'assistant', content: null },
    { role: 'user', content: 'Text' },
    { role: 'assistant', content: 'Text', tool_calls: [{ function: { name: 'send_message' } }] },
    { role: 'assistant', content: 'Text', function_call: { name: 'send_message' } },
  ])('rejects OpenRouter tool/non-assistant/non-string responses (case %#)', async message => {
    const transport = fakeResponse('openrouter', { choices: [{ message }] });
    await expectError(createOpenRouterProvider({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy('openrouter', transport);
  });

  it('uses only the first OpenRouter assistant choice and never falls through an invalid first choice', async () => {
    const transport = fakeResponse('openrouter', { choices: [
      { message: { role: 'assistant', content: '' } }, { message: { role: 'assistant', content: 'Do not use fallback' } },
    ] });
    await expectError(createOpenRouterProvider({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy('openrouter', transport);
  });

  it.each(['tool_calls', 'function_call'])('rejects OpenRouter %s finish reasons even with text', async finishReason => {
    const transport = fakeResponse('openrouter', { choices: [{
      finish_reason: finishReason, message: { role: 'assistant', content: 'Untrusted tool response' },
    }] });
    await expectError(createOpenRouterProvider({ apiKey: sentinel, model, transport }), 'provider_response_invalid');
    expect(transport).toHaveBeenCalledTimes(1);
    assertPrivacy('openrouter', transport);
  });
});
