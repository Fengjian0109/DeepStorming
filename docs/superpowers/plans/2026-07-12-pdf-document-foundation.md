# PDF Document Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first PDF document foundation slice: persisted import jobs, managed source PDF files, page text, text blocks, and safe failure states.

**Architecture:** Domain defines PDF import state and page/block facts. Application orchestrates import through ports. Infrastructure owns SQLite, managed file storage, and PDF extraction. Main/Preload expose explicit IPC; Renderer only consumes Contracts.

**Tech Stack:** TypeScript, Electron, React, SQLite via `better-sqlite3`, Vitest, Playwright. PDF extractor package must be validated before locking.

---

## File Map

- Modify `packages/domain/src/document.ts`: add PDF import job, page, block, and validation helpers.
- Modify `packages/domain/src/document.test.ts`: domain tests.
- Modify `packages/contracts/src/document.ts`: schemas, channels, DTOs, errors.
- Modify `packages/contracts/src/document.test.ts`: strict contract tests.
- Modify `packages/application/src/document-ports.ts`: new repository and extractor ports.
- Modify `packages/application/src/document-use-cases.ts`: import/get-pages/get-blocks use cases.
- Modify `packages/application/src/document-use-cases.test.ts`: TDD tests for success/failures.
- Modify `packages/infrastructure/src/database/migrations.ts`: add migration.
- Modify `packages/infrastructure/src/database/migrations.test.ts`: migration tests.
- Create `packages/infrastructure/src/database/sqlite-document-import-repository.ts`: import/page/block persistence.
- Create `packages/infrastructure/src/documents/managed-document-file-store.ts`: app-managed file copy.
- Create `packages/infrastructure/src/documents/pdf-text-extractor.ts`: narrow PDF extractor adapter.
- Modify `apps/desktop/src/main/composition-root.ts`: wire use cases and adapters.
- Modify `apps/desktop/src/main/ipc/document-handlers.ts`: new handlers.
- Modify `apps/desktop/src/main/ipc/register-ipc.ts`: register channels.
- Modify `apps/desktop/src/preload/index.ts`: expose explicit API.
- Modify `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`: PDF import UI and page/block preview.
- Modify `tests/e2e/app.spec.ts`: small PDF import E2E.

## Task 1: Domain model

- [x] **Step 1: Write failing domain tests**

Add tests to `packages/domain/src/document.test.ts`:

```ts
it('normalizes PDF import jobs and rejects unsafe states', () => {
  expect(
    normalizeDocumentImportJob({
      id: '00000000-0000-4000-8000-000000000801',
      documentId: null,
      sourceKind: 'pdf_file',
      status: 'queued',
      originalName: 'paper.pdf',
      fileSizeBytes: 1024,
      contentHash: 'a'.repeat(64),
      error: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
      finishedAt: null,
    }),
  ).toMatchObject({ status: 'queued', originalName: 'paper.pdf' })

  expect(() =>
    normalizeDocumentImportJob({
      id: 'bad',
      documentId: null,
      sourceKind: 'pdf_file',
      status: 'ready',
      originalName: 'paper.pdf',
      fileSizeBytes: -1,
      contentHash: 'bad',
      error: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
      finishedAt: null,
    }),
  ).toThrow()
})
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run packages/domain/src/document.test.ts
```

Expected: fails because `normalizeDocumentImportJob` is not defined.

- [x] **Step 3: Implement minimal domain types and normalizer**

Add to `packages/domain/src/document.ts`:

```ts
export const DOCUMENT_IMPORT_STATUSES = [
  'queued',
  'copying',
  'parsing',
  'ready',
  'failed',
  'cancelled',
] as const

export type DocumentImportStatus = (typeof DOCUMENT_IMPORT_STATUSES)[number]
export type DocumentImportError = Readonly<{ code: string; message: string; retryable: boolean }>

export type DocumentImportJob = Readonly<{
  id: string
  documentId: string | null
  sourceKind: 'pdf_file'
  status: DocumentImportStatus
  originalName: string
  fileSizeBytes: number
  contentHash: string
  error: DocumentImportError | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}>
```

Implement validation using the existing UUID and non-blank patterns in the file.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm vitest run packages/domain/src/document.test.ts
```

Expected: all tests pass.

## Task 2: Contracts and IPC shape

- [x] **Step 1: Write failing contract tests**

Add to `packages/contracts/src/document.test.ts`:

```ts
it('defines PDF import channels and strict job schemas', () => {
  expect(DOCUMENT_CHANNELS.importPdf).toBe('documents:import-pdf')
  expect(
    importPdfDocumentRequestSchema.safeParse({
      requestId,
      filePath: '/tmp/paper.pdf',
      originalName: 'paper.pdf',
    }).success,
  ).toBe(true)
  expect(
    documentImportJobSchema.safeParse({
      id: requestId,
      documentId: null,
      sourceKind: 'pdf_file',
      status: 'queued',
      originalName: 'paper.pdf',
      fileSizeBytes: 10,
      contentHash: 'a'.repeat(64),
      error: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
      finishedAt: null,
    }).success,
  ).toBe(true)
})
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run packages/contracts/src/document.test.ts
```

Expected: missing channel/schema failures.

- [x] **Step 3: Implement contracts**

Add:

- `DOCUMENT_CHANNELS.importPdf`
- `DOCUMENT_CHANNELS.getPages`
- `DOCUMENT_CHANNELS.getPageBlocks`
- `documentImportJobSchema`
- `documentPageSchema`
- `documentTextBlockSchema`
- result schemas using existing result envelope pattern.

- [x] **Step 4: Verify GREEN**

Run:

```bash
pnpm vitest run packages/contracts/src/document.test.ts
```

Expected: all contract tests pass.

## Task 3: SQLite migration and repository

- [x] **Step 1: Write failing migration test**

Modify `packages/infrastructure/src/database/migrations.test.ts` to assert:

```ts
expect(tables.map((row) => row.name)).toContain('document_import_jobs')
expect(tables.map((row) => row.name)).toContain('document_files')
expect(tables.map((row) => row.name)).toContain('document_pages')
expect(tables.map((row) => row.name)).toContain('document_text_blocks')
```

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run packages/infrastructure/src/database/migrations.test.ts
```

