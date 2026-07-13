# Mastery Evidence MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the D6-MVP learning diagnosis loop: successful learner replies produce persisted MasteryEvidence, optional MisconceptionSignal, and desktop-visible “学习诊断”.

**Architecture:** Extend the existing lesson aggregate returned by `LessonRepositoryPort` and lesson IPC DTOs. Keep diagnosis deterministic in Application for this MVP, persist it in SQLite alongside lessons, and render it in `LessonWorkspace` without adding new IPC channels.

**Tech Stack:** TypeScript, Zod contracts, Vitest, better-sqlite3 migrations/repository, Electron renderer React, Playwright E2E.

---

## File structure

- Modify `packages/domain/src/lesson.ts`: add mastery/misconception types and normalizers.
- Modify `packages/domain/src/lesson.test.ts`: add TDD coverage for normalizers.
- Modify `packages/contracts/src/lesson.ts`: add DTO schemas and include arrays in `lessonSessionSchema`.
- Modify `packages/contracts/src/lesson.test.ts`: extend fixtures and schema tests.
- Modify `packages/contracts/src/provider.test.ts`, `apps/desktop/src/preload/index.test.ts`, `apps/desktop/src/main/ipc/lesson-handlers.test.ts`, `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: update lesson fixtures with empty or populated diagnosis arrays.
- Modify `packages/application/src/lesson-ports.ts`: extend `StoredLessonSession`.
- Modify `packages/application/src/lesson-use-cases.ts`: generate mastery evidence on successful reply/retry.
- Modify `packages/application/src/lesson-use-cases.test.ts`: test normal, short, stuck, failure/cancel, retry cases.
- Modify `packages/infrastructure/src/database/migrations.ts` and `.test.ts`: add Migration 13.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.ts` and `.test.ts`: map/save/read diagnosis tables.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx` and `apps/desktop/src/renderer/src/styles/global.css`: render diagnosis.
- Modify `tests/e2e/app.spec.ts`: assert diagnosis after reply and after restart.
- Modify docs: `docs/planning/current-status.md`, `docs/planning/software-design-completion-roadmap.md`, `docs/database/database_schema.md`.

---

## Task 1: Domain and Contracts models

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.test.ts`
- Modify fixtures in `packages/contracts/src/provider.test.ts`, `apps/desktop/src/preload/index.test.ts`, `apps/desktop/src/main/ipc/lesson-handlers.test.ts`

- [ ] **Step 1: Write failing Domain tests**

Add to `packages/domain/src/lesson.test.ts`:

```ts
import { normalizeMasteryEvidence, normalizeMisconceptionSignal } from './lesson'

it('normalizes mastery evidence with confidence bounds', () => {
  expect(
    normalizeMasteryEvidence({
      id: '00000000-0000-4000-8000-000000000801',
      lessonId: '00000000-0000-4000-8000-000000000101',
      stepId: '00000000-0000-4000-8000-000000000701',
      learnerMessageId: '00000000-0000-4000-8000-000000000402',
      tutorMessageId: '00000000-0000-4000-8000-000000000403',
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 0.55,
      rationale: 'Learner connected the answer to the cited evidence.',
      suggestedReview: false,
      createdAt: '2026-07-11T00:01:00.000Z',
    }).rationale,
  ).toBe('Learner connected the answer to the cited evidence.')

  expect(() =>
    normalizeMasteryEvidence({
      id: '00000000-0000-4000-8000-000000000801',
      lessonId: '00000000-0000-4000-8000-000000000101',
      stepId: '00000000-0000-4000-8000-000000000701',
      learnerMessageId: '00000000-0000-4000-8000-000000000402',
      tutorMessageId: '00000000-0000-4000-8000-000000000403',
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 1.1,
      rationale: 'Too high confidence.',
      suggestedReview: false,
      createdAt: '2026-07-11T00:01:00.000Z',
    }),
  ).toThrow('Mastery confidence is invalid')
})

it('normalizes misconception signals with safe labels', () => {
  expect(
    normalizeMisconceptionSignal({
      id: '00000000-0000-4000-8000-000000000901',
      evidenceId: '00000000-0000-4000-8000-000000000801',
      lessonId: '00000000-0000-4000-8000-000000000101',
      label: '学习者表达卡住',
      severity: 'medium',
      rationale: 'Learner explicitly said they were stuck.',
      createdAt: '2026-07-11T00:01:00.000Z',
    }).severity,
  ).toBe('medium')

  expect(() =>
    normalizeMisconceptionSignal({
      id: '00000000-0000-4000-8000-000000000901',
      evidenceId: '00000000-0000-4000-8000-000000000801',
      lessonId: '00000000-0000-4000-8000-000000000101',
      label: '',
      severity: 'medium',
      rationale: 'Missing label.',
      createdAt: '2026-07-11T00:01:00.000Z',
    }),
  ).toThrow('Misconception label is required')
})
```

