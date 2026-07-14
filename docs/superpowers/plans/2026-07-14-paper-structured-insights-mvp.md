# Paper Structured Insights MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent paper insight cards that update alongside the existing six-slot paper reading map after successful paper lesson replies and retries, using model-provided structured payloads when already available and otherwise falling back to deterministic local extraction.

**Architecture:** Extend the existing `paperProfile` aggregate with structured insight cards in Domain and Contracts, then add one Application-side merger that consumes either optional provider payloads or local fallback extraction without issuing extra model requests. Reuse the existing SQLite `paper_profile_json` persistence path and paper lesson workspace, adding a second renderer section for grouped insight cards while preserving standard lessons unchanged.

**Tech Stack:** TypeScript, Vitest, Zod, Electron renderer React, Playwright, SQLite via `better-sqlite3`.

---

## File Structure

- Modify `packages/domain/src/lesson.ts`: add paper insight card types, defaults, normalization, and capped per-kind merge helpers.
- Modify `packages/domain/src/lesson.test.ts`: cover default cards, legacy compatibility, standard/paper invariants, and per-kind cap behavior.
- Modify `packages/contracts/src/lesson.ts`: add DTO schemas/types for paper insight cards and extend paper lesson profile schema.
- Modify `packages/contracts/src/lesson.test.ts`: validate legal/illegal DTO payloads with insight cards.
- Modify `packages/application/src/lesson-ports.ts`: extend stored lesson/provider reply types with optional structured paper insights payload.
- Modify `packages/application/src/lesson-use-cases.ts`: add paper structured insights fallback extractor, merger, and success-path updates without a second provider call.
- Modify `packages/application/src/lesson-use-cases.test.ts`: cover model-first, invalid-model-fallback, local fallback, retry parity, and no-op on failed/cancelled runs.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.ts`: rely on normalized `paperProfile` shape round-trip for insight cards.
- Modify `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`: prove persistence and old JSON compatibility without migration.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`: render grouped paper insight cards below the reading map for paper lessons only.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: cover paper card rendering, source labels, and standard omission.
- Modify `apps/desktop/src/renderer/src/styles/global.css`: style the new grouped card area.
- Modify `tests/e2e/app.spec.ts`: assert paper insight cards appear, update after reply, and persist after restart.
- Modify `docs/planning/current-status.md` and `docs/planning/software-design-completion-roadmap.md`: mark D7.2 progress/completion and keep later paper workflow items.

### Task 1: Extend Domain and Contracts for paper insight cards

**Files:**
- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.test.ts`

- [ ] **Step 1: Write the failing Domain tests**

Add tests near the existing paper reading map coverage in `packages/domain/src/lesson.test.ts`:

```ts
it('creates an empty paper insight card collection by default', () => {
  const session = normalizeLessonSession({
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Paper Session',
    status: 'active',
    documentId: '00000000-0000-4000-8000-000000000102',
    documentTitle: 'Paper',
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
      readingMap: createDefaultPaperReadingMap(),
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  })

  expect(session.paperProfile?.insightCards).toEqual([])
})

it('normalizes legacy paper profiles without insight cards', () => {
  const session = normalizeLessonSession({
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Paper Session',
    status: 'active',
    documentId: '00000000-0000-4000-8000-000000000102',
    documentTitle: 'Paper',
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
      readingMap: createDefaultPaperReadingMap(),
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  })

  expect(session.paperProfile?.insightCards).toEqual([])
})

