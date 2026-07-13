# Chunk Retrieval Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a derived PDF chunk index, lexical retrieval, and a shared lesson context budget that powers both lesson start and follow-up generation without sending full document text to providers.

**Architecture:** Keep `document_pages` and `document_text_blocks` as the source of truth, derive `document_chunks` in infrastructure, and expose rebuild/search/context-assembly through application ports. Extend lesson model-run input summaries to persist which chunks were selected so retrieval is testable and auditable in the desktop UI and E2E flows.

**Tech Stack:** TypeScript, Zod, React, SQLite/FTS5, Vitest, Playwright, pnpm monorepo.

---

### Task 1: Add chunk and context-summary models in Domain and Contracts

**Files:**

- Modify: `packages/domain/src/document.ts`
- Test: `packages/domain/src/document.test.ts`
- Modify: `packages/domain/src/lesson.ts`
- Test: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/document.ts`
- Test: `packages/contracts/src/document.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Test: `packages/contracts/src/lesson.test.ts`

- [x] **Step 1: Write the failing domain and contract tests** for `DocumentChunk`, `DocumentContextBudget`, and lesson model-run input summaries that carry selected chunk references.

```ts
expect(() =>
  normalizeDocumentChunk({
    id: validId,
    documentId: validDocumentId,
    pageNumberStart: 2,
    pageNumberEnd: 1,
    blockIds: [validBlockId],
    text: 'chunk text',
    charCount: 10,
    sourceVersion: 'page-text:v1',
    rebuildToken: 'chunk-rule:v1',
  }),
).toThrow('Document chunk page range is invalid')

expect(() => normalizeDocumentContextBudget({ maxChunks: 0, maxCharacters: 2400 })).toThrow(
  'Document context chunk budget is invalid',
)

expect(() =>
  lessonModelRunSchema.parse({
    ...validRun,
    inputSummary: {
      ...validRun.inputSummary,
      contextChunks: [],
    },
  }),
).toThrow()
```

- [x] **Step 2: Run the focused tests and verify the new cases fail.**

Run: `pnpm vitest packages/domain/src/document.test.ts packages/domain/src/lesson.test.ts packages/contracts/src/document.test.ts packages/contracts/src/lesson.test.ts`

Expected: FAIL with missing `normalizeDocumentChunk` / `contextChunks` support.

- [x] **Step 3: Add the minimal domain and contract types.**

```ts
export type DocumentChunk = Readonly<{
  id: string
  documentId: string
  pageNumberStart: number
  pageNumberEnd: number
  blockIds: readonly string[]
  text: string
  charCount: number
  sourceVersion: string
  rebuildToken: string
}>

export type DocumentContextBudget = Readonly<{
  maxChunks: number
  maxCharacters: number
}>

export type LessonContextChunkSummary = Readonly<{
  chunkId: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}>
```

- [x] **Step 4: Extend lesson run input summaries with a required `contextChunks` array and a `contextCharacterCount` total, then rerun the focused tests and `pnpm typecheck`.**

Run: `pnpm vitest packages/domain/src/document.test.ts packages/domain/src/lesson.test.ts packages/contracts/src/document.test.ts packages/contracts/src/lesson.test.ts && pnpm typecheck`

Expected: PASS.

- [x] **Step 5: Commit the model changes.**

```bash
git add packages/domain/src/document.ts packages/domain/src/document.test.ts packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/document.ts packages/contracts/src/document.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts
git commit -m "feat: add chunk context models"
```

### Task 2: Add SQLite chunk storage, FTS, and repository methods

**Files:**

- Modify: `packages/application/src/document-ports.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Test: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-document-import-repository.ts`
- Test: `packages/infrastructure/src/database/sqlite-document-import-repository.test.ts`

- [x] **Step 1: Write failing migration and repository tests** for `document_chunks`, FTS-backed lexical search, and stale-index detection by `sourceVersion` / `rebuildToken`.

