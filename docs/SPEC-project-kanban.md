# Raven Projects: kanban and task workspace

Date: 2026-11-07
Status: Approved by the user's “proceed” on 2026-11-07. Executable planning is authorized; implementation has not started.
Scope: Every enhancement requested in the Raven audit and Hermes comparison.

## 1. Objective and alternatives

Enhance Raven's existing project board into a task workspace: informative cards, useful filters, accessible actions, details/discussion/activity/files, explicit blockers and dependencies, review handoffs, and human-approved subtask suggestions.

Primary users: project contributors, reviewers, project managers, and read-only project participants. Success means each requirement and acceptance journey below has observed evidence, not merely a rendered component or passing build.

Decisions:
- ERPNext Task, Task Depends On, ToDo assignment, Comment, Version, and private File remain authoritative. Do not copy Hermes's SQLite storage, agent runner, worker states, office UI, or automatic execution model.
- Keep Raven's React frontend and existing Espresso components/tokens. Do not introduce a parallel Vue app, styling system, drag library, or task database.
- Native ERPNext statuses remain unchanged. Blockers and lateness are orthogonal task attributes, not replacement status values.
- Stock ERPNext Kanban/Task forms remain available through Open in Desk, but cannot replace Raven's customer messaging, project-channel context, and integrated task panel.
- An edit-only dialog is insufficient: reading/discussing work must not require entering edit mode. A separate full-page task app would unnecessarily discard board context.
- Use existing Raven AI provider infrastructure; no second AI SDK or fake rule-based fallback presented as AI.

## 2. Assumptions and repository baseline

Assumptions surfaced for approval:
1. No new role grants, public endpoints, customer portal access, mandatory fields on old tasks, naming-series changes, or core modifications.
2. A task reader can read its permitted detail; commenting/uploading/mutating requires the corresponding server capability described below. Raven membership alone never grants Task access.
3. A reviewer is an enabled, eligible project user; requesting review does not itself approve or complete work. No new Frappe Workflow DocType is introduced.
4. Templates are separately navigable, not counted as active work. Existing Overdue records stay explicitly labeled and visible.
5. AI generation is optional, but actual generation/preview/approval is included in delivery when a configured provider is available. Missing provider configuration must be reported, not replaced with fabricated suggestions.

Observed baseline:
- Bench `/Users/mac/ERPNext/coaletecherp`, site `coaletech`, web port 8054. `bench --site coaletech list-apps` reports Frappe 16.36.1, ERPNext 16.37.0, Raven 3.1.0; HRMS, WhatsApp, CRM, Wiki and coale_web are installed. Suite is not installed: task attachments cannot depend on Suite Drive.
- `raven/api/project_tabs.py:get_tasks` returns an array capped at 200, ordered by modification. `TasksTab.tsx` displays five statuses and sends other values to Open.
- Earlier read-only API audit observed 18 tasks across five accessible projects, all unassigned, including three Overdue tasks. This is baseline evidence, not authorization to bulk-assign or edit them.
- `CreateTaskDialog.tsx` already supports assignment, parent groups, dependencies, customer-facing flags, dates and advanced fields. Its untouched rich description must remain unchanged on save.
- `ProjectHub.tsx` currently rewrites query parameters when selecting tabs; permalink support must change that behavior rather than adding a query parameter that is immediately discarded.
- `raven/api/suggestions.py:approve` already creates tasks through `project_tabs.create_task`; preserve that internal signature and creation return value.
- Existing customer-facing/send actions are in `customer_outreach.py`; existing project bot/channel notifications must continue through the installed document lifecycle.

Reference patterns: supplied `/Users/mac/ERPNext/CEO Terminal/hermes-agent`, particularly `apps/desktop/src/app/mycompany/index.tsx`, `plugins/kanban/dashboard/plugin_api.py`, and `coaletech_cli/kanban_db.py`. Borrow card context, blockers, contextual actions, attachment feedback, stable order, and handoff context only.

## 3. Requirement coverage register

Each identifier must have implementation and observed acceptance evidence before completion. All items are currently unchecked.

