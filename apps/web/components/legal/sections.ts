/** Task 11: the clause order of each public legal page; titles and bodies live in the `legal` message files. */
export const LEGAL_SECTIONS = {
  terms: ['service', 'accounts', 'payments', 'health', 'conduct', 'liability', 'termination', 'changes', 'law', 'contact'],
  privacy: ['controller', 'collect', 'purpose', 'basis', 'sharing', 'retention', 'rights', 'security', 'transfers', 'contact'],
  consent: ['health_data', 'photos', 'videos', 'communications', 'withdrawal'],
} as const;

/** Task 11: a public legal document id. */
export type LegalDoc = keyof typeof LEGAL_SECTIONS;