```ts
await migrateDatabase(db, options)
const columns = db.prepare("PRAGMA table_info('document_chunks')").all()
expect(columns.map((column) => column.name)).toContain('rebuild_token')

const results = await repository.searchChunks({
  documentId,
  query: 'gradient descent',
  limit: 5,
})
expect(results[0]?.text).toContain('gradient descent')

expect(await repository.hasFreshChunks(documentId, 'page-text:v2', 'chunk-rule:v1')).toBe(false)
```

- [x] **Step 2: Run the focused infrastructure tests and verify failure.**

Run: `pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-import-repository.test.ts`

Expected: FAIL because migration v10 and repository methods do not exist yet.

- [x] **Step 3: Add migration v10** creating `document_chunks` plus an FTS5 virtual table and supporting indexes.

```sql
CREATE TABLE document_chunks (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
 page_number_start INTEGER NOT NULL CHECK (page_number_start > 0),
 page_number_end INTEGER NOT NULL CHECK (page_number_end >= page_number_start),
 block_ids_json TEXT NOT NULL,
 text TEXT NOT NULL,
 char_count INTEGER NOT NULL CHECK (char_count >= 0),
 source_version TEXT NOT NULL,
 rebuild_token TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(document_id, chunk_index)
);
CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
 chunk_id UNINDEXED,
 document_id UNINDEXED,
 body
);
```

- [x] **Step 4: Extend `DocumentImportRepositoryPort` and the SQLite implementation with explicit chunk APIs.**

```ts
replaceChunks(documentId: string, chunks: readonly StoredDocumentChunk[]): Promise<void>
listChunks(documentId: string): Promise<readonly StoredDocumentChunk[]>
searchChunks(input: { documentId: string; query: string; limit: number }): Promise<readonly StoredDocumentChunk[]>
hasFreshChunks(documentId: string, sourceVersion: string, rebuildToken: string): Promise<boolean>
```

- [x] **Step 5: Rerun the focused infrastructure tests and `pnpm typecheck`.**

Run: `pnpm vitest packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-import-repository.test.ts && pnpm typecheck`

Expected: PASS with deterministic lexical ordering and FTS table population covered.

- [x] **Step 6: Commit the persistence layer.**

```bash
git add packages/application/src/document-ports.ts packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-import-repository.ts packages/infrastructure/src/database/sqlite-document-import-repository.test.ts
git commit -m "feat: persist document chunks"
```

### Task 3: Add chunk rebuilding, lexical search, and budget assembly use cases

**Files:**

- Create: `packages/application/src/document-chunking.ts`
- Test: `packages/application/src/document-chunking.test.ts`
- Modify: `packages/application/src/document-use-cases.ts`
- Test: `packages/application/src/document-use-cases.test.ts`
- Modify: `packages/application/src/index.ts`

- [x] **Step 1: Write failing application tests** for three behaviors: deriving chunks from adjacent blocks, selecting top chunks under a `4 / 2400` budget, and returning snippet-only fallback when chunks are stale or absent.

```ts
const selected = selectBudgetedChunks(
  [
    fakeChunk({ id: 'a', charCount: 900 }),
    fakeChunk({ id: 'b', charCount: 900 }),
    fakeChunk({ id: 'c', charCount: 900 }),
  ],
  normalizeDocumentContextBudget({ maxChunks: 2, maxCharacters: 2400 }),
)
expect(selected.map((chunk) => chunk.id)).toEqual(['a', 'b'])

await expect(searchDocumentChunks.execute({ documentId, query: '  ' })).rejects.toMatchObject({
  code: 'DOCUMENT_VALIDATION_FAILED',
})

expect(
  await lessonContextAssembler.execute({
    documentId,
    query: 'evidence snippet',
    fallbackSnippet: 'evidence snippet',
  }),
).toMatchObject({ chunks: [], degradedToSnippetOnly: true })
```

- [x] **Step 2: Run the focused application tests and verify failure.**

