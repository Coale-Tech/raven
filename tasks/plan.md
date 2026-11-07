# Raven Projects Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` for native execution or `subagent-driven-development` for the subagent-driven alternative. Execute the checked steps task-by-task; read the approved specification alongside this plan.

**Goal:** Deliver every requested kanban enhancement, including richer cards, the task detail panel, visible blockers/dependencies, contextual actions, private attachments, structured review handoffs and human-approved subtask suggestions.

**Architecture:** Extend Raven's existing React Project Hub and authoritative ERPNext Task records. Keep whitelisted contracts in `raven.api.project_tabs`; put permission-aware queries, mutations, activity and suggestion logic in focused existing-project integration modules. Reuse ToDo, Comment, Version, private File, native controllers and Raven's existing AI client; add no task database, Workflow, role grants or frontend dependencies.

**Tech Stack:** Installed Frappe 16.36.1 / ERPNext 16.37.0 / Raven 3.1.0; Python, MariaDB, React/TypeScript, frappe-react-sdk, existing Radix/Espresso components, Vitest.

**Spec:** [`../docs/SPEC-project-kanban.md`](../docs/SPEC-project-kanban.md), approved by the user's “proceed” on 2026-11-07. The user subsequently approved this executable plan and selected Native execution. Proposed work is not completed verification.

**Execution amendment — user instruction:** Do not create another site; use existing `coaletech`. This supersedes all isolated-site creation/restore prerequisites and commands below. The completed prechange backup is retained. Use additive migration, read-only data comparisons and tightly scoped rollback-based smoke records; do not invoke the broad Frappe test runner against existing business data. No real customer delivery is authorized. Independent full-suite migration proof remains a documented verification limit, not a blocker requiring another site.

## Global Constraints

- No new role grants, public endpoints, customer portal access, mandatory fields on old tasks, naming-series changes, or core modifications.
- Keep Raven's React frontend and existing Espresso components/tokens. Do not introduce a parallel Vue app, styling system, drag library, or task database.
- Native ERPNext statuses remain unchanged. Blockers and lateness are orthogonal task attributes, not replacement status values.
- Use existing Raven AI provider infrastructure; no second AI SDK or fake rule-based fallback presented as AI.
- User text limits: subject 1–140 characters; comment 1–10,000; blocker reason 1–2,000; review summary/checks 1–10,000 each; AI instructions 0–2,000; acceptance criteria 1–10,000 for suggested rows; at most 12 suggested rows and 20 review evidence files.
- Search is literal case-insensitive title/ID text (trimmed, max 200 characters); no interpreted filter JSON. Filters combine with AND; mutually exclusive mine/unassigned returns an empty result with clear UI, not a hidden override.
- `page_length` 1–100, `start` nonnegative; reject invalid enum/type/range inputs.
- Native `Task.validate_status` permits completion when prerequisites are Completed **or Cancelled**. Preserve that rule for readiness/action guards and label cancelled prerequisites explicitly instead of calling them completed.
- No automatic task start, model-suggestion creation, customer delivery, permission bypass, public-file fallback or invented activity history.
- No `frappe.get_all` or default permission-ignoring QB query for user-visible Task selection/counts. Pass `ignore_permissions=False` to the installed permission-aware query builder.
- Task update, assignment, action and subtask application require a fresh row lock and `expected_modified`. Comments/uploads remain independent creates. Do not add a retry/replay subsystem.
- Work only in Raven. Do not rewrite the 18 baseline tasks, bulk-assign them, run destructive cleanup, restore over `coaletech`, enable a paid provider, or send real customer messages without separate authorization.
- No automatic commits/pushes. Update the tracker from observed evidence, never from code presence alone.

## Review Focus

1. Literal `%`, `_`, mixed-case title/ID searches and `ann` versus `joann` assignment matching: no wildcard interpretation or substring ownership. Owned by P04/P05 tests.
2. Exact site-timezone Datetime boundaries, existing midnight values, null due dates, Template flag/status disagreement and cancelled prerequisites: no browser-time guesses or silent Open fallback. Owned by P03/P04/P06.
3. A readable Project with restricted Tasks/children/dependencies/files, shares and read-only users: totals and metadata must not disclose hidden records. Owned by P04/P07/P10/P13/P18/P25.
4. Concurrent assignment/status/edit and native child saves changing parent versions: stale requests reject without overwrite or duplicate children. Owned by P07/P08/P19/P23.
5. Partial upload failure and malformed/cyclic AI output: retain the created Task/successful files; generation/cancel write nothing and batch application rolls back completely. Owned by P17/P22/P23/P24.

## Source-grounded scope review

**Decision: hold the requested scope.** Stock Task/Kanban/forms cover records, assignments, dependencies and basic movement, but not Raven's customer/channel context and integrated panel. Configure Task custom fields and change tracking; customize only Raven's task API/UI. Do not add a new DocType, Workflow, runner, Suite dependency or copies of Hermes's worker states.

Review estimates, not runtime measurements: standard coverage 6/10; configuration-only coverage 4/10; upgrade safety 8/10 with core untouched. Proposed API DX: time-to-first-working-call 8/10, error clarity 8/10, authentication consistency 8/10, duplicate-write protection 7/10. Stale-token rejection is not idempotent replay after a lost response.

Design handoff: preserve the current Project Hub shell and tokens; P06/P11/P14/P18/P21/P24 define component behavior, and P26 verifies the actual surface. Mockup comparison and independent cold-reader/API review have **not** passed. Earlier scout calls failed HTTP 429; reviewer lacked a configured model; per-call model overrides are disabled. Do not repeat those calls just to reconfirm the failure. Seek independent review when a working reviewer becomes available and report the limitation if it remains unavailable.

## File ownership and execution order

All paths below are relative to `apps/raven` unless prefixed `BENCH/`. `WEB` means `apps/web/src/components/features/project`; `TABS` means `WEB/tabs`. These are path abbreviations, not directories to create literally.

