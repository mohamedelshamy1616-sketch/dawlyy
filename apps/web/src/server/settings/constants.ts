// Pure constants shared by the settings API (server) and the consent screens (client). No imports on purpose.

/** Task 11 / spec section 44: the six consent kinds of the database enum. */
export const CONSENT_KINDS = ['terms', 'privacy', 'health_data', 'photos', 'videos', 'communications'] as const;

/** Task 11: legal text version in force. Counsel replaces it when the text is final. */
export const LEGAL_VERSION = '2026-11-draft';
