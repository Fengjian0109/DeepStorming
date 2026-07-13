# Paper Lesson Mode MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paper-specific lesson mode that reuses the existing document, lesson, diagnosis, and review pipeline while giving paper documents staged research-reading behavior.

**Architecture:** Extend `LessonSession` with `lessonMode` and `paperProfile`, infer paper mode from `documentType = 'paper'`, and keep the new state in the existing lesson aggregate. Reuse the current lesson state machine and review loop, but add paper-aware prompt manifests, follow-up stage updates, SQLite persistence, explicit IPC wiring, and lightweight renderer affordances for paper-stage progress.

**Tech Stack:** TypeScript, Zod, Vitest, better-sqlite3, Electron IPC/preload, React renderer, Playwright E2E.

---

## File structure

- Modify `packages/domain/src/lesson.ts`: add `LessonMode`, `PaperReadingStage`, `PaperLessonProfile`, and normalization rules.
- Modify `packages/domain/src/lesson.test.ts`: cover the new paper mode invariants.
- Modify `packages/contracts/src/lesson.ts`: add DTO schemas and request schema support for `lessonMode` / `paperProfile`.
- Modify `packages/contracts/src/lesson.test.ts`: extend schema coverage for paper lessons.
- Modify `packages/application/src/lesson-ports.ts`: extend stored lesson view/session types with paper metadata.
- Modify `packages/application/src/lesson-use-cases.ts`: infer paper mode from `paper` documents, initialize `paperProfile`, add paper prompt manifests, update paper stage after replies/retries, and keep failure/cancel semantics unchanged.
- Modify `packages/application/src/lesson-use-cases.test.ts`: cover paper lesson startup, follow-up stage changes, and non-paper validation.
- Modify `packages/infrastructure/src/database/migrations.ts`: add a migration for `lesson_mode` and `paper_profile_json`.
- Modify `packages/infrastructure/src/database/migrations.test.ts`: assert the migration exists and installs successfully on fresh/legacy databases.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.ts`: read/write `lesson_mode` and `paper_profile_json`.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`: verify round-trip persistence and legacy defaults.
- Modify `apps/desktop/src/main/ipc/lesson-handlers.ts` and `apps/desktop/src/main/ipc/lesson-handlers.test.ts`: accept `lessonMode` in start requests and return paper lesson sessions.
- Modify `apps/desktop/src/preload/index.ts` and `apps/desktop/src/preload/index.test.ts`: expose the updated lesson start request/result typing.
- Modify `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx` and related tests if needed: prefer reopening active paper lessons for paper documents.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx` and `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: display paper stage and stage summary only for paper lessons.
- Modify `tests/e2e/app.spec.ts`: verify paper lesson launch, stage update, and restart persistence.
- Modify `docs/planning/current-status.md` and `docs/planning/software-design-completion-roadmap.md`: record D7 plan/progress once implementation lands.

---

### Task 1: Domain and contract scaffolding

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.test.ts`

- [ ] **Step 1: Write the failing Domain tests**

Add to `packages/domain/src/lesson.test.ts`:

```ts
it('normalizes paper lesson profiles for paper lessons', () => {
  const session = normalizeLessonSession({
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Paper Map 课堂',
    status: 'active',
    documentId: '00000000-0000-4000-8000-000000000201',
    documentTitle: 'Paper Map',
    sourceAnchors: [],
    messages: [],
    modelRuns: [],
    currentState: 'opening',
    steps: [],
    masteryEvidence: [],
    misconceptionSignals: [],
    reviewItems: [],
    reviewEvents: [],
    lessonMode: 'paper',
    paperProfile: {
      currentStage: 'orientation',
      stageSummary: 'We established the paper problem and the learner background.',
      termsIntroduced: ['Transformer'],
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
    },
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  })

  expect(session.paperProfile?.currentStage).toBe('orientation')
  expect(session.lessonMode).toBe('paper')
})

