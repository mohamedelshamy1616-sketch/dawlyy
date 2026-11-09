import type { getProgram, listPrograms, listProgramVersions } from '@/src/server/programs/read';

type Wire<T> = T extends Date ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
/** Task 4: JSON-safe coach detail shared by the Server Component and builder transport. */
export type ProgramDetail = Wire<Awaited<ReturnType<typeof getProgram>>>;
/** Task 4: JSON-safe program cards and cursor response. */
export type ProgramListData = Wire<Awaited<ReturnType<typeof listPrograms>>>;
/** Task 4: JSON-safe version history metadata and core diff summaries. */
export type ProgramHistoryData = Wire<Awaited<ReturnType<typeof listProgramVersions>>>;
/** Task 4: module grants control coach actions without replacing server authorization. */
export type ProgramGrants = { edit: boolean; create: boolean; publish: boolean };
