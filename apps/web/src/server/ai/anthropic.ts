import 'server-only';
import { buildAiPrompt } from './prompt';
import { AiProviderError, isProviderObject, requestProviderText, type AiProvider } from './types';

/** R4d: opt-in Anthropic draft adapter; a key does not establish consent or legal approval. */
export function createAnthropicProvider(options: {
  apiKey?: string;
  model?: string;
  transport?: typeof fetch;
}): AiProvider {
  const apiKey = options.apiKey?.trim();
  const model = options.model?.trim();
  return {
    name: 'anthropic',
    async draft(request) {
      if (!apiKey || !model) throw new AiProviderError('provider_not_configured');
      if (request.review.mustHandleFlags) throw new AiProviderError('red_flags_open');
      const prompt = buildAiPrompt(request);
      const text = await requestProviderText({
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: { model, max_tokens: 1000, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] },
        transport: options.transport ?? fetch,
        parse(value) {
          if (!isProviderObject(value) || value.role !== 'assistant' || value.stop_reason === 'tool_use' ||
            !Array.isArray(value.content) || value.content.length === 0) {
            throw new AiProviderError('provider_response_invalid');
          }
          const texts = value.content.map((block: unknown) => {
            if (!isProviderObject(block) || block.type !== 'text' || typeof block.text !== 'string' || !block.text.trim()) {
              throw new AiProviderError('provider_response_invalid');
            }
            return block.text;
          });
          return texts.join('\n');
        },
      });
      return { provider: 'anthropic', text };
    },
  };
}