it('rejects mismatched lessonMode and paperProfile', () => {
  expect(() =>
    normalizeLessonSession({
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Notes 课堂',
      status: 'active',
      documentId: '00000000-0000-4000-8000-000000000201',
      documentTitle: 'Notes',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'opening',
      steps: [],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'standard',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [],
      },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }),
  ).toThrow('Paper lesson profile is invalid')
})
```

- [ ] **Step 2: Run the Domain test to verify RED**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: FAIL because `lessonMode`, `paperProfile`, and their normalizers do not exist.

- [ ] **Step 3: Implement the minimal Domain paper lesson types**

Add to `packages/domain/src/lesson.ts`:

```ts
export const LESSON_MODES = ['standard', 'paper'] as const
export const PAPER_READING_STAGES = [
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
] as const

export type LessonMode = (typeof LESSON_MODES)[number]
export type PaperReadingStage = (typeof PAPER_READING_STAGES)[number]

export type PaperLessonProfile = Readonly<{
  currentStage: PaperReadingStage
  stageSummary: string | null
  termsIntroduced: readonly string[]
  citedAnchorIds: readonly string[]
}>
```

Extend `LessonSession`:

```ts
lessonMode: LessonMode
paperProfile: PaperLessonProfile | null
```

Normalize with helpers like:

```ts
const normalizePaperLessonProfile = (
  profile: PaperLessonProfile | null,
  lessonMode: LessonMode,
): PaperLessonProfile | null => {
  if (lessonMode === 'standard') {
    if (profile !== null) throw new Error('Paper lesson profile is invalid')
    return null
  }
  if (profile === null) throw new Error('Paper lesson profile is invalid')
  if (!includes(PAPER_READING_STAGES, profile.currentStage)) {
    throw new Error('Paper reading stage is invalid')
  }
  return {
    currentStage: profile.currentStage,
    stageSummary:
      profile.stageSummary === null
        ? null
        : normalizeNonBlank(profile.stageSummary, 'Paper stage summary is invalid').slice(0, 500),
    termsIntroduced: profile.termsIntroduced.map((term) =>
      normalizeNonBlank(term, 'Paper term is invalid').slice(0, 120),
    ),
    citedAnchorIds: profile.citedAnchorIds.map((id) =>
      assertUuid(id, 'Paper cited anchor id is invalid'),
    ),
  }
}
```

Update `normalizeLessonSession(...)` to default legacy reads to:

```ts
lessonMode: session.lessonMode ?? 'standard'
paperProfile: normalizePaperLessonProfile(
  session.paperProfile ?? null,
  session.lessonMode ?? 'standard',
)
```

- [ ] **Step 4: Run the Domain test to verify GREEN**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: PASS with the new paper lesson coverage green.

- [ ] **Step 5: Write the failing contract tests**

Add to `packages/contracts/src/lesson.test.ts`:

```ts
it('validates paper lesson dto payloads', () => {
  expect(
    lessonSessionSchema.parse({
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Paper Map 课堂',
      status: 'active',
      documentId: '00000000-0000-4000-8000-000000000201',
      documentTitle: 'Paper Map',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'opening',
      steps: [],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: 'The learner has only a rough intuition so far.',
        termsIntroduced: ['Transformer'],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }).lessonMode,
  ).toBe('paper')
})
```

- [ ] **Step 6: Run the contract test to verify RED**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts --run
```

Expected: FAIL because the lesson schema does not yet include `lessonMode` and `paperProfile`.

- [ ] **Step 7: Implement the contract schema updates**

Add to `packages/contracts/src/lesson.ts`:

```ts
export const lessonModeSchema = z.enum(['standard', 'paper'])
export const paperReadingStageSchema = z.enum([
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
])

export const paperLessonProfileSchema = z.object({
  currentStage: paperReadingStageSchema,
  stageSummary: z.string().max(500).nullable(),
  termsIntroduced: z.array(z.string().trim().min(1).max(120)).max(24),
  citedAnchorIds: z.array(uuidSchema).max(24),
})
```

Extend `lessonSessionSchema`:

```ts
lessonMode: lessonModeSchema.default('standard'),
paperProfile: paperLessonProfileSchema.nullable().default(null),
```

Extend `lessonStartDraftSchema`:

```ts
lessonMode: lessonModeSchema.optional(),
```

- [ ] **Step 8: Run the contract test to verify GREEN**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts --run
```

Expected: PASS with the paper DTO validation green.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: add paper lesson session contracts"
```

Expected: a commit containing the new domain and schema scaffolding.

### Task 2: Application paper-mode behavior

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write the failing application tests**

