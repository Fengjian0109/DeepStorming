# Review Scheduler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `MasteryEvidence` and `MisconceptionSignal` into persisted lesson-scoped review tasks that learners can complete from the lesson page.

**Architecture:** Extend the lesson aggregate end-to-end with deterministic `ReviewItem` and `ReviewEvent` records. Keep scheduling logic in Application, persist the records in SQLite through Migration 14, expose one explicit IPC endpoint for saving review results, and render the review loop inside `LessonWorkspace`.

**Tech Stack:** TypeScript, Zod, Vitest, better-sqlite3, Electron IPC/preload, React renderer, Playwright E2E.

---

## File structure

- Modify `packages/domain/src/lesson.ts`: define `ReviewItem`, `ReviewEvent`, enums, and normalizers.
- Modify `packages/domain/src/lesson.test.ts`: add domain normalization coverage.
- Modify `packages/contracts/src/lesson.ts`: add DTO schemas, request schema, response schema wiring, and `lessons:record-review`.
- Modify `packages/contracts/src/lesson.test.ts`: extend schema tests for review DTOs and request validation.
- Modify `packages/application/src/lesson-ports.ts`: extend stored aggregate types with review arrays.
- Modify `packages/application/src/lesson-use-cases.ts`: map review arrays into views, auto-create review items after diagnosis, add deterministic scheduler helpers, and add `RecordReviewEvent`.
- Modify `packages/application/src/lesson-use-cases.test.ts`: cover creation rules, dedupe, and rating-based rescheduling.
- Modify `packages/infrastructure/src/database/migrations.ts`: add Migration 14 for `lesson_review_items` and `lesson_review_events`.
- Modify `packages/infrastructure/src/database/migrations.test.ts`: assert migration 14 exists and installs the new tables/indexes.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.ts`: read/write review rows with lesson sessions.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`: cover round-trip persistence for review items and review events.
- Modify `apps/desktop/src/main/ipc/lesson-handlers.ts` and `apps/desktop/src/main/ipc/lesson-handlers.test.ts`: wire the new use case and channel validation.
- Modify `apps/desktop/src/main/ipc/register-ipc.ts`: register the review IPC handler.
- Modify `apps/desktop/src/preload/index.ts` and `apps/desktop/src/preload/index.test.ts`: expose `window.deepstorming.lessons.recordReview`.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx` and `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: render review tasks and submit review results with loading/success/error states.
- Modify `tests/e2e/app.spec.ts`: verify review task creation, completion, and restart persistence.
- Modify `docs/planning/current-status.md`, `docs/planning/software-design-completion-roadmap.md`, and `docs/database/database_schema.md`: document the new status and schema.

---

## Task 1: Domain and Contracts review models

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.test.ts`

- [ ] **Step 1: Write the failing Domain tests**

Add to `packages/domain/src/lesson.test.ts`:

```ts
import { normalizeReviewEvent, normalizeReviewItem } from './lesson'

it('normalizes review items with trimmed prompts and outlines', () => {
  expect(
    normalizeReviewItem({
      id: '00000000-0000-4000-8000-000000000951',
      lessonId: '00000000-0000-4000-8000-000000000101',
      masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
      misconceptionSignalId: '00000000-0000-4000-8000-000000000901',
      prompt: '  复习：学习者把关键概念混淆了。请重新解释这段证据想说明什么。  ',
      answerOutline: ['  先解释原证据 ', ' 再指出误区 '],
      status: 'active',
      dueAt: '2026-07-14T00:00:00.000Z',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }).answerOutline,
  ).toEqual(['先解释原证据', '再指出误区'])
})

