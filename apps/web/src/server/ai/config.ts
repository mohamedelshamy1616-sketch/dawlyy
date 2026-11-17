import 'server-only';
import { createAnthropicProvider } from './anthropic';
import { createNoneProvider } from './none';
import { createOpenRouterProvider } from './openrouter';
import { AiProviderError, type AiProvider, type AiProviderEnv, type AiProviderStatus } from './types';

function runtimeEnv(): AiProviderEnv {
  return {
    DAWLYY_AI_PROVIDER: process.env.DAWLYY_AI_PROVIDER,
    DAWLYY_AI_MODEL: process.env.DAWLYY_AI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  };
}

/** R4d: redacted, synchronous configuration inspection; no requests or legal approval implied. */
export function getAiProviderStatus(env: AiProviderEnv = runtimeEnv()): AiProviderStatus {
  const selected = env.DAWLYY_AI_PROVIDER?.trim();
  if (!selected) return { provider: 'none', state: 'off', reason: 'default_none' };
  if (selected === 'none') return { provider: 'none', state: 'off', reason: 'explicit_none' };
  if (selected !== 'anthropic' && selected !== 'openrouter') {
    return { provider: 'none', state: 'misconfigured', reason: 'unknown_provider' };
  }
  const key = selected === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENROUTER_API_KEY;
  if (!key?.trim()) return { provider: selected, state: 'misconfigured', reason: 'needs_key' };
  if (!env.DAWLYY_AI_MODEL?.trim()) return { provider: selected, state: 'misconfigured', reason: 'needs_model' };
  return { provider: selected, state: 'configured', reason: 'external_configuration' };
}

/** R4d: selection performs no I/O; activation still needs Mohamed's approval and legal review. */
export function getAiProvider(options: { env?: AiProviderEnv; transport?: typeof fetch } = {}): AiProvider {
  const env = options.env ?? runtimeEnv();
  const status = getAiProviderStatus(env);
  if (status.reason === 'unknown_provider') throw new AiProviderError('provider_not_configured');
  if (status.provider === 'none') return createNoneProvider();
  const configuration = { model: env.DAWLYY_AI_MODEL, transport: options.transport };
  return status.provider === 'anthropic'
    ? createAnthropicProvider({ ...configuration, apiKey: env.ANTHROPIC_API_KEY })
    : createOpenRouterProvider({ ...configuration, apiKey: env.OPENROUTER_API_KEY });
}
