# DAWLYY audit: can the coach add, change, remove and undo everything? (13 Nov 2026)

Source: every `createRoute` in `apps/web/src/api/*.ts`, parsed on 13 Nov 2026 at commit f9d2781. This audit covers
the API level only. Whether the UI exposes each action is not checked here. The UI audit track covers that.

## What exists per entity

| Entity | Create | Edit | Remove | Undo or restore | Gap |
|---|---|---|---|---|---|
| Client | POST /clients | PATCH /clients/{id} | none | none | Cannot archive, end or delete a client. A wrongly added client stays forever. |
| Client overrides | PUT | PUT | DELETE /overrides/{key} | DELETE resets to the default | Fine. |
| Invitation | POST | none | POST /{id}/revoke | POST /{id}/regenerate | Fine. |
| Package | POST | PATCH | POST /{id}/archive | none | No unarchive. |
| Subscription | POST | extend, freeze, resume | cancel | resume undoes freeze only | Cancel has no undo. A subscription created by mistake can only be cancelled. |
| Payment | POST | none | reject, refund | none | A verify or reject has no undo. A typo in the amount cannot be corrected, only refunded. |
| Exercise | POST, import | PATCH, customise | none | none | No hide, archive or delete. Foods have hide and unhide; exercises do not. |
| Food | POST, clone | PATCH | POST /{id}/hide | POST /{id}/unhide | Fine. |
| Program | POST, duplicate | draft, ops, publish | none | revert to version, version diff | Strongest undo story. Cannot delete or archive a program. No unassign. |
| Nutrition plan | POST, duplicate | draft, publish, version edit | none | revert, diff | Same as program. No unassign or delete. |
| Form (intake, check-in, assessment) | POST, duplicate | PATCH, draft, publish | none | revert | No archive or delete. |
| Calendar event | POST | PATCH, reschedule | none (maybe through PATCH status, not checked) | none | No visible delete or cancel route. |
| Task | POST | PATCH, snooze | none | reopen undoes complete | Fine, except no delete. |
| Message | POST | PATCH | DELETE | none | Fine. |
| Team member | invite | permissions | deactivate | reactivate | Fine. |
| Progress photo | POST | none | DELETE | none | Fine. |
| Meal log (client) | POST, supplements, water | none | none | none | A client cannot fix or remove a wrong meal log. |
| Measurement (client) | POST | none | none | none | A client cannot fix a typo in their weight. |
| Workout session | POST, sync | PATCH, finish | none | none | No delete of a junk session. |

## Patterns missing across the app

1. No app-wide "Undo" after a destructive or important action, such as a toast with an undo button for a few
   seconds (the Gmail pattern).
2. No trash or archive view where the coach restores removed things.
3. No activity log the coach can read ("what changed, who, when") outside program and nutrition versions.
4. No bulk actions, such as archiving 10 finished clients or reassigning a program to 5 clients.
5. The coach cannot fully customise the client app. This means hiding modules the business does not use (for
   example nutrition for a pure strength coach), reordering the client's home screen, and renaming sections. Only
   branding, business, language and legal settings exist.

## What this means for the founder's ask ("add or remove anything, undo mistakes")

The backend already has strong versioning for programs, nutrition plans and forms. The rest of the app has none.
A coherent answer has two parts:

1. **Archive** instead of delete for every coach-owned entity, plus a restore action.
2. **Undo toasts** and one activity log built on an audit table.

Edit and void actions for payments, meal logs and measurements need care, because they touch money and health
records. They should keep history rather than overwrite it. This needs a design decision from Mohamed.