it('rejects paper insight cards on standard lessons', () => {
  expect(() =>
    normalizeLessonSession({
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Standard Session',
      status: 'active',
      documentId: '00000000-0000-4000-8000-000000000102',
      documentTitle: 'Paper',
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
        readingMap: createDefaultPaperReadingMap(),
        insightCards: [],
      },
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    }),
  ).toThrowError('Standard lessons must not include paper profile data')
})
```

Also add a helper-focused test:

```ts
it('caps paper insight cards to the latest three cards per kind', () => {
  const cards = normalizePaperInsightCards([
    createPaperInsightCard('section', 'A', 'One', 'orientation', 'fallback', [], '2026-07-11T00:00:00.000Z'),
    createPaperInsightCard('section', 'B', 'Two', 'orientation', 'fallback', [], '2026-07-11T00:01:00.000Z'),
    createPaperInsightCard('section', 'C', 'Three', 'orientation', 'fallback', [], '2026-07-11T00:02:00.000Z'),
    createPaperInsightCard('section', 'D', 'Four', 'orientation', 'fallback', [], '2026-07-11T00:03:00.000Z'),
  ])

  expect(cards.filter((card) => card.kind === 'section').map((card) => card.title)).toEqual([
    'B',
    'C',
    'D',
  ])
})
```

- [ ] **Step 2: Run the Domain tests to verify they fail**

Run: `pnpm exec vitest run packages/domain/src/lesson.test.ts`

Expected: FAIL because `insightCards`, related types, and normalization helpers do not exist yet.

- [ ] **Step 3: Implement the minimal Domain insight card model**

In `packages/domain/src/lesson.ts`, add alongside the existing paper reading map declarations:

```ts
export const PAPER_INSIGHT_CARD_KINDS = [
  'section',
  'claim',
  'evidence',
  'limitation',
] as const

export const PAPER_INSIGHT_CARD_CONFIDENCE = ['fallback', 'model'] as const

export type PaperInsightCardKind = (typeof PAPER_INSIGHT_CARD_KINDS)[number]
export type PaperInsightCardConfidence = (typeof PAPER_INSIGHT_CARD_CONFIDENCE)[number]

export type PaperInsightCard = Readonly<{
  id: string
  kind: PaperInsightCardKind
  title: string
  summary: string
  sourceAnchorIds: readonly string[]
  stage: PaperReadingStage
  confidence: PaperInsightCardConfidence
  updatedAt: string
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
  insightCards: readonly PaperInsightCard[]
}>
```

Add helpers:

```ts
export const createPaperInsightCard = (
  kind: PaperInsightCardKind,
  title: string,
  summary: string,
  stage: PaperReadingStage,
  confidence: PaperInsightCardConfidence,
  sourceAnchorIds: readonly string[],
  updatedAt: string,
): PaperInsightCard => ({
  id: crypto.randomUUID(),
  kind,
  title: normalizeNonBlank(title, 'Paper insight card title must not be blank'),
  summary: normalizeNonBlank(summary, 'Paper insight card summary must not be blank'),
  sourceAnchorIds: [...new Set(sourceAnchorIds)],
  stage,
  confidence,
  updatedAt: assertIsoTimestamp(updatedAt, 'Paper insight card updated timestamp is invalid'),
})

export const normalizePaperInsightCards = (
  cards: readonly PaperInsightCard[] | null | undefined,
): readonly PaperInsightCard[] => {
  const normalized = (cards ?? []).map((card) => ({
    ...card,
    title: normalizeNonBlank(card.title, 'Paper insight card title must not be blank'),
    summary: normalizeNonBlank(card.summary, 'Paper insight card summary must not be blank'),
    sourceAnchorIds: [...new Set(card.sourceAnchorIds)],
    updatedAt: assertIsoTimestamp(card.updatedAt, 'Paper insight card updated timestamp is invalid'),
  }))

  return PAPER_INSIGHT_CARD_KINDS.flatMap((kind) =>
    normalized.filter((card) => card.kind === kind).slice(-3),
  )
}
```

Update `normalizePaperLessonProfile()` to include:

```ts
insightCards: normalizePaperInsightCards(profile?.insightCards),
```

and keep standard lessons rejecting any non-null `paperProfile`.

- [ ] **Step 4: Run the Domain tests to verify they pass**

Run: `pnpm exec vitest run packages/domain/src/lesson.test.ts`

Expected: PASS with the new paper insight normalization coverage green.

- [ ] **Step 5: Write the failing Contracts tests**

In `packages/contracts/src/lesson.test.ts`, add:

```ts
it('parses paper lesson profiles with structured insight cards', () => {
  const result = lessonSessionSchema.parse({
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Paper Session',
    status: 'active',
    documentId: '00000000-0000-4000-8000-000000000102',
    documentTitle: 'Paper',
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
      currentStage: 'problem_framing',
      stageSummary: null,
      termsIntroduced: [],
      citedAnchorIds: [],
      readingMap: { slots: [] },
      insightCards: [
        {
          id: '00000000-0000-4000-8000-000000000103',
          kind: 'claim',
          title: 'Core claim',
          summary: 'The paper argues evidence supports behavior-level evaluation.',
          sourceAnchorIds: [],
          stage: 'problem_framing',
          confidence: 'model',
          updatedAt: '2026-07-11T00:00:00.000Z',
        },
      ],
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  })

  expect(result.paperProfile?.insightCards[0]?.kind).toBe('claim')
})

