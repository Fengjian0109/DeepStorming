# Paper Stage Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade paper lesson stage progression from a coarse rule set to a balanced “rules first, model suggestion second” flow that advances through the paper-reading stages without extra model calls.

**Architecture:** Extend the existing structured paper insights payload with optional stage suggestions, then centralize stage decision logic in the Application layer so it evaluates local rule signals first, consumes provider suggestions only when signals are weak, and applies forward-only progression constraints before persisting `currentStage` and `stageSummary`. Reuse the existing `paper_profile_json`, lesson reply/retry success paths, and current renderer stage display.

**Tech Stack:** TypeScript, Vitest, Zod, Electron renderer React, Playwright, SQLite via `better-sqlite3`.

---

## File Structure

- Modify `packages/contracts/src/lesson.ts`: ensure paper lesson DTOs still accept the same persisted stage fields after Application changes.
- Modify `packages/application/src/provider-ports.ts`: extend `StructuredPaperInsights` with optional stage suggestion fields.
- Modify `packages/application/src/lesson-use-cases.ts`: replace the coarse `nextPaperStageForReply()` logic with a rule-first stage decision pipeline plus progression constraints and stage summary generation.
- Modify `packages/application/src/lesson-use-cases.test.ts`: cover strong-rule progression, model-assisted progression, invalid/too-aggressive suggestions, retry parity, and “stay put” behavior.
- Modify `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`: keep stage label coverage aligned with richer summaries if needed.
- Modify `tests/e2e/app.spec.ts`: extend the paper lesson flow to assert at least one later-stage advancement beyond `problem_framing`.
- Modify `docs/planning/current-status.md`: record D7.3 completion and the new mixed progression strategy.
- Modify `docs/planning/software-design-completion-roadmap.md`: move D7.3 from remaining work to completed work.

### Task 1: Add failing tests for mixed paper stage progression

**Files:**

- Modify: `packages/application/src/lesson-use-cases.test.ts`

- [ ] **Step 1: Write the failing tests for rule-driven progression**

Add tests near the existing paper stage coverage:

```ts
it('advances from problem framing to method intuition when the reply explains why the approach works', async () => {
  const lesson = createPaperLesson({
    currentStage: 'problem_framing',
    stageSummary: '已进入问题定位：当前回答聚焦论文要解决的问题。',
  })

  const updated = await submitPaperReply({
    lesson,
    learnerReply: 'The key idea is that the retrieval signal works because it constrains noisy supervision and gives the model a better inductive bias.',
  })

  expect(updated.paperProfile?.currentStage).toBe('method_intuition')
  expect(updated.paperProfile?.stageSummary).toContain('方法直觉')
})

it('advances from method mechanics to evidence check when the reply focuses on experiments and ablations', async () => {
  const lesson = createPaperLesson({
    currentStage: 'method_mechanics',
    stageSummary: '已进入方法细节：当前回答聚焦模块和训练流程。',
  })

  const updated = await submitPaperReply({
    lesson,
    learnerReply: 'The experiments, benchmark comparison, and ablation results are the main evidence that the method actually improves performance.',
  })

  expect(updated.paperProfile?.currentStage).toBe('evidence_check')
  expect(updated.paperProfile?.stageSummary).toContain('证据核验')
})
```

- [ ] **Step 2: Write the failing tests for model-assisted progression and constraints**

Add tests for weak-rule cases:

```ts
it('accepts a provider suggested stage when local rule signals are weak', async () => {
  generator.nextStructuredPaperInsights = {
    suggestedStage: 'transfer',
    suggestedStageRationale: 'The learner is discussing how the method could be adapted to adjacent tasks.',
    cards: [],
  }

  const lesson = createPaperLesson({
    currentStage: 'critical_review',
    stageSummary: '已进入批判审视：当前回答开始讨论局限。',
  })

  const updated = await submitPaperReply({
    lesson,
    learnerReply: 'It might also be useful in nearby settings, though I am still not fully sure.',
  })

  expect(updated.paperProfile?.currentStage).toBe('transfer')
  expect(updated.paperProfile?.stageSummary).toContain('transfer')
})

it('rejects provider suggestions that jump too far ahead', async () => {
  generator.nextStructuredPaperInsights = {
    suggestedStage: 'synthesis',
    suggestedStageRationale: 'The learner seems ready to wrap up.',
    cards: [],
  }

  const lesson = createPaperLesson({
    currentStage: 'problem_framing',
    stageSummary: '已进入问题定位：当前回答聚焦论文要解决的问题。',
  })

  const updated = await submitPaperReply({
    lesson,
    learnerReply: 'I think the paper is about improving the task formulation.',
  })

  expect(updated.paperProfile?.currentStage).toBe('problem_framing')
})
```

- [ ] **Step 3: Run the targeted Application tests to verify they fail**

Run: `pnpm exec vitest run packages/application/src/lesson-use-cases.test.ts`

Expected: FAIL because the current paper stage logic only supports coarse advancement and does not consume `suggestedStage`.

- [ ] **Step 4: Commit the red test snapshot**