| Owner file | Responsibility |
|---|---|
| `raven/raven_integrations/project/setup.py`, fixtures, patch and `hooks.py` | Additive Task metadata and installed lifecycle registration |
| `raven/raven_integrations/project/tasks.py` | Task authorization, relationship/blocker/handoff validation, row-locked mutation and authoritative actions |
| `raven/raven_integrations/project/task_board.py` | Permission-aware board query/count/paging and batch card summaries |
| `raven/raven_integrations/project/task_activity.py` | Authorized detail collections, comments/activity/files and upload capabilities |
| `raven/raven_integrations/project/task_suggestions.py` | Bounded provider preview and atomic approved subtask creation |
| `raven/api/project_tabs.py` | Typed whitelisted API contracts; leave unrelated tabs in place |
| `WEB/taskTypes.ts`, `WEB/taskBoard.ts` | Shared wire types, board cache keys, deterministic client page merge/date presentation |
| `TABS/TasksTab.tsx`, task-local components in `WEB/` | Existing board plus task cards, panel, actions, upload queue and review/suggestion dialogs |
| `WEB/CreateTaskDialog.tsx`, `ProjectHub.tsx` | Preserve advanced editing and integrate quick create/deep links |
| Focused `raven/tests/test_project_tasks_*.py` and colocated pure `*.test.ts` | Consumer-visible boundaries, not source-text/wiring assertions |

One native integrator owns shared API/hooks/types/cache changes. Tasks P01–P26 are sequential by default. After P03, P04 query research and P10 detail research could be independent; P17's pure upload queue and P22's provider implementation can be delegated only after their contracts are fixed and without editing shared API/types concurrently. No competing builds/migrations/tests during delegated edits. Do not fan out until the model/configuration failure is resolved.

## Fixed contracts

The spec's section 7 is authoritative for public signatures and response shapes. The following clarifications close implementation decisions without changing requested scope:

- `get_task_relations(task: str, kind: str='children', start: int=0, page_length: int=30)` GET returns `{items, total, has_more, next_start}`; kinds `children` and `dependencies`. `get_task` returns the first page of each with pagination metadata. This explicit endpoint implements the already-required bounded relationship collections; no silent all-record list.
- Every new custom mutation is `@frappe.whitelist(methods=['POST'])`; reads are authenticated GET, never `allow_guest=True`. Parse JSON arguments with native typed validation and reject extra action payload fields.
- Internal `tasks.require_task(task: str, permission: str='read', for_update: bool=False)` returns the Task after actual-project read and Task permission checks. For mutations use `frappe.get_doc('Task', task, for_update=True)` before version comparison. `tasks.check_version(doc, expected_modified: str) -> None` raises native `frappe.TimestampMismatchError` on mismatch.
- `tasks.validate_task_context(doc, method=None) -> None` is the appended Task validate hook. It validates changed new fields/relationships, not unrelated historical defects. Handoff changes require the service's server-only provenance flag. No client field can set that flag.
- `task_board.cards_for_tasks(docs: list) -> list[dict]` batches authorized summaries for already-authorized Tasks. `task_activity.upload_policy(task=None) -> dict` resolves effective server file constraints; it does not invent a fixed byte/count limit.
- Native statuses: Open, Working, Pending Review, Overdue, Completed, Cancelled; Templates view also recognizes `is_template`. Unknown lane key `unknown`, label `Unknown status`, preserves actual stored text and disables mutations. Templates have no Raven mutation controls.
- Generic Move targets are Open, Working, Pending Review, Completed, Cancelled. Open is valid from Working/Pending Review/Overdue and terminal reopen; Working only through the Start rule (Open/Overdue); Pending Review only through Request review; Completed/Cancelled through their contextual guards. Overdue is visible but not a manual target. A drop to review opens the handoff dialog before any request. An unchanged destination is a no-op in the client, not a mutation request.
- `allowed_actions` contains action names only after effective Task write and active Workflow checks. `permissions` contains `read`, `write`, `create_subtask`, `comment`, `upload`, `suggest_subtasks`; File items carry individual delete capability. The backend rechecks all capabilities on submit.
- Sort priority uses Urgent=0, High=1, Medium=2, Low=3, others=4; tie-breakers creation ASC/name ASC. Due sorts null last then date ASC/creation ASC/name ASC. Oldest sorts creation ASC/name ASC. Do not use modified in ordering.
- Relationship traversal uses a visited set over accessible and internal prerequisite identities to detect cycles without returning hidden metadata. Changed/new links require same project/readability, no self/duplicates, and an actual group parent. Hidden unresolved prerequisite inhibits readiness but returns only a generic restricted indicator.
- Initial board request pages each lane. Lane-only requests merge by Task name, retain that lane's total and append in server order. Filter/sort/mutation resets offsets; do not claim snapshot consistency under concurrent edits.
- Board SWR keys begin `['project_tasks', project, canonicalFilters, lane, start]`. Task detail key remains `['task_detail', task]`. Export one `refreshProjectTasks(mutate, project)` in `taskBoard.ts` that invalidates the project key family and relevant task detail without relying on the obsolete two-element exact key. Migrate SuggestionsTab too.
- Details preserve `description` as the current editor's plain-text value and add `description_html` for sanitized display. Update only explicitly changed fields; never overwrite untouched rich HTML. All current advanced fields remain available; status becomes read-only context plus shared actions.
- Discussion order is creation ASC/name ASC; activity and file lists are creation DESC/name DESC. All return bounded authorized totals. Activity merges actual Task creation, permitted Version changes and real task Comments; deduplicate by source doctype/name. Do not synthesize historical changes.
- Quick-create date-only due values are explicitly converted to end-of-day in site timezone. Existing Datetime values retain exact timestamps. Board lateness is computed from returned server time, not the browser timezone.
- Task panel URL merges `tab=tasks&task=<name>` using existing search parameters. Close removes only `task`; Back/Forward selection follows URL. Explicitly switching to another tab removes stale task selection but preserves unrelated parameters/channel/filter state.
- Upload queue states: selected → uploading → uploaded or failed; removed before submit uploads nothing. Once Task creation returns its name, it is retained through retries. Uploaded entries never re-upload automatically; each failed item has retry/remove. Existing native File delete is separate from removing an unsubmitted selection.
- Subtask preview local keys match `^[A-Za-z0-9_-]{1,40}$`, owners are eligible User IDs or null, dependencies reference selected keys only, at most 12 rows, DAG required. Removed referenced rows require the user to fix the preview; do not silently drop dependencies. Batch creation topologically inserts children and then resolves their real dependency names, preserving the native parent updates; reload the parent before returning.

