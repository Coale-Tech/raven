# Raven Projects kanban delivery tracker

Spec: [`../docs/SPEC-project-kanban.md`](../docs/SPEC-project-kanban.md). Executable plan: [`plan.md`](plan.md).

Specification and executable plan approved on 2026-11-07; user selected Native execution in the current checkout and will provision the isolated test site locally. P00 awaits that site. The independent P16 upload-state core and five regression tests are implemented; board integration, schema migration, real-provider smoke and UI acceptance remain unverified.

## Execution steps

Each task's acceptance criteria, exact files/interfaces and verification commands are in the plan. Check a task only after its behavior and rejection path have observed evidence.

- [ ] P00 — Establish isolated restored acceptance site, browser and configured-provider prerequisites.
- [ ] P01 — Add five optional Task context fields, prospective change tracking and additive idempotent patch.
- [ ] P02 — Export narrowly scoped fixtures and append migration/setup hooks.
- [ ] Checkpoint A — Metadata and unchanged-data review after P00–P02.
- [ ] P03 — Enforce blocker/handoff/relationship invariants across API and direct document saves.
- [ ] P04 — Replace capped task array with permission-aware TaskPage, accurate totals and batch rich-card summaries.
- [ ] P05 — Centralize deterministic page merging and project task cache-family invalidation, including inbox approval.
- [ ] Checkpoint B — Status/count/paging/permission contract review after P03–P05.
- [ ] P06 — Add all toolbar controls, explicit native/unknown/template grouping and mobile status list.
- [ ] P07 — Add authorized quick assignment/search and assignment concurrency tokens.
- [ ] P08 — Unify contextual actions and versioned editing; migrate callers and delete the status bypass.
- [ ] Checkpoint C — Actual transition/concurrency review after P06–P08.
- [ ] P09 — Render rich cards, ownership, semantic due/priority signals and task-local busy/error states.
- [ ] P10 — Provide authorized detail, sanitized display HTML and bounded relationship pages.
- [ ] P11 — Add task Details panel, existing advanced editor integration and history-safe permalinks.
- [ ] Checkpoint D — Detail/URL/context review after P09–P11; do not publish empty panel tabs.
- [ ] P12 — Add actual paginated task discussion/activity with sanitized authorized writes.
- [ ] P13 — Add private-file listing, effective upload policy and direct-download authorization checks.
- [ ] P14 — Add accessible contextual Move/blocker actions and shared drag/menu/touch handlers.
- [ ] Checkpoint E — All four functional panel tabs and authorization review after P12–P14.
- [ ] P15 — Separate minimal quick creation from initially collapsed advanced fields; preserve existing editing behavior.
- [ ] P16 — Implement and test task-local upload state/retry without channel-message side effects. Core reducer/policy logic complete: five new tests included in the passing 485-test suite; direct reducer smoke and strict targeted TypeScript compilation passed. TaskFiles UI/integration remains pending, so this task is not complete.
- [ ] P17 — Integrate private files into creation/panel and prove one-Task identity through partial failure.
- [ ] Checkpoint F — Real creation/upload/failure/retry review after P15–P17.
- [ ] P18 — Harden authorized review evidence and atomic versioned handoff persistence.
- [ ] P19 — Add Request review form and exact evidence confirmation for menu/context/drop entry points.
- [ ] P20 — Preserve customer-facing/send, inbox approval, project progress and channel notifications.
- [ ] Checkpoint G — Full task-to-review integration review after P18–P20.
- [ ] P21 — Build editable, selected-row subtask preview with explicit group conversion approval.
- [ ] P22 — Generate bounded real-provider suggestions without Task/ToDo/parent writes.
- [ ] P23 — Atomically create human-approved children/assignments/dependencies/criteria with stale replay rejection.
- [ ] Checkpoint H — Provider/no-write/atomic-apply review after P21–P23.
- [ ] P24 — Integrate real suggestion generation, edit/cancel/regenerate/approve and actionable provider failures.
- [ ] P25 — Complete backend/API/security/migration/concurrency regressions and independent review where available.
- [ ] P26 — Verify actual desktop/mobile/theme/keyboard UI; document behavior/evidence and prepare approved rollout.
- [ ] Final checkpoint — Every requirement/spec slice has observed evidence; user acceptance and controlled rollout decision.

## User-requested coverage

Nothing below is complete merely because a component, endpoint or test exists.

