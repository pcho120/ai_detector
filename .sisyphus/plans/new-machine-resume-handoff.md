# New Machine Resume Handoff

## TL;DR
> **Summary**: Capture the exact current repo state so another machine can continue safely after `git pull`, with no hidden decisions about what is done, what is pending, what must be committed, and what must happen first.
> **Deliverables**:
> - One authoritative handoff plan covering current implementation status, pending approval state, and resume procedure
> - Explicit file/state inventory for what must be committed before another machine can continue from `git pull`
> - Exact post-pull verification commands and expected outcomes
> - Clear distinction between completed work, pending user approval, and pending git/push actions
> **Effort**: Quick
> **Parallel**: NO
> **Critical Path**: 1 → 2 → 3 → 4 → 5

## Context
### Original Request
- "곧 다른 컴퓨터에서 이어서 작업해야될 수도 있으니까 지금 todo로 나와있는것, 방금 작업한것들 다 포함해서 다른 컴퓨터에서 git pull으로 내려받은 후 작업 이어서 진행 할 수 있도록 플랜 만들어줘"

### Interview Summary
- User wants a continuation/handoff plan, not implementation.
- The plan must include both the just-completed regression work and the currently pending todo/approval state.
- The handoff must assume the next machine starts from `git pull`, so all required state must be represented in committed repo files.

### Metis Review (gaps addressed)
- Call out that another machine cannot continue from `git pull` unless current uncommitted work is committed and pushed first.
- Separate true source-of-truth state from noisy/generated `.next/` artifacts.
- Include the blocker that final-wave F1-F4 reviewers all approved, but the active plan intentionally still leaves those checkboxes unchecked until explicit user okay.
- Add acceptance criteria for both this machine's close-out and the new machine's resume verification.

## Work Objectives
### Core Objective
Produce a decision-complete operational handoff so a future executor on another computer can resume from the current state without guessing what is finished, what is blocked, what must be committed, and what exact commands to run after `git pull`.

### Deliverables
- Authoritative summary of current active plan and implementation state
- Explicit list of pending actions that still remain before the current work is truly portable to another machine
- Commit/push requirements before handoff
- Exact resume procedure for the next machine
- Verification checklist for confirming the pulled state is correct

