# Lesson State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal application-owned TutorAction / LessonState state machine to DeepStorming lessons, with persisted steps, recoverable current state, and desktop visibility.

**Architecture:** Domain defines the legal lesson states, tutor action types, step model, and transition validation. Application use cases create started/succeeded/failed/cancelled steps alongside existing model runs and messages. SQLite persists `lesson_sessions.current_state` and `lesson_steps`; Renderer only displays state/action metadata from contracts.

**Tech Stack:** TypeScript, Zod, SQLite migrations, React, Vitest, Playwright, pnpm monorepo.

---

## File map

- `packages/domain/src/lesson.ts`: add `LessonState`, `TutorAction`, `LessonStep`, normalization and transition helpers.
- `packages/domain/src/lesson.test.ts`: cover legal and illegal transitions plus action/step validation.
- `packages/contracts/src/lesson.ts`: add DTO schemas for lesson state, tutor action type, lesson step, and include `currentState` / `steps` in `lessonSessionSchema`.
- `packages/contracts/src/lesson.test.ts`: cover contract validation and compatibility failures.
- `packages/application/src/lesson-ports.ts`: extend stored session and generator result shapes with state/action metadata.
- `packages/application/src/lesson-use-cases.ts`: create and update steps in start/reply/retry failure/cancellation flows.
- `packages/application/src/lesson-use-cases.test.ts`: cover state machine behavior at use-case level.
- `packages/infrastructure/src/database/migrations.ts`: add migration v12.
- `packages/infrastructure/src/database/migrations.test.ts`: verify new column/table/check constraints.
- `packages/infrastructure/src/database/sqlite-lesson-repository.ts`: map and persist steps and current state transactionally.
- `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`: cover create/read/save/list and historical compatibility.
- `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`: show current lesson state and action transition metadata.
- `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: renderer assertions.
- `tests/e2e/app.spec.ts`: desktop PDF lesson state machine assertions across restart.
- `docs/planning/current-status.md`: update D5 progress once implemented.
- `docs/planning/software-design-completion-roadmap.md`: mark D5 complete or partially complete according to final scope.

---

### Task 1: Add Domain and Contract state-machine models

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Test: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Test: `packages/contracts/src/lesson.test.ts`

- [ ] **Step 1: Write failing Domain tests for state/action/step validation.**

Add tests equivalent to:

```ts
expect(validateLessonStateTransition('opening', 'probing')).toBeUndefined()
expect(validateLessonStateTransition('probing', 'hinting')).toBeUndefined()
expect(() => validateLessonStateTransition('completed', 'probing')).toThrow(
  'Lesson state transition is invalid',
)

expect(
  normalizeTutorAction({
    actionType: 'ask',
    stateBefore: 'opening',
    stateAfter: 'probing',
    utterance: '你觉得这段证据想解决什么问题？',
    citedChunkIds: ['00000000-0000-4000-8000-000000000901'],
    rationale: 'Start with a source-grounded question.',
  }),
).toEqual(expect.objectContaining({ actionType: 'ask', stateAfter: 'probing' }))

expect(() =>
  normalizeLessonStep({
    id: '00000000-0000-4000-8000-000000000701',
    lessonId: '00000000-0000-4000-8000-000000000101',
    sequenceNo: 0,
    stateBefore: 'opening',
    stateAfter: 'completed',
    actionType: 'ask',
    status: 'succeeded',
    modelRunId: '00000000-0000-4000-8000-000000000501',
    messageId: '00000000-0000-4000-8000-000000000401',
    rationale: 'bad transition',
    errorSummary: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    finishedAt: '2026-07-13T00:00:00.000Z',
  }),
).toThrow('Lesson state transition is invalid')
```

- [ ] **Step 2: Write failing Contract tests for DTO schemas.**

Add assertions:

```ts
expect(
  lessonSessionSchema.parse({
    ...validLessonSession,
    currentState: 'probing',
    steps: [
      {
        id: '00000000-0000-4000-8000-000000000701',
        lessonId: validLessonSession.id,
        sequenceNo: 0,
        stateBefore: 'opening',
        stateAfter: 'probing',
        actionType: 'ask',
        status: 'succeeded',
        modelRunId: validLessonSession.modelRuns[0]!.id,
        messageId: validLessonSession.messages[0]!.id,
        rationale: 'Started with a source-grounded question.',
        errorSummary: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        finishedAt: '2026-07-13T00:00:00.000Z',
      },
    ],
  }).currentState,
).toBe('probing')