it('rejects blank review outlines and invalid ratings', () => {
  expect(() =>
    normalizeReviewItem({
      id: '00000000-0000-4000-8000-000000000951',
      lessonId: '00000000-0000-4000-8000-000000000101',
      masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
      misconceptionSignalId: null,
      prompt: '复习：请重新解释这段课堂证据。',
      answerOutline: ['   '],
      status: 'active',
      dueAt: '2026-07-14T00:00:00.000Z',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }),
  ).toThrow('Review answer outline item is required')

  expect(() =>
    normalizeReviewEvent({
      id: '00000000-0000-4000-8000-000000000961',
      reviewItemId: '00000000-0000-4000-8000-000000000951',
      lessonId: '00000000-0000-4000-8000-000000000101',
      rating: 'unknown' as never,
      response: 'I think I remember this now.',
      previousDueAt: '2026-07-14T00:00:00.000Z',
      nextDueAt: '2026-07-17T00:00:00.000Z',
      reviewedAt: '2026-07-14T09:00:00.000Z',
      createdAt: '2026-07-14T09:00:00.000Z',
    }),
  ).toThrow('Review rating is invalid')
})
```

- [ ] **Step 2: Run Domain tests to verify RED**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: FAIL because review normalizers and review types do not exist yet.

- [ ] **Step 3: Implement the minimal Domain review types and normalizers**

Add to `packages/domain/src/lesson.ts` near the existing lesson diagnosis exports:

```ts
export const REVIEW_ITEM_STATUSES = ['active', 'completed', 'suspended'] as const
export const REVIEW_RATINGS = ['remembered', 'forgot'] as const

export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number]
export type ReviewRating = (typeof REVIEW_RATINGS)[number]

export type ReviewItem = Readonly<{
  id: string
  lessonId: string
  masteryEvidenceId: string
  misconceptionSignalId: string | null
  prompt: string
  answerOutline: readonly string[]
  status: ReviewItemStatus
  dueAt: string
  createdAt: string
  updatedAt: string
}>

export type ReviewEvent = Readonly<{
  id: string
  reviewItemId: string
  lessonId: string
  rating: ReviewRating
  response: string
  previousDueAt: string
  nextDueAt: string | null
  reviewedAt: string
  createdAt: string
}>
```

Add guards and normalizers using the existing `includes`, `assertUuid`, `normalizeNonBlank`, and timestamp assertions:

```ts
const assertReviewItemStatus = (status: ReviewItemStatus): void => {
  if (!includes(REVIEW_ITEM_STATUSES, status)) throw new Error('Review item status is invalid')
}

const assertReviewRating = (rating: ReviewRating): void => {
  if (!includes(REVIEW_RATINGS, rating)) throw new Error('Review rating is invalid')
}

const normalizeAnswerOutline = (answerOutline: readonly string[]): readonly string[] => {
  if (answerOutline.length === 0) throw new Error('Review answer outline is required')
  if (answerOutline.length > 5) throw new Error('Review answer outline is too long')
  return answerOutline.map((item) =>
    normalizeNonBlank(item, 'Review answer outline item is required').slice(0, 280),
  )
}
```

Then export:

```ts
export const normalizeReviewItem = (item: ReviewItem): ReviewItem => ({
  ...item,
  id: assertUuid(item.id, 'Review item id is invalid'),
  lessonId: assertUuid(item.lessonId, 'Lesson id is invalid'),
  masteryEvidenceId: assertUuid(item.masteryEvidenceId, 'Mastery evidence id is invalid'),
  misconceptionSignalId:
    item.misconceptionSignalId === null
      ? null
      : assertUuid(item.misconceptionSignalId, 'Misconception signal id is invalid'),
  prompt: normalizeNonBlank(item.prompt, 'Review prompt is required').slice(0, 280),
  status: (assertReviewItemStatus(item.status), item.status),
  answerOutline: normalizeAnswerOutline(item.answerOutline),
  dueAt: assertTimestamp(item.dueAt, 'Review due timestamp is invalid'),
  createdAt: assertTimestamp(item.createdAt, 'Review created timestamp is invalid'),
  updatedAt: assertTimestamp(item.updatedAt, 'Review updated timestamp is invalid'),
})

export const normalizeReviewEvent = (event: ReviewEvent): ReviewEvent => ({
  ...event,
  id: assertUuid(event.id, 'Review event id is invalid'),
  reviewItemId: assertUuid(event.reviewItemId, 'Review item id is invalid'),
  lessonId: assertUuid(event.lessonId, 'Lesson id is invalid'),
  rating: (assertReviewRating(event.rating), event.rating),
  response: normalizeNonBlank(event.response, 'Review response is required').slice(0, 1_000),
  previousDueAt: assertTimestamp(event.previousDueAt, 'Previous review due timestamp is invalid'),
  nextDueAt:
    event.nextDueAt === null
      ? null
      : assertTimestamp(event.nextDueAt, 'Next review due timestamp is invalid'),
  reviewedAt: assertTimestamp(event.reviewedAt, 'Review timestamp is invalid'),
  createdAt: assertTimestamp(event.createdAt, 'Review event created timestamp is invalid'),
})
```

Also extend `LessonSession` with:

```ts
reviewItems: readonly ReviewItem[]
reviewEvents: readonly ReviewEvent[]
```

- [ ] **Step 4: Run Domain tests to verify GREEN**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts --run
```

