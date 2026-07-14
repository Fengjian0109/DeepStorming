# Paper Reading Map MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent six-slot paper reading map to paper lessons, displayed in the lesson workspace and updated only after successful paper lesson interactions.

**Architecture:** Extend the existing `PaperLessonProfile` JSON payload instead of adding a new aggregate or migration. Keep Domain normalization as the compatibility boundary, Contracts as the renderer-facing schema, Application as the only place that mutates map content, Infrastructure as JSON persistence, and Renderer as a read-only display of the map.

**Tech Stack:** TypeScript, Zod, Vitest, SQLite repository JSON persistence, React renderer, Playwright E2E, pnpm workspace scripts

---

## File Structure / Responsibility Map

- Modify: `packages/domain/src/lesson.ts`
  - Add reading-map constants, types, default map factory, normalization, and compatibility for old paper profiles missing `readingMap`.
- Modify: `packages/domain/src/lesson.test.ts`
  - Cover six-slot map normalization, invalid slot shapes, old profile compatibility, and standard/paper constraints.
- Modify: `packages/contracts/src/lesson.ts`
  - Add Zod schemas and DTO types for paper reading map slots.
- Modify: `packages/contracts/src/lesson.test.ts`
  - Cover valid paper DTOs, invalid slot kinds/statuses, and standard sessions with `paperProfile = null`.
- Modify: `packages/application/src/lesson-use-cases.ts`
  - Initialize reading maps when paper lessons start and update them after successful reply/retry paths only.
- Modify: `packages/application/src/lesson-use-cases.test.ts`
  - Cover default map creation, successful reply updates, failed/cancelled non-updates, and retry success updates.
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`
  - Prove JSON persistence and legacy `paper_profile_json` compatibility through the existing repository path.
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
  - Render the compact paper reading map card only for paper lessons.
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
  - Cover paper map rendering, empty slot copy, anchor indicator, and standard lesson omission.
- Modify: `apps/desktop/src/renderer/src/App.css`
  - Add compact, non-card-nested styles for the reading map grid.
- Modify: `tests/e2e/app.spec.ts`
  - Extend the paper lesson E2E to assert map visibility, update after reply, and restart persistence.
- Modify: `docs/planning/current-status.md`
  - Mark D7.1 complete after implementation and verification.
- Modify: `docs/planning/software-design-completion-roadmap.md`
  - Move Paper Reading Map MVP into completed D7 work while preserving later paper workflow expansion items.

## Task 1: Domain Reading Map Model

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/domain/src/lesson.test.ts`

- [ ] **Step 1: Write failing Domain tests for paper map normalization**

Add imports in `packages/domain/src/lesson.test.ts`:

```ts
import {
  PAPER_READING_MAP_SLOT_KINDS,
  createDefaultPaperReadingMap,
} from './lesson'
```

Add these tests near the existing paper profile tests:

```ts
  it('creates a default paper reading map with six empty slots', () => {
    expect(createDefaultPaperReadingMap()).toEqual({
      slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => ({
        kind,
        summary: null,
        status: 'empty',
        citedAnchorIds: [],
        updatedAt: null,
      })),
    })
  })

  it('normalizes paper lesson reading maps and preserves seeded slots', () => {
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
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        readingMap: {
          slots: [
            {
              kind: 'why',
              summary: '  The paper asks why evidence supports the claim.  ',
              status: 'seeded',
              citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
              updatedAt: '2026-07-14T00:00:00.000Z',
            },
            ...PAPER_READING_MAP_SLOT_KINDS.filter((kind) => kind !== 'why').map((kind) => ({
              kind,
              summary: null,
              status: 'empty' as const,
              citedAnchorIds: [],
              updatedAt: null,
            })),
          ],
        },
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    })

    expect(session.paperProfile?.readingMap.slots[0]).toEqual({
      kind: 'why',
      summary: 'The paper asks why evidence supports the claim.',
      status: 'seeded',
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    })
  })

  it('adds a default reading map to legacy paper profiles', () => {
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
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [],
      },
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    })

    expect(session.paperProfile?.readingMap).toEqual(createDefaultPaperReadingMap())
  })

  it('rejects invalid paper reading maps', () => {
    const baseSession = {
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Paper Map 课堂',
      status: 'active' as const,
      documentId: '00000000-0000-4000-8000-000000000201',
      documentTitle: 'Paper Map',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'opening' as const,
      steps: [],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'paper' as const,
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    }

    expect(() =>
      normalizeLessonSession({
        ...baseSession,
        paperProfile: {
          currentStage: 'orientation',
          stageSummary: null,
          termsIntroduced: [],
          citedAnchorIds: [],
          readingMap: { slots: [] },
        },
      }),
    ).toThrow('Paper reading map is invalid')

    expect(() =>
      normalizeLessonSession({
        ...baseSession,
        paperProfile: {
          currentStage: 'orientation',
          stageSummary: null,
          termsIntroduced: [],
          citedAnchorIds: [],
          readingMap: {
            slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => ({
              kind,
              summary: null,
              status: 'seeded' as const,
              citedAnchorIds: [],
              updatedAt: null,
            })),
          },
        },
      }),
    ).toThrow('Paper reading map slot is invalid')
  })
```