expect(() =>
  lessonStepSchema.parse({
    ...validLessonStep,
    status: 'succeeded',
    errorSummary: { code: 'INTERNAL_ERROR', message: 'bad', retryable: true },
  }),
).toThrow()
```

- [ ] **Step 3: Run focused tests and verify failure.**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts
```

Expected: FAIL because `LessonState`, `TutorAction`, `LessonStep`, `lessonStepSchema`, `currentState`, and `steps` do not exist yet.

- [ ] **Step 4: Implement minimal Domain models and helpers.**

Add:

```ts
export const LESSON_STATES = [
  'opening',
  'probing',
  'hinting',
  'explaining',
  'reflecting',
  'summarizing',
  'completed',
  'paused',
  'error',
] as const

export const TUTOR_ACTION_TYPES = ['ask', 'hint', 'explain', 'reflect', 'summarize'] as const
export const LESSON_STEP_STATUSES = ['started', 'succeeded', 'failed', 'cancelled'] as const

export type LessonState = (typeof LESSON_STATES)[number]
export type TutorActionType = (typeof TUTOR_ACTION_TYPES)[number]
export type LessonStepStatus = (typeof LESSON_STEP_STATUSES)[number]
```

Add a transition map:

```ts
const VALID_STATE_TRANSITIONS: ReadonlyMap<LessonState, readonly LessonState[]> = new Map([
  ['opening', ['probing', 'paused', 'error']],
  ['probing', ['probing', 'hinting', 'reflecting', 'summarizing', 'completed', 'paused', 'error']],
  ['hinting', ['probing', 'hinting', 'explaining', 'reflecting', 'summarizing', 'paused', 'error']],
  ['explaining', ['probing', 'reflecting', 'summarizing', 'paused', 'error']],
  ['reflecting', ['probing', 'summarizing', 'completed', 'paused', 'error']],
  ['summarizing', ['probing', 'completed', 'paused', 'error']],
  ['paused', ['opening', 'probing', 'hinting', 'explaining', 'reflecting', 'summarizing', 'error']],
  ['error', ['opening', 'probing', 'hinting', 'explaining', 'reflecting', 'summarizing']],
  ['completed', []],
])
```

Add `validateLessonStateTransition(before, after)`, `normalizeTutorAction(action)`, and `normalizeLessonStep(step)` using the existing UUID and non-blank helpers. Rules:

- Reject unknown states/action/status.
- Reject invalid transition.
- Reject blank `utterance` or `rationale`.
- Reject invalid `citedChunkIds`.
- `succeeded` step must have `messageId`, `rationale`, `finishedAt`, and `errorSummary === null`.
- `failed/cancelled` step must have `finishedAt`.
- `started` step must have `messageId === null`, `rationale === null`, `finishedAt === null`, `errorSummary === null`.

- [ ] **Step 5: Implement Contract schemas.**

Add Zod schemas:

```ts
export const lessonStateSchema = z.enum([
  'opening',
  'probing',
  'hinting',
  'explaining',
  'reflecting',
  'summarizing',
  'completed',
  'paused',
  'error',
])
export const tutorActionTypeSchema = z.enum(['ask', 'hint', 'explain', 'reflect', 'summarize'])
export const lessonStepStatusSchema = z.enum(['started', 'succeeded', 'failed', 'cancelled'])
```

Then define `lessonStepSchema` with the same fields as the Domain type and add:

```ts
currentState: lessonStateSchema,
steps: z.array(lessonStepSchema),
```

to `lessonSessionSchema`.

- [ ] **Step 6: Run focused tests and typecheck.**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: add lesson state machine models"
```

### Task 2: Persist lesson current state and steps in SQLite

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Test: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

- [ ] **Step 1: Write failing migration tests.**

Assert migration v12 exists and creates:

```ts
expect(MIGRATIONS.at(-1)).toMatchObject({
  version: 12,
  name: 'lesson_state_machine',
})

const sessionColumns = db.prepare("PRAGMA table_info('lesson_sessions')").all()
expect(sessionColumns.map((column) => column.name)).toContain('current_state')