it('rejects invalid paper insight cards', () => {
  expect(() =>
    lessonSessionSchema.parse({
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Paper Session',
      status: 'active',
      documentId: '00000000-0000-4000-8000-000000000102',
      documentTitle: 'Paper',
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
        currentStage: 'problem_framing',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [],
        readingMap: { slots: [] },
        insightCards: [
          {
            id: '00000000-0000-4000-8000-000000000103',
            kind: 'note',
            title: '',
            summary: 'x',
            sourceAnchorIds: [],
            stage: 'problem_framing',
            confidence: 'fallback',
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
        ],
      },
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    }),
  ).toThrow()
})
```

- [ ] **Step 6: Run the Contracts tests to verify they fail**

Run: `pnpm exec vitest run packages/contracts/src/lesson.test.ts`

Expected: FAIL because the DTO schema does not yet accept `insightCards`.

- [ ] **Step 7: Implement the minimal Contracts schemas**

In `packages/contracts/src/lesson.ts`, add:

```ts
export const paperInsightCardKindSchema = z.enum([
  'section',
  'claim',
  'evidence',
  'limitation',
])

export const paperInsightCardConfidenceSchema = z.enum(['fallback', 'model'])

export const paperInsightCardSchema = z.object({
  id: uuidSchema,
  kind: paperInsightCardKindSchema,
  title: nonBlankTrimmedStringSchema,
  summary: nonBlankTrimmedStringSchema,
  sourceAnchorIds: z.array(uuidSchema),
  stage: paperReadingStageSchema,
  confidence: paperInsightCardConfidenceSchema,
  updatedAt: isoTimestampSchema,
})
```

Extend `paperLessonProfileSchema`:

```ts
insightCards: z.array(paperInsightCardSchema).default([]),
```

Export DTO types:

```ts
export type PaperInsightCardKindDto = z.infer<typeof paperInsightCardKindSchema>
export type PaperInsightCardConfidenceDto = z.infer<typeof paperInsightCardConfidenceSchema>
export type PaperInsightCardDto = z.infer<typeof paperInsightCardSchema>
```

- [ ] **Step 8: Run the Contracts tests to verify they pass**

Run: `pnpm exec vitest run packages/contracts/src/lesson.test.ts`

Expected: PASS with paper insight DTO validation green.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: add paper structured insight contracts"
```

### Task 2: Add Application structured insight extraction and merge behavior

**Files:**
- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write the failing Application tests**

In `packages/application/src/lesson-use-cases.test.ts`, add to the paper lesson suite:

```ts
it('prefers structured paper insights from the current provider reply payload', async () => {
  documents.document = { ...documentRecord, documentType: 'paper' }
  const created = await new StartLessonFromDocument(
    documents,
    lessons,
    clock,
    idGenerator,
    undefined,
    createContextAssembler(),
  ).execute({
    documentId,
    documentTitle: 'Paper Map',
    source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
  })

  providers.replyResult = {
    providerId: 'provider-1',
    modelName: 'mock-cloud',
    content: 'The paper claims evidence-grounded behavior evaluation matters.',
    promptVersion: 'paper-tutor-follow-up-v2',
    promptManifest: promptManifestFor('lesson.paper.follow_up', 2, 'hash'),
    action: {
      actionType: 'ask',
      stateBefore: 'probing',
      stateAfter: 'probing',
      utterance: 'The paper claims evidence-grounded behavior evaluation matters.',
      citedChunkIds: [],
      rationale: 'Continue probing.',
    },
    structuredPaperInsights: {
      readingMapUpdates: {
        what: '模型结构化：论文核心主张是基于证据评估行为。',
      },
      cards: [
        {
          kind: 'claim',
          title: 'Evidence-grounded evaluation',
          summary: '论文主张应以证据为基础评估模型行为。',
          sourceAnchorIds: [anchorId],
          stage: 'problem_framing',
          confidence: 'model',
        },
      ],
    },
  }

  const updated = await new SubmitLessonReply(
    lessons,
    clock,
    { generate: () => randomUUID() },
    createContextAssembler(),
  ).execute({
    lessonId: created.id,
    content: 'I think the paper is about evidence-grounded evaluation.',
  })

  expect(updated.paperProfile?.readingMap.slots.find((slot) => slot.kind === 'what')).toMatchObject({
    summary: '模型结构化：论文核心主张是基于证据评估行为。',
  })
  expect(updated.paperProfile?.insightCards).toContainEqual(
    expect.objectContaining({
      kind: 'claim',
      title: 'Evidence-grounded evaluation',
      confidence: 'model',
    }),
  )
})

it('falls back to local extraction when structured paper insights are absent or invalid', async () => {
  documents.document = { ...documentRecord, documentType: 'paper' }
  const created = await new StartLessonFromDocument(
    documents,
    lessons,
    clock,
    idGenerator,
    undefined,
    createContextAssembler(),
  ).execute({
    documentId,
    documentTitle: 'Paper Map',
    source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
  })

  providers.replyResult = {
    providerId: 'provider-1',
    modelName: 'mock-cloud',
    content: 'The method uses evidence to support the central claim.',
    promptVersion: 'paper-tutor-follow-up-v2',
    promptManifest: promptManifestFor('lesson.paper.follow_up', 2, 'hash'),
    action: {
      actionType: 'ask',
      stateBefore: 'probing',
      stateAfter: 'probing',
      utterance: 'The method uses evidence to support the central claim.',
      citedChunkIds: [],
      rationale: 'Continue probing.',
    },
    structuredPaperInsights: { cards: [{ kind: 'bad' }] },
  } as never

  const updated = await new SubmitLessonReply(
    lessons,
    clock,
    { generate: () => randomUUID() },
    createContextAssembler(),
  ).execute({
    lessonId: created.id,
    content: 'The method uses evidence to support the central claim.',
  })

  expect(updated.paperProfile?.insightCards).toContainEqual(
    expect.objectContaining({
      kind: 'claim',
      confidence: 'fallback',
    }),
  )
})
```

Also add:

```ts
it('does not trigger a second provider call to extract paper insights', async () => {
  documents.document = { ...documentRecord, documentType: 'paper' }
  const created = await new StartLessonFromDocument(
    documents,
    lessons,
    clock,
    idGenerator,
    undefined,
    createContextAssembler(),
  ).execute({
    documentId,
    documentTitle: 'Paper Map',
    source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
  })

  await new SubmitLessonReply(
    lessons,
    clock,
    { generate: () => randomUUID() },
    createContextAssembler(),
  ).execute({
    lessonId: created.id,
    content: 'The paper has a limitation in evidence coverage.',
  })

  expect(providers.followUpCallCount).toBe(1)
})
```

- [ ] **Step 2: Run the Application tests to verify they fail**

Run: `pnpm exec vitest run packages/application/src/lesson-use-cases.test.ts`

Expected: FAIL because provider reply payloads do not expose structured insights and the lesson success path does not merge cards yet.

- [ ] **Step 3: Extend the provider reply result and stored lesson types**

In `packages/application/src/lesson-ports.ts`, add:

```ts
export type StructuredPaperReadingMapUpdates = Partial<
  Record<PaperReadingMapSlotKind, string>
>

export type StructuredPaperInsightCardInput = Readonly<{
  kind: PaperInsightCardKind
  title: string
  summary: string
  sourceAnchorIds: readonly string[]
  stage: PaperReadingStage
  confidence: PaperInsightCardConfidence
}>

export type StructuredPaperInsights = Readonly<{
  readingMapUpdates?: StructuredPaperReadingMapUpdates
  cards: readonly StructuredPaperInsightCardInput[]
}>
```

and extend `LessonTutorReplyResult`:

```ts
structuredPaperInsights?: StructuredPaperInsights | undefined
```

- [ ] **Step 4: Implement a single paper insight merger in the use cases**

In `packages/application/src/lesson-use-cases.ts`, add focused helpers near the reading map helpers:

```ts
const normalizeInsightTitleKey = (value: string): string =>
  value.trim().toLowerCase().replaceAll(/\s+/g, ' ')

const mergePaperInsightCard = (
  cards: readonly PaperInsightCard[],
  candidate: PaperInsightCard,
): readonly PaperInsightCard[] => {
  const index = cards.findIndex(
    (card) =>
      card.kind === candidate.kind &&
      (normalizeInsightTitleKey(card.title) === normalizeInsightTitleKey(candidate.title) ||
        normalizeInsightTitleKey(card.summary).startsWith(
          normalizeInsightTitleKey(candidate.summary).slice(0, 24),
        )),
  )

  if (index === -1) return normalizePaperInsightCards([...cards, candidate])

  const next = [...cards]
  next[index] = {
    ...next[index]!,
    ...candidate,
    id: next[index]!.id,
    confidence:
      next[index]!.confidence === 'model' || candidate.confidence === 'model'
        ? 'model'
        : 'fallback',
  }
  return normalizePaperInsightCards(next)
}
```

Add fallback extractor:

```ts
const extractFallbackPaperInsights = (
  stage: PaperReadingStage,
  reply: string,
  citedAnchorIds: readonly string[],
  updatedAt: string,
): StructuredPaperInsights => {
  const normalized = reply.trim()
  const cards: StructuredPaperInsightCardInput[] = []
  const readingMapUpdates: StructuredPaperReadingMapUpdates = {}

  if (stage === 'orientation' || stage === 'problem_framing') {
    readingMapUpdates.what = `学习者当前理解：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'claim',
      title: 'Current problem framing',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/method|algorithm|模型|方法|机制/iu.test(normalized)) {
    readingMapUpdates.how = `方法线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'section',
      title: 'Method clues',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/evidence|experiment|result|实验|结果|支撑/iu.test(normalized)) {
    readingMapUpdates.evidence = `证据线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'evidence',
      title: 'Evidence thread',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/limit|limitation|局限|假设|不足/iu.test(normalized)) {
    readingMapUpdates.limits = `局限线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'limitation',
      title: 'Limitation noted',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }

  return { readingMapUpdates, cards }
}
```

Add one merger:

```ts
const updatePaperProfileWithStructuredInsights = (
  session: StoredLessonSession,
  reply: string,
  updatedAt: string,
  structuredPaperInsights: StructuredPaperInsights | undefined,
): StoredLessonSession['paperProfile'] => {
  if (session.lessonMode !== 'paper' || session.paperProfile === null) return session.paperProfile

  const citedAnchorIds = session.sourceAnchors.map((anchor) => anchor.id)
  const source =
    structuredPaperInsights ?? extractFallbackPaperInsights(
      session.paperProfile.currentStage,
      reply,
      citedAnchorIds,
      updatedAt,
    )

  let readingMap = session.paperProfile.readingMap
  for (const [kind, summary] of Object.entries(source.readingMapUpdates ?? {})) {
    if (typeof summary === 'string' && summary.trim().length > 0) {
      readingMap = updateReadingMapSlot(
        readingMap,
        kind as PaperReadingMapSlotKind,
        summary,
        citedAnchorIds,
        updatedAt,
      )
    }
  }

  let insightCards = session.paperProfile.insightCards
  for (const card of source.cards) {
    insightCards = mergePaperInsightCard(
      insightCards,
      createPaperInsightCard(
        card.kind,
        card.title,
        card.summary,
        card.stage,
        card.confidence,
        card.sourceAnchorIds,
        updatedAt,
      ),
    )
  }

  return {
    ...updatePaperProfileAfterReply(session, reply, updatedAt),
    readingMap,
    insightCards,
  }
}
```

Use it only in succeeded reply/retry paths, passing `result.structuredPaperInsights` from the already-returned payload. Do not add any second provider operation.

- [ ] **Step 5: Run the Application tests to verify they pass**

Run: `pnpm exec vitest run packages/application/src/lesson-use-cases.test.ts`

Expected: PASS with structured insights preferring provider payloads, falling back locally, and never issuing a second provider call.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/lesson-ports.ts packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: merge paper structured insights"
```

### Task 3: Persist insight cards and expose them in the lesson workspace

**Files:**
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write the failing Infrastructure tests**

In `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`, add:

```ts
it('persists paper insight cards in paper_profile_json', async () => {
  const created = await repository.create({
    ...paperSession,
    paperProfile: {
      ...paperSession.paperProfile!,
      insightCards: [
        {
          id: '00000000-0000-4000-8000-000000000111',
          kind: 'claim',
          title: 'Core claim',
          summary: 'The paper argues evidence supports the claim.',
          sourceAnchorIds: [paperSession.sourceAnchors[0]!.id],
          stage: 'problem_framing',
          confidence: 'model',
          updatedAt: now,
        },
      ],
    },
  })

  const reloaded = await repository.get(created.id)
  expect(reloaded?.paperProfile?.insightCards).toContainEqual(
    expect.objectContaining({
      kind: 'claim',
      title: 'Core claim',
      confidence: 'model',
    }),
  )
})

it('normalizes legacy paper profiles without insight cards', () => {
  db.prepare(
    `INSERT INTO lesson_sessions
       (id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode,paper_profile_json)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    lessonId,
    'Legacy Paper',
    'active',
    documentId,
    'Paper',
    now,
    now,
    'opening',
    'paper',
    JSON.stringify({
      currentStage: 'orientation',
      stageSummary: null,
      termsIntroduced: [],
      citedAnchorIds: [],
      readingMap: createDefaultPaperReadingMap(),
    }),
  )

  const session = repository.getSync(lessonId)
  expect(session?.paperProfile?.insightCards).toEqual([])
})
```

- [ ] **Step 2: Run the Infrastructure tests to verify they fail**

Run: `pnpm exec vitest run packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

Expected: FAIL because the stored paper profile shape and fixtures do not yet include `insightCards`.

- [ ] **Step 3: Update repository fixtures and round-trip coverage**

In `packages/infrastructure/src/database/sqlite-lesson-repository.ts`, keep the current normalized `mapSession()` path and ensure create/save JSON stringification includes the expanded `paperProfile`. In the test file, update paper fixtures to include `insightCards: []` where appropriate and add the new assertions above.

- [ ] **Step 4: Run the Infrastructure tests to verify they pass**

Run: `pnpm exec vitest run packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

Expected: PASS with insight card persistence and legacy normalization green.

- [ ] **Step 5: Write the failing renderer tests**

In `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`, extend the paper session fixture:

```ts
paperProfile: {
  currentStage: 'problem_framing',
  stageSummary: 'We narrowed the paper problem.',
  termsIntroduced: [],
  citedAnchorIds: [anchorId],
  readingMap: createPaperReadingMapFixture(),
  insightCards: [
    {
      id: '00000000-0000-4000-8000-000000000121',
      kind: 'claim',
      title: 'Evidence-grounded evaluation',
      summary: '论文主张应以证据为基础评估模型行为。',
      sourceAnchorIds: [anchorId],
      stage: 'problem_framing',
      confidence: 'model',
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000122',
      kind: 'evidence',
      title: 'Observed evidence',
      summary: '实验结果被用来支撑核心判断。',
      sourceAnchorIds: [anchorId],
      stage: 'evidence_check',
      confidence: 'fallback',
      updatedAt: now,
    },
  ],
}
```

Add assertions:

```ts
expect(screen.getByText('论文洞察卡片')).toBeTruthy()
expect(screen.getByText('Claim')).toBeTruthy()
expect(screen.getByText('Evidence-grounded evaluation')).toBeTruthy()
expect(screen.getByText('模型')).toBeTruthy()
expect(screen.getByText('规则')).toBeTruthy()
expect(screen.getByText('已关联证据')).toBeTruthy()
```

and for standard sessions:

```ts
expect(screen.queryByText('论文洞察卡片')).toBeNull()
```

- [ ] **Step 6: Run the renderer tests to verify they fail**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

Expected: FAIL because the workspace does not yet render grouped insight cards.

- [ ] **Step 7: Implement the renderer section and styles**

In `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`, add label maps:

```ts
const paperInsightKindLabels = {
  section: 'Section',
  claim: 'Claim',
  evidence: 'Evidence',
  limitation: 'Limitation',
} as const

const paperInsightConfidenceLabels = {
  model: '模型',
  fallback: '规则',
} as const
```

Render after `.lesson-paper-map`:

```tsx
<section className="lesson-paper-insights">
  <h3>论文洞察卡片</h3>
  {(['section', 'claim', 'evidence', 'limitation'] as const).map((kind) => {
    const cards = detailState.session.paperProfile?.insightCards.filter((card) => card.kind === kind) ?? []
    if (cards.length === 0) return null
    return (
      <div key={kind} className="lesson-paper-insight-group">
        <h4>{paperInsightKindLabels[kind]}</h4>
        <div className="lesson-paper-insight-list">
          {cards.map((card) => (
            <article key={card.id} className="lesson-paper-insight-card">
              <header>
                <strong>{card.title}</strong>
                <span>{paperInsightConfidenceLabels[card.confidence]}</span>
              </header>
              <p>{card.summary}</p>
              <footer>
                <span>{paperStageLabels[card.stage]}</span>
                {card.sourceAnchorIds.length > 0 ? <span>已关联证据</span> : null}
              </footer>
            </article>
          ))}
        </div>
      </div>
    )
  })}
</section>
```

In `apps/desktop/src/renderer/src/styles/global.css`, add compact styles for:

```css
.lesson-paper-insights { ... }
.lesson-paper-insight-group { ... }
.lesson-paper-insight-list { ... }
.lesson-paper-insight-card { ... }
.lesson-paper-insight-card header { ... }
.lesson-paper-insight-card footer { ... }
```

following the existing paper map card styling.

- [ ] **Step 8: Run the renderer tests to verify they pass**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

Expected: PASS with grouped insight cards visible for paper lessons only.

- [ ] **Step 9: Commit**

```bash
git add packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: show paper structured insight cards"
```

### Task 4: Verify end-to-end behavior and update planning docs

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Write the failing E2E assertions**

In `tests/e2e/app.spec.ts`, extend the paper lesson test:

```ts
const paperInsights = page.locator('.lesson-paper-insights')
await expect(paperInsights.getByText('论文洞察卡片')).toBeVisible()
await expect(paperInsights.getByText('Claim')).toBeVisible()
await expect(paperInsights.getByText('Evidence')).toBeVisible()
await expect(paperInsights.getByText('规则')).toBeVisible()
```

After submitting the reply:

```ts
await expect(paperInsights.getByText('Current problem framing')).toBeVisible()
await expect(paperInsights.getByText('Method clues')).toBeVisible()
```

After restart:

```ts
await expect(page.locator('.lesson-paper-insights').getByText('论文洞察卡片')).toBeVisible()
await expect(page.locator('.lesson-paper-insights').getByText('Current problem framing')).toBeVisible()
```

- [ ] **Step 2: Run the E2E suite to verify it fails**

Run: `pnpm test:e2e`

Expected: FAIL in the paper lesson test because the desktop app does not yet render or persist the new insight card area.

- [ ] **Step 3: Update project docs for D7.2**

In `docs/planning/current-status.md`, add a new completed section:

```md
- Phase 6 D7.2 Paper Structured Insights MVP：
  - Domain / Contracts：`paperProfile` 新增 `insightCards`，兼容旧 paper profile 缺失字段。
  - Application：成功 reply / retry 时优先消费当前 provider 已返回的结构化结果，否则规则兜底；不额外触发第二轮模型请求。
  - Infrastructure：继续复用 `paper_profile_json`，无新增 migration。
  - Desktop：课堂详情新增“论文洞察卡片”分组展示。
  - E2E：覆盖卡片显示、更新与重启恢复。
```

In `docs/planning/software-design-completion-roadmap.md`, move D7.2 into completed work and leave later paper workflow items, for example:

```md
- D7.2 Paper Structured Insights MVP：paper lesson 已能沉淀 Section / Claim / Evidence / Limitation 洞察卡片，并与六槽地图同步更新。
```

- [ ] **Step 4: Run the full verification commands**

Run: `pnpm check`

Expected: PASS with lint, format, typecheck, unit tests, and desktop build green.

Run: `pnpm test:e2e`

Expected: PASS with the four dev desktop E2E tests green and the packaged-provider test skipped only under its existing precondition.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "test: verify paper structured insights end to end"
```

## Self-Review

- Spec coverage: the tasks cover Domain/Contracts model changes, Application model-first plus fallback extraction, no-second-request token guard, Infrastructure JSON compatibility, Renderer grouped cards, E2E, and planning docs.
- Placeholder scan: every change step points to exact files, code examples, and verification commands; no TBD/TODO placeholders remain.
- Type consistency: `insightCards`, `PaperInsightCardKind`, `PaperInsightCardConfidence`, and `structuredPaperInsights` are named consistently across Domain, Contracts, Application, Infrastructure, and Renderer.