- [ ] **Step 2: Run Domain tests to verify RED**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: FAIL because `normalizeMasteryEvidence` and `normalizeMisconceptionSignal` do not exist.

- [ ] **Step 3: Implement Domain models**

In `packages/domain/src/lesson.ts`, add const arrays and exported types near the existing lesson enums:

```ts
export const MASTERY_EVIDENCE_KINDS = ['teach_back', 'stuck_signal', 'self_report'] as const
export const MASTERY_JUDGEMENTS = ['insufficient', 'partial_understanding', 'needs_review'] as const
export const MISCONCEPTION_SEVERITIES = ['low', 'medium', 'high'] as const

export type MasteryEvidenceKind = (typeof MASTERY_EVIDENCE_KINDS)[number]
export type MasteryJudgement = (typeof MASTERY_JUDGEMENTS)[number]
export type MisconceptionSeverity = (typeof MISCONCEPTION_SEVERITIES)[number]
```

Add to `LessonSession`:

```ts
masteryEvidence: readonly MasteryEvidence[]
misconceptionSignals: readonly MisconceptionSignal[]
```

Add types:

```ts
export type MasteryEvidence = Readonly<{
  id: string
  lessonId: string
  stepId: string
  learnerMessageId: string
  tutorMessageId: string
  kind: MasteryEvidenceKind
  judgement: MasteryJudgement
  confidence: number
  rationale: string
  suggestedReview: boolean
  createdAt: string
}>

export type MisconceptionSignal = Readonly<{
  id: string
  evidenceId: string
  lessonId: string
  label: string
  severity: MisconceptionSeverity
  rationale: string
  createdAt: string
}>
```

Add helper assertions using the existing `includes`, `assertUuid`, and `normalizeNonBlank` patterns:

```ts
const assertMasteryEvidenceKind = (kind: MasteryEvidenceKind): void => {
  if (!includes(MASTERY_EVIDENCE_KINDS, kind)) throw new Error('Mastery evidence kind is invalid')
}

const assertMasteryJudgement = (judgement: MasteryJudgement): void => {
  if (!includes(MASTERY_JUDGEMENTS, judgement)) throw new Error('Mastery judgement is invalid')
}

const assertMisconceptionSeverity = (severity: MisconceptionSeverity): void => {
  if (!includes(MISCONCEPTION_SEVERITIES, severity)) {
    throw new Error('Misconception severity is invalid')
  }
}

export const normalizeMasteryEvidence = (evidence: MasteryEvidence): MasteryEvidence => {
  assertUuid(evidence.id, 'Mastery evidence id is invalid')
  assertUuid(evidence.lessonId, 'Lesson id is invalid')
  assertUuid(evidence.stepId, 'Lesson step id is invalid')
  assertUuid(evidence.learnerMessageId, 'Learner message id is invalid')
  assertUuid(evidence.tutorMessageId, 'Tutor message id is invalid')
  assertMasteryEvidenceKind(evidence.kind)
  assertMasteryJudgement(evidence.judgement)
  if (evidence.confidence < 0 || evidence.confidence > 1) {
    throw new Error('Mastery confidence is invalid')
  }
  return {
    ...evidence,
    rationale: normalizeNonBlank(evidence.rationale, 'Mastery rationale is required').slice(0, 280),
  }
}

export const normalizeMisconceptionSignal = (signal: MisconceptionSignal): MisconceptionSignal => {
  assertUuid(signal.id, 'Misconception signal id is invalid')
  assertUuid(signal.evidenceId, 'Mastery evidence id is invalid')
  assertUuid(signal.lessonId, 'Lesson id is invalid')
  assertMisconceptionSeverity(signal.severity)
  return {
    ...signal,
    label: normalizeNonBlank(signal.label, 'Misconception label is required').slice(0, 80),
    rationale: normalizeNonBlank(signal.rationale, 'Misconception rationale is required').slice(
      0,
      280,
    ),
  }
}
```