Run: `pnpm vitest packages/application/src/document-chunking.test.ts packages/application/src/document-use-cases.test.ts`

Expected: FAIL because chunking helpers and context assembly use cases are not implemented.

- [x] **Step 3: Create focused chunking helpers in a new file** so the rules stay isolated from the larger document use case file.

```ts
export const DEFAULT_CONTEXT_BUDGET = normalizeDocumentContextBudget({
  maxChunks: 4,
  maxCharacters: 2400,
})

export const selectBudgetedChunks = (
  chunks: readonly DocumentChunk[],
  budget: DocumentContextBudget,
): readonly DocumentChunk[] => {
  const selected: DocumentChunk[] = []
  let total = 0
  for (const chunk of chunks) {
    if (selected.length >= budget.maxChunks) break
    if (total + chunk.charCount > budget.maxCharacters) break
    selected.push(chunk)
    total += chunk.charCount
  }
  return selected
}
```

- [x] **Step 4: Add explicit application use cases** for rebuild, search, and context assembly, then export them from `packages/application/src/index.ts`.

```ts
export class RebuildDocumentChunks {
  public async execute(input: { documentId: string }): Promise<readonly DocumentChunk[]> {
    /* ... */
  }
}

export class SearchDocumentChunks {
  public async execute(input: { documentId: string; query: string; limit?: number }) {
    /* ... */
  }
}

export class AssembleLessonContext {
  public async execute(input: {
    documentId: string
    query: string
    fallbackSnippet: string
  }): Promise<{ chunks: readonly DocumentChunk[]; degradedToSnippetOnly: boolean }> {
    /* ... */
  }
}
```

- [x] **Step 5: Rerun the focused tests and `pnpm typecheck`.**

Run: `pnpm vitest packages/application/src/document-chunking.test.ts packages/application/src/document-use-cases.test.ts && pnpm typecheck`

Expected: PASS.

- [x] **Step 6: Commit the application chunking layer.**

```bash
git add packages/application/src/document-chunking.ts packages/application/src/document-chunking.test.ts packages/application/src/document-use-cases.ts packages/application/src/document-use-cases.test.ts packages/application/src/index.ts
git commit -m "feat: add chunk retrieval use cases"
```

### Task 4: Rebuild chunks after PDF import and keep them fresh

**Files:**

- Modify: `packages/application/src/document-use-cases.ts`
- Test: `packages/application/src/document-use-cases.test.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`
- Test: `apps/desktop/src/main/ipc/document-handlers.test.ts` if constructor wiring changes require coverage

- [x] **Step 1: Write failing tests** proving successful PDF import also produces fresh chunks and that a parsing failure never leaves partial chunks behind.

```ts
const imported = await new ImportPdfDocument(
  repo,
  importRepo,
  fileStore,
  extractor,
  hasher,
  clock,
  ids,
  rebuildChunks,
).execute({ filePath, originalName: 'evidence.pdf' })

expect(await importRepo.listChunks(imported.documentId!)).not.toHaveLength(0)
expect(await importRepo.hasFreshChunks(imported.documentId!, 'page-text:v1', 'chunk-rule:v1')).toBe(
  true,
)
```

- [x] **Step 2: Run the focused tests and verify failure.**

Run: `pnpm vitest packages/application/src/document-use-cases.test.ts apps/desktop/src/main/ipc/document-handlers.test.ts`

Expected: FAIL because `ImportPdfDocument` is not yet wired to rebuild chunks.

- [x] **Step 3: Inject `RebuildDocumentChunks` into `ImportPdfDocument` and call it only after pages/blocks are durably saved.**

```ts
await this.imports.replacePagesAndBlocks(pages, blocks)
await this.rebuildDocumentChunks.execute({ documentId })
return await this.imports.updateJob(readyJob)
```

- [x] **Step 4: Update the composition root and any affected tests** so desktop wiring still follows the “main process is composition root” boundary.

