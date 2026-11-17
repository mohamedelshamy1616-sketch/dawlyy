import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAiProvider, getAiProviderStatus, AiProviderError, type AiProviderEnv } from './index';

let network: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  network = vi.fn<typeof fetch>().mockRejectedValue(new Error('Global transport is forbidden in R4d tests'));
  vi.stubGlobal('fetch', network);
});
afterEach(() => {
  try { expect(network).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

const keys: AiProviderEnv = {
  ANTHROPIC_API_KEY: 'inert-anthropic-sentinel',
  OPENROUTER_API_KEY: 'inert-openrouter-sentinel',
  DAWLYY_AI_MODEL: 'explicit-test-model',
};

describe('R4d explicit provider selection', () => {
  it.each([
    [{}, 'default_none'],
    [{ ...keys }, 'default_none'],
    [{ DAWLYY_AI_PROVIDER: 'none' }, 'explicit_none'],
    [{ ...keys, DAWLYY_AI_PROVIDER: 'none' }, 'explicit_none'],
    [{ ...keys, DAWLYY_AI_PROVIDER: '  ' }, 'default_none'],
  ] as const)('keeps templates selected for %j', (env, reason) => {
    expect(getAiProvider({ env }).name).toBe('none');
    expect(getAiProviderStatus(env)).toEqual({ provider: 'none', state: 'off', reason });
  });

  it('fails closed for an unknown provider without echoing its value', () => {
    const env = { ...keys, DAWLYY_AI_PROVIDER: 'unknown-inert-secret-value' };
    expect(getAiProviderStatus(env)).toEqual({ provider: 'none', state: 'misconfigured', reason: 'unknown_provider' });
    expect(() => getAiProvider({ env })).toThrowError(AiProviderError);
    expect(() => getAiProvider({ env })).toThrowError('provider_not_configured');
    expect(JSON.stringify(getAiProviderStatus(env))).not.toContain('unknown-inert');
  });

  it.each(['anthropic', 'openrouter'] as const)('%s needs its own key and an explicit model', provider => {
    const keyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENROUTER_API_KEY';
    const otherKey = provider === 'anthropic' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY';
    const missingOwn: AiProviderEnv = { DAWLYY_AI_PROVIDER: provider, DAWLYY_AI_MODEL: 'test-model', [otherKey]: 'inert-other-provider' };
    expect(getAiProviderStatus(missingOwn)).toEqual({ provider, state: 'misconfigured', reason: 'needs_key' });
    expect(getAiProvider({ env: missingOwn }).name).toBe(provider);
    expect(getAiProviderStatus({ ...missingOwn, [keyName]: ' \t ' })).toEqual({ provider, state: 'misconfigured', reason: 'needs_key' });
    for (const model of [undefined, '', ' \t ']) {
      const env: AiProviderEnv = { DAWLYY_AI_PROVIDER: provider, [keyName]: 'inert-own-provider', DAWLYY_AI_MODEL: model };
      expect(getAiProviderStatus(env)).toEqual({ provider, state: 'misconfigured', reason: 'needs_model' });
      expect(getAiProvider({ env }).name).toBe(provider);
    }
  });

  it.each(['anthropic', 'openrouter'] as const)('reports %s configuration without disclosing keys or models', provider => {
    const env = { ...keys, DAWLYY_AI_PROVIDER: provider };
    const transport = vi.fn<typeof fetch>();
    const status = getAiProviderStatus(env);
    expect(status).toEqual({ provider, state: 'configured', reason: 'external_configuration' });
    expect(getAiProvider({ env, transport }).name).toBe(provider);
    expect(transport).not.toHaveBeenCalled();
    expect(Object.keys(status).sort()).toEqual(['provider', 'reason', 'state']);
    expect(JSON.stringify(status)).not.toMatch(/sentinel|inert|explicit-test-model|API_KEY/);
  });
});