## Verification commands and evidence rules

Commands run from `/Users/mac/ERPNext/coaletecherp` unless noted. The isolated site is `kanban-review.localhost`; it was absent at planning time. Never substitute `coaletech` for isolated tests.

```sh
# P00: create a fresh backup; bind restore inputs to actual printed output paths.
bench --site coaletech backup --with-files
bench new-site kanban-review.localhost
bench --site kanban-review.localhost restore "$BACKUP_DB" --with-public-files "$BACKUP_PUBLIC" --with-private-files "$BACKUP_PRIVATE"
# Run only after verifying the destination is the newly created isolated site.
bench --site kanban-review.localhost migrate
bench --site kanban-review.localhost clear-cache
bench --site kanban-review.localhost run-tests --app raven --module raven.tests.test_project_tasks_board
```

`BACKUP_DB`, `BACKUP_PUBLIC`, `BACKUP_PRIVATE` are bound from the new backup's output, not guessed old filenames. Supply DB credentials through the installed secure prompt; never log them or copy production secrets into documentation. Preserve encryption support privately for restored data where needed. Before running the restored site, retain maintenance/scheduler pause and verify outbound integrations cannot dispatch to real customers; run explicit synchronous test actions only, never start its scheduler/workers. No site creation/restore has run yet. If infrastructure is unavailable, finish reachable code but report the exact missing prerequisite rather than claiming migration/runtime acceptance.

For a task's focused backend module use `bench --site kanban-review.localhost run-tests --app raven --module <module named in that task>`. Each new integration test module follows existing `raven.tests.test_project_hub` factories, isolated setup and rollback. Create permission users/shares inside tests; no permanently altered production fixtures. Use separate transactions/connections for genuine concurrency checks; two stale sequential calls alone are not proof of concurrent locking.

From `/Users/mac/ERPNext/coaletecherp/apps/raven` after integration:
```sh
yarn workspace @raven/web test
yarn workspace @raven/web build
yarn workspace @raven/web lint
```
Root `yarn test` intentionally fails; do not use it. The web build also regenerates the Raven HTML entry through its existing script; distinguish generated artifacts from handwritten changes. Do not introduce a DOM test framework: use existing pure Vitest tests for nontrivial state logic and real browser journeys for UI. Run LSP references before exported symbol changes and diagnostics after edits; dynamic dotted API consumers also require explicit search.

## Tasks

### P00 — Establish the isolated acceptance surface
**Size:** S. **Depends:** approved plan/execution method. **Requirements:** R18–R19. **Files:** update only `tasks/todo.md` with actual site/command evidence; no product files.
- [ ] Execute the backup/new-site/restore procedure above without `--force`, changing the default site or restoring over the live site; verify apps/sites, destination database and paused outbound behavior before migration/tests.
- [ ] Check authenticated Raven access using the existing running service, real browser automation and configured project AI capability without changing provider settings. Identify the isolated-site route and test users. Missing AI/browser capability is a recorded prerequisite, not success.
- [ ] Verify `bench --site kanban-review.localhost list-apps`, console import of `raven.api.project_tabs`, and an authenticated read-only project board request; record exit/output and no live-task mutation. Acceptance: isolated data is usable; no real messages/jobs are dispatched; missing prerequisites are explicit.

### P01 — Add Task context metadata and the additive patch
**Size:** M. **Depends:** P00. **Requirements:** R12/R16/R17/R18. **Files:** modify `raven/raven_integrations/project/setup.py`, `raven/patches.txt`; create `raven/patches/v3_0/add_project_task_context.py`, `raven/tests/test_project_tasks_migration.py`.
- [ ] Add a regression that snapshots an existing task's status, description, project, `_assign` and ToDo rows, runs setup/patch twice, then asserts the snapshot is unchanged and all five fields plus Task track_changes exist. Expected pre-change failure: new fields/tracking absent.
- [ ] Implement `add_task_context_fields()` with the exact five optional field definitions in spec §4 and a Task track_changes=1 Property Setter; call it from existing `setup_project_hub`, preserving the existing customer-field helper. Patch `execute()` calls this same helper; register under existing `[post_model_sync]`. No data/status/assignment backfill.
- [ ] Run isolated migrate, clear-cache and `raven.tests.test_project_tasks_migration`; assert repeated execution does not duplicate Custom Field/Property Setter records. Acceptance: metadata correct; existing content unchanged; repeated setup safe.

### P02 — Export only Raven-owned metadata and wire migration hooks
**Size:** M. **Depends:** P01. **Requirements:** R18. **Files:** modify `raven/hooks.py`; create `raven/fixtures/custom_field.json`, `raven/fixtures/property_setter.json`; extend `raven/tests/test_project_tasks_migration.py`.
- [ ] Add fixtures filters for only the five new Task field names and the Task track_changes Property Setter. Preserve any installed fixture declarations; do not export every site's customization or unrelated customer fields.
- [ ] Append `add_task_context_fields` to after_migrate without removing `add_task_customer_facing_field`; export fixtures on the isolated site. Test existing enabled-site migration and fresh metadata setup through the same helper.
- [ ] Run migrate twice and the migration test module; confirm no Role/Workflow/core files changed. Acceptance: fresh and existing installs receive identical metadata; hooks preserved; fixture scope narrow.