If `assertUuid` is not currently exported or named differently, reuse the existing internal UUID validation style in `lesson.ts`.

- [ ] **Step 4: Run Domain tests to verify GREEN**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Write failing Contract tests**

Update `packages/contracts/src/lesson.test.ts` fixture with:

```ts
const masteryEvidenceId = '00000000-0000-4000-8000-000000000801'
const misconceptionSignalId = '00000000-0000-4000-8000-000000000901'
```

Add to `session`:

```ts
masteryEvidence: [
  {
    id: masteryEvidenceId,
    lessonId,
    stepId,
    learnerMessageId: '00000000-0000-4000-8000-000000000402',
    tutorMessageId: messageId,
    kind: 'teach_back',
    judgement: 'partial_understanding',
    confidence: 0.55,
    rationale: 'Learner connected the answer to the cited evidence.',
    suggestedReview: false,
    createdAt: '2026-07-11T00:01:00.000Z',
  },
],
misconceptionSignals: [
  {
    id: misconceptionSignalId,
    evidenceId: masteryEvidenceId,
    lessonId,
    label: '学习者表达卡住',
    severity: 'medium',
    rationale: 'Learner explicitly said they were stuck.',
    createdAt: '2026-07-11T00:01:00.000Z',
  },
],
```

Add assertions:

```ts
expect(lessonSessionSchema.parse(session).masteryEvidence).toHaveLength(1)
expect(
  lessonSessionSchema.safeParse({
    ...session,
    masteryEvidence: [{ ...session.masteryEvidence[0], confidence: 2 }],
  }).success,
).toBe(false)
```

- [ ] **Step 6: Run Contract tests to verify RED**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts --run
```

Expected: FAIL because contract schemas do not include mastery fields yet.

- [ ] **Step 7: Implement Contract schemas**

In `packages/contracts/src/lesson.ts`, add:

```ts
export const masteryEvidenceKindSchema = z.enum(['teach_back', 'stuck_signal', 'self_report'])
export const masteryJudgementSchema = z.enum([
  'insufficient',
  'partial_understanding',
  'needs_review',
])
export const misconceptionSeveritySchema = z.enum(['low', 'medium', 'high'])

export const lessonMasteryEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    stepId: z.string().uuid(),
    learnerMessageId: z.string().uuid(),
    tutorMessageId: z.string().uuid(),
    kind: masteryEvidenceKindSchema,
    judgement: masteryJudgementSchema,
    confidence: z.number().min(0).max(1),
    rationale: requiredTextSchema.max(280),
    suggestedReview: z.boolean(),
    createdAt: timestampSchema,
  })
  .strict()

export const lessonMisconceptionSignalSchema = z
  .object({
    id: z.string().uuid(),
    evidenceId: z.string().uuid(),
    lessonId: lessonIdSchema,
    label: requiredTextSchema.max(80),
    severity: misconceptionSeveritySchema,
    rationale: requiredTextSchema.max(280),
    createdAt: timestampSchema,
  })
  .strict()
```

Add to `lessonSessionSchema`:

```ts
masteryEvidence: z.array(lessonMasteryEvidenceSchema),
misconceptionSignals: z.array(lessonMisconceptionSignalSchema),
```

Export DTO types:

```ts
export type LessonMasteryEvidenceDto = z.infer<typeof lessonMasteryEvidenceSchema>
export type LessonMisconceptionSignalDto = z.infer<typeof lessonMisconceptionSignalSchema>
```

Update all affected lesson fixtures in contracts/preload/main tests by adding:

```ts
masteryEvidence: [],
misconceptionSignals: [],
```

- [ ] **Step 8: Run Contract and typecheck**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts packages/contracts/src/provider.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts --run
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts packages/contracts/src/provider.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts
git commit -m "feat: add mastery evidence contracts"
```

---

## Task 2: SQLite persistence

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

- [ ] **Step 1: Write failing migration tests**

In `packages/infrastructure/src/database/migrations.test.ts`, extend the expected migration list with:

```ts
{ version: 13, name: 'lesson_mastery_evidence' }
```

Add assertions after applying migrations:

```ts
expect(
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lesson_mastery_evidence'")
    .get(),
).toEqual({ name: 'lesson_mastery_evidence' })
expect(
  db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='lesson_misconception_signals'",
    )
    .get(),
).toEqual({ name: 'lesson_misconception_signals' })
```