Add to `packages/application/src/lesson-use-cases.test.ts`:

```ts
it('starts paper documents in paper mode with orientation stage', async () => {
  documents.records.set(document.id, { ...document, documentType: 'paper' })

  const created = await new StartLessonFromDocument(
    documents,
    lessons,
    clock,
    idGenerator,
    createContextAssembler(),
  ).execute({
    documentId: document.id,
    documentTitle: document.title,
    source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
  })

  expect(created.lessonMode).toBe('paper')
  expect(created.paperProfile?.currentStage).toBe('orientation')
  expect(created.modelRuns[0]?.promptManifest.key).toBe('lesson.paper.first_question')
})

it('rejects explicit paper mode for non-paper documents', async () => {
  await expect(
    new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      createContextAssembler(),
    ).execute({
      documentId: document.id,
      documentTitle: document.title,
      lessonMode: 'paper',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    }),
  ).rejects.toMatchObject({ code: 'LESSON_VALIDATION_FAILED' })
})

it('advances paper stage after a successful follow-up', async () => {
  documents.records.set(document.id, { ...document, documentType: 'paper' })
  const created = await new StartLessonFromDocument(
    documents,
    lessons,
    clock,
    idGenerator,
    createContextAssembler(),
  ).execute({
    documentId: document.id,
    documentTitle: document.title,
    source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
  })

  const updated = await new SubmitLessonReply(
    lessons,
    clock,
    idGenerator,
    createContextAssembler(),
  ).execute({
    lessonId: created.id,
    content: 'I think the paper is solving the gap between observed evidence and model behavior.',
  })

  expect(updated.paperProfile?.currentStage).toBe('problem_framing')
})
```

- [ ] **Step 2: Run the application tests to verify RED**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
```

Expected: FAIL because use cases and stored lesson types do not yet support paper mode.

- [ ] **Step 3: Implement the minimal application behavior**

In `packages/application/src/lesson-ports.ts`, extend stored/session view types:

```ts
import type { LessonMode, PaperLessonProfile } from '@deepstorming/domain'

export type LessonSessionView = LessonSession

export type StoredLessonSession = Readonly<{
  // existing fields
  lessonMode: LessonMode
  paperProfile: PaperLessonProfile | null
}>
```

In `packages/application/src/lesson-use-cases.ts`:

1. Add prompt manifest constants:

```ts
const PAPER_FIRST_QUESTION_PROMPT_VERSION = 1
const PAPER_FOLLOW_UP_PROMPT_VERSION = 1
```

2. Add helpers:

```ts
const inferLessonMode = (documentType: DocumentType, requested?: LessonMode): LessonMode => {
  const inferred = documentType === 'paper' ? 'paper' : 'standard'
  if (requested === undefined) return inferred
  if (requested === 'paper' && documentType !== 'paper') {
    throw new Error('Paper lesson mode requires a paper document')
  }
  return requested
}

const nextPaperStageForReply = (
  currentStage: PaperReadingStage,
  reply: string,
): PaperReadingStage => {
  if (currentStage === 'orientation') return 'problem_framing'
  if (/公式|推导|loss|objective/iu.test(reply)) return 'method_mechanics'
  if (/局限|质疑|问题|假设/iu.test(reply)) return 'critical_review'
  return currentStage
}
```

3. When creating a lesson:

```ts
const lessonMode = inferLessonMode(document.documentType, draft.lessonMode)
const paperProfile =
  lessonMode === 'paper'
    ? {
        currentStage: 'orientation' as const,
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: sourceAnchors.map((anchor) => anchor.id),
      }
    : null
```

4. Use paper prompt manifests and opening text:

```ts
const promptManifest =
  lessonMode === 'paper'
    ? promptManifestFor('lesson.paper.first_question', PAPER_FIRST_QUESTION_PROMPT_VERSION, ...)
    : promptManifestFor('lesson.mockTutor.firstQuestion', MOCK_TUTOR_FIRST_QUESTION_PROMPT_VERSION, ...)
```

5. On successful reply/retry for paper lessons, update `paperProfile.currentStage` and optionally `stageSummary`.

- [ ] **Step 4: Run the application tests to verify GREEN**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
```