```ts
const rebuildDocumentChunks = new RebuildDocumentChunks(documentImports, clock, idGenerator)
const importPdfDocument = new ImportPdfDocument(
  documentRepository,
  documentImportRepository,
  pdfFileStore,
  pdfTextExtractor,
  documentTextHasher,
  clock,
  idGenerator,
  rebuildDocumentChunks,
)
```

- [x] **Step 5: Rerun the focused tests and `pnpm typecheck`.**

Run: `pnpm vitest packages/application/src/document-use-cases.test.ts apps/desktop/src/main/ipc/document-handlers.test.ts && pnpm typecheck`

Expected: PASS.

- [x] **Step 6: Commit automatic chunk rebuilding.**

```bash
git add packages/application/src/document-use-cases.ts packages/application/src/document-use-cases.test.ts apps/desktop/src/main/composition-root.ts apps/desktop/src/main/ipc/document-handlers.test.ts
git commit -m "feat: rebuild chunks after pdf import"
```

### Task 5: Feed budgeted chunks into lesson start and follow-up generation

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Test: `packages/application/src/lesson-use-cases.test.ts`
- Modify: `packages/domain/src/lesson.ts`
- Test: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Test: `packages/contracts/src/lesson.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`

- [x] **Step 1: Write failing lesson tests** for three cases: first-question runs record chunk context, follow-up runs reuse the same budgeter, and stale chunks degrade to snippet-only without aborting the lesson.

```ts
expect(created.modelRuns[0]?.inputSummary.contextChunks).toEqual([
  expect.objectContaining({ chunkId: chunkA.id }),
])
expect(created.modelRuns[0]?.inputSummary.contextCharacterCount).toBeGreaterThan(0)

expect(replied.modelRuns.at(-1)?.inputSummary.contextChunks).toHaveLength(2)

expect(degraded.modelRuns[0]?.inputSummary.contextChunks).toEqual([])
expect(degraded.modelRuns[0]?.inputSummary.contextCharacterCount).toBe(0)
```

- [x] **Step 2: Run the focused lesson tests and verify failure.**

Run: `pnpm vitest packages/application/src/lesson-use-cases.test.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`

Expected: FAIL because lesson runs do not yet persist chunk context or call the context assembler.

- [x] **Step 3: Expand the lesson generator port** so the first question and follow-up both receive the same context-bearing input.

```ts
export type LessonTutorContextChunk = Readonly<{
  chunkId: string
  text: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}>

export interface LessonTutorReplyGeneratorPort {
  generateFirstQuestion(
    input: LessonTutorFirstQuestionRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult>
  generateFollowUp(
    input: LessonTutorReplyRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult>
}
```

- [x] **Step 4: Inject `AssembleLessonContext` into `StartLessonFromDocument`, `SubmitLessonReply`, and `RetryLessonRun`, then persist the selected chunk summaries in `inputSummary_json`.**

```ts
const context = await this.lessonContextAssembler.execute({
  documentId: session.documentId,
  query: `${latestTutorQuestion}\n${draft.content}`,
  fallbackSnippet: anchor.snippet,
})

inputSummary: {
  documentId: session.documentId,
  documentTitle: session.documentTitle,
  sourceAnchorIds: [anchor.id],
  sourceCharacterRange: { startOffset: anchor.startOffset, endOffset: anchor.endOffset },
  snippetCharacterCount: anchor.snippet.length,
  learnerReplyCharacterCount: draft.content.length,
  contextChunks: context.chunks.map(toContextChunkSummary),
  contextCharacterCount: context.chunks.reduce((sum, chunk) => sum + chunk.charCount, 0),
}
```

- [x] **Step 5: Rerun the focused lesson tests and `pnpm typecheck`.**

Run: `pnpm vitest packages/application/src/lesson-use-cases.test.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts && pnpm typecheck`

Expected: PASS, with no migration required because `input_summary_json` is already JSON-backed.

- [x] **Step 6: Commit lesson context integration.**