### Definition of Done (verifiable conditions with commands)
- `.sisyphus/plans/new-machine-resume-handoff.md` exists and documents the current active plan, completed work, pending approval state, and resume commands
- The handoff identifies that `.sisyphus/plans/voice-profile-suggestion-fixes.md` Tasks 1-5 are complete and F1-F4 reviewer verdicts are all APPROVE, while F1-F4 checkboxes remain intentionally unchecked pending user okay
- The handoff explicitly states that current source/test changes are not yet portable via `git pull` until they are committed and pushed
- The handoff includes exact post-pull verification commands: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`
- The handoff includes expected plan-file verification: `grep '\- \[ \]' .sisyphus/plans/voice-profile-suggestion-fixes.md`

### Must Have
- Use `.sisyphus/plans/voice-profile-suggestion-fixes.md` as the authoritative active implementation plan
- Record that Tasks 1-5 are complete
- Record that final-wave F1-F4 verdicts are APPROVE
- Record that final-wave checkboxes in the active plan are still unchecked because user okay has not yet been applied to the file
- Distinguish repo-tracked source/test/sisyphus artifacts from generated `.next/` noise
- Include exact next-step order for the current machine and exact resume order for the next machine

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT invent commits or pushes that have not happened
- Must NOT claim the next machine can resume solely from `git pull` before current uncommitted work is committed/pushed
- Must NOT treat `.next/` generated artifacts as required handoff state
- Must NOT mark F1-F4 complete in the active plan without explicit user okay
- Must NOT mix this handoff plan with new feature implementation scope

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed, except for the explicit user okay gate already required by the active implementation plan.
- Test decision: **verification-by-state + command checklist**
- Evidence source: current active plan, boulder state, learnings, and working-tree status
- QA policy: every handoff step names the exact command/output expected on the resume machine

## Execution Strategy
### Parallel Execution Waves
> This handoff is sequential because each step depends on repo state from the previous one.

Wave 1: capture current truth, close current-machine blockers, then push

Wave 2: resume from new machine and verify pulled state

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 5
- 2 blocks 3, 4, 5
- 3 blocks 4, 5
- 4 blocks 5

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 4 tasks → unspecified-low, quick, unspecified-high
- Wave 2 → 1 task → unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Freeze the current truth into the repo before handoff

  **What to do**: Treat the following as the current authoritative state to preserve in subsequent steps: active plan is `.sisyphus/plans/voice-profile-suggestion-fixes.md`; Tasks 1-5 are complete; final-wave reviewers F1/F2/F3/F4 all returned APPROVE; the active plan still leaves F1-F4 unchecked pending explicit user okay; `.sisyphus/boulder.json` points to `voice-profile-suggestion-fixes`; current working tree still contains uncommitted source/test/sisyphus changes plus noisy `.next/` artifacts. Ensure any executor follows this state exactly.
  **Must NOT do**: Must NOT reinterpret reviewer verdicts, must NOT assume commit/push already happened, and must NOT use `.next/` as source of truth.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: state capture and interpretation only
  - Skills: `[]`
  - Omitted: [`git-master`] — no git mutation yet

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3, 4, 5] | Blocked By: []

  **References**:
  - Plan: `.sisyphus/plans/voice-profile-suggestion-fixes.md:101-321` — tasks 1-5 checked, F1-F4 still unchecked
  - State: `.sisyphus/boulder.json:1-102` — active plan and stored task sessions
  - Learnings: `.sisyphus/notepads/voice-profile-suggestion-fixes/learnings.md:170-328` — F2/F3/F4 approvals and F1 re-audit approval
  - Repo state: `git status --short` on current machine — source/test changes present, `.next/` noise present

  **Acceptance Criteria**:
  - [ ] Any future executor can state exactly what is done vs pending without re-investigating the repo
  - [ ] Completed work is identified as Tasks 1-5 plus reviewer verdicts F1-F4 = APPROVE
  - [ ] Pending work is identified as: user okay, checkbox close-out, commit, push, resume verification

  **QA Scenarios**:
  ```
  Scenario: Active plan state is correctly summarized
    Tool: Bash
    Steps: run `grep -n "^- \[[x ]\]" .sisyphus/plans/voice-profile-suggestion-fixes.md`
    Expected: Tasks 1-5 show `[x]`; F1-F4 still show `[ ]`
    Evidence: .sisyphus/evidence/handoff-task-1-plan-state.txt

  Scenario: Boulder points to the same active plan
    Tool: Bash
    Steps: run `grep -n '"active_plan"\|"plan_name"' .sisyphus/boulder.json`
    Expected: active plan and plan_name both reference `voice-profile-suggestion-fixes`
    Evidence: .sisyphus/evidence/handoff-task-1-boulder-state.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `n/a`