Add a constraint test:

```ts
expect(() =>
  db
    .prepare(
      `INSERT INTO lesson_mastery_evidence
       (id,lesson_id,step_id,learner_message_id,tutor_message_id,kind,judgement,confidence,rationale,suggested_review,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      '00000000-0000-4000-8000-000000000801',
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000701',
      '00000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000403',
      'teach_back',
      'partial_understanding',
      2,
      'Invalid confidence.',
      0,
      '2026-07-11T00:01:00.000Z',
    ),
).toThrow()
```

- [ ] **Step 2: Run migration tests to verify RED**

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts --run
```

Expected: FAIL because Migration 13 does not exist.

- [ ] **Step 3: Implement Migration 13**

In `packages/infrastructure/src/database/migrations.ts`, add SQL:

```ts
const LESSON_MASTERY_EVIDENCE_SQL = `
CREATE TABLE lesson_mastery_evidence (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 step_id TEXT NOT NULL REFERENCES lesson_steps(id) ON DELETE CASCADE,
 learner_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE,
 tutor_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('teach_back','stuck_signal','self_report')),
 judgement TEXT NOT NULL CHECK (judgement IN ('insufficient','partial_understanding','needs_review')),
 confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
 rationale TEXT NOT NULL,
 suggested_review INTEGER NOT NULL CHECK (suggested_review IN (0,1)),
 created_at TEXT NOT NULL,
 UNIQUE(tutor_message_id)
);
CREATE INDEX lesson_mastery_evidence_lesson_created ON lesson_mastery_evidence(lesson_id, created_at);
CREATE INDEX lesson_mastery_evidence_step ON lesson_mastery_evidence(step_id);
CREATE TABLE lesson_misconception_signals (
 id TEXT PRIMARY KEY,
 evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
 rationale TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(evidence_id, label)
);
CREATE INDEX lesson_misconception_signals_lesson_created ON lesson_misconception_signals(lesson_id, created_at);`
```

Append migration:

```ts
{ version: 13, name: 'lesson_mastery_evidence', sql: LESSON_MASTERY_EVIDENCE_SQL }
```

- [ ] **Step 4: Run migration tests to verify GREEN**

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts --run
```

Expected: PASS.

- [ ] **Step 5: Write failing repository tests**

In `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`, extend a saved session fixture with one mastery evidence and one signal, then assert:

```ts
const stored = await repository.create(sessionWithMastery)
expect(stored.masteryEvidence).toHaveLength(1)
expect(stored.misconceptionSignals).toHaveLength(1)

