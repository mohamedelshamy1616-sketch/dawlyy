# PT ledger wave 1

Branch `feat/pt-ledger`. Implementation ready for Claude’s review. The migration has not been applied. Typecheck, production build, and runtime tests are pending.

## Ledger and receipts

The purchased package is a subscription. Its owner records the verified opening count and a reason once, including when the verified count is zero. The visit UUID identifies one closed session in the tenant. Inserting a visit also inserts its debit through a trigger in the same transaction. A balance conflict rolls back both writes.

Every entry takes a subscription-scoped transaction lock before allocating its position and validating the balance. Current balance is the sum of all deltas. The receipt shows the sum through its debit, the debit’s ordinal among recorded visits on that subscription, and its close date. Session numbering starts with the first visit recorded in this ledger. Replaying an earlier visit after another close or correction returns its original receipt.

The coach’s device keeps the visit UUID across uncertain delivery and reloads. An acknowledged close requires an explicit new-session action before the device allocates another UUID. The client records a first visible view separately from a confirmation or dispute. Each visit accepts one decision. The owner can restore one session against a disputed debit once, with a reason and database-stamped approver. The original debit remains in history.

## HTTP endpoints

All paths below use `POST /api/v1/pt` and an authenticated membership.

| Path suffix | Caller and input | Successful result |
| --- | --- | --- |
| `/subscriptions/:subscriptionId/opening-credit` | Owner, verified integer `count` and `reason` | Opening credit recorded |
| `/visits/:visitId/close` | Owner or assigned coach, `subscriptionId` | Visit ID, close timestamp, session number and balance after debit |
| `/receipts/:visitId/view` | Own client, empty object | First view recorded |
| `/receipts/:visitId/confirm` | Own client, optional `note` | Confirmation recorded |
| `/receipts/:visitId/dispute` | Own client, optional `note` | Dispute recorded |
| `/visits/:visitId/correction` | Owner, `reason` | One session credited back |

A fresh close returns 409 before opening or at zero. A replay of a successful close still returns 200 at zero. The coach client page, client Today page and owner Billing page read through authenticated transactions.

## Database policies

Each table has a restrictive `<table>_tenant_guard` policy matching the pinned tenant for both reads and writes. Its `<table>_read_select` policy admits owners, explicitly assigned coaches, and the client whose ID matches the row.

| Table | Additional insert policy |
| --- | --- |
| `pt_visits` | `pt_visits_write_insert` admits the owner or an assigned coach. |
| `pt_ledger_entries` | `pt_ledger_entries_write_insert` admits the owner for all kinds and assigned coaches for debits. |
| `pt_receipt_actions` | `pt_receipt_actions_write_insert` admits only the client linked to the receipt. |

Runtime grants provide SELECT and column-limited INSERT. Timestamps, attribution and ledger position are database-owned. Runtime memberships have no UPDATE or DELETE privileges on these tables. Composite foreign keys bind visits and entries to the subscription, client and tenant and preserve the existing privileged erasure cascades.

## Changed files

| Area | Files |
| --- | --- |
| Database | `packages/db/migrations/0009_pt_ledger.sql`, `packages/db/migrations/meta/_journal.json`, `packages/db/src/schema/pt-ledger.ts`, `packages/db/src/schema/index.ts` |
| API and service | `apps/web/src/api/pt.ts`, `apps/web/src/api/index.ts`, `apps/web/src/server/pt/ledger.ts` |
| UI | `apps/web/components/pt/ledger.tsx`, `apps/web/app/[locale]/coach/clients/[clientId]/page.tsx`, `apps/web/app/[locale]/app/today/page.tsx`, `apps/web/app/[locale]/coach/billing/page.tsx` |
| Strings | `apps/web/messages/ar/billing.json`, `apps/web/messages/en/billing.json` |
| Tests | `packages/db/test/security.pt-ledger.test.ts`, `apps/web/src/api/pt.db.test.ts`, `packages/db/test/security.catalog.test.ts`, `packages/db/test/security.integrity.test.ts` |
| Report | `docs/qa/LEDGER_W1_REPORT.md` |

## Verification

- DB tests written and pending. Cases cover runtime grants, concurrent double-close, delayed replay, missing and duplicate opening credits, contention for the last credit, zero balance rollback, cross-tenant and same-tenant isolation, immutable history, and owner-only correction with attribution.
- API tests written and pending. Cases cover replay with an identical historical response, missing and zero opening balance, duplicate funding, another coach and another client, view and decision actions, and correction authorization and uniqueness.
- Exact catalog and integrity expectations extended for the new policies, triggers, migration journal, foreign keys, unique constraints and checks.
- Static review covered TS/TSX syntax, JSON syntax, English/Arabic key and placeholder parity, SQL statement breakpoints and whitespace. These checks do not establish runtime behavior.
- Claude owns the two pending gates, `pnpm -r typecheck` and `pnpm --filter @dawlyy/web build`. DB, API and e2e suites remain for the final round.
