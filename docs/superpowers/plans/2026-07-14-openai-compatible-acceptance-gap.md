# OpenAI-compatible Acceptance Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining D1 OpenAI-compatible real-provider acceptance work as soon as a real HTTPS-compatible endpoint and credential are available, without leaking secrets or overstating completion before the real pass happens.

**Architecture:** Reuse the existing desktop Provider management flow, OpenAI-compatible gateway, lesson generation path, and markdown planning docs. Treat this as a sanitized manual acceptance workflow plus documentation synchronization, not as a new product feature or test harness.

**Tech Stack:** Electron desktop app, existing Provider/Lesson UI flows, pnpm workspace scripts, Playwright baseline checks, Markdown planning docs, local shell verification

---

## File Structure / Responsibility Map

- Modify: `docs/planning/provider-cloud-release-acceptance.md`
  - Record the concrete OpenAI-compatible acceptance result, including the sanitized endpoint/model choice, final pass/fail outcome, and any stable error-code evidence that was intentionally validated.
- Modify: `docs/planning/current-status.md`
  - Change D1 from “partial” to “complete” only if the real endpoint pass fully satisfies the acceptance definition.
- Modify: `docs/planning/software-design-completion-roadmap.md`
  - Move D1 from “DeepSeek done / OpenAI-compatible pending” to fully complete once the real pass is done.
- Reference: `docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md`
  - Source of truth for scope, safety boundary, and recovery conditions.
- Reference without modification unless acceptance exposes a bug:
  - `packages/domain/src/provider.ts`
  - `packages/infrastructure/src/providers/openai-compatible-gateway.ts`
  - existing desktop Provider and Lesson screens

## Task 1: Reconfirm scope, guardrails, and current baseline

**Files:**

- Modify: none
- Reference: `docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md`
- Reference: `docs/planning/provider-cloud-release-acceptance.md`
- Reference: `docs/planning/current-status.md`
- Reference: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Re-read the approved spec and the three synchronized planning docs**

Review these files in full before touching the app or updating status:

```text
docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md
docs/planning/provider-cloud-release-acceptance.md
docs/planning/current-status.md
docs/planning/software-design-completion-roadmap.md
```

- [ ] **Step 2: Verify the workspace is clean before starting real-endpoint work**

Run:

```bash
git status --short
```

Expected:

```text
No output
```

- [ ] **Step 3: Re-run the baseline gates before any real-key entry**

Run:

```bash
pnpm check
pnpm test:e2e
```

Expected:

```text
pnpm check -> PASS
pnpm test:e2e -> PASS
```

- [ ] **Step 4: Confirm the acceptance still requires a real HTTPS-compatible endpoint**

Run:

```bash
rg -n "OpenAI-compatible.*待真实端点|不以 mock、单测或文档推断替代真实验收结论" \
  docs/planning/provider-cloud-release-acceptance.md \
  docs/planning/current-status.md \
  docs/planning/software-design-completion-roadmap.md \
  docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md
```

Expected:

```text
All four documents contain the pending/real-endpoint language.
```

- [ ] **Step 5: Commit only if baseline documentation needed a pre-acceptance correction**

If no files changed, do nothing.

If files changed in this task:

```bash
git add docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md
git commit -m "docs: refresh openai-compatible acceptance prerequisites"
```

## Task 2: Prepare the real endpoint inputs without leaking secrets

**Files:**

- Modify: none
- Reference: local user-provided endpoint/key source outside the repo

- [ ] **Step 1: Confirm the three required inputs exist**

Before launching the app, verify that the operator has:

```text
1. HTTPS base URL
2. Model name
3. API key
```

Do not proceed if any of the three are missing.

Set fixed shell variables for the rest of this plan:

```bash
export OPENAI_COMPAT_BASE_URL='https://your-real-compatible-host/v1'
export OPENAI_COMPAT_MODEL='your-real-compatible-model'
export OPENAI_COMPAT_KEY_FILE='/absolute/path/to/local/key-file.txt'
```

- [ ] **Step 2: Validate the base URL shape without printing any secret**

Run with the real base URL substituted locally:

```bash
python - <<'PY'
from urllib.parse import urlparse
import os
base_url = os.environ["OPENAI_COMPAT_BASE_URL"]
parsed = urlparse(base_url)
assert parsed.scheme == "https", f"Expected https, got {parsed.scheme!r}"
assert parsed.netloc, "Missing hostname"
assert "@" not in parsed.netloc, "Credentials must not be embedded in base URL"
print(parsed.scheme, parsed.netloc)
PY
```

Expected:

```text
https <hostname>
```

