# D1 + D8 Self-Use Release Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate one real DeepSeek provider flow end to end without leaking secrets, then advance DeepStorming to a documented self-use macOS release candidate.

**Architecture:** Reuse the existing desktop Provider and Lesson flows rather than adding new product surface area. Treat D1 as a sanitized manual acceptance pass over the current app, and D8 as release-readiness documentation plus packaging verification for unsigned self-use builds.

**Tech Stack:** Electron, React renderer, Playwright packaged-app coverage, pnpm workspace scripts, DeepSeek OpenAI-compatible API, Markdown planning docs

---

## File Structure / Responsibility Map

- Modify: `docs/planning/provider-cloud-release-acceptance.md`
  - Record the exact DeepSeek manual acceptance result in sanitized form and distinguish completed DeepSeek validation from any still-pending OpenAI-compatible work.
- Modify: `docs/planning/current-status.md`
  - Reflect D1 completion status and D8 self-use release-candidate progress accurately.
- Modify: `docs/planning/software-design-completion-roadmap.md`
  - Move D1 forward based on acceptance evidence and clarify that D8 is advanced for self-use, not yet for public distribution.
- Create: `docs/planning/self-use-release-candidate.md`
  - Single-user operational guide covering unsigned-app expectations, privacy boundaries, backup/restore, and deferred public-release work.
- Reuse without code changes if possible:
  - `apps/desktop/out/main/index.js`
  - `apps/desktop/out/preload/index.js`
  - `apps/desktop/out/renderer/*`
  - existing Provider UI and lesson flows

## Task 1: Reconfirm baseline and release inputs

**Files:**
- Modify: none
- Reference: `docs/superpowers/specs/2026-07-14-d1-d8-self-use-release-design.md`
- Reference: `docs/planning/provider-cloud-release-acceptance.md`

- [ ] **Step 1: Re-read the design and acceptance checklist**

Review these files in full before touching docs or running the real-provider pass:

```text
docs/superpowers/specs/2026-07-14-d1-d8-self-use-release-design.md
docs/planning/provider-cloud-release-acceptance.md
docs/planning/current-status.md
docs/planning/software-design-completion-roadmap.md
```

- [ ] **Step 2: Verify the current recommended DeepSeek model from the official docs**

Run:

```bash
python - <<'PY'
import requests
from bs4 import BeautifulSoup
html = requests.get("https://api-docs.deepseek.com/", timeout=20).text
print("deepseek-v4-flash" in html, "deepseek-v4-pro" in html)
PY
```

Expected: `True True`

Working assumption after verification:

```text
Preferred acceptance model: deepseek-v4-flash
Fallback model if needed: deepseek-v4-pro
Do not use deprecated deepseek-chat / deepseek-reasoner unless acceptance is specifically testing backward compatibility.
```

- [ ] **Step 3: Run fresh baseline verification before real-key work**

Run:

```bash
pnpm check
pnpm test:e2e
```

Expected:

```text
pnpm check -> PASS
pnpm test:e2e -> PASS with packaged-provider either passing or skipping according to existing preconditions
```

- [ ] **Step 4: Confirm the real key file exists without printing its contents**

Run:

```bash
test -s /Users/hezhendong/Desktop/deepseek_api.txt
```

Expected: exit code `0`

- [ ] **Step 5: Commit only if baseline/doc-prep changes were needed**

If no files changed, do nothing.

If files changed in this task:

```bash
git add <changed-files>
git commit -m "chore: refresh d1 baseline prerequisites"
```

## Task 2: Execute sanitized DeepSeek manual acceptance

**Files:**
- Modify: `docs/planning/provider-cloud-release-acceptance.md`
- Test: manual desktop acceptance only
- Reference: `/Users/hezhendong/Desktop/deepseek_api.txt`

- [ ] **Step 1: Launch the desktop app in a clean temporary user-data directory**

Run:

```bash
mkdir -p /tmp/deepstorming-d1-acceptance
DEEPSTORMING_USER_DATA_DIR=/tmp/deepstorming-d1-acceptance pnpm --filter @deepstorming/desktop dev
```

Expected:

```text
Electron app launches to the DeepStorming document library.
No terminal output contains the API key.
```

- [ ] **Step 2: Read the key locally without echoing it and enter it only into the app**

Use a local-only read path such as:

```bash
python - <<'PY'
from pathlib import Path
key = Path("/Users/hezhendong/Desktop/deepseek_api.txt").read_text().strip()
assert key, "DeepSeek key file is empty"
print(f"Loaded key length: {len(key)}")
PY
```

Expected:

```text
Only the length is printed.
The key itself is never printed or stored in repo files.
```

Then in the app:

```text
Open Provider page
Choose Provider 类型 = deepseek
显示名称 = DeepSeek Self Use
模型名称 = deepseek-v4-flash
API Key = paste the local key
Add Provider
```