Expected: PASS with the new review normalization coverage green.

- [ ] **Step 5: Write the failing Contracts tests**

Add to `packages/contracts/src/lesson.test.ts`:

```ts
import {
  LESSON_CHANNELS,
  lessonRecordReviewDraftSchema,
  lessonReviewEventSchema,
  lessonReviewItemSchema,
} from './lesson'

it('validates review item and review event dto payloads', () => {
  expect(
    lessonReviewItemSchema.parse({
      id: '00000000-0000-4000-8000-000000000951',
      lessonId: '00000000-0000-4000-8000-000000000101',
      masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
      misconceptionSignalId: null,
      prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
      answerOutline: ['先说明证据', '再说明判断依据'],
      status: 'active',
      dueAt: '2026-07-14T00:00:00.000Z',
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }).status,
  ).toBe('active')

  expect(LESSON_CHANNELS.recordReview).toBe('lessons:record-review')
  expect(() =>
    lessonRecordReviewDraftSchema.parse({
      lessonId: '00000000-0000-4000-8000-000000000101',
      reviewItemId: '00000000-0000-4000-8000-000000000951',
      rating: 'remembered',
      response: '   ',
    }),
  ).toThrow()
})
```

- [ ] **Step 6: Run Contracts tests to verify RED**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts --run
```

Expected: FAIL because the review schemas and channel do not exist.

- [ ] **Step 7: Implement Contracts review schemas and channel wiring**

In `packages/contracts/src/lesson.ts`:

```ts
export const LESSON_CHANNELS = {
  list: 'lessons:list',
  startFromDocument: 'lessons:start-from-document',
  get: 'lessons:get',
  reply: 'lessons:reply',
  retryRun: 'lessons:retry-run',
  cancelRun: 'lessons:cancel-run',
  recordReview: 'lessons:record-review',
} as const
```

Add:

```ts
export const reviewItemStatusSchema = z.enum(['active', 'completed', 'suspended'])
export const reviewRatingSchema = z.enum(['remembered', 'forgot'])

export const lessonReviewItemSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    masteryEvidenceId: z.string().uuid(),
    misconceptionSignalId: z.string().uuid().nullable(),
    prompt: requiredTextSchema.max(280),
    answerOutline: z.array(requiredTextSchema.max(280)).min(1).max(5),
    status: reviewItemStatusSchema,
    dueAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const lessonReviewEventSchema = z
  .object({
    id: z.string().uuid(),
    reviewItemId: z.string().uuid(),
    lessonId: lessonIdSchema,
    rating: reviewRatingSchema,
    response: requiredTextSchema.max(1_000),
    previousDueAt: timestampSchema,
    nextDueAt: timestampSchema.nullable(),
    reviewedAt: timestampSchema,
    createdAt: timestampSchema,
  })
  .strict()

export const lessonRecordReviewDraftSchema = z
  .object({
    lessonId: lessonIdSchema,
    reviewItemId: z.string().uuid(),
    rating: reviewRatingSchema,
    response: requiredTextSchema.max(1_000),
  })
  .strict()
```

Extend `lessonSessionSchema` with:

```ts
reviewItems: z.array(lessonReviewItemSchema),
reviewEvents: z.array(lessonReviewEventSchema),
```

Export the corresponding DTO/input types and the `lessonSessionResultSchema` path used by the new IPC handler.

- [ ] **Step 8: Run Contracts tests to verify GREEN**

Run:

```bash
pnpm vitest packages/contracts/src/lesson.test.ts --run
```

Expected: PASS with review DTO coverage green.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: define review scheduler models"
```

Expected: commit succeeds with the new domain/contracts review model changes.

---

## Task 2: Application scheduling and use case flow

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write the failing Application tests for creation and rescheduling**

Add to `packages/application/src/lesson-use-cases.test.ts`:

```ts
it('creates a review item when diagnosis suggests review', async () => {
  const result = await submitLessonReply.execute({
    lessonId: lesson.id,
    content: 'I am still stuck on why this evidence matters.',
    operationId: '00000000-0000-4000-8000-000000000701',
  })

  expect(result.reviewItems).toHaveLength(1)
  expect(result.reviewItems[0]).toMatchObject({
    lessonId: lesson.id,
    status: 'active',
    prompt: expect.stringContaining('复习：'),
  })
  expect(result.reviewItems[0]?.dueAt).toBe('2026-07-14T00:00:00.000Z')
})

it('does not create a review item for partial understanding', async () => {
  tutor.generateFollowUp.mockResolvedValue({
    content: '继续解释一下你的依据。',
    providerId: null,
    modelName: 'mock-local',
    actionType: 'reflect',
    stateAfter: 'reflecting',
    rationale: 'Learner showed partial understanding.',
  })

  const result = await submitLessonReply.execute({
    lessonId: lesson.id,
    content: 'I think I mostly understand it now.',
    operationId: '00000000-0000-4000-8000-000000000702',
  })

  expect(result.reviewItems).toEqual([])
})

it('records remembered reviews with a three-day next due date', async () => {
  const result = await recordReviewEvent.execute({
    lessonId: lesson.id,
    reviewItemId: '00000000-0000-4000-8000-000000000951',
    rating: 'remembered',
    response: 'I can explain the evidence and the misconception clearly now.',
  })

  expect(result.reviewEvents.at(-1)).toMatchObject({
    rating: 'remembered',
    previousDueAt: '2026-07-14T00:00:00.000Z',
    nextDueAt: '2026-07-17T09:00:00.000Z',
  })
  expect(result.reviewItems[0]?.dueAt).toBe('2026-07-17T09:00:00.000Z')
})
```

- [ ] **Step 2: Run Application tests to verify RED**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
```

Expected: FAIL because review arrays, scheduler helpers, and `RecordReviewEvent` are missing.

- [ ] **Step 3: Extend stored lesson types**

In `packages/application/src/lesson-ports.ts`, add:

```ts
import type { ReviewEvent, ReviewItem } from '@deepstorming/domain'

export type StoredReviewItem = ReviewItem
export type StoredReviewEvent = ReviewEvent
```

Extend `StoredLessonSession`:

```ts
reviewItems: readonly StoredReviewItem[]
reviewEvents: readonly StoredReviewEvent[]
```

- [ ] **Step 4: Add deterministic scheduler helpers in `lesson-use-cases.ts`**

Add small pure helpers near the existing diagnosis helpers:

```ts
const plusDaysIso = (iso: string, days: number): string => {
  const next = new Date(iso)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString()
}

const createReviewPrompt = (signal: StoredMisconceptionSignal | undefined): string =>
  signal === undefined
    ? '复习：请重新解释这段课堂证据，并说明你的判断依据。'
    : `复习：${signal.label}。请重新解释这段证据想说明什么。`

const createReviewAnswerOutline = (
  evidence: StoredMasteryEvidence,
  signal: StoredMisconceptionSignal | undefined,
): readonly string[] =>
  signal === undefined ? [evidence.rationale] : [evidence.rationale, signal.rationale]

const createReviewItemForDiagnosis = (input: {
  session: StoredLessonSession
  evidence: StoredMasteryEvidence
  signal?: StoredMisconceptionSignal
  idGenerator: IdGeneratorPort
}): StoredReviewItem | undefined => {
  if (!input.evidence.suggestedReview) return undefined
  if (input.evidence.judgement === 'partial_understanding') return undefined
  if (input.session.reviewItems.some((item) => item.masteryEvidenceId === input.evidence.id)) {
    return undefined
  }
  return normalizeReviewItem({
    id: input.idGenerator.create(),
    lessonId: input.session.id,
    masteryEvidenceId: input.evidence.id,
    misconceptionSignalId: input.signal?.id ?? null,
    prompt: createReviewPrompt(input.signal),
    answerOutline: createReviewAnswerOutline(input.evidence, input.signal),
    status: 'active',
    dueAt: plusDaysIso(input.evidence.createdAt, 1),
    createdAt: input.evidence.createdAt,
    updatedAt: input.evidence.createdAt,
  })
}

const nextDueAtForRating = (reviewedAt: string, rating: ReviewRating): string =>
  plusDaysIso(reviewedAt, rating === 'remembered' ? 3 : 1)