- [ ] **Step 2: Run Domain tests and verify they fail for missing exports**

Run:

```bash
pnpm --filter @deepstorming/domain test -- lesson
```

Expected:

```text
FAIL because PAPER_READING_MAP_SLOT_KINDS and createDefaultPaperReadingMap are not exported yet
```

- [ ] **Step 3: Implement Domain reading map types and normalization**

In `packages/domain/src/lesson.ts`, add constants after `PAPER_READING_STAGES`:

```ts
export const PAPER_READING_MAP_SLOT_KINDS = [
  'why',
  'what',
  'how',
  'evidence',
  'limits',
  'next',
] as const
export const PAPER_READING_MAP_SLOT_STATUSES = ['empty', 'seeded', 'updated'] as const
```

Add types after `PaperReadingStage`:

```ts
export type PaperReadingMapSlotKind = (typeof PAPER_READING_MAP_SLOT_KINDS)[number]
export type PaperReadingMapSlotStatus = (typeof PAPER_READING_MAP_SLOT_STATUSES)[number]

export type PaperReadingMapSlot = Readonly<{
  kind: PaperReadingMapSlotKind
  summary: string | null
  status: PaperReadingMapSlotStatus
  citedAnchorIds: readonly string[]
  updatedAt: string | null
}>

export type PaperReadingMap = Readonly<{
  slots: readonly PaperReadingMapSlot[]
}>
```

Extend `PaperLessonProfile`:

```ts
export type PaperLessonProfile = Readonly<{
  currentStage: PaperReadingStage
  stageSummary: string | null
  termsIntroduced: readonly string[]
  citedAnchorIds: readonly string[]
  readingMap: PaperReadingMap
}>
```

Add a legacy input type before `normalizePaperLessonProfile`:

```ts
type LegacyPaperLessonProfile = Omit<PaperLessonProfile, 'readingMap'> &
  Partial<Pick<PaperLessonProfile, 'readingMap'>>
```

Add helper functions before `normalizePaperLessonProfile`:

```ts
export const createDefaultPaperReadingMap = (): PaperReadingMap => ({
  slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => ({
    kind,
    summary: null,
    status: 'empty',
    citedAnchorIds: [],
    updatedAt: null,
  })),
})

const normalizePaperReadingMap = (map: PaperReadingMap | undefined): PaperReadingMap => {
  if (map === undefined) return createDefaultPaperReadingMap()
  if (map.slots.length !== PAPER_READING_MAP_SLOT_KINDS.length) {
    throw new Error('Paper reading map is invalid')
  }

  const seen = new Set<string>()
  const slotsByKind = new Map(map.slots.map((slot) => [slot.kind, slot]))

  return {
    slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => {
      const slot = slotsByKind.get(kind)
      if (slot === undefined || seen.has(kind)) {
        throw new Error('Paper reading map is invalid')
      }
      seen.add(kind)
      if (!includes(PAPER_READING_MAP_SLOT_STATUSES, slot.status)) {
        throw new Error('Paper reading map slot is invalid')
      }

      const summary =
        slot.summary === null
          ? null
          : normalizeNonBlank(slot.summary, 'Paper reading map summary is invalid').slice(0, 500)
      if (summary === null && (slot.status !== 'empty' || slot.updatedAt !== null)) {
        throw new Error('Paper reading map slot is invalid')
      }
      if (summary !== null && slot.updatedAt === null) {
        throw new Error('Paper reading map slot is invalid')
      }
      if (slot.updatedAt !== null) {
        assertIsoTimestamp(slot.updatedAt, 'Paper reading map updatedAt is invalid')
      }

      return {
        kind,
        summary,
        status: slot.status,
        citedAnchorIds: slot.citedAnchorIds.map((id) =>
          assertUuid(id, 'Paper reading map cited anchor id is invalid'),
        ),
        updatedAt: slot.updatedAt,
      }
    }),
  }
}
```

Update `normalizePaperLessonProfile` signature and return:

```ts
const normalizePaperLessonProfile = (
  profile: LegacyPaperLessonProfile | null,
  lessonMode: LessonMode,
): PaperLessonProfile | null => {
  // existing mode/stage checks stay the same
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
    readingMap: normalizePaperReadingMap(profile.readingMap),
  }
}
```

- [ ] **Step 4: Run Domain tests and verify they pass**

Run:

```bash
pnpm --filter @deepstorming/domain test -- lesson
```

Expected:

```text
PASS lesson domain tests
```

- [ ] **Step 5: Commit Domain model changes**

Run:

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts
git commit -m "feat: add paper reading map domain model"
```

## Task 2: Contracts Schema and DTOs

**Files:**

- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.test.ts`

- [ ] **Step 1: Write failing Contracts tests for reading map schema**

In `packages/contracts/src/lesson.test.ts`, add a valid paper profile fixture:

```ts
const readingMap = {
  slots: [
    {
      kind: 'why',
      summary: 'The paper asks why evidence supports the claim.',
      status: 'seeded',
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    ...['what', 'how', 'evidence', 'limits', 'next'].map((kind) => ({
      kind,
      summary: null,
      status: 'empty',
      citedAnchorIds: [],
      updatedAt: null,
    })),
  ],
}
```

Add tests near existing lesson session schema tests:

```ts
  it('parses paper lesson profiles with reading maps', () => {
    const result = lessonSessionSchema.parse({
      ...lessonSession,
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        readingMap,
      },
    })

    expect(result.paperProfile?.readingMap.slots).toHaveLength(6)
  })

  it('rejects invalid paper reading map slots', () => {
    expect(() =>
      lessonSessionSchema.parse({
        ...lessonSession,
        lessonMode: 'paper',
        paperProfile: {
          currentStage: 'orientation',
          stageSummary: null,
          termsIntroduced: [],
          citedAnchorIds: [],
          readingMap: {
            slots: [
              {
                kind: 'unknown',
                summary: null,
                status: 'empty',
                citedAnchorIds: [],
                updatedAt: null,
              },
            ],
          },
        },
      }),
    ).toThrow()
  })
```

- [ ] **Step 2: Run Contracts tests and verify they fail**

Run:

```bash
pnpm --filter @deepstorming/contracts test -- lesson
```

Expected:

```text
FAIL because paperLessonProfileSchema does not accept readingMap yet
```

- [ ] **Step 3: Implement Contracts schemas**

In `packages/contracts/src/lesson.ts`, add after `paperReadingStageSchema`:

```ts
export const paperReadingMapSlotKindSchema = z.enum([
  'why',
  'what',
  'how',
  'evidence',
  'limits',
  'next',
])
export const paperReadingMapSlotStatusSchema = z.enum(['empty', 'seeded', 'updated'])

export const paperReadingMapSlotSchema = z
  .object({
    kind: paperReadingMapSlotKindSchema,
    summary: z.string().trim().min(1).max(500).nullable(),
    status: paperReadingMapSlotStatusSchema,
    citedAnchorIds: z.array(z.string().uuid()).max(24),
    updatedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine((value) => value.summary !== null || (value.status === 'empty' && value.updatedAt === null), {
    message: 'empty reading map slot must not have update metadata',
  })
  .refine((value) => value.summary === null || value.updatedAt !== null, {
    message: 'non-empty reading map slot must have updatedAt',
  })

export const paperReadingMapSchema = z
  .object({
    slots: z.array(paperReadingMapSlotSchema).length(6),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.slots.map((slot) => slot.kind)).size === 6 &&
      ['why', 'what', 'how', 'evidence', 'limits', 'next'].every((kind) =>
        value.slots.some((slot) => slot.kind === kind),
      ),
    { message: 'reading map must contain exactly one slot for each kind' },
  )
```

Extend `paperLessonProfileSchema`:

```ts
export const paperLessonProfileSchema = z
  .object({
    currentStage: paperReadingStageSchema,
    stageSummary: z.string().max(500).nullable(),
    termsIntroduced: z.array(z.string().trim().min(1).max(120)).max(24),
    citedAnchorIds: z.array(z.string().uuid()).max(24),
    readingMap: paperReadingMapSchema,
  })
  .strict()
```

Add exported DTO types at the bottom:

```ts
export type PaperReadingMapSlotKindDto = z.infer<typeof paperReadingMapSlotKindSchema>
export type PaperReadingMapSlotStatusDto = z.infer<typeof paperReadingMapSlotStatusSchema>
export type PaperReadingMapSlotDto = z.infer<typeof paperReadingMapSlotSchema>
export type PaperReadingMapDto = z.infer<typeof paperReadingMapSchema>
```

- [ ] **Step 4: Run Contracts tests and typecheck**

Run:

```bash
pnpm --filter @deepstorming/contracts test -- lesson
pnpm --filter @deepstorming/contracts typecheck
```

Expected:

```text
PASS contracts lesson tests
PASS contracts typecheck
```

- [ ] **Step 5: Commit Contracts changes**

Run:

```bash
git add packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: expose paper reading map contracts"
```

## Task 3: Application Map Initialization and Updates

**Files:**

- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write failing Application tests for map creation and reply update**

Add assertions to the existing paper start test in `packages/application/src/lesson-use-cases.test.ts`:

```ts
    expect(created.paperProfile?.readingMap.slots).toHaveLength(6)
    expect(created.paperProfile?.readingMap.slots.find((slot) => slot.kind === 'why')).toMatchObject({
      status: 'seeded',
      citedAnchorIds: [created.sourceAnchors[0]?.id],
    })
    expect(created.paperProfile?.readingMap.slots.find((slot) => slot.kind === 'evidence')).toMatchObject({
      status: 'seeded',
      citedAnchorIds: [created.sourceAnchors[0]?.id],
    })
```

Add a reply update assertion to the existing paper stage advancement test:

```ts
    expect(updated.paperProfile?.readingMap.slots.find((slot) => slot.kind === 'what')).toMatchObject({
      status: 'updated',
      summary: expect.stringContaining('gap between observed evidence and model behavior'),
    })
```

Add a cancelled/failed non-update test near existing cancellation tests:

```ts
  it('does not update the paper reading map when provider generation fails', async () => {
    documents.document = { ...documentRecord, documentType: 'paper' }
    const failingGenerator = {
      generateFirstQuestion: vi.fn(async () => ({ content: 'First question' })),
      generateReply: vi.fn(async () => {
        throw new LessonUseCaseError('LESSON_PROVIDER_FAILED', 'Provider failed.', true)
      }),
    }
    const useCases = createLessonUseCases({ tutorGenerator: failingGenerator })
    const started = await useCases.start.execute({
      documentId: documentRecord.id,
      documentTitle: 'Paper Map',
      source: { startOffset: 0, endOffset: 8, snippet: 'Evidence' },
    })
    const before = started.paperProfile?.readingMap

    const replied = await useCases.reply.execute({
      lessonId: started.id,
      content: 'The paper has a limitation.',
    })

    expect(replied.paperProfile?.readingMap).toEqual(before)
    expect(replied.modelRuns.at(-1)?.status).toBe('failed')
  })
```