### Checkpoint A — P00–P02
- [ ] Isolated migrate and `raven.tests.test_project_hub` pass; console imports work. Record metadata/data comparison and request human review before the next group. Do not mark live rollout complete.

### P03 — Enforce shared context and relationship invariants
**Size:** M. **Depends:** P02. **Requirements:** R12/R13/R16/R18. **Files:** create `raven/raven_integrations/project/tasks.py`, `raven/tests/test_project_tasks_context.py`; modify `raven/hooks.py`.
- [ ] Add direct document-save tests for partial blockers, disabled/ineligible owner, handoff forgery, same-project/new-link/self/duplicate/cycle validation, cancelled-prerequisite readiness and safe unrelated edits on historically invalid links. Example invariant: `with self.assertRaises(frappe.ValidationError): blocked_without_reason.save()`; verify stored blocker/status remains unchanged.
- [ ] Implement `require_task`, `check_version`, `validate_task_context` and dependency-readiness helpers using native permission/controller behavior. Append the Task validate hook without replacing after_insert/on_update handlers. Guard only changed relationships/new fields; use a visited-set traversal, not the native 15-hop limit as a security assumption.
- [ ] Run `raven.tests.test_project_tasks_context` and a direct authenticated REST/document-save rejection smoke. Acceptance: API and Desk/REST cannot forge new context; legacy unrelated edits survive; readiness never starts work.

### P04 — Implement the permission-aware paginated board API
**Size:** M. **Depends:** P03. **Requirements:** R01–R04/R07/R10/R18. **Files:** create `raven/raven_integrations/project/task_board.py`, `raven/tests/test_project_tasks_board.py`, `WEB/taskTypes.ts`; modify `raven/api/project_tabs.py`, `TABS/TasksTab.tsx`.
- [ ] Before replacing get_tasks, run LSP references and search dotted consumers across `apps/web`, `apps/native`, `packages`, `raven`. Add integration data with 231 tasks, tied priorities/dates, Templates, unknown status, hidden Tasks, literal `%/_` titles and exact `ann`/`joann` ownership. Assert `len(all_unique_names)==authorized_total`, no duplicated page identities, hidden rows absent from totals, and edits do not reorder stable ties. Do not mutate native status options to create the unknown fixture outside the isolated rollback test.
- [ ] Implement exact get_tasks/TaskPage contract, strict enums/ranges/AND filters, permission-aware QB selection/counts, per-lane pages, site time and upload capabilities. Batch authorized assignments/child counts/dependencies/comments/latest update for page Tasks; never per-card N+1 queries or a 200-ID cap. Add explicit TS wire types and atomically adapt TasksTab to TaskPage so there is no array/object mismatch.
- [ ] Run `raven.tests.test_project_tasks_board`; issue a real authenticated HTTP request with page_length=2, then follow next_start and inspect totals. Acceptance: all records reachable; all summaries/counts authorized; invalid ranges/enums reject rather than silently normalize.

### P05 — Centralize client page merging and cache invalidation
**Size:** M. **Depends:** P04. **Requirements:** R03/R04/R07/R09. **Files:** create `WEB/taskBoard.ts`, `WEB/taskBoard.test.ts`; modify `TABS/TasksTab.tsx`, `TABS/SuggestionsTab.tsx`.
- [ ] Add pure tests for canonical filters, lane append/dedup/reset and project-scoped cache invalidation; observable case: pages `[A,B]` and `[B,C]` merge to `[A,B,C]` without disturbing another lane. A filter change must not retain previous offsets/items.
- [ ] Export `refreshProjectTasks(mutate, project)` and wire every board mutation/inbox approval to the key family defined above. Preserve task detail invalidation and unrelated project tab refreshes; do not invalidate every project's board unnecessarily.
- [ ] Run web Vitest filtered to `taskBoard.test.ts` and a real inbox approval/board refresh smoke on isolated data. Acceptance: refreshed boards reflect new tasks; no missing filtered-cache consumer; no cross-lane duplicates.

### Checkpoint B — P03–P05
- [ ] Run context/board backend modules, existing project_hub integration tests and applicable pure frontend tests; inspect actual board HTTP output. Human review: permissions/counts/status contract before visual expansion.

### P06 — Add the board toolbar, explicit lanes and responsive navigation
**Size:** S. **Depends:** P05. **Requirements:** R01/R03/R04/R08. **Files:** modify `TABS/TasksTab.tsx`, `WEB/taskBoard.test.ts`.
- [ ] Render search, My tasks, Unassigned, Overdue, Priority, Customer-facing, sort, Tasks/Templates and Clear controls. Use all server lane totals with individual Load more; preserve unknown stored labels and explicit Overdue, never `fallback || Open`.
- [ ] Use the existing responsive breakpoint to switch desktop lanes to a labeled status selector and one-column list. Distinguish initial loading, lane loading, error, empty project and empty filtered results. Keep focus on an existing control after reset.
- [ ] Browser smoke combined filters, template/unknown fixtures, null-date sorting and mobile status selection; test exact existing midnight timestamps versus newly chosen end-of-day date values. Acceptance: totals match server; no silent fallback; no clipped controls at 320px.

### P07 — Add authorized quick assignment with stale-write protection
**Size:** M. **Depends:** P06. **Requirements:** R02/R07/R18. **Files:** modify `raven/raven_integrations/project/tasks.py`, `raven/api/project_tabs.py`; create `raven/tests/test_project_tasks_assignment.py`, `WEB/TaskAssigneePicker.tsx`.
- [ ] Add tests for eligible search paging, unauthorized metadata exclusion, add/remove through ToDo, disabled targets and stale versions. Assert after an actual assignment change `new.modified != old.modified`; stale second request raises TimestampMismatchError and leaves first assignment intact.
- [ ] Implement exact get_task_assignees/set_task_assignees contracts; require exactly one project/task search context, derive actual project, use installed assignment helpers and advance Task.modified within the locked transaction. Do not write `_assign` directly.
- [ ] Build the searchable accessible picker with explicit Unassigned and paged results. Run assignment tests and real authenticated add/remove/denied calls. Acceptance: assignment persists; unauthorized target/write fails; picker never dumps all User data.