| ID | Required outcome | Checklist slice |
|---|---|---|
| R01 | Explicit Open, Working, Pending Review, Overdue, Completed, Cancelled, Template and unknown-status handling | S01, S03 |
| R02 | Assignee avatar/name or Unassigned and quick assignment | S02, S04 |
| R03 | Title/ID search; My tasks, Unassigned, Overdue, Priority and Customer-facing filters | S02, S03 |
| R04 | Stable Priority / Due date / Oldest first ordering; edits do not reorder by modification | S02, S03 |
| R05 | Text plus semantic due/priority signals; compact, keyboard-accessible Move to actions | S04, S07 |
| R06 | Quick creation separate from advanced editing; parent/subtask context | S05, S06 |
| R07 | Per-card saving/errors, duplicate-change protection, pagination and accurate permission-filtered totals | S02, S04, S07 |
| R08 | Mobile status selector/single-column list; keyboard and touch alternatives to dragging | S03, S07, S12 |
| R09 | Preserve customer flags/sending; task permalinks and connected discussion/activity | S06, S11 |
| R10 | Rich cards: ownership, due warnings, completed-child progress, discussion count, age, latest update | S04 |
| R11 | Task panel: Details, Discussion, Activity, Files; editing without losing board context | S06, S09 |
| R12 | Explicit blocker category, reason and responsible person | S01, S08 |
| R13 | Unresolved dependencies and dependency-aware readiness; no automatic human start | S06, S08 |
| R14 | Server-authoritative Start work, Request review, Complete, Flag blocker, Clear blocker actions | S07, S08, S10 |
| R15 | Private attachments selected/dropped at creation; limits and per-file partial-failure/retry feedback | S05, S09 |
| R16 | Structured review handoff: changes, evidence/files, reviewer and what needs checking | S01, S10 |
| R17 | Optional Suggest subtasks; editable titles/owners/dependencies/acceptance criteria; approval before writes | S01, S13 |
| R18 | Permission, migration, malformed-input, pagination and workflow-boundary coverage | S01–S13 |
| R19 | Actual desktop/mobile, theme, keyboard/touch and full-journey browser verification | S12, S14 |

## 4. Data model

### Existing records, unchanged ownership

- **Task**: retain installed naming `TASK-.YYYY.-.#####`, non-submittable semantics and standard permissions. Standard JSON does not enable `track_changes`; add a narrowly scoped Property Setter to enable Task change tracking prospectively, without inventing earlier history. Keep `subject`, `status`, `is_template`, `priority`, datetime dates, `description`, `progress`, `parent_task`, `is_group`, `depends_on`, and `raven_customer_facing`.
- **Task Depends On** remains Task's dependency child table, distinct from parent/subtask grouping. Native `populate_depends_on` also adds each saved child to its parent's prerequisites and saves the parent: account for that during group conversion, dependency validation, transactions and version refresh. A newly linked subtask belongs to the same project and a valid group parent.
- **ToDo** remains the assignment source; use Frappe assignment helpers, including removals/notifications. Do not write `_assign` JSON directly or treat creator as assignee.
- **Comment** stores task discussions and human-readable action/handoff entries. **Version** supplies permitted change history. No invented historical events are backfilled.
- **File** stores private task attachments (`is_private=1`, `attached_to_doctype=Task`, `attached_to_name=task`). Do not require Suite folders or expose uploads by making them public.
- No new standalone or child DocType and no naming-series change is proposed.

### Additive Task Custom Fields

All fields are optional for existing records; install/export only Raven-owned fields, not every site's unrelated customization.

| Field | Type / options | Default / requirement |
|---|---|---|
| `raven_blocker_kind` | Select: blank, Waiting on customer, Waiting on dependency, Needs decision, Access issue | Blank; nonblank requires reason and responsible person |
| `raven_blocker_reason` | Small Text | Blank; trimmed nonempty when blocked |
| `raven_blocker_owner` | Link / User | Blank; enabled and eligible user when blocked |
| `raven_acceptance_criteria` | Text | Blank; editable for normal tasks and approved suggested subtasks |
| `raven_review_handoff` | Code / JSON, read-only | Blank; server-written versioned object described below |

Handoff value: `{version: 1, summary: string, checks: string, reviewer: user_id, requested_by: user_id, requested_on: ISO_datetime, evidence: [File.name]}`. Summary and checks are required on Request review; evidence may be empty. Store File names, not arbitrary URLs. Resolve evidence to display metadata only after File authorization. Current handoff is shown prominently; previous requests remain represented in task activity and permitted Version history. No provider keys or hidden task content is stored here.

Blocker validation is shared by the task API and a narrowly scoped Task validation hook, so Desk/REST edits cannot create contradictory blocker fields. Clearing a blocker clears all three fields and logs who cleared it. Existing unblocked records remain valid without a backfill. Review JSON is validated and written by the action service, not accepted as an arbitrary editor field; validation rejects a changed handoff unless the trusted action service sets its server-only provenance. This does not replace standard ERPNext Desk Workflow rules: an existing/native review status without a Raven handoff is displayed honestly as No handoff recorded.

## 5. Permissions and security

Do not infer permissions from a visible menu or from the client-supplied project. Load the task, derive its actual project, check Project read and Task permission, and apply field-level permissions before returning data. Standalone Tasks without projects are outside this project-board API.

The matrix describes effective capabilities, not new Role Permission Manager grants. Installed Task JSON grants read/write/create to Projects User and HR Manager; HR User, Accounts User, Employee and Manufacturing User have select only. Installed Project JSON grants read/write/create to Projects User and Projects Manager; HR Manager has only Project select without another role/share. Projects Manager does not itself appear in Task permission rows. System Manager is not an automatic Task allow. Effective combined roles, User Permissions, shares and permission hooks remain authoritative.