- [ ] 2. Close the approval gate on the current machine in the correct order

  **What to do**: On the current machine, do not start with git. First present the consolidated final-wave result to the user: F1/F2/F3/F4 all APPROVE. Wait for explicit user `okay`. Only after that approval, mark F1-F4 checked in `.sisyphus/plans/voice-profile-suggestion-fixes.md`. This is the only correct close-out order under the active plan.
  **Must NOT do**: Must NOT mark F1-F4 complete before user okay; must NOT skip presenting the reviewer results.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: small state transition after a required human approval gate
  - Skills: `[]`
  - Omitted: [`git-master`] — still not a git step

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3, 4, 5] | Blocked By: [1]

  **References**:
  - Plan rule: `.sisyphus/plans/voice-profile-suggestion-fixes.md:314-321` — do not mark F1-F4 before user okay
  - Approvals: `.sisyphus/notepads/voice-profile-suggestion-fixes/learnings.md:265-328` — F2, F3, F1 re-audit approvals
  - Approvals: `.sisyphus/notepads/ai-detect-essay-app/learnings.md:386-477` — cumulative compliance/F4 approval context

  **Acceptance Criteria**:
  - [ ] User has explicitly approved the final-wave results
  - [ ] `.sisyphus/plans/voice-profile-suggestion-fixes.md` shows F1-F4 changed from `[ ]` to `[x]`
  - [ ] No unchecked items remain in the active plan

  **QA Scenarios**:
  ```
  Scenario: Active plan is fully checked after user approval
    Tool: Bash
    Steps: run `grep '\- \[ \]' .sisyphus/plans/voice-profile-suggestion-fixes.md`
    Expected: no matches
    Evidence: .sisyphus/evidence/handoff-task-2-no-open-checkboxes.txt

  Scenario: Final-wave checkboxes were not closed early
    Tool: Bash
    Steps: inspect session transcript and plan update timing before commit step begins
    Expected: user approval appears before the plan file is edited to mark F1-F4 complete
    Evidence: .sisyphus/evidence/handoff-task-2-approval-order.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `n/a`

- [ ] 3. Commit only the portable repo state and exclude generated noise

  **What to do**: Commit the actual handoff-required repo state: source files, tests, `.sisyphus/plans/`, `.sisyphus/notepads/`, `.sisyphus/evidence/`, `.sisyphus/boulder.json`, and any other tracked/non-generated files required to reproduce the current state on another machine. Explicitly exclude `.next/` artifacts from the commit. If there is any doubt, verify staged files before committing. The goal is that another machine gets all meaningful work via git history, not local build residue.
  **Must NOT do**: Must NOT commit `.next/` artifacts, must NOT omit the active plan or supporting `.sisyphus` state needed for continuation, and must NOT create an empty or misleading commit.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: careful git staging is required to separate portable state from generated noise
  - Skills: [`git-master`] — exact staging/commit hygiene
  - Omitted: [`playwright`] — no browser work

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4, 5] | Blocked By: [2]

  **References**:
  - Git state: current `git status --short`
  - Active plan: `.sisyphus/plans/voice-profile-suggestion-fixes.md`
  - Boulder state: `.sisyphus/boulder.json`
  - New files: `src/components/VoiceProfilePanel.tsx`, `src/lib/suggestions/voiceProfile.ts`, `src/app/api/voice-profile/`, `tests/integration/voice-profile-route.test.ts`, `e2e/voice-rewrite.spec.ts`

  **Acceptance Criteria**:
  - [ ] All current meaningful source/test/sisyphus changes are committed
  - [ ] `.next/` files are not included in the commit
  - [ ] `git status --short` after commit is either clean or contains only ignorable generated leftovers explicitly excluded from handoff

  **QA Scenarios**:
  ```
  Scenario: Staged diff excludes .next artifacts
    Tool: Bash
    Steps: run `git diff --cached --name-only`
    Expected: no paths under `.next/`
    Evidence: .sisyphus/evidence/handoff-task-3-staged-files.txt

  Scenario: Portable repo state is committed
    Tool: Bash
    Steps: run `git log -1 --name-only --format='%H %s'`
    Expected: latest commit includes source/test/.sisyphus paths required for continuation
    Evidence: .sisyphus/evidence/handoff-task-3-latest-commit.txt
  ```

  **Commit**: YES | Message: `chore(handoff): preserve resume state for new machine` | Files: `tracked source/tests/.sisyphus state only`

- [ ] 4. Push the committed state so git pull on the other machine is sufficient

  **What to do**: Push the current branch after the portable state is committed. The other machine must be able to obtain the handoff state with `git pull` alone. If upstream is not configured, configure push with the normal non-force upstream flow. Do not rewrite history.
  **Must NOT do**: Must NOT force-push, must NOT leave the commit local-only, and must NOT claim the other machine can continue via git pull before push succeeds.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: single git publication step after commit
  - Skills: [`git-master`] — branch/upstream safety
  - Omitted: [`playwright`]

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [5] | Blocked By: [3]

  **References**:
  - Git state after Task 3
  - Branch status / upstream status at push time

  **Acceptance Criteria**:
  - [ ] Remote branch contains the latest handoff commit(s)
  - [ ] Current machine reports branch is up to date after push
  - [ ] Another machine can retrieve the state with `git pull`

  **QA Scenarios**:
  ```
  Scenario: Push succeeded
    Tool: Bash
    Steps: run `git status`
    Expected: branch reports up to date with upstream after push
    Evidence: .sisyphus/evidence/handoff-task-4-push-status.txt

  Scenario: Remote-ready history exists
    Tool: Bash
    Steps: run `git log -1 --oneline`
    Expected: latest handoff-preserving commit is visible and no push error occurred
    Evidence: .sisyphus/evidence/handoff-task-4-last-commit.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `n/a`