| Requirement | User-requested outcome | Owning tasks | Acceptance evidence |
|---|---|---|---|
| R01 | Explicit every native status, Overdue, Templates and unknown grouping | P04, P06 | Not run |
| R02 | Owner/avatar or Unassigned; quick assignment | P07, P09 | Not run |
| R03 | Literal title/ID search; My tasks, Unassigned, Overdue, Priority, Customer-facing filters | P04–P06 | Not run |
| R04 | Stable Priority / Due date / Oldest first sorts, predictable edits | P04–P06 | Not run |
| R05 | Text plus semantic dates/priority and compact keyboard-accessible Move | P08, P09, P14 | Not run |
| R06 | Quick create vs advanced edit; parent/subtask context | P10, P11, P15, P24 | Not run |
| R07 | Per-card saving/error, duplicate-change protection, pagination and accurate totals | P04, P05, P07–P09 | Not run |
| R08 | Mobile status selector/single list; keyboard/touch alternatives | P06, P14, P26 | Not run |
| R09 | Preserve customer integration; permalinks/discussion/activity | P05, P11, P12, P20 | Not run |
| R10 | Rich cards with owners/due/subtask progress/discussion count/age/latest update | P04, P09 | Not run |
| R11 | Working Details, Discussion, Activity and Files panel without losing board | P10–P13, P17 | Not run |
| R12 | Classified explicit blockers/reasons/responsible people | P01, P03, P08, P09, P14 | Not run |
| R13 | Visible dependencies/readiness, restricted-context safety and no auto-start | P03, P04, P10, P11, P14 | Not run |
| R14 | Authoritative contextual Start/Review/Complete/Flag/Clear actions | P08, P14, P18, P19 | Not run |
| R15 | Private create-time attachments, actual limits and partial-failure retry | P13, P15–P17 | Not run |
| R16 | Structured review changes/checks/reviewer/evidence handoff | P01, P03, P08, P12, P18, P19 | Not run |
| R17 | Real AI suggestion preview/edit, explicit human approval and atomic creation | P01, P21–P24 | Not run |
| R18 | Permissions, migrations, pagination, Workflow, concurrency and customer regressions | P00–P04, P07, P08, P10, P13, P18, P20, P22, P23, P25 | Not run |
| R19 | Actual desktop/mobile/theme/keyboard/touch end-to-end verification | P00, P24, P26 | Not run |

## Spec slice coverage

| Spec slice | Plan tasks | Acceptance state |
|---|---|---|
| S01 Schema/shared invariants | P01–P03 | Pending |
| S02 Board API/stable paging | P04, P05 | Pending |
| S03 Toolbar/status/mobile | P06 | Pending |
| S04 Rich cards/ownership | P07, P09 | Pending |
| S05 Quick create/advanced | P15–P17 | Pending |
| S06 Context-preserving panel | P10, P11 | Pending |
| S07 Unified contextual moves | P08, P14 | Pending |
| S08 Blockers/dependency readiness | P03, P14 | Pending |
| S09 Private files/partial failures | P13, P16, P17 | Pending |
| S10 Structured review handoff | P18, P19 | Pending |
| S11 Discussion/activity/Raven | P12, P20 | Pending |
| S12 Accessibility/responsive proof | P26 | Pending |
| S13 Approved AI subtasks | P21–P24 | Pending |
| S14 Integrated acceptance/delivery | P25, P26 | Pending |

## Evidence ledger

| Gate | Required record | Current observation |
|---|---|---|
| Plan approval | User review and Native/Subagent-driven selection | Approved — Native execution |
| Isolated runtime | Restored site, safe scheduler/outbound settings, usable login | User will create `kanban-review.localhost` locally; latest directory inspection still shows only `coaletech`. Existing site DB login works but cannot provision databases |
| Backup/restore CLI | Supported exact installed commands/options | Backup with files succeeded: `20261107_071154-coaletech-*`; database 6.6 MiB, public 25.2 MiB, private 692 KiB; restore not run |
| Backend runner CLI | Installed module/app test invocation | `run-tests --help` exited 0; no implementation tests executed |
| Baseline LSP | Exported get_tasks references | References returned only definition; dynamic dotted consumers additionally searched |
| Independent review | Working fresh reviewer/API/migration review | Earlier scout HTTP 429; reviewer had no model; model override disallowed; not passed |
| Browser | Actual authenticated Raven interactions/screenshots | Headless tab opened `/raven`, title Raven; initial observation had no elements, subsequent observation timed out after 20 seconds; tab closed; no UI proof |
| Provider | Configured real generation, no-write proof and edited approval | Read-only `enable_ai_integration` check returned 1; provider generation not exercised |
| Migration | Repeated setup/patch, old-data comparison, fresh/existing path | Not run |
| Backend | Focused modules, full Raven tests, concurrency and role boundaries | Not run |
| Frontend | Pure tests, production build, configured lint | 73 files / 485 tests passed, including five upload-state tests; actual reducer retry smoke and strict targeted TypeScript compilation passed. ESLint blocked by configured missing `react-hooks/react-compiler` rule; LSP TypeScript diagnostics timed out; no production build or UI acceptance claimed |
| Delivery | User docs/release notes, complete evidence and approved live rollout | Not run |

Record each implementation result with date, exact command/action, site/user, observed output or screenshot artifact and requirement IDs. Never paste credentials, customer secrets or private provider keys. Existing audit observations are baseline evidence only, not implementation acceptance.