- [ ] **Step 3: Confirm the API key can be read locally without printing it**

If the key is stored in a local file outside the repo, use a length-only check:

```bash
python - <<'PY'
import os
from pathlib import Path
key = Path(os.environ["OPENAI_COMPAT_KEY_FILE"]).read_text().strip()
assert key, "Key file is empty"
print(f"Loaded key length: {len(key)}")
PY
```

Expected:

```text
Only the key length is printed.
```

- [ ] **Step 4: Launch the desktop app with a clean temporary user-data directory**

Run:

```bash
mkdir -p /tmp/deepstorming-openai-compatible-acceptance
DEEPSTORMING_USER_DATA_DIR=/tmp/deepstorming-openai-compatible-acceptance pnpm --filter @deepstorming/desktop dev
```

Expected:

```text
Electron launches to the DeepStorming UI with an isolated local state directory.
No terminal output contains the real key.
```

- [ ] **Step 5: Commit nothing in this task**

This task is preparation only. No repo files should change here.

## Task 3: Execute Provider-level real acceptance in the app

**Files:**

- Modify: `docs/planning/provider-cloud-release-acceptance.md`
- Test: manual desktop Provider acceptance only

- [ ] **Step 1: Add the OpenAI-compatible provider through the UI**

In the app, enter only local real values:

```text
Provider 类型 = openai_compatible
显示名称 = OpenAI-Compatible Self Use
Base URL = value from OPENAI_COMPAT_BASE_URL
模型名称 = value from OPENAI_COMPAT_MODEL
API Key = contents of OPENAI_COMPAT_KEY_FILE pasted only into the app
```

Then click:

```text
Add Provider
```

Expected UI result:

```text
Provider 已添加。
Provider card shows display name, provider type, model name, and hasApiKey semantics only.
No raw key is visible in the renderer.
```

- [ ] **Step 2: Verify O-01 by checking URL normalization behavior**

Use a base URL with a trailing slash or an explicit `/chat/completions` suffix when entering it, for example:

```text
https://example-compatible-host/v1/
```

or

```text
https://example-compatible-host/v1/chat/completions
```

Expected UI result after save/reopen:

```text
The saved provider works through the normalized base URL path.
No duplicate /chat/completions path is required from the user.
```

- [ ] **Step 3: Verify O-02 by rejecting an insecure remote http URL**

In the provider form, attempt a second draft using:

```text
http://example-compatible-host/v1
```

Expected UI result:

```text
The app rejects the insecure remote URL.
No provider is saved from this invalid attempt.
```

- [ ] **Step 4: Verify O-03 by enabling the real provider and running connection test**

In the app:

```text
Click "设为启用 OpenAI-Compatible Self Use"
Click "测试 OpenAI-Compatible Self Use"
```

Expected UI result:

```text
Provider 已启用。
Provider 测试成功。
```

- [ ] **Step 5: Record sanitized Provider-level results in the acceptance doc**

Append or update an OpenAI-compatible record block in:

```markdown
## OpenAI-compatible acceptance record (use today's date in YYYY-MM-DD)

- Commit: output of `git rev-parse --short HEAD`
- Provider type: openai_compatible
- Base URL: sanitized value derived from `OPENAI_COMPAT_BASE_URL` with no credentials and no key
- Model: value from `OPENAI_COMPAT_MODEL`
- Key entered only through approved local means: yes
- O-01 HTTPS/normalization: pass
- O-02 insecure remote http rejection: pass
- O-03 connection test: success
- Notes: no API key, Authorization header, raw response body, or full prompt recorded
```

- [ ] **Step 6: Commit only if the sanitized doc record was written at this stage**

Run:

```bash
git add docs/planning/provider-cloud-release-acceptance.md
git commit -m "docs: record provider-level openai-compatible acceptance"
```

Expected:

```text
One documentation commit containing only sanitized acceptance notes.
```

## Task 4: Execute lesson, cancellation, error, and restart acceptance

**Files:**

- Modify: `docs/planning/provider-cloud-release-acceptance.md`
- Modify if fully successful: `docs/planning/current-status.md`
- Modify if fully successful: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Verify O-04 with one real provider-backed lesson generation**

In the app:

```text
Create a non-sensitive text document
Title = OpenAI-Compatible Acceptance Notes
Body = Evidence links a claim to observable behavior. A learner should explain what the evidence proves and what it does not prove.

Search for "Evidence"
Start a lesson from the matching snippet
Submit learner reply:
"The evidence supports the claim, but I would still want to compare it against another condition before I generalize too far."
```

Expected UI result:

```text
回答已提交。
A tutor follow-up appears.
The latest model-run shows the active provider/model, not mock-local.
```