Expected: missing table assertion fails.

- [x] **Step 3: Add migration**

Add a new migration after current version:

```sql
CREATE TABLE document_import_jobs (...);
CREATE TABLE document_files (...);
CREATE TABLE document_pages (...);
CREATE TABLE document_text_blocks (...);
```

Use explicit `CHECK` constraints for status and source kind. Use `ON DELETE CASCADE` for document-owned rows.

- [x] **Step 4: Add repository tests and implementation**

Create `packages/infrastructure/src/database/sqlite-document-import-repository.test.ts` covering:

- save queued job
- update to parsing
- persist ready pages and blocks
- persist failed safe error
- list jobs for document

Implement `sqlite-document-import-repository.ts` with explicit column lists and JSON runtime validation only where JSON exists.

- [x] **Step 5: Verify GREEN**

Run:

```bash
pnpm vitest run packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-import-repository.test.ts
```

Expected: all tests pass.

## Task 4: Application import use case

- [ ] **Step 1: Write failing application tests**

In `packages/application/src/document-use-cases.test.ts`, add:

```ts
it('imports a text PDF into pages and blocks', async () => {
  const result = await new ImportPdfDocument(
    repo,
    fileStore,
    extractor,
    hasher,
    clock,
    ids,
  ).execute({
    filePath: '/tmp/paper.pdf',
    originalName: 'paper.pdf',
  })

  expect(result.status).toBe('ready')
  expect(repo.pagesFor(result.documentId!)).toHaveLength(1)
})
```

Also add failure tests for password protected, no text layer, and damaged PDF.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run packages/application/src/document-use-cases.test.ts
```

Expected: missing use case and port failures.

- [ ] **Step 3: Implement ports and use case**

Add ports:

```ts
export interface PdfTextExtractorPort {
  extract(filePath: string): Promise<{
    pages: readonly {
      pageNumber: number
      width: number
      height: number
      text: string
      blocks: readonly { text: string; x?: number; y?: number; width?: number; height?: number }[]
    }[]
  }>
}
```

Implement `ImportPdfDocument` with the state sequence:

```text
queued -> copying -> parsing -> ready
queued/copying/parsing -> failed
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
pnpm vitest run packages/application/src/document-use-cases.test.ts
```

Expected: all document use case tests pass.

## Task 5: Main, Preload, Renderer

- [ ] **Step 1: Write failing IPC and Preload tests**

Update:

- `apps/desktop/src/main/ipc/document-handlers.test.ts`
- `apps/desktop/src/preload/index.test.ts`

Expected new API:

```ts
window.deepstorming.documents.importPdf({ filePath, originalName })
window.deepstorming.documents.getPages(documentId)
window.deepstorming.documents.getPageBlocks(documentId, pageNumber)
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/preload/index.test.ts
```

Expected: missing methods/channels.

- [ ] **Step 3: Implement explicit IPC and Preload**

Follow existing document handler style:

- validate input
- call exactly one use case
- validate result envelope
- map unknown failures to stable error

- [ ] **Step 4: Renderer tests and UI**

Update `DocumentLibrary.test.tsx` first:

- PDF import button exists
- loading state appears
- ready job opens document detail
- failed job shows safe error

Then update `DocumentLibrary.tsx`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
pnpm vitest run apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx
```

Expected: all tests pass.

## Task 6: E2E and docs

- [ ] **Step 1: Add E2E fixture strategy**

Create a tiny text PDF fixture using a deterministic script or checked-in minimal fixture with copyright-safe text:

```text
Evidence connects a claim to observable behavior.
```

- [ ] **Step 2: Extend E2E**

Update `tests/e2e/app.spec.ts`:

- import PDF
- see ready document
- see page/block preview
- start lesson from PDF-derived snippet
- restart app and confirm page/block and lesson still load

- [ ] **Step 3: Update docs**

Update:

- `docs/database/database_schema.md`
- `docs/planning/current-status.md`
- `docs/planning/phase-3-document-library-progress.md`
- `docs/planning/software-design-completion-roadmap.md`

- [ ] **Step 4: Final verification**

Run:

```bash
pnpm format
pnpm check
pnpm test:e2e
```

Expected:

- format check clean
- typecheck clean
- Vitest all pass
- desktop build pass
- E2E pass with packaged test skipped unless package dir exists