| Actor/capability | Read board/panel | Create Task | Edit/assign/status/block/review | Add discussion | Upload/remove file | Submit/cancel/amend docstatus |
|---|---|---|---|---|---|---|
| Guest / no Project read / no Task read | No | No | No | No | No | No |
| Project+Task reader without Task write/create | Permission-filtered records | No | No | No | No | No |
| Project reader + Task create | Only readable records | Yes | Only records also writable | Only writable records | Only with Task write and File capability | No |
| Project+Task reader + Task writer | Yes | Only if Task create | Yes, subject to validation/active Workflow | Yes | Native File permission plus Task write | No |
| Projects User / Projects Manager / HR Manager / System Manager | Only what effective permissions allow | Same capability check | Same capability check | Same capability check | Same capability check | No |
| Assigned reviewer | Only if permitted | No extra grant | Same Task write requirement | Same Task write requirement | Same File requirements | No |

- All custom endpoints require authentication, `allow_guest=False`; mutations are POST-only, typed, explicitly permission checked and CSRF-protected for cookie sessions.
- User selections are enabled, eligible users with access to the task/project; searching for assignees must not dump every User record or disclose email/profile data without permission. Setting assignment uses the installed assignment helper's own checks too.
- Read-only lists and counts must share permission constraints. `frappe.get_all`/QB is not a substitute for permission-aware Task selection. No raw SQL, arbitrary field/order/filter expressions, or client-provided doctype names.
- Child/dependency totals, latest summary, comments, attachment names and Version data must not reveal inaccessible records. An unresolved hidden dependency may show a generic restricted indicator and inhibit readiness without returning its title/ID.
- Comment HTML and plain-text handoff inputs are sanitized; AI output is untrusted data, never executable instructions or HTML. No automatic customer message, assignment, file disclosure or task creation from generation.
- Customer-facing does not mean public. Neither internal discussions, handoffs nor private files are automatically appended to outgoing customer messages.
- Active site-defined Task Workflow, if present, remains authoritative; invalid shortcuts are denied rather than bypassing transition checks.

## 6. Status, blocker and dependency behavior

No Frappe Workflow is added (`workflow_state` is not introduced). All actions save the real Task through its controller; preserve native project progress, date/status normalization, notifications and installed Workflow checks.

| Action | Allowed source | Result / required checks |
|---|---|---|
| Start work | Open or Overdue, non-template, nonterminal | Request Working; deny if explicit blocker or unresolved prerequisites. Return actual saved status, including native overdue normalization |
| Request review | Working or Overdue, non-template, nonterminal | Require summary, checks, reviewer and authorized evidence; deny explicit blocker/unresolved prerequisites; save Pending Review plus handoff atomically |
| Complete | Open, Working, Pending Review or Overdue | Deny explicit blocker/unresolved prerequisites; enforce ERPNext child/dependency/controller and Workflow validation; save Completed |
| Flag blocker | Any nonterminal, non-template task | Require valid category/reason/responsible person; status unchanged |
| Clear blocker | Explicitly blocked task | Clear explicit blocker only; unresolved dependency may remain; status unchanged |
| Move to… | Native valid target for an ordinary task | Same transition guard as contextual action; moving to review opens handoff form; no drag/menu bypass; invalid/custom/Template transition rejected |
| Reopen / Cancel | Completed or Cancelled → Open; ordinary nonterminal → Cancelled | Preserve native validation/Workflow checks; no forced dependency start |

- Explicit status lanes: Open, Working, Pending Review, Overdue, Completed, Cancelled. Templates have a separate switch/view and count; they never silently join Open. Future/unrecognized stored statuses have an Unknown status grouping with original status text, readable detail and no unsupported move target.
- Lateness warning is independent of stored status. Installed `exp_end_date` is Datetime: compare its actual timestamp with server site time, not end-of-day or browser-local guesses. A new quick-create date-only choice explicitly stores end-of-day in site timezone; never reinterpret existing midnight timestamps. Overdue means unfinished, noncancelled, nontemplate work past due, or native status Overdue. Due soon means not already overdue and due today or within the next two site-calendar days. Completed/Cancelled/Template do not get active lateness warnings. Return server_now, server_today and site_timezone. Templates are identified by `is_template` as well as status because native validation normalizes Template/Open using that flag.
- Do not automatically overwrite statuses during board reads. Do not auto-start work when a prerequisite completes. Report Ready when no explicit blocker and all prerequisites satisfy native completion rules.
- Dependency links and parent links are same-project, readable, non-self, nonduplicate and acyclic on new edits. Existing invalid/cross-project historical links are displayed safely without silently removing them; edits must resolve invalid changes explicitly.
- Native `Task.validate_status` permits completion when prerequisites are Completed **or Cancelled**. Preserve that rule for readiness/action guards and label cancelled prerequisites explicitly instead of calling them completed. A blocked dependent remains blocked after explicit blocker clearing if any prerequisite is neither Completed nor Cancelled.
- Card subtask completion is `Completed / non-Template children`, with cancelled children shown separately; do not invent weighted percentage when the source is a child count.

## 7. API contracts