Expected: PASS with paper startup and stage update coverage green.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/application/src/lesson-ports.ts packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: add paper lesson application flow"
```

Expected: a commit containing paper lesson inference, prompt routing, and stage updates.

### Task 3: SQLite persistence and migration

**Files:**

- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

- [ ] **Step 1: Write the failing infrastructure tests**

Add to `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`:

```ts
it('persists lesson mode and paper profile', async () => {
  const session = createLessonSession({
    lessonMode: 'paper',
    paperProfile: {
      currentStage: 'orientation',
      stageSummary: 'The learner is still orienting around the paper.',
      termsIntroduced: ['Transformer'],
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
    },
  })

  await repository.create(session)

  await expect(repository.findById(session.id)).resolves.toMatchObject({
    lessonMode: 'paper',
    paperProfile: {
      currentStage: 'orientation',
      termsIntroduced: ['Transformer'],
    },
  })
})
```

Add to `packages/infrastructure/src/database/migrations.test.ts`:

```ts
it('installs the paper lesson migration', () => {
  expect(MIGRATIONS.some((migration) => migration.name === 'lesson_paper_mode')).toBe(true)
})
```

- [ ] **Step 2: Run the infrastructure tests to verify RED**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
```

Expected: FAIL because the lesson table does not yet have `lesson_mode` or `paper_profile_json`.

- [ ] **Step 3: Implement the migration and repository support**

Add a new migration in `packages/infrastructure/src/database/migrations.ts`:

```sql
ALTER TABLE lesson_sessions ADD COLUMN lesson_mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE lesson_sessions ADD COLUMN paper_profile_json TEXT NULL;
```

If the existing migration helper requires table rebuilds for checks, create a full migration constant:

```ts
{
  version: 15,
  name: 'lesson_paper_mode',
  sql: LESSON_PAPER_MODE_SQL,
}
```

In `packages/infrastructure/src/database/sqlite-lesson-repository.ts`:

```ts
type LessonSessionRow = {
  // existing fields
  lesson_mode: string
  paper_profile_json: string | null
}
```

Map session rows:

```ts
lessonMode: row.lesson_mode === 'paper' ? 'paper' : 'standard',
paperProfile:
  row.paper_profile_json === null
    ? null
    : JSON.parse(row.paper_profile_json),
```

Write rows:

```ts
lesson_mode,
paper_profile_json,
```

with:

```ts
paper_profile_json: session.paperProfile === null ? null : JSON.stringify(session.paperProfile),
```

- [ ] **Step 4: Run the infrastructure tests to verify GREEN**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
```

Expected: PASS with paper mode round-trip persistence green.

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts
git commit -m "feat: persist paper lesson metadata"
```

Expected: a commit containing the migration and repository support.

### Task 4: Desktop IPC, preload, and renderer

**Files:**

- Modify: `apps/desktop/src/main/ipc/lesson-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/lesson-handlers.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

- [ ] **Step 1: Write the failing desktop tests**

Add to `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`:

```ts
it('renders paper stage and summary for paper lessons', async () => {
  render(<LessonWorkspace selectedLessonId={paperSession.id} />)

  expect(await screen.findByText('当前论文阶段')).toBeTruthy()
  expect(screen.getByText('问题定位')).toBeTruthy()
  expect(screen.getByText('The learner is still orienting around the paper.')).toBeTruthy()
})