### P08 — Replace every status bypass with unified actions and versioned editing
**Size:** M. **Depends:** P07. **Requirements:** R05/R07/R12–R14/R16/R18. **Files:** modify `raven/raven_integrations/project/tasks.py`, `raven/api/project_tabs.py`, `TABS/TasksTab.tsx`, `WEB/CreateTaskDialog.tsx`; create `raven/tests/test_project_tasks_actions.py`.
- [ ] Test every allowed/source-denied action, blockers/unresolved prerequisites, native cancelled-prerequisite satisfaction, active Workflow denial, stale editor/action requests and two independent simultaneous requests. Check rejected requests leave status/handoff/assignments unchanged. Add review validation now, not a placeholder action.
- [ ] Implement task_action/update_task contracts and create guardrails. Lock fresh Task, check expected_modified, recheck effective permissions/readiness/Workflow, save through native controller and return saved status. Request review atomically validates/persists versioned handoff and evidence; flag/clear blocker is orthogonal. Generic editor rejects status and server-owned handoff. Keep create_task's existing string result/signature and suggestion inbox caller.
- [ ] Migrate all discovered set_task_status consumers to task_action, pass editor modified tokens, remove the obsolete endpoint with no shim, and make editor status read-only with action affordance. Run actions tests plus direct POST/GET-verb rejection smoke. Acceptance: no bypass caller; stale changes cannot overwrite; native channel/project side effects preserved.

### Checkpoint C — P06–P08
- [ ] Verify real assignment/action/edit requests and browser keyboard/touch status action parity; run assignment/actions modules and existing project_hub notifications tests. Human review: authoritative transitions/concurrency before panel integration.

### P09 — Render richer cards and task-local feedback
**Size:** M. **Depends:** P08. **Requirements:** R02/R05/R07/R10/R12/R13. **Files:** create `WEB/TaskCard.tsx`; modify `TABS/TasksTab.tsx`, `WEB/taskBoard.ts`, `WEB/taskBoard.test.ts`.
- [ ] Extract the existing card into TaskCard without rebuilding the board shell. Show title/ID, owner/avatar or Unassigned, priority text, exact overdue/due-soon signals, age, latest permitted update, child completed/total plus cancelled count, discussion count, parent and explicit/implicit blockers.
- [ ] Wire TaskAssigneePicker and per-card saving/error state. Disable duplicate same-card changes while pending; keep unrelated cards interactive. On stale error refresh authoritative data and retain unsaved dialog text. No optimistic success toast.
- [ ] Test date/status presentation at server boundary and browser-check long titles/multiple owners/both themes. Acceptance: semantic text accompanies color; saving/error state visible; restricted context never appears in card text/tooltips.

### P10 — Provide authorized detail and bounded relationship collections
**Size:** M. **Depends:** P09. **Requirements:** R06/R09/R11/R13/R18. **Files:** create `raven/raven_integrations/project/task_activity.py`, `raven/tests/test_project_tasks_detail.py`; modify `raven/api/project_tabs.py`, `WEB/taskTypes.ts`.
- [ ] Test hidden/cross-project/standalone task rejection; permitted parent/children/dependency paging; unauthorized relationships return a generic restricted indicator only. Verify untouched rich description survives a subject-only update and sanitized display blocks script/event-handler HTML.
- [ ] Implement get_task plus get_task_relations exactly as specified; use existing plain-text editor fields separately from sanitized description_html. Return permission-filtered relationship first pages, handoff and capabilities; no unbounded dependencies/children dump or inherited Project-role assumption.
- [ ] Run detail tests and an authenticated detail/next-page HTTP smoke as contributor and reader. Acceptance: complete permitted detail; no hidden metadata; old editor contract remains functional with required version token.

### P11 — Build Details panel and context-preserving task permalinks
**Size:** M. **Depends:** P10. **Requirements:** R06/R09/R11/R13. **Files:** create `WEB/TaskDetailPanel.tsx`; modify `TABS/TasksTab.tsx`, `apps/web/src/pages/project/ProjectHub.tsx`, `WEB/taskBoard.test.ts`.
- [ ] Use existing drawer primitives for Details/Discussion/Activity/Files selection and real get_task data. Details shows description, criteria, dates/owners, parent/children/dependency pages, explicit blocker and current handoff or No handoff recorded. Existing Edit opens the advanced editor; Open in Desk remains available.
- [ ] Merge task/tab search parameters instead of replacing query state; route task links through authorization and project match, preserve channel/filter/scroll context, and copy the current permalink. Back/Forward, reload and close follow the fixed URL contract. Never leave empty nonfunctional tabs: connect P12/P13 collection rendering in this same integration checkpoint before exposing the panel in the built app.
- [ ] Browser-check title→panel→Edit→save→reload link→Back and inaccessible/cross-project links. Acceptance: board state retained; safe errors; modal focus enters/returns to trigger.

### Checkpoint D — P09–P11
- [ ] Run card/date pure tests and detail backend tests. Review Details and permalink behavior in the actual shell. Keep integration unpublished until P12/P13 supply all four functioning tabs; no scaffold claimed complete.

### P12 — Add real task discussion and activity
**Size:** M. **Depends:** P11. **Requirements:** R09/R11/R16. **Files:** modify `raven/raven_integrations/project/task_activity.py`, `raven/api/project_tabs.py`, `WEB/TaskDetailPanel.tsx`; create `raven/tests/test_project_tasks_activity.py`.
- [ ] Test sanitized/blank/oversized comment inputs, read-only writer denial, bounded totals/order and Version visibility. Assert a real action/comment appears once with actual actor/time, while no pre-tracking historical update is invented.
- [ ] Implement get_task_updates discussion/activity and add_task_comment; save real Task Comment, native permission/field-level filtering, deterministic paging and deduplicated merged activity. Render composer/timeline and refresh board discussion/latest summary through the task cache family.
- [ ] Run activity tests and real comment→reload→card/timeline smoke; verify no duplicate project channel notifications from UI. Acceptance: permitted discussion persists; unauthorized writes fail; activity reflects real sources only.