```bash
git add packages/application/src/lesson-use-cases.test.ts
git commit -m "test: add paper stage progression coverage"
```

### Task 2: Implement the mixed progression logic in Application

**Files:**

- Modify: `packages/application/src/provider-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`

- [ ] **Step 1: Extend `StructuredPaperInsights` with optional stage suggestions**

Update `packages/application/src/provider-ports.ts`:

```ts
export type StructuredPaperInsights = Readonly<{
  readingMapUpdates?: StructuredPaperReadingMapUpdates
  suggestedStage?: PaperReadingStage
  suggestedStageRationale?: string
  cards: readonly StructuredPaperInsightCardInput[]
}>
```

- [ ] **Step 2: Add normalization for the optional suggestion fields**

Inside `normalizeStructuredPaperInsights(...)` in `packages/application/src/lesson-use-cases.ts`, validate:

```ts
const suggestedStage = value['suggestedStage']
const suggestedStageRationale = value['suggestedStageRationale']

const normalizedSuggestedStage =
  suggestedStage === 'orientation' ||
  suggestedStage === 'problem_framing' ||
  suggestedStage === 'method_intuition' ||
  suggestedStage === 'method_mechanics' ||
  suggestedStage === 'evidence_check' ||
  suggestedStage === 'critical_review' ||
  suggestedStage === 'transfer' ||
  suggestedStage === 'synthesis'
    ? suggestedStage
    : undefined

const normalizedSuggestedStageRationale =
  typeof suggestedStageRationale === 'string' && suggestedStageRationale.trim().length > 0
    ? suggestedStageRationale.trim()
    : undefined
```

Return them conditionally:

```ts
return {
  cards,
  ...(Object.keys(readingMapUpdates).length === 0 ? {} : { readingMapUpdates }),
  ...(normalizedSuggestedStage === undefined ? {} : { suggestedStage: normalizedSuggestedStage }),
  ...(normalizedSuggestedStageRationale === undefined
    ? {}
    : { suggestedStageRationale: normalizedSuggestedStageRationale }),
}
```

- [ ] **Step 3: Replace the coarse stage helper with a rule-first decision pipeline**

In `packages/application/src/lesson-use-cases.ts`, replace the current `nextPaperStageForReply()` with focused helpers:

```ts
const PAPER_STAGE_ORDER: readonly PaperReadingStage[] = [
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
]

const stageIndex = (stage: PaperReadingStage): number => PAPER_STAGE_ORDER.indexOf(stage)

const detectRuleBasedPaperStage = (
  currentStage: PaperReadingStage,
  reply: string,
  readingMap: PaperReadingMap,
  insightCards: readonly PaperInsightCard[],
): Readonly<{ strength: 'strong' | 'weak' | 'none'; stage: PaperReadingStage | null; rationale: string | null }> => {
  const normalized = reply.toLowerCase()

  if (/experiment|benchmark|ablation|指标|实验|对比|消融/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: currentStage === 'method_mechanics' ? 'evidence_check' : 'evidence_check',
      rationale: '当前回答开始讨论实验结果与证据。',
    }
  }

  if (/because|intuition|why it works|直觉|为什么有效|关键想法|核心思路/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'method_intuition',
      rationale: '当前回答开始解释方法为何有效。',
    }
  }

  if (/module|architecture|formula|loss|objective|训练|结构|公式|流程|模块/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'method_mechanics',
      rationale: '当前回答开始讨论方法细节与实现机制。',
    }
  }

  if (/limitation|assumption|failure|counterexample|局限|假设|不足|反例|漏洞/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'critical_review',
      rationale: '当前回答开始讨论局限、假设或潜在问题。',
    }
  }

  if (/future|transfer|adapt|application|启发|迁移|应用|改进|未来/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'transfer',
      rationale: '当前回答开始讨论迁移、应用或改进方向。',
    }
  }

  if (/summary|takeaway|overall|总结|主线|整体看|最终理解/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'synthesis',
      rationale: '当前回答开始整体总结论文主线。',
    }
  }

  if (readingMap.slots.some((slot) => slot.kind === 'evidence' && slot.status === 'updated')) {
    return {
      strength: 'weak',
      stage: 'evidence_check',
      rationale: '阅读地图已积累实验相关线索。',
    }
  }

  if (insightCards.some((card) => card.kind === 'limitation')) {
    return {
      strength: 'weak',
      stage: 'critical_review',
      rationale: '当前洞察卡片已经出现局限线索。',
    }
  }

  return { strength: 'none', stage: null, rationale: null }
}
```

- [ ] **Step 4: Add progression constraints and model fallback**

In `packages/application/src/lesson-use-cases.ts`, add:

```ts
const clampPaperStageProgression = (
  currentStage: PaperReadingStage,
  candidateStage: PaperReadingStage,
): PaperReadingStage => {
  const current = stageIndex(currentStage)
  const candidate = stageIndex(candidateStage)

  if (candidate <= current) return currentStage
  if (candidate - current > 1) return currentStage
  return candidateStage
}
```

Then create one final decider:

```ts
const decideNextPaperStage = (
  currentStage: PaperReadingStage,
  reply: string,
  readingMap: PaperReadingMap,
  insightCards: readonly PaperInsightCard[],
  structuredPaperInsights: StructuredPaperInsights | undefined,
): Readonly<{ stage: PaperReadingStage; summary: string | null }> => {
  const rule = detectRuleBasedPaperStage(currentStage, reply, readingMap, insightCards)

  if (currentStage === 'orientation') {
    return {
      stage: 'problem_framing',
      summary: '已进入问题定位：当前回答开始聚焦论文要解决的问题。',
    }
  }

  if (rule.strength === 'strong' && rule.stage !== null) {
    const stage = clampPaperStageProgression(currentStage, rule.stage)
    return {
      stage,
      summary:
        stage === currentStage
          ? `继续停留在${paperStageSummaryLabel(stage)}：当前回答尚不足以安全推进到更后阶段。`
          : `已进入${paperStageSummaryLabel(stage)}：${rule.rationale}`,
    }
  }

  if (structuredPaperInsights?.suggestedStage !== undefined) {
    const stage = clampPaperStageProgression(currentStage, structuredPaperInsights.suggestedStage)
    if (stage !== currentStage) {
      return {
        stage,
        summary:
          structuredPaperInsights.suggestedStageRationale === undefined
            ? `已进入${paperStageSummaryLabel(stage)}：当前回答的规则信号不足，已采用本轮结构化阶段建议。`
            : `已进入${paperStageSummaryLabel(stage)}：${structuredPaperInsights.suggestedStageRationale}`,
      }
    }
  }

  if (rule.strength === 'weak' && rule.stage !== null) {
    const stage = clampPaperStageProgression(currentStage, rule.stage)
    if (stage !== currentStage) {
      return {
        stage,
        summary: `已进入${paperStageSummaryLabel(stage)}：${rule.rationale}`,
      }
    }
  }

  return {
    stage: currentStage,
    summary: `继续停留在${paperStageSummaryLabel(currentStage)}：当前回答暂未提供足够的新阶段信号。`,
  }
}
```

- [ ] **Step 5: Wire the new decider into the paper profile update path**

In `updatePaperProfileAfterReply(...)`, replace:

```ts
const nextStage = nextPaperStageForReply(session.paperProfile.currentStage, reply)
```

with:

```ts
const stageDecision = decideNextPaperStage(
  session.paperProfile.currentStage,
  reply,
  readingMap,
  insightCards,
  normalizedStructuredInsights,
)
```

Then persist:

```ts
currentStage: stageDecision.stage,
stageSummary: stageDecision.summary,
```

- [ ] **Step 6: Run the targeted Application tests to verify they pass**

Run: `pnpm exec vitest run packages/application/src/lesson-use-cases.test.ts`

Expected: PASS with the new rule-first progression and model fallback behavior covered.

- [ ] **Step 7: Commit the green Application implementation**

```bash
git add packages/application/src/provider-ports.ts packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts
git commit -m "feat: refine paper stage progression"
```

### Task 3: Verify UI- and persistence-level behavior

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 1: Write the failing E2E assertion for a later-stage advance**

Update the paper lesson E2E so the reply text strongly targets evidence-check behavior:

```ts
await page
  .getByLabel('你的回答')
  .fill(
    'The experiments, benchmark comparison, and ablation results are the main evidence that the method actually improves performance.',
  )
await page.getByRole('button', { name: '提交回答' }).click()

await expect(page.locator('.lesson-paper-stage').getByText('证据核验')).toBeVisible()
```

- [ ] **Step 2: Run the E2E suite to verify the new assertion fails before implementation is complete**

Run: `pnpm test:e2e`

Expected: FAIL on the new `证据核验` stage assertion if Task 2 has not landed yet; PASS after Task 2 is complete.

- [ ] **Step 3: Update planning docs**

In `docs/planning/current-status.md`, add a D7.3 completion note:

```md
- Phase 6 D7.3 Paper Stage Progression：
  - Application：paper lesson 阶段推进升级为“规则主导 + 模型补充”；规则信号不足时才采纳当前 provider payload 的 `suggestedStage`，且不会额外触发第二轮模型请求。
  - Persistence / Desktop：`currentStage` 与 `stageSummary` 在课堂中实时更新，并在重启后恢复。
  - E2E：覆盖 paper lesson 从早期阶段推进到更细粒度阶段的主流程。
```

In `docs/planning/software-design-completion-roadmap.md`, move the item from remaining work to completed work:

```md
- D7.3 Paper Stage Progression：paper lesson 已支持更细粒度的阶段推进规则，并在规则信号不足时接收本轮结构化阶段建议。
```

- [ ] **Step 4: Run targeted renderer/persistence verification if stage text snapshots changed**

Run: `pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

Expected: PASS unless the stage summary wording requires a test update.

- [ ] **Step 5: Run the full project verification**

Run:

```bash
pnpm check
pnpm test:e2e
git diff --check
```

Expected:

- `pnpm check` PASS
- `pnpm test:e2e` PASS
- `git diff --check` clean

- [ ] **Step 6: Commit the docs and verification updates**

```bash
git add tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "test: verify paper stage progression"
```