const stepColumns = db.prepare("PRAGMA table_info('lesson_steps')").all()
expect(stepColumns.map((column) => column.name)).toEqual(
  expect.arrayContaining([
    'id',
    'lesson_id',
    'sequence_no',
    'state_before',
    'state_after',
    'action_type',
    'status',
    'model_run_id',
    'message_id',
    'rationale',
    'error_summary_json',
    'created_at',
    'finished_at',
  ]),
)
```

Also assert invalid action type/status inserts fail.

- [ ] **Step 2: Write failing repository tests.**

Extend the test fixture session with:

```ts
currentState: 'probing',
steps: [
  {
    id: '00000000-0000-4000-8000-000000000701',
    lessonId,
    sequenceNo: 0,
    stateBefore: 'opening',
    stateAfter: 'probing',
    actionType: 'ask',
    status: 'succeeded',
    modelRunId,
    messageId,
    rationale: 'Started with a source-grounded question.',
    errorSummary: null,
    createdAt,
    finishedAt: createdAt,
  },
],
```

Assert `create`, `findById`, `list`, and `save` round-trip `currentState` and `steps`, and that `save` replaces steps transactionally with deterministic `sequenceNo` ordering.

- [ ] **Step 3: Run focused infrastructure tests and verify failure.**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts
```

Expected: FAIL because migration and repository mapping do not exist.

- [ ] **Step 4: Extend application port session type.**

In `packages/application/src/lesson-ports.ts`, add:

```ts
import type { LessonStep, LessonState } from '@deepstorming/domain'

export type StoredLessonStep = LessonStep
```

and extend `StoredLessonSession`:

```ts
currentState: LessonState
steps: readonly StoredLessonStep[]
```

- [ ] **Step 5: Add migration v12.**

Add SQL:

```sql
ALTER TABLE lesson_sessions ADD COLUMN current_state TEXT NOT NULL DEFAULT 'opening'
  CHECK (current_state IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error'));

CREATE TABLE lesson_steps (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
 state_before TEXT NOT NULL CHECK (state_before IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error')),
 state_after TEXT NOT NULL CHECK (state_after IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error')),
 action_type TEXT NOT NULL CHECK (action_type IN ('ask','hint','explain','reflect','summarize')),
 status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','cancelled')),
 model_run_id TEXT NOT NULL REFERENCES lesson_model_runs(id) ON DELETE CASCADE,
 message_id TEXT REFERENCES lesson_messages(id) ON DELETE SET NULL,
 rationale TEXT,
 error_summary_json TEXT,
 created_at TEXT NOT NULL,
 finished_at TEXT,
 UNIQUE(lesson_id, sequence_no),
 CHECK (
   (status = 'succeeded' AND message_id IS NOT NULL AND rationale IS NOT NULL AND finished_at IS NOT NULL AND error_summary_json IS NULL)
   OR (status = 'started' AND message_id IS NULL AND rationale IS NULL AND finished_at IS NULL AND error_summary_json IS NULL)
   OR (status IN ('failed','cancelled') AND finished_at IS NOT NULL)
 )
);
CREATE INDEX lesson_steps_lesson_sequence ON lesson_steps(lesson_id, sequence_no);
CREATE INDEX lesson_steps_model_run ON lesson_steps(model_run_id);
```

- [ ] **Step 6: Map and persist steps.**

In `sqlite-lesson-repository.ts`:

- Add `current_state` to `LessonRow`.
- Add `StepRow` type.
- Add `mapStep(row): StoredLessonStep`.
- Add `stepsFor(lessonIds)` that queries `lesson_steps WHERE lesson_id IN (...) ORDER BY lesson_id,sequence_no,id`, maps each row with `mapStep`, groups rows in a `Map<string, StoredLessonStep[]>`, and returns an empty map for an empty input list.
- Update `mapSession` to include `currentState` and `steps`.
- Update `create` to insert `current_state` into `lesson_sessions` and insert each `lesson_steps` row after model runs/messages exist.
- Update `save` to `UPDATE lesson_sessions SET title=?,status=?,current_state=?,updated_at=? WHERE id=?`, delete `lesson_steps` before deleting model runs/messages, and reinsert steps after model runs/messages.

- [ ] **Step 7: Run focused tests and typecheck.**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add packages/application/src/lesson-ports.ts packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts
git commit -m "feat: persist lesson state machine steps"
```

### Task 3: Attach state-machine steps to lesson start and follow-up success/failure

**Files:**

- Modify: `packages/application/src/lesson-use-cases.ts`
- Test: `packages/application/src/lesson-use-cases.test.ts`
- Modify: `packages/application/src/lesson-ports.ts`
- Test: `packages/infrastructure/src/providers/openai-compatible-gateway.test.ts`

- [ ] **Step 1: Write failing application tests for start and normal reply.**

Assert:

```ts
const created = await startLesson.execute(validDraft)
expect(created.currentState).toBe('probing')
expect(created.steps).toEqual([
  expect.objectContaining({
    sequenceNo: 0,
    stateBefore: 'opening',
    stateAfter: 'probing',
    actionType: 'ask',
    status: 'succeeded',
    modelRunId: created.modelRuns[0]!.id,
    messageId: created.messages[0]!.id,
  }),
])

