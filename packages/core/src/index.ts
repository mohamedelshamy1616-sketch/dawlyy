/**
 * @dawlyy/core — pure domain logic. No database, no React, no I/O.
 *
 * Modules (each also importable as `@dawlyy/core/<module>`):
 *  - types        Zod schemas and TypeScript types shared by db, api and ui
 *  - schedule     generateSchedule(): package rules → dated events
 *  - entitlements resolveEntitlements(), can()
 *  - state        transition tables for the six state machines (spec §56)
 *  - versioning   publish(), diffDocuments()
 *  - workout      compareSessions(), estimate1RM(), sessionVolume()
 *  - nutrition    sumMacros(), convertMeasure(), equivalentQuantity()
 *  - forms        evaluateVisibility(), validateAnswers()
 *  - authz        permission matrix, role presets, isAllowed()
 *  - program-edit applyProgramOp(): the program builder's edit reducer, validateProgram()
 *  - subscription endsOnFor(), buildSubscriptionSchedule(), reconcileSchedule(), accessStatus()
 *  - text         Arabic folding, searchKey(), matchesQuery(), normalizePhone(), parseClientCode()
 *  - csv          parseCsv(), suggestMapping(), mapExerciseRows(), toCsv()
 *  - attention    rankAttention(): the coach inbox ranking with reason codes
 *  - safety       detectRedFlags(): the Arabic and English red-flag lexicon
 */
export * from './types';
export * from './schedule';
export * from './entitlements';
export * from './state';
export * from './versioning';
export * from './workout';
export * from './nutrition';
export * from './forms';
export * from './authz';
export * from './program-edit';
export * from './subscription';
export * from './text';
export * from './csv';
export * from './attention';
export * from './safety';