Proposed additions remain in `raven.api.project_tabs` and a focused task service under `raven/raven_integrations/project/`. Existing `create_task(project, subject, fields=None, assign_to=None) -> str` and suggestion approval callers retain that contract. Extend its allowed field whitelist only with intended editable fields; never accept server-owned handoff data blindly.

### Common shapes

`TaskCard`: name, subject, status, is_template, priority, exp_end_date, creation, modified, progress, parent summary (or restricted indicator), is_group, raven_customer_facing, assignees (authorized name/avatar metadata), child_counts, discussion_count, latest_update, blocker, dependency_summary, permissions and allowed_actions. Empty states are explicit, not absent ownership. No rich description or complete activity on every card.

`TaskPage`: `{lanes: [{key, label, total, items: TaskCard[], has_more, next_start}], filtered_total, total, template_total, start, page_length, status_options, server_now, server_today, site_timezone, capabilities}`. Totals count readable tasks, not a capped sample. `total` is all readable tasks in the project; `filtered_total` is the selected view/filters before paging. Template totals remain separate. Unknown status lane does not change original stored values.

TaskPage/get_task capabilities include server-resolved upload policy: maximum file bytes, permitted extensions (null if unrestricted), maximum attachment count (null if unlimited) and remaining count for an existing task. Board counts and summaries are not a client-side approximation. Subtask/assignee/comment/file detail collections require their own bounded paging, not a hidden all-record dump.

| Method / verb | Typed request | Response |
|---|---|---|
| `get_tasks` GET | `project: str, q: str='', mine: bool=False, unassigned: bool=False, overdue: bool=False, priority: str|None=None, customer_facing: bool=False, sort: str='priority', view: str='tasks', lane: str|None=None, start: int=0, page_length: int=30` | TaskPage; initial request pages each lane, lane request pages just that lane |
| `get_task` GET | `task: str` | Current editor fields plus TaskCard context, sanitized detail description, acceptance criteria, parent, readable children/dependencies, handoff, permissions/actions; preserve existing plain-text editor value separately from display HTML |
| `get_task_updates` GET | `task: str, kind: str='discussion', start: int=0, page_length: int=30` | `{items, total, has_more, next_start}`; kind allowlist discussion/activity/files; stable creation/name order |
| `get_task_assignees` GET | `task: str|None=None, project: str|None=None, q: str='', start: int=0, page_length: int=20` | `{items: [{name, full_name, user_image}], has_more}`; exactly one task/project context |
| `set_task_assignees` POST | `task: str, users: list[str], expected_modified: str` | Authoritative TaskCard; add/remove through ToDo helpers |
| `task_action` POST | `task: str, action: str, expected_modified: str, payload: dict|None=None` | Authoritative TaskCard plus handoff if applicable; allowed actions: start, request_review, complete, flag_blocker, clear_blocker, reopen, cancel, move |
| `add_task_comment` POST | `task: str, content: str` | Created permitted comment; reject blank/oversized/unsafe content |
| `update_task` POST | `task: str, subject: str, fields: dict|str|None=None, assign_to_users: list|str|None=None, *, expected_modified: str` | Authoritative task result; apply only explicitly changed fields, preserve untouched HTML; status changes use task_action rather than this generic editor endpoint |
| `suggest_subtasks` POST | `task: str, instructions: str=''` | `{parent_modified, suggestions: [{key, title, owner, depends_on: [key], acceptance_criteria}], warnings}`; generation only, no task/assignment writes |
| `create_subtasks` POST | `task: str, rows: list[dict], expected_modified: str, convert_to_group: bool=False` | `{parent, created: [{key, name}]}`; explicit human approval, atomic batch |

Upload uses installed Frappe `upload_file` with `is_private=1`, `doctype=Task`, `docname=task` and real file bytes; native `handler.check_write_permission` checks Task write before saving File. No extra upload wrapper is required. Never enable guest upload settings or invoke its guest path for this feature. Native File deletion permissions still apply. Resolve upload constraints from installed File/System Settings/config, not assumed constants.