it('does not render paper metadata for standard lessons', async () => {
  render(<LessonWorkspace selectedLessonId={session.id} />)

  expect(await screen.findByRole('heading', { name: '课堂' })).toBeTruthy()
  expect(screen.queryByText('当前论文阶段')).toBeNull()
})
```

Add to `apps/desktop/src/main/ipc/lesson-handlers.test.ts` a start request payload that includes:

```ts
lessonMode: 'paper'
```

- [ ] **Step 2: Run the desktop tests to verify RED**

Run:

```bash
pnpm vitest apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
```

Expected: FAIL because the desktop layer does not yet expose or render paper metadata.

- [ ] **Step 3: Implement the desktop wiring**

In `apps/desktop/src/main/ipc/lesson-handlers.ts` and `apps/desktop/src/preload/index.ts`, make sure lesson start requests simply pass through the optional `lessonMode` already defined in Contracts.

In `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`, add paper-stage labels:

```ts
const paperStageLabels: Record<PaperReadingStageDto, string> = {
  orientation: '整体定位',
  problem_framing: '问题定位',
  method_intuition: '方法直觉',
  method_mechanics: '方法细节',
  evidence_check: '证据核验',
  critical_review: '批判审视',
  transfer: '迁移延伸',
  synthesis: '复盘整合',
}
```

Render for paper lessons only:

```tsx
{
  session.lessonMode === 'paper' && session.paperProfile !== null ? (
    <section className="lesson-paper-stage">
      <h3>当前论文阶段</h3>
      <p>{paperStageLabels[session.paperProfile.currentStage]}</p>
      {session.paperProfile.stageSummary !== null ? (
        <p>{session.paperProfile.stageSummary}</p>
      ) : null}
    </section>
  ) : null
}
```

- [ ] **Step 4: Run the desktop tests to verify GREEN**

Run:

```bash
pnpm vitest apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
```

Expected: PASS with paper metadata correctly flowing through and rendering.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/desktop/src/main/ipc/lesson-handlers.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
git commit -m "feat: surface paper lesson mode in desktop app"
```

Expected: a commit containing the IPC/preload/renderer changes.

### Task 5: E2E, verification, and status docs

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Write the failing E2E test**

Add to `tests/e2e/app.spec.ts`:

```ts
test('starts a paper lesson, advances the paper stage, and restores it after restart', async ({
  page,
  electronApp,
}) => {
  await page.getByRole('button', { name: '粘贴文本' }).click()
  await page.getByLabel('标题').fill('Paper Map')
  await page.getByLabel('正文').fill('Why What How Evidence Limits Next')
  await page.getByRole('combobox', { name: '文档类型' }).selectOption('paper')
  await page.getByRole('button', { name: '保存文档' }).click()

  await page.getByRole('button', { name: '开始课堂' }).click()
  await expect(page.getByText('当前论文阶段')).toBeVisible()
  await expect(page.getByText('整体定位')).toBeVisible()

  await page
    .getByLabel('你的回答')
    .fill('I think the paper is solving how evidence supports model behavior.')
  await page.getByRole('button', { name: '提交回答' }).click()

  await expect(page.getByText('问题定位')).toBeVisible()

  await electronApp.restart()

  await page.getByRole('link', { name: '课堂' }).click()
  await page.getByRole('button', { name: '打开 Paper Map 课堂' }).click()
  await expect(page.getByText('问题定位')).toBeVisible()
})
```

- [ ] **Step 2: Run the focused E2E to verify RED**

Run:

```bash
pnpm test:e2e -- --grep "starts a paper lesson, advances the paper stage, and restores it after restart"
```

Expected: FAIL because paper mode UI and persistence are not implemented yet.

- [ ] **Step 3: Update status docs after green implementation**

When the code is green, update:

- `docs/planning/current-status.md`
- `docs/planning/software-design-completion-roadmap.md`

Make these edits:

```md
- 当前阶段：Phase 7 D7 Paper Lesson Mode MVP
- 状态：D7 Paper Lesson Mode MVP 已完成
```

and in the roadmap mark D7 as completed while moving the next-stage focus to paper cards / release candidate.

- [ ] **Step 4: Run the full verification gate**

Run:

```bash
pnpm check
pnpm test:e2e
```

Expected:

- `pnpm check` exits `0`
- `pnpm test:e2e` reports the existing suite green, with the packaged test skipped unless the packaged build precondition is satisfied

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "test: verify paper lesson mode end to end"
```

Expected: a commit containing the final E2E coverage and status doc updates.

## Self-review checklist

- Spec coverage:
  - Unified reading bottom layer is covered by Tasks 1-4 through `lessonMode` and `paperProfile` on the existing lesson aggregate.
  - Paper-specific first question and follow-up behavior is covered by Task 2.
  - SQLite persistence and legacy compatibility are covered by Task 3.
  - Desktop rendering and restart persistence are covered by Tasks 4-5.
  - Status documentation is covered by Task 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or “similar to previous task” placeholders remain.
  - Every task includes exact file paths, commands, and representative code to anchor implementation.
- Type consistency:
  - `lessonMode`, `paperProfile`, and `PaperReadingStage` are named consistently across Domain, Contracts, Application, Infrastructure, and Renderer.