- [ ] **Step 2: Run Application tests and verify they fail**

Run:

```bash
pnpm --filter @deepstorming/application test -- lesson-use-cases
```

Expected:

```text
FAIL because paperProfile.readingMap is not initialized or updated yet
```

- [ ] **Step 3: Implement deterministic map helpers**

In `packages/application/src/lesson-use-cases.ts`, import the Domain helpers/types:

```ts
import {
  createDefaultPaperReadingMap,
  type PaperReadingMap,
  type PaperReadingMapSlotKind,
} from '@deepstorming/domain'
```

Add helpers near `nextPaperStageForReply`:

```ts
const updateReadingMapSlot = (
  map: PaperReadingMap,
  kind: PaperReadingMapSlotKind,
  summary: string,
  citedAnchorIds: readonly string[],
  updatedAt: string,
): PaperReadingMap => ({
  slots: map.slots.map((slot) =>
    slot.kind === kind
      ? {
          kind,
          summary: summary.trim().slice(0, 500),
          status: slot.status === 'empty' ? 'seeded' : 'updated',
          citedAnchorIds,
          updatedAt,
        }
      : slot,
  ),
})

const createInitialPaperReadingMap = (
  documentTitle: string,
  sourceSnippet: string,
  anchorId: string,
  createdAt: string,
): PaperReadingMap => {
  const base = createDefaultPaperReadingMap()
  const withWhy = updateReadingMapSlot(
    base,
    'why',
    `《${documentTitle}》先从这段证据切入，帮助澄清论文试图解决的核心问题。`,
    [anchorId],
    createdAt,
  )
  return updateReadingMapSlot(
    withWhy,
    'evidence',
    `当前入口证据是：${sourceSnippet.trim().slice(0, 120)}`,
    [anchorId],
    createdAt,
  )
}

const updatePaperReadingMapAfterReply = (
  map: PaperReadingMap,
  reply: string,
  anchorIds: readonly string[],
  updatedAt: string,
): PaperReadingMap => {
  const normalized = reply.trim()
  const lower = normalized.toLowerCase()
  let next = updateReadingMapSlot(
    map,
    'what',
    `学习者当前理解：${normalized.slice(0, 180)}`,
    anchorIds,
    updatedAt,
  )

  if (/method|方法|algorithm|算法|模型|机制/u.test(lower)) {
    next = updateReadingMapSlot(next, 'how', `方法线索：${normalized.slice(0, 180)}`, anchorIds, updatedAt)
  }
  if (/evidence|实验|result|结果|figure|图表|supports|支撑/u.test(lower)) {
    next = updateReadingMapSlot(
      next,
      'evidence',
      `证据线索：${normalized.slice(0, 180)}`,
      anchorIds,
      updatedAt,
    )
  }
  if (/limit|limitation|局限|假设|反例|不能|失败/u.test(lower)) {
    next = updateReadingMapSlot(next, 'limits', `局限线索：${normalized.slice(0, 180)}`, anchorIds, updatedAt)
  }
  if (/future|next|未来|启发|迁移|应用|改进/u.test(lower)) {
    next = updateReadingMapSlot(next, 'next', `延展线索：${normalized.slice(0, 180)}`, anchorIds, updatedAt)
  }

  return next
}
```

- [ ] **Step 4: Initialize and update map in use cases**

In `StartLessonFromDocument`, set paper profile:

```ts
paperProfile:
  draft.lessonMode === 'paper'
    ? {
        currentStage: 'orientation',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [anchorId],
        readingMap: createInitialPaperReadingMap(draft.documentTitle, anchor.snippet, anchorId, createdAt),
      }
    : null,
```

Update `updatePaperProfileAfterReply`:

```ts
const updatePaperProfileAfterReply = (
  session: StoredLessonSession,
  reply: string,
  updatedAt: string,
): StoredLessonSession['paperProfile'] => {
  if (session.lessonMode !== 'paper' || session.paperProfile === null) {
    return session.paperProfile
  }
  const anchorIds = session.sourceAnchors.map((anchor) => anchor.id)
  return {
    ...session.paperProfile,
    currentStage: nextPaperStageForReply(session.paperProfile.currentStage, reply),
    stageSummary: reply.trim(),
    readingMap: updatePaperReadingMapAfterReply(
      session.paperProfile.readingMap,
      reply,
      anchorIds,
      updatedAt,
    ),
  }
}
```

Update callers to pass the same timestamp used for session update:

```ts
paperProfile: updatePaperProfileAfterReply(session, draft.content, finishedAt),
```

and in retry success:

```ts
paperProfile: updatePaperProfileAfterReply(session, learnerMessage.content, finishedAt),
```

- [ ] **Step 5: Run Application tests**

Run:

```bash
pnpm --filter @deepstorming/application test -- lesson-use-cases
pnpm --filter @deepstorming/application typecheck
```

Expected:

```text
PASS application lesson-use-cases tests
PASS application typecheck
```

- [ ] **Step 6: Commit Application changes**

Run:

```bash
git add packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: update paper reading maps from lessons"
```

## Task 4: Infrastructure JSON Persistence Compatibility

**Files:**

- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

- [ ] **Step 1: Write repository tests for persisted and legacy reading maps**

Add assertions to the existing paper profile persistence test:

```ts
    expect(reloaded?.paperProfile?.readingMap.slots).toHaveLength(6)
    expect(reloaded?.paperProfile?.readingMap.slots.find((slot) => slot.kind === 'why')).toMatchObject({
      status: 'seeded',
    })
```

Add a legacy compatibility test:

```ts
  it('normalizes legacy paper profiles that do not include readingMap', () => {
    const db = createMigratedDatabase()
    const repository = new SqliteLessonRepository(db)
    const now = '2026-07-14T00:00:00.000Z'
    db.prepare(
      `INSERT INTO lesson_sessions
       (id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode,paper_profile_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      '00000000-0000-4000-8000-000000000101',
      'Paper Map 课堂',
      'active',
      '00000000-0000-4000-8000-000000000201',
      'Paper Map',
      now,
      now,
      'opening',
      'paper',
      JSON.stringify({
        currentStage: 'orientation',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [],
      }),
    )

    const session = repository.getById('00000000-0000-4000-8000-000000000101')

    expect(session?.paperProfile?.readingMap.slots).toHaveLength(6)
    expect(session?.paperProfile?.readingMap.slots.every((slot) => slot.status === 'empty')).toBe(
      true,
    )
  })