Contract details:
- Action payloads: flag_blocker `{kind, reason, responsible_user}`; request_review `{summary, checks, reviewer, evidence: [File.name]}`; move `{status}`; other actions accept no extra fields. Moving to Pending Review is the same request_review action and requires its handoff form; the server must not accept a bare move as an alternative.
- Create remains a string-returning Task creation API used by the inbox. Raven creation defaults to Open; Working is allowed only after dependency readiness checks. Review/terminal transitions are post-create actions, not a create-fields bypass. Template records are managed in Desk and read separately in Raven; the board does not silently create or convert a Template from a status string. The editor retains visible status context but replaces direct status editing with the shared actions.
- User text limits: subject 1–140 characters; comment 1–10,000; blocker reason 1–2,000; review summary/checks 1–10,000 each; AI instructions 0–2,000; acceptance criteria 1–10,000 for suggested rows; at most 12 suggested rows and 20 review evidence files. Reject malformed/oversized payloads rather than silently truncating approved content. Every evidence File must belong to this Task, remain private and be readable by the requester and selected reviewer.
- Search is literal case-insensitive title/ID text (trimmed, max 200 characters); no interpreted filter JSON. Filters combine with AND; mutually exclusive mine/unassigned returns an empty result with clear UI, not a hidden override.
- Sort allowlist: priority (Urgent, High, Medium, Low; unknown after known), due_date (ascending, null last), oldest (creation ascending). Every ordering has creation/name tie-breakers; `modified` never controls order. Per-lane offset paging resets after mutation/filter change and deduplicates by Task name. No claim of snapshot consistency while other people change the board.
- `page_length` 1–100, `start` nonnegative; reject invalid enum/type/range inputs. Cursor is not needed for this offset-based board contract. Do not truncate counts at 200. Batch child/comment/assignee/dependency summaries for the page rather than queries per card.
- Version-bearing task/assignment/action/subtask mutations acquire the Task row lock, load fresh state, compare expected_modified, recheck permissions/source state/dependencies, and save within the request transaction. Assignment changes must also advance Task.modified; ToDo-only writes cannot leave the concurrency token unchanged. A stale action raises Frappe's timestamp-conflict error; refresh the card and preserve unsaved form text. Comments/uploads use independent native create semantics, not a stale task-version prerequisite. No optimistic success toast before server confirmation.
- Cleanly replace `set_task_status`: migrate every discovered consumer to task_action then delete the obsolete endpoint; do not retain a compatibility alias/bypass. The editor's status updates use the same action guards and required review handoff. API return-shape changes require atomic migration of web/native/packages callers, cache keys and existing tests.
- Existing AI extraction is `raven/raven_integrations/project/suggestions.py`, using `RavenAgentManager(bot).client`, project_bot_for, enable_ai_integration and a daily budget. Reuse client/provider selection and budget, but not its background extract function (which writes suggestions), permission-bypassing _project_context, fixed extraction prompt or exception-swallowing behavior. Introduce a bounded subtask-specific structured prompt with permission-filtered task/user context. ChatGPT Subscription is unsupported by that current JSON chat path; show an actionable configuration error, as for disabled/missing bot/provider. Cap at 12 suggestions, require unique local keys, title 1–140 characters, nonempty acceptance criteria, valid owner or Unassigned, and valid acyclic references within the batch. Provider failures never become writes or empty-success substitutions.
- Applying suggestions revalidates edits without trusting the model/preview: same-project parent, Task create plus parent write, valid owners, valid dependencies, no cycles/self-links. Converting an ordinary task into a group requires the explicit confirmation flag. Lock/save the parent to advance its modification version, create and link all children/assignments in one request transaction, and reload parent after native child saves update its dependencies/version. Any failure rolls back the entire batch; a stale second submission cannot duplicate children. No manual app-code commit.

## 8. UI behavior

### Board and cards

Toolbar: title/ID search; My tasks, Unassigned, Overdue and Customer-facing toggles; priority selector; sort selector; Tasks/Templates view. Show active filters and Clear filters. Zero-results, loading, read-only and error states are distinct. Maintain board scroll/filter/selection while a task panel is open.

Cards display title/ID, owner avatars/names or Unassigned, explicit Urgent/High text with existing semantic badge tokens, due label, age, child progress, discussion count, one-line latest update, parent context and blocker/dependency warnings. Text supplements color/icons; avoid tooltips as the only accessible label. The action menu replaces the full-width status dropdown. Quick assign opens an accessible searchable picker with unassign capability.

Desktop: horizontally scrollable status columns, sticky counts, independent Load more in each lane, no drag-over on read-only/unsupported lanes. Keep existing native drag where useful; explicit Move to is the required keyboard/touch path and uses identical validation. Saving/error state is local to the affected task, preventing simultaneous duplicate requests for that card without freezing unrelated cards.

Mobile: use the existing mobile breakpoint, a status selector with accurate counts and a single-column list, not a squeezed desktop board. Controls wrap/scroll intentionally; detail panel is a full-height accessible drawer. No required hover or drag interaction.

### Creation and detail panel

Quick create: title, optional owner, priority, due date and file drop/selection; selected lane defaults only when a valid create status. Advanced fields initially collapsed, reusing the existing editor's fields rather than discarding them. Advanced editing remains available from Details. Inline group/subtask creation supplies validated parent context.

Reuse inventory: `CreateTaskDialog.Field`/`MultiLink` and existing link controls, `components/ui/drawer.tsx`, existing `FileDropzone`, and `frappe-react-sdk` upload progress/error primitives. `UploadDocDialog` uploads before document creation and only one file, so reuse its primitives, not its orchestration. `packages/lib/hooks/useFileUpload.ts` creates Raven Messages and removes failed queue entries: do not reuse that channel-writing/error-loss behavior for Task files. A small task-local upload queue is justified; no general upload framework.