```bash
git add packages/application/src/lesson-ports.ts packages/application/src/lesson-use-cases.ts packages/application/src/lesson-use-cases.test.ts packages/domain/src/lesson.ts packages/domain/src/lesson.test.ts packages/contracts/src/lesson.ts packages/contracts/src/lesson.test.ts packages/infrastructure/src/database/sqlite-lesson-repository.ts packages/infrastructure/src/database/sqlite-lesson-repository.test.ts apps/desktop/src/main/composition-root.ts
git commit -m "feat: attach chunk context to lesson runs"
```

### Task 6: Surface selected chunks in the desktop app and cover the end-to-end flow

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Test: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`
- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [x] **Step 1: Write failing renderer and E2E assertions** for displaying selected retrieval chunks under each model run and for continuing a lesson when the chunk index is missing.

```ts
expect(screen.getByText('上下文证据')).toBeVisible()
expect(screen.getByText('第 1 页 · 312 字')).toBeVisible()

await expect(page.getByText('上下文证据')).toBeVisible()
await expect(page.getByText('第 1 页')).toBeVisible()
await expect(page.getByText('课堂仍可继续（已降级为 snippet）')).toBeVisible()
```

- [x] **Step 2: Run the focused renderer tests and `pnpm test:e2e`, verifying the new checks fail first.**

Run: `pnpm vitest apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`

Run: `pnpm test:e2e`

Expected: renderer tests and the document/lesson desktop flow fail because context chunks are not shown yet.

- [x] **Step 3: Add a compact “上下文证据” section** in `LessonWorkspace` that reads from `modelRun.inputSummary.contextChunks`, shows page span plus character count, and labels snippet-only fallback.

```tsx
{
  run.inputSummary.contextChunks.length > 0 ? (
    <ul className="lesson-context-chunks">
      {run.inputSummary.contextChunks.map((chunk) => (
        <li key={chunk.chunkId}>
          {chunk.pageNumberStart === chunk.pageNumberEnd
            ? `第 ${chunk.pageNumberStart} 页 · ${chunk.charCount} 字`
            : `第 ${chunk.pageNumberStart}-${chunk.pageNumberEnd} 页 · ${chunk.charCount} 字`}
        </li>
      ))}
    </ul>
  ) : (
    <p>课堂仍可继续（已降级为 snippet）</p>
  )
}
```

- [x] **Step 4: Update E2E to cover both retrieval passes**: start from a PDF block, verify first-question context chunks, submit a learner reply, verify the follow-up run also shows retrieval chunks, and keep the downgrade path deterministic with a test fixture that clears chunks before re-opening the lesson.

- [x] **Step 5: Run the full phase gates and update the planning docs.**

Run: `pnpm format && pnpm check`

Run: `pnpm test:e2e`

Expected: PASS. Then update `docs/planning/current-status.md` and `docs/planning/software-design-completion-roadmap.md` to mark D4 complete and set D5 as next.

- [x] **Step 6: Commit the UI, E2E, and docs.**

```bash
git add apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx tests/e2e/app.spec.ts docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "test: cover chunk retrieval lesson context"
```

## Self-review

Spec coverage:

- Chunk is a derived layer: Tasks 1-4.
- Lexical retrieval and budgeting: Tasks 2-3.
- Shared lesson-start and follow-up context assembly: Task 5.
- Snippet-only downgrade and UI/E2E proof: Tasks 5-6.
- No full-document provider input: Tasks 3 and 5 constrain the generator input shape.

Placeholder scan:

- No `TODO` / `TBD` placeholders remain.
- Each task names exact files, explicit commands, and concrete code shapes.

Type consistency:

- `contextChunks` and `contextCharacterCount` are introduced once in Task 1 and reused with the same names in Tasks 5-6.
- `RebuildDocumentChunks`, `SearchDocumentChunks`, and `AssembleLessonContext` are defined in Task 3 before later wiring tasks use them.
