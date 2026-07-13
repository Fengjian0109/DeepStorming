# D1 DeepSeek Real-Provider Acceptance + D8 Self-Use Release Candidate Design

- Date: 2026-07-14
- Status: design ready for implementation planning
- Scope: D1 real DeepSeek provider acceptance, plus D8 self-use macOS release-candidate hardening for a single-user workflow

## 1. Goal

Push DeepStorming past the current local/mock-only confidence boundary by validating one real cloud provider end to end, then package the app into a self-use release candidate that is safe to keep using locally.

This slice is intentionally narrower than a full public release:

- It must prove that a real DeepSeek API key works inside the app without leaking secrets.
- It must prove that provider-backed lesson generation still works after restart.
- It must leave the app in a state that the user can package, keep, and personally use on macOS.
- It does **not** require Developer ID signing, notarization, App Store readiness, or multi-user distribution support.

## 2. User Intent and Constraints

The user explicitly provided a real DeepSeek API key and wants to continue with D1 and D8.

Key constraints:

- The app is currently for personal use only.
- Real credentials must not be written into the repository, docs, shell history, test fixtures, logs, SQLite plaintext, screenshots, or verification output.
- Existing architecture boundaries remain unchanged.
- The implementation should prefer documentation, safe manual validation, and minimal product changes over broad release engineering work.

## 3. Recommended Approach

We will treat this as two linked but distinct deliverables:

1. D1 acceptance execution
   - Use the real DeepSeek key in the running desktop app.
   - Execute a controlled manual acceptance pass against the existing provider and lesson flows.
   - Record only stable outcomes and sanitized metadata.

2. D8 self-use release-candidate hardening
   - Keep the current unsigned local packaging path.
   - Clarify the difference between a self-use release candidate and a publicly distributable macOS build.
   - Add user-facing operational guidance for local backup, restore, privacy boundaries, and unsigned-app expectations.

This is preferable to jumping straight to signing/notarization because the user’s stated need is self-use, and the highest remaining risk is still “does the real provider behave safely and reliably in the actual product?”

## 4. Non-Goals

This slice will not:

- Add a second real provider unless one is already trivially available and useful for comparison.
- Automate real-key tests in CI.
- Require signing, notarization, hardened runtime policy work, or Gatekeeper-friendly public distribution.
- Redesign Provider UI, lesson flows, or release infrastructure unless a real acceptance finding proves a blocking issue.
- Add OCR, richer paper workflow stages, notification systems, or a review center.

## 5. D1 Acceptance Design

### 5.1 Secret-handling model

The real DeepSeek API key will be read from the user-provided local file and used only as runtime input for manual acceptance. The implementation must avoid echoing the key in:

- commentary updates
- final responses
- committed files
- shell command text
- shell command output
- acceptance docs

If a temporary file or environment bridge is needed for desktop automation, it must be created outside the repository and removed after use.

### 5.2 Acceptance flow

The acceptance pass should validate the existing product behaviors in this order:

1. Create a DeepSeek provider with a current recommended model.
2. Enable the provider and run connection test.
3. Start or reuse a non-sensitive lesson.
4. Submit one learner reply and confirm provider-backed tutor output succeeds.
5. Restart the app and confirm:
   - provider metadata persists
   - active provider persists
   - lesson session persists
   - generated tutor content and model-run metadata persist

Optional negative validation may include a wrong model name or another non-secret failure path, but should not intentionally corrupt or expose the real API key.

### 5.3 Accepted evidence

The acceptance record may store:

- provider type
- base URL
- model name
- whether the key was entered only through approved local means
- connection test result
- lesson generation result
- restart persistence result
- stable error code, if any
- high-level notes

It must not store:

- the API key
- Authorization headers
- raw provider response bodies
- full lesson prompts
- sensitive user content

### 5.4 Product/code changes allowed

If D1 reveals a genuine product gap, only the smallest fix necessary should be made. Candidate examples:

- a safe acceptance note in docs
- a missing privacy clarification
- a release checklist correction
- a stable error-message improvement

This phase should not invent new release infrastructure unless a concrete blocker demands it.

## 6. D8 Self-Use Release-Candidate Design

### 6.1 Release posture

For this phase, DeepStorming’s release posture is:

- packaged and runnable on the user’s local macOS machine
- suitable for personal use and local reinstall
- explicit about unsigned-app limitations
- explicit about local-data and cloud-provider boundaries

This is a “self-use release candidate,” not a public macOS release.

### 6.2 Required release-candidate outputs

The D8 self-use slice should leave behind:

- a refreshed release/acceptance checklist
- explicit self-use notes about unsigned builds
- privacy and local-storage guidance
- backup/restore guidance appropriate for a single-user local app
- confirmation that existing package flow still works with the current codebase

### 6.3 Self-use guidance content

The resulting docs should clearly explain:

- what is stored locally
- what gets sent to the enabled cloud provider
- how to back up local app data before upgrades
- how to recover after reinstall
- what to expect from macOS when opening an unsigned app
- which steps remain for a future public-release track

### 6.4 Public-release work intentionally deferred

The docs should explicitly mark these as future work:

- app icon/brand polish if still incomplete
- Developer ID signing
- notarization
- public download packaging strategy
- multi-machine rollout confidence

## 7. Documentation Changes

The implementation should update these documents:

- `docs/planning/provider-cloud-release-acceptance.md`
  - record real DeepSeek acceptance results in sanitized form
  - distinguish completed DeepSeek acceptance from still-pending OpenAI-compatible validation if applicable
- `docs/planning/current-status.md`
  - reflect D1 status and D8 self-use release-candidate progress accurately
- `docs/planning/software-design-completion-roadmap.md`
  - move D1 forward according to real acceptance outcome
  - clarify that D8 is partially advanced for self-use but public-release items remain

If the current docs mix “self-use release candidate” with “public release candidate” too heavily, add one focused doc under `docs/planning/` rather than overloading the existing acceptance checklist.

## 8. Verification Plan

Minimum required verification for this slice:

1. Fresh baseline sanity:
   - `pnpm check`
2. Packaging sanity:
   - `pnpm package:dir`
3. If the packaged-provider persistence test is in scope and prerequisites are satisfied:
   - `pnpm exec playwright test tests/e2e/packaged-provider.spec.ts`
4. Manual D1 acceptance in the desktop app using the real DeepSeek key
5. Post-acceptance sensitive-info scan using the existing documented pattern, interpreted carefully so documentation examples are not treated as leaks

Verification success means:

- automated checks still pass
- packaging still succeeds
- real DeepSeek flow succeeds or fails with a documented, stable blocker
- no credential leakage is introduced by the acceptance work

## 9. Risks and Mitigations

### Risk: secret exposure during manual acceptance

Mitigation:

- never echo the key in command text
- prefer UI input or safe local file bridging
- redact any acceptance notes

### Risk: current recommended DeepSeek model name has changed

Mitigation:

- verify the current recommendation from official DeepSeek docs immediately before manual acceptance
- record the exact accepted model name in sanitized documentation

### Risk: acceptance depends on local environment or network variance

Mitigation:

- capture exact observed outcome and stable error code
- separate product bug from temporary external-service instability

### Risk: D8 scope expands into full release engineering

Mitigation:

- keep this slice explicitly limited to self-use release readiness
- document, rather than implement, signing/notarization unless the user later asks for full public distribution

## 10. Done Criteria

This slice is complete when:

- one real DeepSeek provider flow has been accepted end to end or blocked with precise evidence
- the acceptance record is sanitized and committed
- self-use release-candidate docs are updated and internally consistent
- `pnpm check` passes
- `pnpm package:dir` passes
- any claimed packaged verification has fresh evidence
- no committed change leaks the real API key or other raw secrets