const reloaded = await repository.findById(sessionWithMastery.id)
expect(reloaded?.masteryEvidence[0]?.judgement).toBe('needs_review')
expect(reloaded?.misconceptionSignals[0]?.label).toBe('学习者表达卡住')
```

Add a rewrite test:

```ts
await repository.save({ ...sessionWithMastery, masteryEvidence: [], misconceptionSignals: [] })
const reloaded = await repository.findById(sessionWithMastery.id)
expect(reloaded?.masteryEvidence).toEqual([])
expect(reloaded?.misconceptionSignals).toEqual([])
```

- [ ] **Step 6: Run repository tests to verify RED**

```bash
pnpm vitest packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
```

Expected: FAIL because repository does not read/write the new tables.

- [ ] **Step 7: Implement repository mapping**

In `packages/application/src/lesson-ports.ts`, import Domain types and add:

```ts
export type StoredMasteryEvidence = MasteryEvidence
export type StoredMisconceptionSignal = MisconceptionSignal
```

Extend `StoredLessonSession`:

```ts
masteryEvidence: readonly StoredMasteryEvidence[]
misconceptionSignals: readonly StoredMisconceptionSignal[]
```

In `sqlite-lesson-repository.ts`:

- Add row types `MasteryEvidenceRow` and `MisconceptionSignalRow`.
- Add `mapMasteryEvidence(row)` and `mapMisconceptionSignal(row)`.
- Update `mapSession` signature to receive both arrays.
- Add `masteryEvidenceFor(lessonIds)` and `misconceptionSignalsFor(lessonIds)` queries ordered by `lesson_id,created_at,id`.
- In `list()` and `findById()`, load both maps and pass them to `mapSession`.
- In `create()` and `save()`, insert rows after steps:

```ts
const insertEvidence = this.db.prepare(
  `INSERT INTO lesson_mastery_evidence
   (id,lesson_id,step_id,learner_message_id,tutor_message_id,kind,judgement,confidence,rationale,suggested_review,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
)
for (const evidence of session.masteryEvidence) {
  insertEvidence.run(
    evidence.id,
    evidence.lessonId,
    evidence.stepId,
    evidence.learnerMessageId,
    evidence.tutorMessageId,
    evidence.kind,
    evidence.judgement,
    evidence.confidence,
    evidence.rationale,
    evidence.suggestedReview ? 1 : 0,
    evidence.createdAt,
  )
}
```

For `save()`, delete in child-to-parent order:

```sql
DELETE FROM lesson_misconception_signals WHERE lesson_id=?
DELETE FROM lesson_mastery_evidence WHERE lesson_id=?
```

Then reinsert evidence first, signals second.

- [ ] **Step 8: Run repository tests and typecheck**

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/application/src/lesson-ports.ts packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts
git commit -m "feat: persist mastery evidence"
```

---

## Task 3: Application diagnosis generation

**Files:**

- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write failing application tests**

In `packages/application/src/lesson-use-cases.test.ts`, update fake fixtures with `masteryEvidence: []` and `misconceptionSignals: []`.

Add tests:

```ts
it('records partial understanding mastery evidence after a successful reply', async () => {
  const started = await startUseCase.execute(startDraft)
  lessonRepository.records.set(started.id, started)

  const updated = await submitUseCase.execute({
    lessonId: started.id,
    content: '它在说明证据如何支撑判断。',
    operationId,
  })

  expect(updated.masteryEvidence).toHaveLength(1)
  expect(updated.masteryEvidence[0]).toMatchObject({
    kind: 'teach_back',
    judgement: 'partial_understanding',
    confidence: 0.55,
    suggestedReview: false,
  })
  expect(updated.misconceptionSignals).toEqual([])
})

it('records suggested review for short learner replies', async () => {
  const started = await startUseCase.execute(startDraft)
  const updated = await submitUseCase.execute({
    lessonId: started.id,
    content: '不太懂',
    operationId,
  })

  expect(updated.masteryEvidence[0]).toMatchObject({
    kind: 'stuck_signal',
    judgement: 'needs_review',
    confidence: 0.75,
    suggestedReview: true,
  })
  expect(updated.misconceptionSignals[0]).toMatchObject({
    label: '学习者表达卡住',
    severity: 'medium',
  })
})
```

Add failure/cancel assertion to existing tests:

```ts
expect(updated.masteryEvidence).toEqual([])
expect(updated.misconceptionSignals).toEqual([])
```

Add retry success assertion:

```ts
expect(retried.masteryEvidence.at(-1)?.tutorMessageId).toBe(retryMessageId)
```

- [ ] **Step 2: Run application tests to verify RED**

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
```

Expected: FAIL because use cases do not create mastery evidence.

- [ ] **Step 3: Implement deterministic classifier**

In `lesson-use-cases.ts`, import `normalizeMasteryEvidence`, `normalizeMisconceptionSignal`, and Domain types.

Add helpers near existing lesson step helpers:

```ts
const STUCK_REPLY_PATTERN = /不会|不懂|卡住|不知道|help|stuck|confused/iu

const classifyMasteryEvidence = (input: {
  evidenceId: string
  signalId: string
  lessonId: string
  stepId: string
  learnerMessageId: string
  tutorMessageId: string
  learnerReply: string
  createdAt: string
}): Readonly<{
  evidence: StoredMasteryEvidence
  signal: StoredMisconceptionSignal | null
}> => {
  const normalizedReply = input.learnerReply.trim()
  if (STUCK_REPLY_PATTERN.test(normalizedReply)) {
    const evidence = normalizeMasteryEvidence({
      id: input.evidenceId,
      lessonId: input.lessonId,
      stepId: input.stepId,
      learnerMessageId: input.learnerMessageId,
      tutorMessageId: input.tutorMessageId,
      kind: 'stuck_signal',
      judgement: 'needs_review',
      confidence: 0.75,
      rationale: 'Learner explicitly signaled they are stuck or unsure.',
      suggestedReview: true,
      createdAt: input.createdAt,
    })
    return {
      evidence,
      signal: normalizeMisconceptionSignal({
        id: input.signalId,
        evidenceId: evidence.id,
        lessonId: input.lessonId,
        label: '学习者表达卡住',
        severity: 'medium',
        rationale: 'Learner used language that indicates confusion or being stuck.',
        createdAt: input.createdAt,
      }),
    }
  }

  if (normalizedReply.length < 12) {
    return {
      evidence: normalizeMasteryEvidence({
        id: input.evidenceId,
        lessonId: input.lessonId,
        stepId: input.stepId,
        learnerMessageId: input.learnerMessageId,
        tutorMessageId: input.tutorMessageId,
        kind: 'teach_back',
        judgement: 'insufficient',
        confidence: 0.65,
        rationale: 'Learner reply was too short to show stable understanding.',
        suggestedReview: true,
        createdAt: input.createdAt,
      }),
      signal: null,
    }
  }

  return {
    evidence: normalizeMasteryEvidence({
      id: input.evidenceId,
      lessonId: input.lessonId,
      stepId: input.stepId,
      learnerMessageId: input.learnerMessageId,
      tutorMessageId: input.tutorMessageId,
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 0.55,
      rationale: 'Learner gave a source-grounded answer that can support follow-up.',
      suggestedReview: false,
      createdAt: input.createdAt,
    }),
    signal: null,
  }
}
```

- [ ] **Step 4: Generate evidence in successful reply/retry**

In `SubmitLessonReply` success path after tutor message and succeeded step are known:

```ts
const diagnosis = classifyMasteryEvidence({
  evidenceId: this.ids.next(),
  signalId: this.ids.next(),
  lessonId: session.id,
  stepId: modelRunId,
  learnerMessageId,
  tutorMessageId,
  learnerReply: content,
  createdAt,
})
```

Append to saved session:

```ts
masteryEvidence: [...session.masteryEvidence, diagnosis.evidence],
misconceptionSignals:
  diagnosis.signal === null
    ? session.misconceptionSignals
    : [...session.misconceptionSignals, diagnosis.signal],
```

In `RetryLessonRun`, locate the learner message immediately before the failed/cancelled run’s position, or by nearest previous learner message in `session.messages`. If no learner message is found, skip diagnosis. If found and the tutor message ID has no existing evidence, append diagnosis. Use `tutorMessageId` uniqueness at application level:

```ts
const alreadyDiagnosed = session.masteryEvidence.some(
  (evidence) => evidence.tutorMessageId === tutorMessageId,
)
```

- [ ] **Step 5: Run application tests and typecheck**

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: record mastery evidence for lesson replies"
```

---

## Task 4: Renderer diagnosis display

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write failing renderer tests**

In `LessonWorkspace.test.tsx`, add mastery evidence and signal to `repliedSession`.

Add assertions after reply:

```ts
expect(await screen.findByText('学习诊断')).toBeTruthy()
expect(screen.getByText('部分理解 · 55%')).toBeTruthy()
expect(
  screen.getByText('Learner gave a source-grounded answer that can support follow-up.'),
).toBeTruthy()
```

Add historical fallback test:

```ts
const undiagnosedSession = { ...session, masteryEvidence: [], misconceptionSignals: [] }
// mock list/get with undiagnosedSession
expect(await screen.findByText('还没有学习诊断。')).toBeTruthy()
```

Add stuck signal fixture and assertion:

```ts
expect(screen.getByText('可能误区：学习者表达卡住 · medium')).toBeTruthy()
```

- [ ] **Step 2: Run renderer tests to verify RED**

```bash
pnpm vitest apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
```

Expected: FAIL because UI does not render diagnosis.

- [ ] **Step 3: Implement renderer labels and UI**

In `LessonWorkspace.tsx`, add labels:

```ts
const masteryJudgementLabels = {
  insufficient: '证据不足',
  partial_understanding: '部分理解',
  needs_review: '建议复习',
} as const
```

Add helper:

```ts
const latestMasteryEvidence = (session: LessonSessionDto) =>
  [...session.masteryEvidence].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0]