### P13 — Add authorized file lists and server-resolved limits
**Size:** M. **Depends:** P12. **Requirements:** R11/R15/R18. **Files:** modify `raven/raven_integrations/project/task_activity.py`, `raven/api/project_tabs.py`, `WEB/taskTypes.ts`; create `raven/tests/test_project_tasks_files.py`.
- [ ] Implement effective upload policy from installed File/System Settings/config and max attachment metadata; return null only for genuinely unrestricted constraints. Paginate permitted task File records; expose per-file native delete capability. No public-file conversion or Suite dependency.
- [ ] Add tests for Task write/native File authorization, hidden file names, size/type/count enforcement, private ownership and authorized review evidence. Use actual small file bytes rather than mocked forwarding assertions.
- [ ] Run files tests and actual authenticated/unauthenticated direct private-download HTTP requests. Acceptance: permitted bytes download; unrelated user and Guest are denied; list totals/limits reflect server policy.

### P14 — Add accessible contextual action/blocker UI
**Size:** M. **Depends:** P13. **Requirements:** R05/R08/R12/R13/R14. **Files:** create `WEB/TaskActions.tsx`; modify `WEB/TaskCard.tsx`, `WEB/TaskDetailPanel.tsx`, `TABS/TasksTab.tsx`.
- [ ] Replace card-wide status select with compact actions/menu: Start, Request review, Complete, Flag/Clear blocker, Reopen, Cancel and Move. Render only supplied capabilities but retain server-authoritative errors. Overdue/Template/unknown are not manual targets.
- [ ] Flag blocker form requires exact category, reason and eligible responsible user; show explicit blocker separately from dependency warning. Native dragging, menu, keyboard and touch all call the same handler; review destinations open P19's form rather than submit bare moves.
- [ ] Browser-check blocked→clear explicit→still waiting→prerequisite completed→Ready without auto-start, plus Cancelled prerequisite label and keyboard Move. Acceptance: no bypass/hover-only action; visible per-card errors; all transitions use current version.

### Checkpoint E — P12–P14
- [ ] Run activity/files/actions modules and exercise all four panel tabs against real records, including denied direct file access. Human review: no internal context leaks into customer messages or restricted-user surfaces.

### P15 — Separate minimal task creation from advanced editing
**Size:** M. **Depends:** P14. **Requirements:** R06/R15. **Files:** modify `WEB/CreateTaskDialog.tsx`, `TABS/TasksTab.tsx`, `raven/api/project_tabs.py`; extend `raven/tests/test_project_tasks_actions.py`.
- [ ] Quick create initially shows title, optional owner, priority and due date; advanced fields collapsed but every existing field remains available. Existing-task editor retains full editing and untouched HTML preservation, with visible status context/shared actions instead of direct status writes.
- [ ] Validate optional group parent and dates on the server, default Open, allow Working only when ready, deny create-fields review/terminal/Template/handoff bypass. New date-only due stores explicit site-timezone end-of-day; retained DateTime values stay exact.
- [ ] Test minimal/advanced/group-child creation and rejected invalid parent/status; browser-check cancel causes no records. Acceptance: all existing fields preserved; create_task still returns Task.name to inbox; no mutation of unrelated live records.

### P16 — Define the task-local upload queue
**Size:** M. **Depends:** P15. **Requirements:** R15. **Files:** create `WEB/taskUploads.ts`, `WEB/taskUploads.test.ts`, `WEB/TaskFiles.tsx`.
- [ ] Implement selected/uploading/uploaded/failed queue transitions with native FileDropzone and frappe-react-sdk file primitives. Resolve limits from server capabilities and keep uploaded File identities; do not reuse the Raven Message upload hook or upload before Task creation.
- [ ] Add a pure regression with one successful and one failed upload: retaining Task T and File F, retry sends only the failed entry and never calls task creation. Also test removal before save, duplicate retry suppression and policy rejection. Use injected uploader outcomes to test state transitions, not SDK argument echoes.
- [ ] Run the focused Vitest module. Acceptance: per-file state/error/retry deterministic; successful entries retained; no channel message side effects.

### P17 — Integrate uploads with creation and the Files panel
**Size:** S. **Depends:** P16. **Requirements:** R11/R15. **Files:** modify `WEB/CreateTaskDialog.tsx`, `WEB/TaskDetailPanel.tsx`, `WEB/TaskFiles.tsx`.
- [ ] Retain created Task.name immediately on successful create, then upload private files with doctype Task/docname. Partial failure shows actual Task link, successful files and individual retry/remove; never restart creation. Cancel before create uploads nothing.
- [ ] Render permitted existing files/download/delete in Files tab; native deletion failure remains visible. Refresh policy/remaining count after upload/delete and keep unsaved selections separate from stored File deletion.
- [ ] Browser-upload an actual screenshot and PDF, deliberately fail one file, retry only that file, reload, download bytes, then deny access as another user. Acceptance: one Task only; successful uploads not duplicated; real limits and private access enforced.

### Checkpoint F — P15–P17
- [ ] Run create/actions/files modules and upload-queue Vitest. Human review of actual minimal/advanced create and partial-failure journey, including one-Task identity and private-file proof.

### P18 — Harden review evidence and atomic handoff persistence
**Size:** M. **Depends:** P17. **Requirements:** R14/R16/R18. **Files:** modify `raven/raven_integrations/project/tasks.py`, `raven/raven_integrations/project/task_activity.py`; create `raven/tests/test_project_tasks_review.py`.
- [ ] Expand P08's real review implementation with requester+reviewer File access tests: reject foreign-task/public/deleted/inaccessible evidence, invalid reviewer, more than 20 files, blank/oversized text, unresolved dependencies/blocker, forged provenance and stale version.
- [ ] Store `{version:1,summary,checks,reviewer,requested_by,requested_on,evidence}` with server actor/time and native status save in one transaction; add a real handoff Comment/activity entry, sanitized text only. Evidence display reauthorizes File each time rather than trusting saved metadata.
- [ ] Run review tests; force a validation failure after preparation and assert both previous status/handoff remain unchanged. Acceptance: authorized evidence only; atomic persistence; no hardcoded status success if native save normalizes it.

