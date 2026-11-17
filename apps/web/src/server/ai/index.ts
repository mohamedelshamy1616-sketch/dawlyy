import 'server-only';

/** R4d: server-only contract consumed by R4b; no core or package-barrel changes. */
export { getAiProvider, getAiProviderStatus } from './config';
export { AiProviderError } from './types';
export type {
  AiProviderName, AiDraftRequest, AiDraftResult, AiProvider, AiProviderEnv, AiProviderStatus,
} from './types';