const replied = await submitReply.execute({
  lessonId: created.id,
  content: '我认为它在验证证据和结论之间的关系。',
})
expect(replied.currentState).toBe('probing')
expect(replied.steps.at(-1)).toMatchObject({
  sequenceNo: 1,
  stateBefore: 'probing',
  stateAfter: 'probing',
  actionType: 'ask',
  status: 'succeeded',
})
```

- [ ] **Step 2: Write failing tests for hint/explain routing and provider failure.**

Assert:

```ts
const hinting = await submitReply.execute({ lessonId, content: '我不懂，卡住了。' })
expect(hinting.currentState).toBe('hinting')
expect(hinting.steps.at(-1)).toMatchObject({ actionType: 'hint', stateAfter: 'hinting' })

await expect(failingSubmitReply.execute({ lessonId, content: '继续' })).rejects.toMatchObject({
  code: 'INTERNAL_ERROR',
})
const failed = await lessons.findById(lessonId)
expect(failed?.currentState).toBe('probing')
expect(failed?.steps.at(-1)).toMatchObject({
  stateBefore: 'probing',
  status: 'failed',
  errorSummary: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
})
```

- [ ] **Step 3: Run focused tests and verify failure.**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts
```

Expected: FAIL because steps/currentState are not produced.

- [ ] **Step 4: Extend generator result shape.**

In `lesson-ports.ts`, change `LessonTutorReplyResult` to:

```ts
export type LessonTutorReplyResult = Readonly<{
  content: string
  providerId: string | null
  modelName: string
  actionType?: TutorActionType
  stateAfter?: LessonState
  rationale?: string
}>
```

Keep the properties optional so provider gateways continue to compile while Application supplies defaults.

- [ ] **Step 5: Add application helpers.**

In `lesson-use-cases.ts`, add helpers:

```ts
const nextStepSequence = (session: StoredLessonSession): number => session.steps.length

const classifyTutorAction = (
  currentState: LessonState,
  learnerReply: string,
): Readonly<{ actionType: TutorActionType; stateAfter: LessonState; rationale: string }> => {
  const normalized = learnerReply.toLowerCase()
  const stuck = /不会|不懂|卡住|不知道|help|stuck|confused/u.test(normalized)
  const summary = /总结|小结|summarize|summary/u.test(normalized)
  const reflect = /复述|解释一下我理解|reflect/u.test(normalized)
  if (summary)
    return {
      actionType: 'summarize',
      stateAfter: 'summarizing',
      rationale: 'Learner requested a summary.',
    }
  if (reflect)
    return {
      actionType: 'reflect',
      stateAfter: 'reflecting',
      rationale: 'Learner requested reflection.',
    }
  if (stuck && currentState === 'hinting')
    return {
      actionType: 'explain',
      stateAfter: 'explaining',
      rationale: 'Learner remained stuck after a hint.',
    }
  if (stuck)
    return { actionType: 'hint', stateAfter: 'hinting', rationale: 'Learner signaled confusion.' }
  return {
    actionType: 'ask',
    stateAfter: currentState === 'opening' ? 'probing' : 'probing',
    rationale: 'Continue probing with source-grounded question.',
  }
}
```

Add `startedLessonStep`, `succeedLessonStep`, `failLessonStep`, and `cancelLessonStep` helpers that call Domain normalizers.

- [ ] **Step 6: Update `toView` and start flow.**

Include `currentState` and `steps` in `toView`.

In `StartLessonFromDocument`:

- Set new session `currentState: 'probing'`.
- Add one succeeded step:

```ts
steps: [
  normalizeLessonStep({
    id: stepId,
    lessonId: sessionId,
    sequenceNo: 0,
    stateBefore: 'opening',
    stateAfter: 'probing',
    actionType: 'ask',
    status: 'succeeded',
    modelRunId,
    messageId,
    rationale: 'Started with a source-grounded opening question.',
    errorSummary: null,
    createdAt,
    finishedAt: createdAt,
  }),
],
```

Generate `stepId` with `ids.generate()`.

- [ ] **Step 7: Update `SubmitLessonReply` success and failure flow.**

Before saving pending state:

- Classify action from `session.currentState` and learner content.
- Generate `stepId`.
- Add a `started` step with `stateBefore = session.currentState`, classified `stateAfter/actionType`, same `modelRunId`.
- Pending save includes learner message, started model run, started step, and unchanged `currentState`.

On generator failure:

- Mark run failed.
- Mark step failed.
- Keep `currentState` unchanged.

On success:

- Use `tutorReply.actionType/stateAfter/rationale` when provided, otherwise classified defaults.
- Validate transition via `normalizeTutorAction`.
- Save tutor message.
- Mark run succeeded.
- Mark step succeeded.
- Set `currentState = action.stateAfter`.

- [ ] **Step 8: Update provider/local generator compatibility.**

Update `localTutorReply` / `localTutorFirstQuestion` to return optional action metadata where convenient:

```ts
actionType: 'ask',
stateAfter: 'probing',
rationale: 'Local deterministic tutor question.',
```

OpenAI-compatible provider tests should continue to expect content/provider/model and not require action metadata.

- [ ] **Step 9: Run focused tests and typecheck.**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts packages/infrastructure/src/providers/openai-compatible-gateway.test.ts && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts packages/application/src/lesson-ports.ts packages/infrastructure/src/providers/openai-compatible-gateway.test.ts
git commit -m "feat: attach lesson steps to tutor turns"
```

### Task 4: Preserve state-machine semantics for retry and cancellation

**Files:**

- Modify: `packages/application/src/lesson-use-cases.ts`
- Test: `packages/application/src/lesson-use-cases.test.ts`
- Modify if needed: `apps/desktop/src/main/ipc/lesson-handlers.test.ts`

- [ ] **Step 1: Write failing retry tests.**

Create a lesson with a failed follow-up run/step, then retry:

```ts
const retried = await retryLessonRun.execute({ lessonId, modelRunId: failedRunId })
expect(retried.steps.find((step) => step.modelRunId === failedRunId)?.status).toBe('failed')
expect(retried.steps.at(-1)).toMatchObject({
  sequenceNo: previousStepCount,
  stateBefore: 'probing',
  status: 'succeeded',
  actionType: 'ask',
})
expect(retried.currentState).toBe('probing')
```

- [ ] **Step 2: Write failing cancellation tests.**

Using the existing delayed/cancellable generator, assert:

```ts
await expect(
  submitLessonReply.execute({
    lessonId,
    content: '继续',
    operationId,
  }),
).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

const cancelled = await lessons.findById(lessonId)
expect(cancelled?.currentState).toBe('probing')
expect(cancelled?.steps.at(-1)).toMatchObject({
  status: 'cancelled',
  stateBefore: 'probing',
  stateAfter: 'probing',
  errorSummary: expect.objectContaining({ code: 'OPERATION_CANCELLED' }),
})
```

- [ ] **Step 3: Run focused tests and verify failure.**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts
```

Expected: FAIL for retry/cancel step behavior.

- [ ] **Step 4: Update retry pending/success/failure.**

In `RetryLessonRun`:

- Do not reuse or modify the failed step.
- Classify next action from `session.currentState` and the saved learner message.
- Create a new started step with new modelRunId.
- On failure/cancel mark only the new step failed/cancelled.
- On success mark new step succeeded and set `currentState = action.stateAfter`.

- [ ] **Step 5: Distinguish cancellation from internal failure.**

When generator throws a `LessonUseCaseError` with `code === 'OPERATION_CANCELLED'`, use `cancelLessonStep` and `cancelModelRun` semantics. The existing `failModelRun` can be reused only if it already preserves `cancelled`; otherwise add a small `cancelModelRun` helper:

```ts
const cancelModelRun = (
  run: LessonModelRun,
  error: LessonUseCaseError,
  finishedAt: string,
): LessonModelRun => ({
  ...run,
  status: 'cancelled',
  errorSummary: toErrorSummary(error),
  finishedAt,
})
```

- [ ] **Step 6: Run focused tests and typecheck.**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts
git commit -m "fix: preserve lesson state on retry cancellation"
```

### Task 5: Display current state and step metadata in the desktop lesson UI

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write failing renderer tests.**

Add assertions:

```ts
expect(screen.getByText('当前阶段：苏格拉底追问')).toBeVisible()
expect(screen.getByText('动作：ask · opening → probing')).toBeVisible()
```

Add a historical session test with `steps: []`:

```ts
expect(screen.getByText('状态机记录尚未生成')).toBeVisible()
```

- [ ] **Step 2: Run renderer tests and verify failure.**

Run:

```bash
pnpm vitest apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
```

Expected: FAIL because UI does not render state/step metadata.

- [ ] **Step 3: Add label helpers.**

In `LessonWorkspace.tsx` add:

```ts
const lessonStateLabels = {
  opening: '开场提问',
  probing: '苏格拉底追问',
  hinting: '提示阶梯',
  explaining: '短讲解',
  reflecting: '复述反思',
  summarizing: '阶段小结',
  completed: '已完成',
  paused: '已暂停',
  error: '待恢复',
} as const