Expected UI result:

```text
Provider 已添加。
Provider card visible.
No raw secret visible in the renderer.
```

- [ ] **Step 3: Enable the provider and run connection test**

In the app:

```text
Click "设为启用 DeepSeek Self Use"
Click "测试 DeepSeek Self Use"
```

Expected UI result:

```text
Provider 已启用。
Provider 测试成功。
```

If `deepseek-v4-flash` fails with a stable model-availability issue, retry once with:

```text
模型名称 = deepseek-v4-pro
```

Record only the sanitized final model choice.

- [ ] **Step 4: Run one real provider-backed lesson generation**

In the app:

```text
Create a non-sensitive text document:
Title = DeepSeek Acceptance Notes
Body = Evidence links a claim to observable behavior. A learner should explain what the evidence proves and what it does not prove.

Search for "Evidence"
Start a lesson from the matching snippet
Submit learner reply:
"The evidence supports the claim, but I would still want to test whether the same behavior appears under another condition."
```

Expected UI result:

```text
回答已提交。
A tutor follow-up appears.
The latest model-run shows the active provider/model rather than mock-local.
```

- [ ] **Step 5: Restart the app and verify persistence**

Close the app, relaunch with the same user-data directory, then confirm:

```text
Provider still listed
Provider still active
Lesson still listed
Generated tutor follow-up still visible
Model-run metadata still points at the real provider/model
```

Expected outcome:

```text
DeepSeek acceptance is marked successful if create + test + generate + restart persistence all succeed.
```

- [ ] **Step 6: Record the sanitized acceptance result**

Update `docs/planning/provider-cloud-release-acceptance.md` with a concrete record block like:

```markdown
## DeepSeek acceptance record (2026-07-14)

- Commit: <current-sha>
- Provider type: deepseek
- Base URL: https://api.deepseek.com
- Model: deepseek-v4-flash
- Key entered only through approved local means: yes
- Connection test: success
- Lesson generation: success
- Restart persistence: success
- Sensitive-info scan: pending
- Notes: no API key, Authorization header, raw response body, or full prompt was recorded in docs or repo files
```

- [ ] **Step 7: Commit the sanitized acceptance record**

Run:

```bash
git add docs/planning/provider-cloud-release-acceptance.md
git commit -m "docs: record deepseek acceptance"
```

## Task 3: Document the self-use release candidate posture

**Files:**
- Create: `docs/planning/self-use-release-candidate.md`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Create the self-use release-candidate guide**

Create `docs/planning/self-use-release-candidate.md` with this exact structure:

```markdown
# DeepStorming 自用版发布候选说明

- 日期：2026-07-14
- 目标：为单用户本地使用提供可打包、可重装、可备份的 macOS 自用版发布候选。
- 范围：未签名、未公证的本地分发；不等同于公开发布版。

## 1. 这是什么

这是一个“自用版发布候选”，适合当前用户在自己的 macOS 设备上持续使用与重装验证。

它保证：

- 本地包可以构建
- 文档、课堂、Provider 元数据和本地 Vault 路径可继续使用
- 云 Provider 的发送边界有明确说明

它不保证：

- Gatekeeper 友好的首次打开体验
- Developer ID 签名
- notarization
- 面向他人的公开分发

## 2. 数据与隐私边界

- 文档、课堂、SQLite 和本地 Vault 默认保存在本机。
- 启用云 Provider 后，选中的证据片段、上下文片段和学习者回答会发送给所启用的 Provider。
- Renderer 不应持久化 API Key 明文。

## 3. 备份建议

- 升级前备份应用数据目录。
- 至少保留：
  - SQLite 数据库
  - Vault 密文目录
  - 如有需要的导入文件副本

## 4. 重装/恢复建议

- 使用同一份应用数据目录恢复本地状态。
- 恢复后优先检查：
  - Provider 是否仍存在且 active
  - 课堂历史是否可见
  - 文档是否可读取

## 5. 未签名应用的现实限制

- macOS 可能提示未知开发者或来源未验证。
- 这是当前“自用版发布候选”的已知限制，不等于应用功能失效。

## 6. 未来公开发布仍需补齐的工作

- 品牌图标
- Developer ID 签名
- notarization
- 对外分发包策略
- 面向多用户/多机器的升级与回滚信心
```

- [ ] **Step 2: Update current status to reflect D1 + D8 self-use progress**

Edit `docs/planning/current-status.md` so it states:

```markdown
- 当前阶段：Phase 6 D1 Real DeepSeek Acceptance + D8 Self-Use Release Candidate
```

and add an “已完成” bullet describing:

```markdown
- D1 真实 DeepSeek Provider 手动验收：真实 key 通过本地安全方式输入，完成创建、启用、连接测试、一次真实课堂生成与重启恢复验证；验收记录已做脱敏。
- D8 自用版发布候选推进：补充未签名自用版发布说明、隐私/备份/恢复边界，并保留签名、公证和公开分发为后续工作。
```

- [ ] **Step 3: Update the roadmap to reflect D1 completion and D8 partial advancement**

Edit `docs/planning/software-design-completion-roadmap.md` so that:

```markdown
- D1 is marked completed for DeepSeek manual acceptance, while OpenAI-compatible real acceptance remains optional/pending if not executed.
- D8 is described as partially advanced for self-use release readiness, with public-release items still pending.
```

Use wording like:

```markdown
### D1. 真实云 Provider 手动验收与发布前收尾

当前状态：DeepSeek 手动验收已完成并记录；OpenAI-compatible 真实端点验收仍可在后续需要时补做。
```

and:

```markdown
### D8. 发布候选

当前状态：自用版发布候选已推进到可本地打包、可重装、可备份的阶段；签名、公证和公开分发仍待后续完成。
```

- [ ] **Step 4: Run doc formatting sanity**

Run:

```bash
pnpm exec prettier --check docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/planning/self-use-release-candidate.md
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 5: Commit the self-use release docs**

Run:

```bash
git add docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/planning/self-use-release-candidate.md
git commit -m "docs: capture self-use release candidate"
```

## Task 4: Verify packaging and packaged persistence for self-use

**Files:**
- Modify: none unless verification reveals a real issue
- Test: `tests/e2e/packaged-provider.spec.ts`

- [ ] **Step 1: Build the unsigned directory package**

Run:

```bash
pnpm package:dir
```

Expected:

```text
DeepStorming.app directory package created under apps/desktop/release/mac-arm64/
```

- [ ] **Step 2: Run packaged-provider persistence verification**

Run:

```bash
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
```

Expected:

```text
PASS
```

- [ ] **Step 3: If verification fails, capture the exact blocker before changing code**

Record the failing command, exit code, and the first meaningful error. Do not patch blindly.

Accepted record format:

```markdown
- Command:
- Exit code:
- Stable symptom:
- Does it block self-use release candidate: yes/no
```

- [ ] **Step 4: Commit only if packaging verification required a product/doc fix**

If no files changed, do nothing.

If files changed:

```bash
git add <changed-files>
git commit -m "fix: unblock self-use package verification"
```

## Task 5: Run sensitive-info scan and close out

**Files:**
- Modify: `docs/planning/provider-cloud-release-acceptance.md` if scan status needs to be updated

- [ ] **Step 1: Run the documented sensitive-info scan**

Run:

```bash
rg -n "Authorization|Bearer |sk-|DEEPSEEK_API_KEY|OPENAI_API_KEY|api[_-]?key|secret_ref" \
  apps packages tests docs README.md
```

Expected:

```text
Only documentation examples, test doubles, or safe security guidance should match.
No real DeepSeek key should appear anywhere in the repository.
```

- [ ] **Step 2: Manually inspect any suspicious hits**

Treat these as acceptable only if they are clearly:

```text
documentation examples
test fixtures with fake values
schema / field names
```

Treat these as blockers:

```text
the real key value
real Authorization content
raw provider response bodies from manual acceptance
```

- [ ] **Step 3: Update the acceptance record with final scan status**

If clean, ensure `docs/planning/provider-cloud-release-acceptance.md` contains:

```markdown
- Sensitive-info scan: passed
```

If not clean, replace with:

```markdown
- Sensitive-info scan: failed (see blocker notes)
```

- [ ] **Step 4: Run final completion verification**

Run:

```bash
pnpm check
pnpm package:dir
```

Expected:

```text
Both commands PASS after all D1/D8 doc and verification changes.
```

- [ ] **Step 5: Commit the final D1/D8 closeout**

Run:

```bash
git add docs/planning/provider-cloud-release-acceptance.md docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/planning/self-use-release-candidate.md
git commit -m "docs: finish d1 d8 self-use release candidate"
```

## Self-Review

- Spec coverage:
  - Real DeepSeek key acceptance: Task 2
  - Sanitized acceptance record: Task 2 + Task 5
  - Self-use release-candidate docs: Task 3
  - Packaging verification: Task 4
  - Final leak scan and baseline checks: Task 5
- Placeholder scan:
  - No `TBD` / `TODO` placeholders remain.
  - Commands and exact target files are named in every task.
- Type and terminology consistency:
  - Uses `deepseek-v4-flash` as preferred model and `deepseek-v4-pro` as fallback, matching current DeepSeek docs.
  - Consistently distinguishes “self-use release candidate” from public-release work.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-d1-d8-self-use-release-candidate.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
