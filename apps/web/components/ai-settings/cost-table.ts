/**
 * R4d: historical report evidence, read on 13 Nov 2026, not live provider prices.
 * Source: docs/research/reports/DAWLYY product reinvention research.md,
 * "Inference costs per 1,000 items". These labels must never become API model IDs.
 * Weekly summaries assume 6,000 input and 800 output tokens; prices are USD.
 */
export type AiCostRow = {
  label: 'haiku' | 'luna' | 'gemma26' | 'gemma31' | 'mistral' | 'flashLite' | 'flashDecember' | 'flashJanuary' | 'cloudflare';
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  perThousandSummaries: number;
};

export const AI_COST_SOURCE_DATE = '2026-11-13';
export const AI_COST_ASSUMPTIONS = Object.freeze({ inputTokens: 6_000, outputTokens: 800, summaries: 1_000 });
export const AI_COST_ROWS: readonly Readonly<AiCostRow>[] = Object.freeze([
  { label: 'haiku', inputPerMillion: 0.1, outputPerMillion: 0.5, perThousandSummaries: 1 },
  { label: 'luna', inputPerMillion: 0.1, outputPerMillion: 0.5, perThousandSummaries: 1 },
  { label: 'gemma26', inputPerMillion: 0.09, outputPerMillion: 0.3, perThousandSummaries: 0.78 },
  { label: 'gemma31', inputPerMillion: 0.2, outputPerMillion: 0.4, perThousandSummaries: 1.52 },
  { label: 'mistral', inputPerMillion: 0.15, outputPerMillion: 0.6, perThousandSummaries: 1.38 },
  { label: 'flashLite', inputPerMillion: 0.3, outputPerMillion: 2.5, perThousandSummaries: 3.8 },
  { label: 'flashDecember', inputPerMillion: 0.75, outputPerMillion: 3.75, perThousandSummaries: 7.5 },
  { label: 'flashJanuary', inputPerMillion: 1.5, outputPerMillion: 7.5, perThousandSummaries: 15 },
  { label: 'cloudflare', inputPerMillion: null, outputPerMillion: null, perThousandSummaries: 0.84 },
] as const);