Task title opens the task panel, not edit mode:
- **Details**: description, acceptance criteria, owner, dates, parent/children, dependency status and links, explicit blocker, review handoff; Edit action opens the existing advanced editor.
- **Discussion**: paged sanitized task comments and a composer for authorized writers; submission refreshes count/latest update. No pretending channel messages are task comments.
- **Activity**: paged actual creation, permitted Version changes, assignment/status/blocker/review events with actor/date. Do not emit duplicate events from UI and lifecycle hooks.
- **Files**: permitted task File records, private download, upload progress and failures, and delete only when native permissions allow. Review evidence links select from these files.

Permalink: preserve the current project route and merge `tab=tasks&task=<encoded Task.name>` into its query. ProjectHub normalization/tab switching must not erase unrelated query state. Opening/closing tasks participates in browser history, Back restores the board, and invalid/inaccessible/cross-project links show a safe error without leaking metadata. Copy link can be pasted into Raven channel discussions; no automatic customer delivery or channel post is implied.

Creation uploads: create the real Task first, then upload each selected file privately to it. Task failure means no uploads. Per-file failures never report whole-task failure or create the task again on retry; display the created task link, successful files and failed files with individual retry/remove. Respect the server's effective file-size/count/type policy and display it before selection; never hardcode Hermes's 25 MB as this site's limit. Cancelling before save uploads nothing. Removal of a selection before save needs no File deletion.

Request review opens summary, reviewer, what to check, and evidence selection/upload. Files upload first; failed uploads are excluded and shown for retry; require explicit confirmation of the evidence actually submitted. Review action persists handoff/status together. Keep the handoff visible to the reviewer, not buried in a channel.

Suggest subtasks is optional and only offered with parent-write/create/provider capability. Generation opens an editable preview with titles, owners, dependencies and acceptance criteria. Users can remove rows, edit, regenerate or cancel with no task creation. Create selected subtasks is a separate explicit action, shows conversion-to-group when needed, and returns actual created links. Generation never starts work or assigns tasks by itself.

## 9. Hooks, schema deployment and migration

- Existing `setup_project_hub` calls `setup.add_task_customer_facing_field`; `hooks.after_migrate` calls that same helper. Add one shared `setup.add_task_context_fields` helper used by both setup and after_migrate, and preserve the existing customer-field helper. Add narrowly filtered Custom Field fixtures for section 4 plus a Task `track_changes=1` Property Setter fixture; export only these Raven-owned records, never every site's fields/setters.
- Register the new idempotent `raven.patches.v3_0.add_project_task_context` under existing `[post_model_sync]` in `raven/patches.txt`. It invokes the shared field/tracking setup on existing installations, including enabled sites that will not toggle settings again. Existing `raven/raven_integrations/project/setup.py`, `raven/hooks.py`, `raven/patches.txt` and new `raven/fixtures/custom_field.json` / `property_setter.json` are affected. No task status, assignment, description or customer rewrite.
- Append `Task.validate -> raven.raven_integrations.project.tasks.validate_task_context` to existing Task doc_events without replacing installed handlers. Scope validation to the new fields/changed relationship data; preserve unrelated legacy Task edits. Enforce the same relationship rules in the shared mutation service, never only in the UI.
- Preserve existing Task after_insert/on_update project-channel notifications. Clear framework meta/cache after schema synchronization; do not clear production data or disable permissions to make migration pass.
- Dry-run migrations on an isolated restored site, invoke setup/patch twice, verify old rows and assignments unchanged, then migrate `coaletech` only with an approved rollout/backup. Do not experiment against the production site's task records.
- No destructive schema change, custom status rewrite, Workflow fixture, new Role, scheduled worker, auto-start job or reports/print formats is required. A migration cannot be marked verified solely because patch registration exists.

## 10. Detailed implementation checklist

These are coverage slices, not authorization to begin implementation. After spec approval, turn them into the executable plan with exact current symbols/references and commands. Complete each acceptance line with evidence; all remain pending.

### S01 — Schema and shared invariants (R01, R12, R16, R17, R18)
- [ ] Extend installed project setup/after_migrate; add/export the five Task fields and Task track_changes Property Setter, plus the additive idempotent patch.
- [ ] Implement shared blocker/handoff/relationship validation; append, never replace, Task hooks; keep old records valid and no core edits.
- [ ] Acceptance: migrate restored site, run patch/setup twice, compare old statuses/assignments/content; reject malformed blocker/review data through API and direct document save.

### S02 — Permission-aware board API and stable pagination (R02–R04, R07, R18)
- [ ] Change get_tasks to TaskPage; implement literal search, all five filter families, Tasks/Templates/unknown grouping, site-date context and three stable sorts.
- [ ] Count full authorized result sets and page each lane; batch permitted card summaries without N+1; migrate every discovered consumer/cache key.
- [ ] Acceptance: use >200 isolated tasks across lanes and duplicate sort keys; all pages accessible without duplicates in an unchanged dataset, totals match readable records, edits preserve sort, hidden tasks never affect visible totals.

