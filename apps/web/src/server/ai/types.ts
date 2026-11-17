import 'server-only';
import type { WeekReview } from '@dawlyy/core/review';

/** R4d: provider selection is explicit; every result remains a coach-owned draft. */
export type AiProviderName = 'none' | 'anthropic' | 'openrouter';
/** R4d: consume the deterministic review, never the original client input. */
export type AiDraftRequest = {
  review: WeekReview;
  locale: 'ar' | 'en';
  dialect: 'egyptian' | 'gulf';
  signaturePhrases: readonly string[];
};
/** R4d: untrusted text for the coach to edit; no approval or sending authority. */
export type AiDraftResult = { provider: AiProviderName; text: string };
/** R4d: adapters only produce drafts and cannot mutate a plan or send a message. */
export interface AiProvider {
  readonly name: AiProviderName;
  draft(request: AiDraftRequest): Promise<AiDraftResult>;
}
/** R4d: deliberately separate from the application's validated environment module. */
export type AiProviderEnv = {
  DAWLYY_AI_PROVIDER?: string;
  DAWLYY_AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};
/** R4d: redacted configuration state, independent of legal approval. */
export type AiProviderStatus = {
  provider: AiProviderName;
  state: 'off' | 'configured' | 'misconfigured';
  reason: 'default_none' | 'explicit_none' | 'needs_key' | 'needs_model' |
    'unknown_provider' | 'external_configuration';
};

type ErrorCode = 'provider_not_configured' | 'red_flags_open' | 'transport_failed' |
  'provider_response_invalid';

/** R4d: fixed messages never retain transport causes, headers, prompts, or bodies. */
export class AiProviderError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

/** R4d: shared, bounded transport used only after adapter configuration/flag guards. */
export async function requestProviderText(options: {
  url: 'https://api.anthropic.com/v1/messages' | 'https://openrouter.ai/api/v1/chat/completions';
  headers: Record<string, string>;
  body: unknown;
  transport: typeof fetch;
  parse: (body: unknown) => string;
}): Promise<string> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AiProviderError('transport_failed'));
      controller.abort();
      // Cancellation is best effort: the deadline also covers transports that ignore abort.
      if (reader) void reader.cancel().catch(() => {});
    }, 15_000);
  });
  const run = async (): Promise<string> => {
    const response = await options.transport(options.url, {
      method: 'POST', headers: options.headers, body: JSON.stringify(options.body),
      signal: controller.signal, redirect: 'error',
    });
    if (!response.ok) throw new AiProviderError('transport_failed');
    if (controller.signal.aborted) throw new AiProviderError('transport_failed');
    if (!response.body) throw new AiProviderError('provider_response_invalid');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new AiProviderError('transport_failed');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      // Also bound the JSON envelope so malformed/oversized streams cannot grow indefinitely.
      if (bytes > 65_536) throw new AiProviderError('provider_response_invalid');
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    let value: unknown;
    try { value = JSON.parse(raw) as unknown; }
    catch { throw new AiProviderError('provider_response_invalid'); }
    const text = options.parse(value);
    if (typeof text !== 'string' || text.trim().length === 0 || text.length > 8_000) {
      throw new AiProviderError('provider_response_invalid');
    }
    return text;
  };
  try {
    return await Promise.race([run(), deadline]);
  } catch (error) {
    if (error instanceof AiProviderError) throw new AiProviderError(error.code);
    throw new AiProviderError('transport_failed');
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

/** R4d: narrow unknown response objects without trusting provider JSON. */
export function isProviderObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