- [ ] 5. Resume and verify on the new machine after git pull

  **What to do**: On the other machine, execute the resume sequence exactly: `git pull`, install dependencies if needed, ensure required env vars exist, then run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run test:e2e`. After verification, inspect `.sisyphus/plans/voice-profile-suggestion-fixes.md` and `.sisyphus/boulder.json` to confirm the pulled repo reflects the closed-out active plan. If all commands pass and the active plan has no unchecked boxes, continuation can begin from the next top-level planning/execution decision rather than from forensic reconstruction.
  **Must NOT do**: Must NOT start by re-exploring what happened on the prior machine, must NOT treat missing env vars as code regressions, and must NOT continue from a dirty or partially pulled tree.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: full repo resume verification across git, env, and test commands
  - Skills: [`git-master`] — git pull/state verification
  - Omitted: [`playwright`] — use existing npm e2e command rather than bespoke browser scripting unless failures require it

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [4]

  **References**:
  - Active plan: `.sisyphus/plans/voice-profile-suggestion-fixes.md`
  - Boulder state: `.sisyphus/boulder.json`
  - Verification commands from active plan: `.sisyphus/plans/voice-profile-suggestion-fixes.md:44-52`
  - Required env context: `README.md` deployment/testing sections

  **Acceptance Criteria**:
  - [ ] `git pull` completes successfully on the new machine
  - [ ] `npm run lint` exits 0
  - [ ] `npm run typecheck` exits 0
  - [ ] `npm run test` exits 0
  - [ ] `npm run test:e2e` exits 0
  - [ ] `grep '\- \[ \]' .sisyphus/plans/voice-profile-suggestion-fixes.md` returns no matches
  - [ ] `.sisyphus/boulder.json` still points to `voice-profile-suggestion-fixes` unless intentionally changed for the next plan

  **QA Scenarios**:
  ```
  Scenario: Full verification passes after git pull
    Tool: Bash
    Steps: run `npm run lint && npm run typecheck && npm run test && npm run test:e2e`
    Expected: all commands exit 0
    Evidence: .sisyphus/evidence/handoff-task-5-full-verify.txt

  Scenario: Pulled plan is fully closed out
    Tool: Bash
    Steps: run `grep '\- \[ \]' .sisyphus/plans/voice-profile-suggestion-fixes.md && grep -n '"active_plan"\|"plan_name"' .sisyphus/boulder.json`
    Expected: no unchecked boxes; boulder still references `voice-profile-suggestion-fixes`
    Evidence: .sisyphus/evidence/handoff-task-5-plan-and-boulder.txt
  ```

  **Commit**: NO | Message: `n/a` | Files: `n/a`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- This handoff plan itself should be committed together with the broader portable state if it is used as the official resume guide.
- Exclude `.next/` generated artifacts from any handoff commit.
- Do not close the active regression plan out of order; user okay must precede final checkbox edits.

## Success Criteria
- Another machine can continue from `git pull` without reconstructing repo history by hand.
- The current machine has converted all meaningful local progress into committed and pushed repo state.
- The active regression plan is either explicitly still awaiting user okay, or fully closed out in the repo after okay is obtained.
- The next machine can verify the pulled state with the exact lint/typecheck/test/e2e command chain.