```

Render between run list and reply form:

```tsx
<div className="lesson-diagnosis">
  <h3>学习诊断</h3>
  {latestEvidence === undefined ? (
    <p className="muted-state">还没有学习诊断。</p>
  ) : (
    <article className="lesson-diagnosis-card">
      <p>
        {masteryJudgementLabels[latestEvidence.judgement]} ·{' '}
        {Math.round(latestEvidence.confidence * 100)}%
      </p>
      <footer>{latestEvidence.rationale}</footer>
      {latestEvidence.suggestedReview && <span className="status-label">建议加入后续复习</span>}
      {detailState.session.misconceptionSignals
        .filter((signal) => signal.evidenceId === latestEvidence.id)
        .map((signal) => (
          <p key={signal.id} className="lesson-misconception">
            可能误区：{signal.label} · {signal.severity}
          </p>
        ))}
    </article>
  )}
</div>
```

Use a local const inside `detailState.status === 'ready'` render block if needed.

Add CSS:

```css
.lesson-diagnosis {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.lesson-diagnosis h3 {
  margin: 0;
}

.lesson-diagnosis-card {
  padding: 12px;
  border: 1px solid rgb(74 139 104 / 24%);
  border-radius: 12px;
  background: rgb(255 255 255 / 72%);
}

.lesson-diagnosis-card p {
  margin: 0;
  font-weight: 700;
}

.lesson-diagnosis-card footer,
.lesson-misconception {
  margin-top: 8px;
  color: #65766d;
  font-size: 0.84rem;
}
```

- [ ] **Step 4: Run renderer tests and typecheck**

```bash
pnpm vitest apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: show lesson mastery diagnosis"
```

---

## Task 5: E2E and documentation

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Modify: `docs/database/database_schema.md`

- [ ] **Step 1: Write failing E2E assertions**

In `tests/e2e/app.spec.ts`, after submitting a normal answer and seeing follow-up:

```ts
await expect(page.getByText('学习诊断')).toBeVisible()
await expect(page.getByText('部分理解 · 55%')).toBeVisible()
```

After restart and opening the same lesson:

```ts
await expect(page.getByText('部分理解 · 55%')).toBeVisible()
```

In the chunk-missing follow-up path, if the learner reply is normal, assert diagnosis remains visible:

```ts
await expect(page.getByText('部分理解 · 55%')).toBeVisible()
```

- [ ] **Step 2: Run E2E to verify RED or pending integration**

If Task 4 is complete, this may already pass. Run:

```bash
pnpm test:e2e
```

Expected before implementation: FAIL because diagnosis is not yet rendered/persisted. Expected after previous tasks: PASS.

- [ ] **Step 3: Update docs**

Update `docs/planning/current-status.md`:

- Current phase becomes `Phase 6 D6 Mastery Evidence / Misconception MVP`.
- Add completed bullets for Domain/Contracts, Migration 13, Application deterministic diagnosis, Renderer, E2E.
- Next step becomes ReviewItem / ReviewEvent / scheduling.

Update `docs/planning/software-design-completion-roadmap.md`:

- Mark D6-MVP as completed.
- Clarify remaining D6 work: ReviewItem / ReviewEvent / scheduler.

Update `docs/database/database_schema.md`:

- Add current implementation section for Migration 13.
- Document `lesson_mastery_evidence` and `lesson_misconception_signals`.

- [ ] **Step 4: Run full gates**

```bash
pnpm format
pnpm check
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/database/database_schema.md
git commit -m "test: cover mastery diagnosis flow"
```

---

## Task 6: Final verification and push

**Files:** none expected beyond committed changes.

- [ ] **Step 1: Verify clean gates**

Run:

```bash
pnpm check
pnpm test:e2e
git status --short --branch
```

Expected:

- `pnpm check` PASS.
- `pnpm test:e2e` PASS with packaged persistence skipped unless package exists.
- `git status` shows branch ahead of origin and no uncommitted changes.

- [ ] **Step 2: Push**

```bash
git push
```

Expected: `main -> main`.

---

## Self-review

- Spec coverage:
  - Domain normalizers: Task 1.
  - Contracts DTO arrays: Task 1.
  - Migration 13 and repository persistence: Task 2.
  - Deterministic diagnosis on reply/retry: Task 3.
  - No evidence on failure/cancel: Task 3.
  - Renderer display/fallback: Task 4.
  - E2E and docs: Task 5.
- Placeholder scan: no unresolved placeholder language remains.
- Type consistency:
  - Uses `masteryEvidence` and `misconceptionSignals` consistently across Domain, Application, Contracts, Repository, and Renderer.
  - Uses `suggestedReview` in TypeScript and `suggested_review` in SQLite only.
  - Uses `tutorMessageId` uniqueness to prevent duplicate evidence on retry.