### S03 — Board toolbar, statuses and mobile layout (R01, R03, R04, R08)
- [ ] Add toolbar/filter clearing/sort control, explicit Overdue lane, separate Templates view and Unknown grouping with actual stored values.
- [ ] Render independent lane paging and accurate counts; mobile selector/single-column list; keep loading/error/zero-project/zero-filter states clear.
- [ ] Acceptance: three native Overdue baseline tasks cannot fall into Open; Template and unknown fixture records retain identity; combined filters/search and mobile status counts agree with server responses.

### S04 — Rich cards and quick ownership (R02, R05, R07, R10)
- [ ] Render owner/Unassigned, due/priority text+tokens, child counts, discussion count, age/latest summary, parent and dependency/blocker markers.
- [ ] Add quick assign/unassign picker using eligible users and server assignment helper; per-task busy/error handling and duplicate-submit suppression.
- [ ] Acceptance: assignment survives reload and My tasks filtering; denied assignment remains unchanged with visible error; card signals remain legible in both themes without revealing restricted context.

### S05 — Quick creation and advanced fields (R06, R15)
- [ ] Split quick-create presentation from detailed editor; advanced fields collapsed; retain all existing task fields and untouched-description behavior.
- [ ] Add selected/dropped file queue and optional validated group parent; create Task once, pass its identity into post-create uploads.
- [ ] Acceptance: minimal task creation, advanced task creation and subtask creation produce correct real records; cancel creates nothing; no duplicate Task after attachment failure/retry.

### S06 — Context-preserving task panel (R06, R09, R11, R13)
- [ ] Implement accessible task drawer/panel and Details/Discussion/Activity/Files tabs with permitted loading/error states; reuse current editor for explicit Edit.
- [ ] Add parent/children/dependency context and task navigation; integrate URL selection/history without dropping project/channel/filter state.
- [ ] Acceptance: open, edit, reload deep link and Back preserve board context; unavailable task gives safe error; parent/subtask/dependency links resolve only within authorized context.

### S07 — Unified moves and contextual actions (R05, R07, R08, R14)
- [ ] Implement server action allowlist/transitions and version checks; wire Start work, Complete, Reopen, Cancel and Move to with task-local feedback.
- [ ] Replace full-width card status select with compact menu; route dragging and keyboard/touch actions through identical service, and retire every bypass caller.
- [ ] Acceptance: drag/menu/context action produce identical allowed/denied results; two concurrent/stale saves cannot silently overwrite work; failed save retains actionable card error and actual status.

### S08 — Explicit blockers and dependency readiness (R12, R13, R14)
- [ ] Add Flag/Clear blocker forms with category, required reason and responsible person; render explicit blockers separately from unresolved dependencies.
- [ ] Recompute readiness after dependency changes without starting tasks; enforce self/cycle/project/readability checks on new links, and expose restricted prerequisites safely.
- [ ] Acceptance: clearing explicit blocker leaves unresolved-dependency warning; completed prerequisite enables but does not start dependent work; cancelled/inaccessible prerequisites, self-links and cycles cannot bypass guards.

### S09 — Private files and partial-failure handling (R11, R15)
- [ ] Wire native private Task uploads, authenticated downloads, File listing and authorized delete; show real server limits before selection/drop.
- [ ] Implement per-file progress/error/retry for create and panel; keep created task and successful files visible after partial failure.
- [ ] Acceptance: permitted user downloads actual screenshot/PDF, unauthorized user/Guest cannot fetch it directly, oversized/disallowed files are rejected, and retry does not duplicate task or already-successful upload.

### S10 — Structured review handoff (R14, R16)
- [ ] Implement Request review dialog and shared server validation for summary/checks/reviewer/authorized File evidence; save handoff+status atomically.
- [ ] Display current handoff in Details and historical request entries in Activity; moving/dropping to review must invoke this same dialog.
- [ ] Acceptance: reviewer sees exact changes/checks/evidence after reload; missing required text, inaccessible evidence, invalid reviewer, stale version and unresolved blocker/dependency reject without changing status.

### S11 — Discussion, activity and Raven integration (R09, R11)
- [ ] Implement paged task comments with sanitized composer and actual activity timeline; refresh card summary/count without duplicates.
- [ ] Add copy-task-link; preserve customer-facing toggle and SendToCustomerDialog; preserve installed project bot notifications and other Project Hub tabs.
- [ ] Acceptance: permitted comments persist and unauthorized writes fail; channel-pasted link opens correct task; customer send retains explicit recipient/channel consent and never includes internal handoff/files automatically.

### S12 — Accessibility and responsive verification (R08, R19)
- [ ] Verify focus entry/return, tab order, menu operation, accessible names, disabled/busy semantics, status announcements and keyboard/touch Move to alternatives.
- [ ] Exercise desktop 1440×900 and mobile 390×844 plus 320px reflow, light/dark themes, long titles/many owners and real overflow.
- [ ] Acceptance: no clipped required controls or hover-only actions; modal focus remains contained/returns to triggering card; actual surface screenshots and interaction results recorded.