- [ ] **Step 2: Verify O-05 by canceling one in-flight generation**

Use a deliberately slower prompt timing if needed, then in the app:

```text
Submit another learner reply
While the run is pending, click "取消生成" or the retry-cancel equivalent
```

Expected UI result:

```text
生成已取消。
The run is persisted as cancelled.
The run error summary shows OPERATION_CANCELLED semantics rather than a raw transport error.
```

- [ ] **Step 3: Verify at least one stable error mapping from O-06**

Choose one safe error-path validation:

```text
A. Temporarily use an intentionally invalid key to trigger 401
B. Use a quota-limited test account to trigger quota/429
```

Expected UI result:

```text
The app shows a stable safe provider error.
No raw response body is shown.
```

Record the exact stable code only, for example:

```text
PROVIDER_AUTH_FAILED
```

or

```text
PROVIDER_QUOTA_EXCEEDED
```

- [ ] **Step 4: Verify O-07 only if a safe local compatible test service is available**

If a local compatible service exists that can intentionally return empty `choices`, run that local-only validation. Otherwise mark O-07 as not executed and do not block D1 completion on it.

If executed, expected result:

```text
The app maps the malformed response to PROVIDER_RESPONSE_INVALID.
```

- [ ] **Step 5: Verify O-08 by restarting the app and checking persistence**

Close the app and relaunch with the same temporary user-data directory:

```bash
DEEPSTORMING_USER_DATA_DIR=/tmp/deepstorming-openai-compatible-acceptance pnpm --filter @deepstorming/desktop dev
```

Confirm in the UI:

```text
Provider still listed
Provider still active
Lesson still listed
Successful tutor follow-up still visible
Cancelled run still visible
Error summary history still visible
Model-run metadata still points at the real provider/model
```

- [ ] **Step 6: Update planning docs only if the full completion definition has been met**

If all required conditions are true:

```text
connection success
lesson generation success
cancellation success
at least one stable error mapping validated
restart persistence success
```

then update:

```text
docs/planning/provider-cloud-release-acceptance.md
docs/planning/current-status.md
docs/planning/software-design-completion-roadmap.md
```

Required doc changes:

```text
Mark OpenAI-compatible real acceptance complete
Move D1 from partial to complete in current-status
Move D1 to complete in the roadmap
```

If any required condition failed, record the blocker in `docs/planning/provider-cloud-release-acceptance.md` and leave D1 as partial/pending in the other docs.

- [ ] **Step 7: Commit the sanitized completion or blocker update**

If the full pass succeeded:

```bash
git add docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "docs: complete openai-compatible provider acceptance"
```

If the pass exposed a blocker instead:

```bash
git add docs/planning/provider-cloud-release-acceptance.md
git commit -m "docs: record openai-compatible acceptance blocker"
```

## Task 5: Run sensitive-info scan and final verification

**Files:**

- Modify: same docs as Task 4 only if scan results require a sanitized wording correction

- [ ] **Step 1: Run the documented sensitive-info scan**

Run:

```bash
rg -n "Authorization|Bearer |sk-|DEEPSEEK_API_KEY|OPENAI_API_KEY|api[_-]?key|secret_ref" \
  apps packages tests docs README.md
```

Expected:

```text
Only allowed hits remain, such as safety guidance text and fake test names.
No real key, no real Authorization header, no raw response body.
```

- [ ] **Step 2: Re-run the documentation consistency scan**

Run:

```bash
rg -n "OpenAI-compatible.*待真实端点|OpenAI-compatible.*已完成|D1 当前状态：部分完成|D1.*整体转为完成" \
  docs/planning/provider-cloud-release-acceptance.md \
  docs/planning/current-status.md \
  docs/planning/software-design-completion-roadmap.md \
  docs/superpowers/specs/2026-07-14-openai-compatible-acceptance-gap-design.md
```

Expected:

```text
Pending language remains only if acceptance did not complete.
Complete language appears only if the real pass fully completed.
No contradictory pending/complete mix remains across docs.
```

- [ ] **Step 3: Re-run the baseline gate after doc updates**

Run:

```bash
pnpm check
```

Expected:

```text
PASS
```

- [ ] **Step 4: Create the final verification commit only if wording corrections were needed after the scan**

If scan-driven doc edits were required:

```bash
git add docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "docs: sanitize openai-compatible acceptance records"
```

If no files changed, do nothing.

- [ ] **Step 5: Stop here unless the real acceptance exposed an implementation bug**

If a code bug is discovered, do not improvise a fix inside this plan. Start a separate spec → plan cycle for the implementation fix.