```

- [ ] **Step 5: Wire review arrays into lesson views and start/reply/retry flows**

Update `toView` and the initial lesson session object to include:

```ts
reviewItems: session.reviewItems,
reviewEvents: session.reviewEvents,
```

Also initialize new sessions with:

```ts
reviewItems: [],
reviewEvents: [],
```

When diagnosis is appended in successful `SubmitLessonReply` and `RetryLessonRun`, also append:

```ts
const reviewItem = createReviewItemForDiagnosis({
  session: pending,
  evidence: diagnosis.evidence,
  signal: diagnosis.misconception,
  idGenerator: this.ids,
})

reviewItems: reviewItem === undefined ? pending.reviewItems : [...pending.reviewItems, reviewItem],
reviewEvents: pending.reviewEvents,
```

- [ ] **Step 6: Add `RecordReviewEvent` use case**

In `packages/application/src/lesson-use-cases.ts`, add:

```ts
export type RecordReviewEventInput = Readonly<{
  lessonId: string
  reviewItemId: string
  rating: ReviewRating
  response: string
}>

const normalizeRecordReviewEventInput = (
  input: RecordReviewEventInput,
): RecordReviewEventInput => ({
  lessonId: normalizeUuid(input.lessonId, 'Lesson id is invalid'),
  reviewItemId: normalizeUuid(input.reviewItemId, 'Review item id is invalid'),
  rating: input.rating,
  response: normalizeNonBlank(input.response, 'Review response is required').slice(0, 1_000),
})

export class RecordReviewEvent {
  public constructor(
    private readonly repository: LessonRepositoryPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: RecordReviewEventInput): Promise<LessonSessionView> {
    const normalized = normalizeRecordReviewEventInput(input)
    const session = await this.repository.findById(normalized.lessonId)
    if (session === undefined)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'Lesson not found.', false)

    const reviewItem = session.reviewItems.find((item) => item.id === normalized.reviewItemId)
    if (reviewItem === undefined) {
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'Review item not found for lesson.', false)
    }

    const reviewedAt = this.clock.now().toISOString()
    const nextDueAt = nextDueAtForRating(reviewedAt, normalized.rating)
    const event = normalizeReviewEvent({
      id: this.ids.create(),
      reviewItemId: reviewItem.id,
      lessonId: session.id,
      rating: normalized.rating,
      response: normalized.response,
      previousDueAt: reviewItem.dueAt,
      nextDueAt,
      reviewedAt,
      createdAt: reviewedAt,
    })

    const updated: StoredLessonSession = {
      ...session,
      reviewItems: session.reviewItems.map((item) =>
        item.id === reviewItem.id
          ? { ...item, dueAt: nextDueAt, status: 'active', updatedAt: reviewedAt }
          : item,
      ),
      reviewEvents: [...session.reviewEvents, event],
      updatedAt: reviewedAt,
    }

    return toView(await this.repository.save(updated))
  }
}
```

- [ ] **Step 7: Run Application tests to verify GREEN**

Run:

```bash
pnpm vitest packages/application/src/lesson-use-cases.test.ts --run
```

Expected: PASS, including create/no-create/reschedule review flow coverage.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add packages/application/src/lesson-ports.ts packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: add lesson review scheduling use cases"
```

Expected: commit succeeds with deterministic scheduler and record-review application logic.

---

## Task 3: SQLite migration and repository persistence

**Files:**

- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

- [ ] **Step 1: Write the failing migration and repository tests**

Add to `packages/infrastructure/src/database/migrations.test.ts`:

```ts
it('includes migration 14 for lesson review scheduler tables', () => {
  const migration = migrations.at(-1)
  expect(migration?.version).toBe(14)
  expect(migration?.sql).toContain('CREATE TABLE lesson_review_items')
  expect(migration?.sql).toContain('CREATE TABLE lesson_review_events')
  expect(migration?.sql).toContain('lesson_review_items_lesson_due')
})
```

Add to `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`:

```ts
it('persists review items and review events with lesson sessions', async () => {
  const created = await repository.create(
    session({
      reviewItems: [
        {
          id: '00000000-0000-4000-8000-000000000951',
          lessonId: '00000000-0000-4000-8000-000000000101',
          masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
          misconceptionSignalId: null,
          prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
          answerOutline: ['先说明证据', '再说明判断依据'],
          status: 'active',
          dueAt: '2026-07-14T00:00:00.000Z',
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
      reviewEvents: [
        {
          id: '00000000-0000-4000-8000-000000000961',
          reviewItemId: '00000000-0000-4000-8000-000000000951',
          lessonId: '00000000-0000-4000-8000-000000000101',
          rating: 'forgot',
          response: 'I still mix up the rationale.',
          previousDueAt: '2026-07-14T00:00:00.000Z',
          nextDueAt: '2026-07-15T09:00:00.000Z',
          reviewedAt: '2026-07-14T09:00:00.000Z',
          createdAt: '2026-07-14T09:00:00.000Z',
        },
      ],
    }),
  )

  const reloaded = await repository.findById(created.id)
  expect(reloaded?.reviewItems).toHaveLength(1)
  expect(reloaded?.reviewEvents[0]?.rating).toBe('forgot')
})
```

- [ ] **Step 2: Run Infrastructure tests to verify RED**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
```

Expected: FAIL because Migration 14 and repository mappings are missing.

- [ ] **Step 3: Add Migration 14**

Append to `packages/infrastructure/src/database/migrations.ts`:

```ts
const LESSON_REVIEW_SCHEDULER_SQL = `
CREATE TABLE lesson_review_items (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 mastery_evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE,
 misconception_signal_id TEXT REFERENCES lesson_misconception_signals(id) ON DELETE SET NULL,
 prompt TEXT NOT NULL,
 answer_outline_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('active','completed','suspended')),
 due_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(mastery_evidence_id)
);
CREATE INDEX lesson_review_items_lesson_due ON lesson_review_items(lesson_id, status, due_at);
CREATE INDEX lesson_review_items_due ON lesson_review_items(status, due_at);
CREATE TABLE lesson_review_events (
 id TEXT PRIMARY KEY,
 review_item_id TEXT NOT NULL REFERENCES lesson_review_items(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 rating TEXT NOT NULL CHECK (rating IN ('remembered','forgot')),
 response TEXT NOT NULL,
 previous_due_at TEXT NOT NULL,
 next_due_at TEXT,
 reviewed_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX lesson_review_events_item_reviewed ON lesson_review_events(review_item_id, reviewed_at);
CREATE INDEX lesson_review_events_lesson_reviewed ON lesson_review_events(lesson_id, reviewed_at);`
```

Then register:

```ts
{ version: 14, name: 'lesson_review_scheduler', sql: LESSON_REVIEW_SCHEDULER_SQL }
```

- [ ] **Step 4: Read and write review rows in the repository**

In `packages/infrastructure/src/database/sqlite-lesson-repository.ts`, follow the existing mastery evidence pattern:

```ts
type ReviewItemRow = Readonly<{
  id: string
  lesson_id: string
  mastery_evidence_id: string
  misconception_signal_id: string | null
  prompt: string
  answer_outline_json: string
  status: StoredReviewItem['status']
  due_at: string
  created_at: string
  updated_at: string
}>

type ReviewEventRow = Readonly<{
  id: string
  review_item_id: string
  lesson_id: string
  rating: StoredReviewEvent['rating']
  response: string
  previous_due_at: string
  next_due_at: string | null
  reviewed_at: string
  created_at: string
}>
```

Add `reviewItemsFor(lessonIds)` and `reviewEventsFor(lessonIds)` loaders, include them in `toLessonSession`, and add insert helpers:

```ts
private insertReviewItems(session: StoredLessonSession): void { /* delete by lesson_id, insert all rows */ }
private insertReviewEvents(session: StoredLessonSession): void { /* delete by lesson_id, insert all rows */ }
```

Call both helpers from `create` and `save`, and include `reviewItems` / `reviewEvents` when hydrating sessions in `list()` and `findById()`.

- [ ] **Step 5: Run Infrastructure tests to verify GREEN**

Run:

```bash
pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts --run
```

Expected: PASS, confirming migration 14 exists and review data round-trips.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts
git commit -m "feat: persist lesson review scheduler data"
```

Expected: commit succeeds with migration/repository support.

---

## Task 4: IPC, preload, and renderer review workflow

**Files:**