### S13 — Human-approved subtask suggestions (R17, R18)
- [ ] Reuse configured Raven project AI; define bounded structured output, unavailable-provider state and server-side validation; generation causes no Task/ToDo/parent writes.
- [ ] Build editable preview and explicit create-selected confirmation including group conversion; atomic apply rechecks permissions/version/owners/dependency DAG and saves acceptance criteria.
- [ ] Acceptance: exercise real provider → edit/remove/reassign/change dependencies → approve → actual children/assignments/criteria; cancel creates nothing, malformed/cyclic output and stale/double approval create no partial/duplicate batch.

### S14 — Integrated acceptance and delivery (R18, R19)
- [ ] Review API/security/migration contracts and regression coverage; run applicable backend/frontend checks after integration, not competing builds during parallel edits.
- [ ] Exercise contributor, reviewer, read-only, unrelated user and Guest journeys against real endpoints/UI; confirm project notifications/customer actions and every requirement row.
- [ ] Acceptance: record actual commands/results, migration site, viewports/screenshots and remaining prerequisites; update user documentation/release notes and mark items complete only with evidence. No scope item silently deferred.

## 11. Verification plan and success gates

Permanent regression coverage belongs in existing `raven/tests/test_project_hub.py` or a focused adjacent Task-board test module and existing frontend Vitest conventions. Test consumer-visible behavior, not source text, copied defaults or mocked forwarding. Keep test records isolated/rolled back and never modify the 18 real baseline tasks for test convenience.

| Area | Required behavioral proof |
|---|---|
| Status/filter/order | Native/unknown/template status placement, literal search, combined filters, exact assignment matching, due timezone edges/null dates, stable ties and >200 tasks |
| Authorization | Project-readable but Task-restricted user; read-only user; unrelated user/Guest; restricted dependency/child/comment/evidence; assignment target eligibility |
| Task mutation | Valid and invalid actions, explicit/implicit blockers, children/dependency completion, cycles, stale versions, simultaneous duplicate action, native validation/Workflow |
| Files/review | Private authenticated download, unauthorized direct download denial, actual limits, partial upload/retry, sanitized text, handoff+status atomicity and evidence authorization |
| Suggestions | Real configured provider path; no writes on generate/cancel; editable valid batch; group conversion; invalid owner/dependency/criteria; atomic rollback and stale replay |
| Migration | Restored site dry-run, repeated setup/patch, fresh enabled install and enabled existing site, no status/assignment/content rewrite |
| UI | All panel tabs, toolbar, quick create/edit, ownership/actions/blocker/review/files/subtask flow, permalinks/Back, read-only/errors, both themes, keyboard and mobile/touch |
| Existing behavior | Customer-facing toggle/send, suggestion inbox task creation, project progress and channel notifications, other project tabs |

Commands to resolve against the approved executable plan:
- `bench --site <isolated-restored-site> migrate` and `clear-cache`; invoke the patch twice on that isolated site.
- `bench --site <isolated-test-site> run-tests --app raven --module raven.tests.test_project_hub`, plus the focused new behavioral module if used.
- `yarn workspace @raven/web test` and `yarn workspace @raven/web build` from `apps/raven`; run the app's applicable configured lint once after integration.
- Authenticated real HTTP smoke and real browser journeys at the running Raven surface. Builds/tests alone do not prove UI behavior.

All R01–R19 and S01–S14 must be satisfied before the full request is called implemented. Never mark visual support verified if browser tooling could not operate. Earlier browser connection timeouts are a verification risk to resolve, not evidence of success.

## 12. Boundaries, open questions and approval

Always: installed-source API checks; Task/Project/File permissions; translated user strings; native controllers; bounded typed requests; isolated migration/test data; exact caller migration; evidence-backed completion.

Ask first: changing standard roles/statuses/Workflow, introducing public/customer task access, destructive schema/data operations, enabling/changing a paid AI provider, sending real customer messages for acceptance, or expanding scope beyond this checklist.

Never: edit ERPNext/Frappe core, create public attachments to bypass permission errors, use `ignore_permissions` for user-facing task mutations, auto-run human work, auto-create model suggestions, auto-send internal context, suppress failures as success, or silently omit requirements.

Specification and executable plan approval have been received; the user selected Native execution in this checkout and will create the isolated test site locally. Runtime prerequisites to verify before corresponding acceptance remain an isolated restored/test site, usable real browser automation and an authorized configured AI provider; unavailable prerequisites must be reported explicitly, not treated as completed features.

Specification validation: structural check passed for all 12 sections, R01–R19, S01–S14 and 42 unchecked delivery/acceptance items. Installed-source reconciliation corrected datetime due semantics, Cancelled dependency satisfaction, missing standard Task change tracking and child-to-parent dependency updates. Independent cold-reader/API review was attempted but did not run: scout/Frappe-scout provider returned HTTP 429; reviewer had no configured model, and per-call model override is disabled. Independent review remains outstanding and is not represented as passed.

Approval: user said “proceed” on 2026-11-07 after receiving this specification, then approved the executable plan and selected Native execution. The approved scope is carried into `../tasks/plan.md` and `../tasks/todo.md`. Approval records authorization, not implementation or test success; every delivery checkbox remains unchecked until supported by evidence.