const stepForRun = (session: LessonSessionDto, modelRunId: string) =>
  session.steps.find((step) => step.modelRunId === modelRunId)
```

- [ ] **Step 4: Render current state and run metadata.**

Near lesson detail title:

```tsx
<p className="lesson-state-pill">当前阶段：{lessonStateLabels[detailState.session.currentState]}</p>
```

Inside each model run card:

```tsx
const step = stepForRun(detailState.session, modelRun.id)
```

Render:

```tsx
{
  step === undefined ? (
    <p className="lesson-step-meta">状态机记录尚未生成</p>
  ) : (
    <p className="lesson-step-meta">
      动作：{step.actionType} · {step.stateBefore} → {step.stateAfter}
    </p>
  )
}
```

- [ ] **Step 5: Add compact styles.**

Add CSS:

```css
.lesson-state-pill,
.lesson-step-meta {
  color: #375346;
  font-size: 0.84rem;
  font-weight: 600;
}
```

- [ ] **Step 6: Run renderer tests and typecheck.**

Run:

```bash
pnpm vitest apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx && pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: show lesson state machine metadata"
```

### Task 6: Cover the state machine in E2E and update planning docs

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Modify if needed: `docs/database/database_schema.md`

- [ ] **Step 1: Write failing E2E assertions.**

In the PDF lesson flow, after starting a lesson:

```ts
await expect(page.getByText('当前阶段：苏格拉底追问')).toBeVisible()
await expect(page.getByText('动作：ask · opening → probing')).toBeVisible()
```

After submitting a normal answer:

```ts
await expect(page.getByText('动作：ask · probing → probing')).toBeVisible()
```

After app restart and reopening the lesson:

```ts
await expect(page.getByText('当前阶段：苏格拉底追问')).toBeVisible()
await expect(page.getByText('动作：ask · opening → probing')).toBeVisible()
```

- [ ] **Step 2: Run E2E and verify failure if UI/backend tasks are not already complete.**

Run:

```bash
pnpm test:e2e
```

Expected before implementation: FAIL on missing state labels. Expected after prior tasks: PASS.

- [ ] **Step 3: Update docs.**

Update `docs/planning/current-status.md`:

- Current phase becomes `Phase 6 D5 TutorAction / LessonState 状态机`.
- Add D5 bullet: Domain/Contracts state machine, SQLite `lesson_steps`, Application start/reply/retry/cancel step semantics, Renderer state metadata, E2E restart coverage.
- Non-goals should still list full mastery scoring, review scheduling, paper workflow, streaming, structured Provider JSON if not implemented.

Update `docs/planning/software-design-completion-roadmap.md`:

- Mark D5 as completed if every D5.1 task is done.
- Clarify that D6 owns mastery evidence, misconceptions, and review items.

Update `docs/database/database_schema.md` to document `lesson_sessions.current_state` and `lesson_steps` in the current implemented schema section.

- [ ] **Step 4: Run full gates.**

Run:

```bash
pnpm format
pnpm check
pnpm test:e2e
```

Expected: PASS. `pnpm test:e2e` may skip packaged persistence unless `pnpm package:dir` has been run, matching existing behavior.

- [ ] **Step 5: Commit E2E and docs.**

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/database/database_schema.md
git commit -m "test: cover lesson state machine flow"
```

## Self-review

Spec coverage:

- Minimal state set: Task 1.
- TutorAction and legal transitions: Task 1 and Task 3.
- LessonStep persistence: Task 2.
- Start/reply integration: Task 3.
- Retry/cancel semantics: Task 4.
- Renderer visibility: Task 5.
- E2E restart proof and docs: Task 6.

Boundary check:

- Domain remains framework/platform independent.
- Application owns state transitions and generator wrapping.
- Infrastructure stores rows and does not decide pedagogy.
- Renderer receives DTOs and displays metadata only.
- Main/Preload require no generic IPC changes.

Known scope line:

- D5.1 intentionally does not implement structured Provider JSON, mastery scoring, misconception storage, review scheduling, branch stack UI, or streaming.
