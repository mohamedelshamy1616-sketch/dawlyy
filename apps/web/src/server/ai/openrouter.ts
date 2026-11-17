import 'server-only';
import { buildAiPrompt } from './prompt';
import { AiProviderError, isProviderObject, requestProviderText, type AiProvider } from './types';

/** R4d: opt-in OpenRouter adapter with immutable privacy routing and no fallback. */
export function createOpenRouterProvider(options: {
  apiKey?: string;
  model?: string;
  transport?: typeof fetch;
}): AiProvider {
  const apiKey = options.apiKey?.trim();
  const model = options.model?.trim();
  return {
    name: 'openrouter',
    async draft(request) {
      if (!apiKey || !model) throw new AiProviderError('provider_not_configured');
      if (request.review.mustHandleFlags) throw new AiProviderError('red_flags_open');
      const prompt = buildAiPrompt(request);
      const text = await requestProviderText({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: {
          model,
          max_tokens: 1000,
          messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
          provider: { data_collection: 'deny', allow_fallbacks: false },
        },
        transport: options.transport ?? fetch,
        parse(value) {
          const choice: unknown = isProviderObject(value) && Array.isArray(value.choices) ? value.choices[0] : undefined;
          const message: unknown = isProviderObject(choice) ? choice.message : undefined;
          if (!isProviderObject(choice) || choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call' ||
            !isProviderObject(message) || message.role !== 'assistant' ||
            Object.hasOwn(message, 'tool_calls') || Object.hasOwn(message, 'function_call') ||
            typeof message.content !== 'string') {
            throw new AiProviderError('provider_response_invalid');
          }
          return message.content;
        },
      });
      return { provider: 'openrouter', text };
    },
  };
}