### P19 — Add the structured Request review dialog
**Size:** M. **Depends:** P18. **Requirements:** R14/R16. **Files:** create `WEB/TaskReviewDialog.tsx`; modify `WEB/TaskActions.tsx`, `WEB/TaskDetailPanel.tsx`, `TABS/TasksTab.tsx`.
- [ ] Collect required summary/checks/reviewer, select existing permitted files and upload additional evidence through TaskFiles. Show failed uploads and require explicit confirmation of the exact successful evidence submitted. Do not silently include/exclude failed selections.
- [ ] Route menu/context/drop-to-review to this same dialog and task_action, retain text on stale/error, and display current handoff prominently after save/reload; historical requests remain Activity entries.
- [ ] Browser-review as contributor then permitted reviewer; retry stale action after a competing change and ensure no duplicate request/status overwrite. Acceptance: reviewer sees exact guidance/files; all entry points enforce same form; invalid submission changes nothing.

### P20 — Preserve Raven customer and notification integration
**Size:** M. **Depends:** P19. **Requirements:** R09/R18. **Files:** modify `TABS/TasksTab.tsx`, `WEB/TaskCard.tsx`, `WEB/TaskDetailPanel.tsx`, `raven/tests/test_project_hub.py`.
- [ ] Keep customer-facing toggle and SendToCustomerDialog using installed explicit recipient/channel consent; refresh task/cache version after native customer-facing mutation so the next task action has a fresh token. Do not append internal discussion/handoff/private attachments to outgoing content.
- [ ] Exercise existing suggestion-inbox approve path, project progress and Task after_insert/on_update bot notifications through real document saves; preserve Notes/Communications/Billing/Issues/Changelog/Files navigation. No second UI notification writer.
- [ ] Run project_hub regression tests and browser copy/paste a task permalink into a test channel. Preview customer send without real outbound delivery unless separately authorized; use existing controlled integration stubs only for external transport, not fake persistence. Acceptance: native integrations retained; no leakage; no duplicate status notifications.

### Checkpoint G — P18–P20
- [ ] Run review and project_hub modules; inspect saved handoff, authorized evidence, activity and permitted reviewer view. Human review: complete richer cards → detail → blockers/actions → attachments/review journey.

### P21 — Define the editable subtask preview types and form
**Size:** M. **Depends:** P20. **Requirements:** R17. **Files:** modify `WEB/taskTypes.ts`; create `WEB/SuggestSubtasksDialog.tsx`, `WEB/taskSuggestions.ts`, `WEB/taskSuggestions.test.ts`.
- [ ] Define preview rows `{key,title,owner,depends_on,acceptance_criteria}` and parent_modified; implement edit/remove/reassign/dependency controls, instruction input and explicit Create selected. Ordinary parents require an explicit conversion-to-group confirmation; cancel/regenerate never create.
- [ ] Add pure tests for selected-row DAG/self/unknown-key rejection, removed referenced row error, required criteria/title limits and preserving edits on server/stale error. Example assertion: a row referencing a removed key yields a validation error, not silently rewritten dependencies.
- [ ] Run focused Vitest and inspect preview form inside existing Dialog primitives. Do not expose a fake Generate button or canned provider response; P22–P24 must be integrated before shipping this feature. Acceptance: editable human-controlled selection; no automatic creation/assignment/start.

### P22 — Generate real bounded permission-filtered subtask suggestions
**Size:** M. **Depends:** P21. **Requirements:** R17/R18. **Files:** create `raven/raven_integrations/project/task_suggestions.py`, `raven/tests/test_project_tasks_suggestions.py`; modify `raven/api/project_tabs.py`.
- [ ] Implement suggest_subtasks using project_bot_for, enabled hub/AI, existing daily budget and RavenAgentManager client. Reuse client/provider selection, not background extract, fixed extraction prompt, ignore-permission project context or swallowed exceptions. Send bounded authorized task/user/dependency context only.
- [ ] Validate structured JSON, at most 12 unique local keys, title/criteria bounds, eligible/null owners and valid acyclic local references. Missing/disabled provider, unsupported ChatGPT Subscription, budget exceeded and provider failure return actionable errors, never empty success or fabricated suggestions.
- [ ] Test malformed/provider-error paths with controlled provider outputs and compare Task/ToDo counts plus parent.modified before/after generation/cancel. Run suggestions module, then a real configured-provider HTTP smoke with no Task/ToDo/parent writes. Acceptance: genuine provider preview; no hidden context; no writes on generation.

### P23 — Atomically create explicitly approved subtasks
**Size:** M. **Depends:** P22. **Requirements:** R17/R18. **Files:** modify `raven/raven_integrations/project/task_suggestions.py`, `raven/api/project_tabs.py`, `raven/tests/test_project_tasks_suggestions.py`.
- [ ] Implement create_subtasks: Task create+parent write, lock/check expected_modified, explicit group conversion, revalidate edited selected rows/owners/DAG, create actual children and assignments, translate local dependency keys, persist criteria and reload native-updated parent.
- [ ] Test a valid edited batch and mid-batch invalid owner/dependency rollback; assert after rejected apply `(child_names,assignments,parent.is_group,parent.modified)` equals the pre-request snapshot. Test stale replay and two genuine concurrent approvals create one batch only; no manual commit inside service.
- [ ] Run suggestions tests and real HTTP approve→reload parent/children/dependencies smoke. Acceptance: real created links and metadata; atomic all-or-none; repeated stale submit cannot duplicate work.