```

- [ ] **Step 2: Run Infrastructure repository tests and verify failures**

Run:

```bash
pnpm --filter @deepstorming/infrastructure test -- sqlite-lesson-repository
```

Expected before Domain/Application changes are wired everywhere:

```text
FAIL if fixtures are missing readingMap or legacy normalization is not applied
```

- [ ] **Step 3: Adjust fixtures only, no repository code unless tests prove it necessary**

If repository code already passes because it uses Domain normalization, only update paper profile fixtures to include `readingMap`.

Use this fixture shape:

```ts
readingMap: {
  slots: [
    {
      kind: 'why',
      summary: 'The paper asks why evidence matters.',
      status: 'seeded',
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    ...['what', 'how', 'evidence', 'limits', 'next'].map((kind) => ({
      kind,
      summary: null,
      status: 'empty' as const,
      citedAnchorIds: [],
      updatedAt: null,
    })),
  ],
}
```

- [ ] **Step 4: Run Infrastructure tests**

Run:

```bash
pnpm --filter @deepstorming/infrastructure test -- sqlite-lesson-repository
pnpm --filter @deepstorming/infrastructure typecheck
```

Expected:

```text
PASS infrastructure sqlite-lesson-repository tests
PASS infrastructure typecheck
```

- [ ] **Step 5: Commit Infrastructure tests/fixture changes**

Run:

```bash
git add packages/infrastructure/src/database/sqlite-lesson-repository.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts
git commit -m "test: cover paper reading map persistence"
```

## Task 5: Renderer Reading Map Card

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.css`

- [ ] **Step 1: Write failing Renderer tests**

Update the `paperSession` fixture in `LessonWorkspace.test.tsx` to include `readingMap`.

Add this map helper near the fixture:

```ts
const readingMap = {
  slots: [
    {
      kind: 'why' as const,
      summary: 'The paper asks why evidence supports model behavior.',
      status: 'seeded' as const,
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    {
      kind: 'what' as const,
      summary: null,
      status: 'empty' as const,
      citedAnchorIds: [],
      updatedAt: null,
    },
    {
      kind: 'how' as const,
      summary: null,
      status: 'empty' as const,
      citedAnchorIds: [],
      updatedAt: null,
    },
    {
      kind: 'evidence' as const,
      summary: 'The opening anchor is the current evidence entry.',
      status: 'seeded' as const,
      citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    {
      kind: 'limits' as const,
      summary: null,
      status: 'empty' as const,
      citedAnchorIds: [],
      updatedAt: null,
    },
    {
      kind: 'next' as const,
      summary: null,
      status: 'empty' as const,
      citedAnchorIds: [],
      updatedAt: null,
    },
  ],
}
```

Add expectations to the paper metadata test:

```ts
    expect(screen.getByText('论文阅读地图')).toBeTruthy()
    expect(screen.getByText('Why')).toBeTruthy()
    expect(screen.getByText('The paper asks why evidence supports model behavior.')).toBeTruthy()
    expect(screen.getAllByText('等待课堂继续补全').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已关联证据').length).toBeGreaterThan(0)
```

Add to the standard lesson omission test:

```ts
    expect(screen.queryByText('论文阅读地图')).toBeNull()
```

- [ ] **Step 2: Run Renderer tests and verify they fail**

Run:

```bash
pnpm --filter @deepstorming/desktop test -- LessonWorkspace
```

Expected:

```text
FAIL because LessonWorkspace does not render the reading map yet
```

- [ ] **Step 3: Render reading map in LessonWorkspace**

In `LessonWorkspace.tsx`, add labels near `paperStageLabels`:

```ts
const paperReadingMapSlotLabels: Record<
  NonNullable<LessonSessionDto['paperProfile']>['readingMap']['slots'][number]['kind'],
  string
> = {
  why: 'Why',
  what: 'What',
  how: 'How',
  evidence: 'Evidence',
  limits: 'Limits',
  next: 'Next',
}

const paperReadingMapStatusLabels: Record<
  NonNullable<LessonSessionDto['paperProfile']>['readingMap']['slots'][number]['status'],
  string
> = {
  empty: '待补全',
  seeded: '已建立',
  updated: '已更新',
}
```

Render after the current paper stage section:

```tsx
                <section className="lesson-paper-map">
                  <h3>论文阅读地图</h3>
                  <div className="lesson-paper-map-grid">
                    {detailState.session.paperProfile.readingMap.slots.map((slot) => (
                      <article key={slot.kind} className="lesson-paper-map-slot">
                        <div className="lesson-paper-map-slot-header">
                          <strong>{paperReadingMapSlotLabels[slot.kind]}</strong>
                          <span>{paperReadingMapStatusLabels[slot.status]}</span>
                        </div>
                        <p>{slot.summary ?? '等待课堂继续补全'}</p>
                        {slot.citedAnchorIds.length > 0 ? (
                          <footer>已关联证据</footer>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
```

Place it only inside the existing paper-mode conditional.

- [ ] **Step 4: Add compact CSS**

In `apps/desktop/src/renderer/src/App.css`, add:

```css
.lesson-paper-map {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-color);
}

.lesson-paper-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.lesson-paper-map-slot {
  min-height: 132px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--background-color);
}

.lesson-paper-map-slot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.lesson-paper-map-slot-header span,
.lesson-paper-map-slot footer {
  color: var(--muted-text-color);
  font-size: 0.85rem;
}
```

If those CSS variables do not exist, use existing nearby variables from `App.css` instead of inventing a new palette.

- [ ] **Step 5: Run Renderer tests**

Run:

```bash
pnpm --filter @deepstorming/desktop test -- LessonWorkspace
pnpm --filter @deepstorming/desktop typecheck
```

Expected:

```text
PASS LessonWorkspace tests
PASS desktop typecheck
```

- [ ] **Step 6: Commit Renderer changes**

Run:

```bash
git add apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/App.css
git commit -m "feat: show paper reading map in lessons"
```

## Task 6: E2E and Planning Docs

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Extend paper E2E assertions**

In `tests/e2e/app.spec.ts`, update the paper lesson test:

```ts
      await page.getByRole('button', { name: '开始课堂' }).click()
      await expect(page.getByText('当前论文阶段')).toBeVisible()
      await expect(page.getByText('整体定位')).toBeVisible()
      await expect(page.getByText('论文阅读地图')).toBeVisible()
      await expect(page.getByText('Why')).toBeVisible()
      await expect(page.getByText('Evidence')).toBeVisible()
```

After submitting the learner answer:

```ts
      await expect(page.getByText('问题定位')).toBeVisible()
      await expect(page.getByText(/I think the paper is solving/)).toBeVisible()
```

After restart:

```ts
      await expect(page.getByText('论文阅读地图')).toBeVisible()
      await expect(page.getByText(/I think the paper is solving/)).toBeVisible()
```

- [ ] **Step 2: Run targeted E2E**

Run:

```bash
pnpm exec playwright test tests/e2e/app.spec.ts -g "starts a paper lesson"
```

Expected:

```text
PASS paper lesson E2E
```

- [ ] **Step 3: Update planning docs**

In `docs/planning/current-status.md`, add under completed Phase 6 work:

```markdown
- Phase 6 D7.1 Paper Reading Map MVP：
  - Domain / Contracts：`paperProfile` 新增可持久化 `readingMap`，包含 Why / What / How / Evidence / Limits / Next 六个槽位。
  - Application：paper lesson 启动时 seeded 默认地图，成功回答或成功 retry 后 deterministic 更新相关槽位；失败和取消不更新地图。
  - Infrastructure：复用 `paper_profile_json`，旧 paper profile 缺少 `readingMap` 时读取为默认空地图，无新增 migration。
  - Desktop：课堂页在当前论文阶段下方展示“论文阅读地图”，standard lesson 不显示。
  - E2E：覆盖 PDF paper lesson 启动、回答更新地图与重启恢复。
```

In `docs/planning/software-design-completion-roadmap.md`, update D7 completed work:

```markdown
- D7.1 Paper Reading Map MVP：paper lesson 已有 Why / What / How / Evidence / Limits / Next 六槽阅读地图，并随课堂成功交互持久化更新。
```

Keep remaining D7 work:

```markdown
- Section / Claim / Evidence / Limitation 的结构化抽取与持久化。
- 跨论文工作区与论文专用复习聚合视图。
```

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm check
pnpm test:e2e
```

Expected:

```text
PASS pnpm check
PASS pnpm test:e2e
```

- [ ] **Step 5: Commit E2E and docs**

Run:

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "docs: mark paper reading map complete"
```

## Task 7: Final Integration Check

**Files:**

- Modify only if final verification exposes a small documentation mismatch.

- [ ] **Step 1: Check worktree status**

Run:

```bash
git status --short
```

Expected:

```text
No output
```

- [ ] **Step 2: Inspect recent commits**

Run:

```bash
git log --oneline -7
```

Expected top commits:

```text
docs: mark paper reading map complete
feat: show paper reading map in lessons
test: cover paper reading map persistence
feat: update paper reading maps from lessons
feat: expose paper reading map contracts
feat: add paper reading map domain model
docs: design paper reading map mvp
```

- [ ] **Step 3: Record any verification caveat**

If `pnpm test:e2e` cannot run because the desktop environment is unavailable, add a short note to `docs/planning/current-status.md` under current gates:

```markdown
- `pnpm test:e2e`：未运行；当前环境不可启动桌面 Playwright。D7.1 已通过 `pnpm check`，需在桌面环境补跑。
```

If E2E ran successfully, do not add a caveat.
