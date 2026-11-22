# Output format for this job (read-only sandbox)

You run in a read-only sandbox: you cannot write files or run anything except reading. So your final answer carries the edits:

1. Read `tools/codex_briefs/p9-fix-1.md` first. It describes the findings. Do ONLY the findings named at the end of this prompt. Where that brief says "you may not run pnpm / write files", the rule is: you only read, and you answer with patches.
2. Return the edits as one or more blocks in the apply_patch format, exactly:

```
*** Begin Patch
*** Update File: relative/path/from/repo/root.ts
@@
 context line copied exactly from the current file
 context line
-line to remove
+line to add
 context line
 context line
*** Add File: relative/new/file.ts
+every line of the new file, each prefixed with +
*** Delete File: relative/path.ts
*** End Patch
```

Rules for the patches:
- Copy context lines (prefix a space) and removed lines (prefix `-`) EXACTLY from the current file, including indentation. Use at least 3 lines of context before and after each change, and enough context that the hunk matches in one place only. Keep hunks in file order. At most one `*** Update File` block per file in the whole answer: merge all hunks of a file into it.
- Paths are relative to the repo root with forward slashes. Never touch `.env*`, `.git`, `.autopilot`, `node_modules`, lockfiles or `package.json`.
- Keep types exact (strict TypeScript, `noUncheckedIndexedAccess`) and re-read each hunk against the file before you answer. The integrator applies the patch mechanically and then runs typecheck and tests; a hunk that does not match is rejected as a whole.
- A migration edit goes into `packages/db/migrations/0008_reinvent_control.sql` in place (statements separated by `--> statement-breakpoint` lines, as the file already does).
- After the patches, write a short prose section: decisions taken, tests added or changed and why each changed test is justified (cite the plan sentence), and anything in the brief you think is wrong.