### Checkpoint H — P21–P23
- [ ] Verify preview tests, provider/no-write evidence and atomic-apply tests. Human review: model output remains untrusted, human edits survive, explicit confirmation precedes creation, no background execution.

### P24 — Wire subtask generation, approval and unavailable-provider UI
**Size:** M. **Depends:** P23. **Requirements:** R06/R17/R19. **Files:** modify `WEB/SuggestSubtasksDialog.tsx`, `WEB/TaskDetailPanel.tsx`, `WEB/taskTypes.ts`, `WEB/taskSuggestions.test.ts`.
- [ ] Show Suggest subtasks only with server capability; display disabled/missing/unsupported/provider-error states actionably. Generation populates editable preview, regenerate replaces only with clear confirmation if edited, cancel leaves data unchanged, approval calls create_subtasks once with retained parent token.
- [ ] On success refresh parent/cards/relationships and show actual created links; on stale error retain edits, refresh parent version and require renewed review/confirmation. Never silently retry approval with a fresh token.
- [ ] Browser-run real provider→edit/remove/reassign/change dependency→confirm group conversion→create→reload; separate cancel and stale approval journeys. Acceptance: all user edits persist; no duplicate children; unavailable provider never masquerades as success.

### P25 — Close API/security/migration and backend regression gates
**Size:** M. **Depends:** P24. **Requirements:** R01–R18. **Files:** extend `raven/tests/test_project_tasks_board.py`, `raven/tests/test_project_tasks_actions.py`, `raven/tests/test_project_tasks_migration.py`, `raven/tests/test_project_tasks_detail.py`; update `tasks/todo.md` with evidence.
- [ ] Exercise effective-role combinations, Task/Project shares/User Permissions, read-only, unrelated user and Guest across every new endpoint; POST-only/CSRF, exact allowlists, field-level summaries, hidden prerequisite/count/file/Version leakage, pagination >200 and no N+1 growth per card. API security review checks all custom mutations explicitly check permissions.
- [ ] Run isolated migrate/setup/patch twice, metadata regression modules, all focused backend modules and existing `raven.tests.test_project_hub`, then `bench --site kanban-review.localhost run-tests --app raven`. Run LSP diagnostics; obtain independent Frappe/API/migration review when reviewer tooling is usable. Record actual failures rather than suppressing them.
- [ ] Reconcile exported/dotted consumers: no set_task_status, old get_tasks-array consumer, old exact-only task cache invalidation or generic status bypass remains. Acceptance: observed backend/security/migration proof; old tasks/content/assignments intact; outstanding unavailable review clearly named.

### P26 — Verify actual UI, document delivery and prepare controlled rollout
**Size:** M. **Depends:** P25. **Requirements:** R01–R19. **Files:** update `docs/SPEC-project-kanban.md`, `tasks/todo.md`; create `docs/project-tasks.md`, `docs/CHANGELOG-project-kanban.md` after successful smoke; product fixes remain in their owning tasks, not hidden in documentation.
- [ ] Run web tests/build/lint once after integration, then actual authenticated Raven desktop 1440×900, mobile 390×844 and 320px reflow, both themes. Exercise every panel tab, filter/page/sort, quick/advanced create, assignment, drag/menu/keyboard/touch move, blocker/dependency flow, private files/retry, review, deep-link/history, real AI approval/cancel and reader/denied states. Capture screenshots; verify focus entry/return/containment, names, live saving/error announcements and no hover-only controls. Close automation tabs afterward.
- [ ] Record commands/results, site, users/capabilities, provider path, screenshot paths and R01–R19/S01–S14 evidence links; mark only observed items done. Document user-facing flows and release changes, including private-file rules, unavailable AI state and concurrency recovery. Remove temporary smoke data/scripts from the isolated acceptance surface without touching live task records.
- [ ] Present rollout backup/migrate/cache/build/restart requirements and evidence for approval before live `coaletech` migration, real customer sends or paid-provider changes. Acceptance: complete observed end-to-end behavior and every named criterion; no build-only visual claim, no stub/fake fallback, and no request called fully implemented while a required real-provider/browser/migration proof is unavailable.

### Final checkpoint — P24–P26
- [ ] Human acceptance compares the evidence register to all 19 requirements and 14 spec slices. Stop only at a complete verified deliverable or a precisely documented unreachable prerequisite; do not silently narrow scope.

## Self-review and handoff

Coverage: R01 P04/P06; R02 P07/P09; R03 P04–P06; R04 P04–P06; R05 P08/P09/P14; R06 P10/P11/P15/P24; R07 P04/P05/P07–P09; R08 P06/P14/P26; R09 P05/P11/P12/P20; R10 P04/P09; R11 P10–P13/P17; R12 P01/P03/P08/P09/P14; R13 P03/P04/P10/P11/P14; R14 P08/P14/P18/P19; R15 P13/P15–P17; R16 P01/P03/P08/P12/P18/P19; R17 P01/P21–P24; R18 P00–P04/P07/P08/P10/P13/P18/P20/P22/P23/P25; R19 P00/P24/P26.

S01 P01–P03; S02 P04/P05; S03 P06; S04 P07/P09; S05 P15–P17; S06 P10/P11; S07 P08/P14; S08 P03/P14; S09 P13/P16/P17; S10 P18/P19; S11 P12/P20; S12 P26; S13 P21–P24; S14 P25/P26. All remain unchecked until implementation and observed proof.

Recommended execution: **Native**, because API/schema/cache consumers are tightly coupled and earlier implementation/reviewer agents could not start. Native does not waive independent final review; if the reviewer remains unavailable, report that explicitly. Alternative: **Subagent-driven**, after model configuration is repaired, with bounded implementation/review tasks and one shared-file integrator.

Execution authorized: Native in the current checkout; user explicitly declined a new worktree and chose to create `kanban-review.localhost` locally. P00 has a successful fresh backup but awaits that site. The independently testable P16 upload-state core has been implemented and exercised; it is not integrated into the board yet. No migration, live Task mutation, paid-provider change, commit or push has occurred.