- Modify: `apps/desktop/src/main/ipc/lesson-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/lesson-handlers.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

- [ ] **Step 1: Write the failing desktop tests**

Add to `apps/desktop/src/main/ipc/lesson-handlers.test.ts`:

```ts
it('records a lesson review event through the review IPC handler', async () => {
  recordReviewEvent.execute.mockResolvedValue(sessionWithReviewItems)

  const result = await handlers.recordReview({
    requestId: '00000000-0000-4000-8000-000000000001',
    lessonId: '00000000-0000-4000-8000-000000000101',
    reviewItemId: '00000000-0000-4000-8000-000000000951',
    rating: 'forgot',
    response: 'I still need one more pass.',
  })

  expect(recordReviewEvent.execute).toHaveBeenCalledWith({
    lessonId: '00000000-0000-4000-8000-000000000101',
    reviewItemId: '00000000-0000-4000-8000-000000000951',
    rating: 'forgot',
    response: 'I still need one more pass.',
  })
  expect(result.ok).toBe(true)
})
```

Add to `apps/desktop/src/preload/index.test.ts`:

```ts
it('exposes lessons.recordReview with validated response parsing', async () => {
  ipcRenderer.invoke.mockResolvedValue(okLessonSessionResult)
  await api.lessons.recordReview({
    lessonId: '00000000-0000-4000-8000-000000000101',
    reviewItemId: '00000000-0000-4000-8000-000000000951',
    rating: 'remembered',
    response: 'I can explain the evidence now.',
  })

  expect(ipcRenderer.invoke).toHaveBeenCalledWith(
    LESSON_CHANNELS.recordReview,
    expect.objectContaining({ rating: 'remembered' }),
  )
})
```

Add to `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`:

```ts
it('renders review tasks and records remembered reviews', async () => {
  renderLessonWorkspace({
    session: sessionWithReviewItems,
  })

  expect(screen.getByText('复习任务')).toBeInTheDocument()
  await user.type(screen.getByLabelText('这次复习回答'), '我已经能解释证据和判断依据。')
  await user.click(screen.getByRole('button', { name: '记住了' }))

  expect(mockLessonsRecordReview).toHaveBeenCalledWith({
    lessonId: sessionWithReviewItems.id,
    reviewItemId: sessionWithReviewItems.reviewItems[0].id,
    rating: 'remembered',
    response: '我已经能解释证据和判断依据。',
  })
  expect(await screen.findByText('复习记录已保存。')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run desktop tests to verify RED**

Run:

```bash
pnpm vitest apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
```

Expected: FAIL because the IPC channel, preload API, and renderer review UI do not exist.

- [ ] **Step 3: Implement the IPC handler and preload bridge**

In `apps/desktop/src/main/ipc/lesson-handlers.ts`, add a handler parallel to `reply`/`retryRun`:

```ts
recordReview: async (input) => {
  const parsed = lessonRecordReviewDraftSchema.safeParse(input)
  if (!parsed.success) return invalidLessonResult(input.requestId, 'LESSON_VALIDATION_FAILED')
  return toLessonSessionResult(input.requestId, await recordReviewEvent.execute(parsed.data))
}
```

Register it in `apps/desktop/src/main/ipc/register-ipc.ts` with `LESSON_CHANNELS.recordReview`.

In `apps/desktop/src/preload/index.ts`, add:

```ts
recordReview: async (review): Promise<LessonSessionResult> => {
  const requestId = globalThis.crypto.randomUUID()
  return invokeValidated(
    LESSON_CHANNELS.recordReview,
    { requestId, ...review },
    lessonSessionResultSchema,
  )
}
```

- [ ] **Step 4: Render the review section in `LessonWorkspace.tsx`**

Follow the current diagnosis section pattern. Add derived helpers:

```ts
const activeReviewItems = [...session.reviewItems]
  .filter((item) => item.status === 'active')
  .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
```

Add local UI state:

```ts
const [reviewResponses, setReviewResponses] = useState<Record<string, string>>({})
const [reviewSavingId, setReviewSavingId] = useState<string | null>(null)
const [reviewFeedback, setReviewFeedback] = useState<string | null>(null)
const [reviewError, setReviewError] = useState<string | null>(null)
```

Render below “学习诊断”:

```tsx
<section aria-labelledby="lesson-review-heading">
  <h2 id="lesson-review-heading">复习任务</h2>
  {activeReviewItems.length === 0 ? (
    <p>还没有复习任务。</p>
  ) : (
    activeReviewItems.map((item) => (
      <article key={item.id}>
        <p>{item.prompt}</p>
        <p>下次复习：{item.dueAt.slice(0, 10)}</p>
        <ul>
          {item.answerOutline.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <label>
          这次复习回答
          <textarea
            value={reviewResponses[item.id] ?? ''}
            onChange={(event) =>
              setReviewResponses((current) => ({ ...current, [item.id]: event.target.value }))
            }
          />
        </label>
        <button onClick={() => handleRecordReview(item.id, 'remembered')}>记住了</button>
        <button onClick={() => handleRecordReview(item.id, 'forgot')}>还不稳</button>
      </article>
    ))
  )}
</section>
```

Implement `handleRecordReview` to call `window.deepstorming.lessons.recordReview`, show loading, preserve input on failure, refresh the lesson session on success, and display `复习记录已保存。`.

- [ ] **Step 5: Run desktop tests to verify GREEN**

Run:

```bash
pnpm vitest apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
```

Expected: PASS with new review handler, preload bridge, and renderer workflow covered.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add apps/desktop/src/main/ipc/lesson-handlers.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
git commit -m "feat: add lesson review workflow to desktop app"
```

Expected: commit succeeds with desktop review flow wired end to end.

---

## Task 5: End-to-end verification and docs

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Modify: `docs/database/database_schema.md`

- [ ] **Step 1: Write the failing E2E test**

Add to `tests/e2e/app.spec.ts`:

```ts
test('lesson review tasks are created, updated, and survive restart', async ({ app }) => {
  await startLessonFromFixture(app)
  await app
    .getByRole('textbox', { name: '输入你的回答' })
    .fill('我还是卡住了，不知道证据如何支持结论。')
  await app.getByRole('button', { name: '发送' }).click()

  await expect(app.getByText('复习任务')).toBeVisible()
  await expect(app.getByText(/下次复习：2026-07-14/)).toBeVisible()

  await app.getByLabel('这次复习回答').fill('我重新梳理后，能说明证据和判断依据。')
  await app.getByRole('button', { name: '记住了' }).click()
  await expect(app.getByText('复习记录已保存。')).toBeVisible()

  await restartDesktopApp(app)
  await reopenLesson(app)
  await expect(app.getByText(/下次复习：2026-07-17/)).toBeVisible()
})
```

- [ ] **Step 2: Run the E2E test to verify RED**

Run:

```bash
pnpm test:e2e -- --grep "lesson review tasks are created, updated, and survive restart"
```

Expected: FAIL because review tasks are not yet visible or actionable end to end.

- [ ] **Step 3: Update planning and database docs**

Refresh the three docs with concrete status:

```md
- `docs/planning/current-status.md`: mark D6 Review Scheduler MVP as implemented/in progress with review loop scope.
- `docs/planning/software-design-completion-roadmap.md`: move review scheduler from planned to done, and note remaining non-goals such as notifications/review center.
- `docs/database/database_schema.md`: add `lesson_review_items` and `lesson_review_events` columns, relationships, and indexes.
```

- [ ] **Step 4: Run focused verification and the repository-wide check**

Run:

```bash
pnpm vitest packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts packages/application/src/lesson-use-cases.test.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts apps/desktop/src/main/ipc/lesson-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx --run
pnpm check
```

Expected: both commands exit 0.

- [ ] **Step 5: Run the E2E suite slice to verify GREEN**

Run:

```bash
pnpm test:e2e -- --grep "lesson review tasks are created, updated, and survive restart"
```

Expected: PASS, proving review task creation, rescheduling, and persistence after restart.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md docs/database/database_schema.md
git commit -m "test: verify lesson review scheduler end to end"
```

Expected: commit succeeds with E2E coverage and docs.

---

## Self-review

### Spec coverage

- Domain models and validation: covered in Task 1.
- Scheduler creation/reschedule rules and dedupe: covered in Task 2.
- SQLite tables/indexes: covered in Task 3.
- IPC/preload explicit API and renderer workflow: covered in Task 4.
- E2E persistence and docs updates: covered in Task 5.

No spec gaps found.

### Placeholder scan

- Checked for `TODO`, `TBD`, “implement later”, “similar to Task”, and vague “add tests” placeholders.
- All tasks include exact files, commands, and concrete code direction.

### Type consistency

- `reviewItems`, `reviewEvents`, `ReviewItemStatus`, `ReviewRating`, and `lessonRecordReviewDraftSchema` are named consistently across Domain, Contracts, Application, Infrastructure, and Renderer tasks.
- IPC channel name is consistently `lessons:record-review`.
