import 'server-only';
import type { AiProvider } from './types';

/** R4d: deterministic R4a output, byte for byte, including empty weeks and flags. */
export function createNoneProvider(): AiProvider {
  return {
    name: 'none',
    async draft(request) { return { provider: 'none', text: request.review.draft.text }; },
  };
}
