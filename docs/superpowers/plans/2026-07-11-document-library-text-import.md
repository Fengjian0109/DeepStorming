# Document Library Text Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 3 minimum document-library slice: users can create local `LearningDocument` records by pasting text or importing `.txt/.md` content, then list, open, delete, and verify persistence after restart.

**Architecture:** Follow the existing Provider vertical-slice pattern. Domain owns document invariants; Application owns use cases and Ports; Infrastructure implements SQLite repository and SHA-256 hashing; Electron Main composes use cases and explicit IPC; Preload exposes typed document APIs; Renderer consumes Contracts only.

**Tech Stack:** TypeScript, React, Electron, Zod, Vitest, Playwright, SQLite via `better-sqlite3`.

---

## File Structure

- `packages/domain/src/document.ts` / `.test.ts`: document types, normalization, validation, hash input contract.
- `packages/contracts/src/document.ts` / `.test.ts`: strict IPC schemas, channels, DTOs, result schemas.
- `packages/application/src/document-ports.ts`: repository, hasher, clock, ID ports and stored row types.
- `packages/application/src/document-use-cases.ts` / `.test.ts`: list/create/get/delete use cases and stable errors.
- `packages/infrastructure/src/database/migrations.ts` / `.test.ts`: Migration 2 tables and constraints.
- `packages/infrastructure/src/database/sqlite-document-repository.ts` / `.test.ts`: SQLite persistence.
- `packages/infrastructure/src/documents/sha256-document-text-hasher.ts` / `.test.ts`: Node crypto adapter.
- `apps/desktop/src/main/ipc/document-handlers.ts` / `.test.ts`: safe IPC handlers.
- `apps/desktop/src/preload/index.ts` / `.test.ts`: explicit `window.deepstorming.documents` API.
- `apps/desktop/src/main/composition-root.ts` and `register-ipc.ts`: compose and register document use cases.
- `apps/desktop/src/renderer/src/document/*`: document library UI and tests.
- `apps/desktop/src/renderer/src/app/App.tsx`, `global.d.ts`, `styles/global.css`: navigation and API types.
- `tests/e2e/app.spec.ts`: extend E2E with document lifecycle and restart persistence.
- `docs/planning/current-status.md`: record Phase 3 progress and gates.

---

## Task 1: Define Document domain rules

**Files:**

- Create: `packages/domain/src/document.ts`
- Create: `packages/domain/src/document.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing Domain tests**

Create `packages/domain/src/document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_SOURCE_KINDS,
  DOCUMENT_TYPES,
  documentHashInput,
  normalizeDocumentDraft,
} from './document'

describe('document domain', () => {
  it('normalizes a pasted generic document draft', () => {
    expect(
      normalizeDocumentDraft({
        title: '  Linear Algebra Notes  ',
        plainText: '  Vectors preserve direction.  ',
        sourceKind: 'pasted_text',
      }),
    ).toEqual({
      documentType: 'generic',
      title: 'Linear Algebra Notes',
      plainText: 'Vectors preserve direction.',
      sourceKind: 'pasted_text',
    })
  })

  it('keeps a text file name without accepting a local path', () => {
    expect(
      normalizeDocumentDraft({
        title: 'Paper notes',
        plainText: 'Claim\\nEvidence',
        sourceKind: 'text_file',
        originalFileName: '/Users/me/secret/paper.md',
      }),
    ).toMatchObject({
      originalFileName: 'paper.md',
      plainText: 'Claim\\nEvidence',
    })
  })

  it('rejects blank titles and blank text', () => {
    expect(() =>
      normalizeDocumentDraft({ title: ' ', plainText: 'content', sourceKind: 'pasted_text' }),
    ).toThrow('Document title must not be blank')
    expect(() =>
      normalizeDocumentDraft({ title: 'Title', plainText: ' \\n ', sourceKind: 'pasted_text' }),
    ).toThrow('Document text must not be blank')
  })

  it('defines the accepted document types and source kinds', () => {
    expect(DOCUMENT_TYPES).toEqual(['generic', 'textbook', 'paper'])
    expect(DOCUMENT_SOURCE_KINDS).toEqual(['pasted_text', 'text_file'])
  })

  it('uses normalized plain text as the stable hash input', () => {
    const first = normalizeDocumentDraft({
      title: 'A',
      plainText: '  same text\\n',
      sourceKind: 'pasted_text',
    })
    const second = normalizeDocumentDraft({
      title: 'B',
      plainText: 'same text',
      sourceKind: 'text_file',
      originalFileName: 'notes.md',
    })

    expect(documentHashInput(first)).toBe('same text')
    expect(documentHashInput(second)).toBe('same text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run packages/domain/src/document.test.ts
```

Expected: FAIL because `./document` does not exist.

- [ ] **Step 3: Implement Domain document module**

Create `packages/domain/src/document.ts`:

```ts
export const DOCUMENT_TYPES = ['generic', 'textbook', 'paper'] as const
export const DOCUMENT_SOURCE_KINDS = ['pasted_text', 'text_file'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type DocumentSourceKind = (typeof DOCUMENT_SOURCE_KINDS)[number]

export type DocumentDraft = Readonly<{
  title: string
  plainText: string
  sourceKind: DocumentSourceKind
  documentType?: DocumentType
  originalFileName?: string
}>

export type NormalizedDocumentDraft = Readonly<{
  title: string
  plainText: string
  sourceKind: DocumentSourceKind
  documentType: DocumentType
  originalFileName?: string
}>

export type LearningDocument = Readonly<{
  id: string
  documentType: DocumentType
  title: string
  sourceKind: DocumentSourceKind
  originalFileName?: string
  characterCount: number
  createdAt: string
  updatedAt: string
}>

export type DocumentTextVersion = Readonly<{
  id: string
  documentId: string
  plainText: string
  characterCount: number
  createdAt: string
}>

const normalizeNonBlank = (value: string, message: string): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  return normalized
}

const normalizeFileName = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  const normalized = trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? ''
  return normalized.length > 0 ? normalized : undefined
}

export const normalizeDocumentDraft = (draft: DocumentDraft): NormalizedDocumentDraft => {
  if (!DOCUMENT_SOURCE_KINDS.includes(draft.sourceKind))
    throw new Error('Document source kind is invalid')
  if (draft.documentType !== undefined && !DOCUMENT_TYPES.includes(draft.documentType))
    throw new Error('Document type is invalid')

  return {
    documentType: draft.documentType ?? 'generic',
    title: normalizeNonBlank(draft.title, 'Document title must not be blank'),
    plainText: normalizeNonBlank(draft.plainText, 'Document text must not be blank'),
    sourceKind: draft.sourceKind,
    ...(normalizeFileName(draft.originalFileName) !== undefined
      ? { originalFileName: normalizeFileName(draft.originalFileName) }
      : {}),
  }
}

export const documentHashInput = (draft: NormalizedDocumentDraft): string => draft.plainText

export const countDocumentCharacters = (plainText: string): number => [...plainText].length
```

Modify `packages/domain/src/index.ts`:

```ts
export * from './application-info'
export * from './document'
export * from './provider'
```

- [ ] **Step 4: Run Domain tests**

Run:

```bash
pnpm vitest run packages/domain/src/document.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/document.ts packages/domain/src/document.test.ts packages/domain/src/index.ts
git commit -m "feat: define learning document domain"
```

---

## Task 2: Add Document contracts and explicit API types

**Files:**

- Create: `packages/contracts/src/document.ts`
- Create: `packages/contracts/src/document.test.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write failing Contract tests**

Create `packages/contracts/src/document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_CHANNELS,
  createDocumentFromTextRequestSchema,
  documentDetailSchema,
  documentErrorCodeSchema,
  documentSummarySchema,
  listDocumentsRequestSchema,
} from './document'

const requestId = '00000000-0000-4000-8000-000000000001'

describe('document contracts', () => {
  it('defines explicit document IPC channels', () => {
    expect(DOCUMENT_CHANNELS).toEqual({
      list: 'documents:list',
      createFromText: 'documents:create-from-text',
      get: 'documents:get',
      remove: 'documents:remove',
    })
  })

  it('strictly validates create-from-text requests', () => {
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: {
          title: 'Notes',
          plainText: 'A useful explanation',
          sourceKind: 'text_file',
          originalFileName: 'notes.md',
        },
      }).success,
    ).toBe(true)

    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: ' ', plainText: 'content', sourceKind: 'pasted_text' },
      }).success,
    ).toBe(false)
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: 'Notes', plainText: ' ', sourceKind: 'pasted_text' },
      }).success,
    ).toBe(false)
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: 'Notes', plainText: 'content', sourceKind: 'pasted_text' },
        extra: true,
      }).success,
    ).toBe(false)
  })

  it('does not expose full text or SQLite internals in summaries', () => {
    const parsed = documentSummarySchema.parse({
      id: requestId,
      documentType: 'generic',
      title: 'Notes',
      sourceKind: 'pasted_text',
      characterCount: 12,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    })
    expect(JSON.stringify(parsed)).not.toContain('plainText')
    expect(JSON.stringify(parsed)).not.toContain('contentHash')
  })

  it('exposes plain text only on detail DTOs', () => {
    expect(
      documentDetailSchema.safeParse({
        id: requestId,
        documentType: 'generic',
        title: 'Notes',
        sourceKind: 'pasted_text',
        characterCount: 12,
        plainText: 'detail text',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  it('parses document error codes', () => {
    expect(documentErrorCodeSchema.options).toEqual([
      'DOCUMENT_VALIDATION_FAILED',
      'DOCUMENT_DUPLICATE',
      'DOCUMENT_NOT_FOUND',
      'DATABASE_UNAVAILABLE',
      'INTERNAL_ERROR',
    ])
  })

  it('validates list requests', () => {
    expect(listDocumentsRequestSchema.parse({ requestId })).toEqual({ requestId })
    expect(listDocumentsRequestSchema.safeParse({ requestId, extra: true }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/contracts/src/document.test.ts
```

Expected: FAIL because `./document` does not exist.

- [ ] **Step 3: Implement document contracts**

Create `packages/contracts/src/document.ts`:

```ts
import { z } from 'zod'
import { createAppResultSchema } from './app-result'

export const DOCUMENT_CHANNELS = {
  list: 'documents:list',
  createFromText: 'documents:create-from-text',
  get: 'documents:get',
  remove: 'documents:remove',
} as const

const requestIdSchema = z.string().uuid()
const documentIdSchema = z.string().uuid()
const requiredTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required text must not be blank',
})
const timestampSchema = z.iso.datetime()

export const documentTypeSchema = z.enum(['generic', 'textbook', 'paper'])
export const documentSourceKindSchema = z.enum(['pasted_text', 'text_file'])
export const documentErrorCodeSchema = z.enum([
  'DOCUMENT_VALIDATION_FAILED',
  'DOCUMENT_DUPLICATE',
  'DOCUMENT_NOT_FOUND',
  'DATABASE_UNAVAILABLE',
  'INTERNAL_ERROR',
])

export const documentDraftSchema = z
  .object({
    title: requiredTextSchema,
    plainText: requiredTextSchema,
    sourceKind: documentSourceKindSchema,
    originalFileName: z.string().optional(),
  })
  .strict()

export const documentSummarySchema = z
  .object({
    id: documentIdSchema,
    documentType: documentTypeSchema,
    title: requiredTextSchema,
    sourceKind: documentSourceKindSchema,
    originalFileName: z.string().optional(),
    characterCount: z.number().int().nonnegative(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const documentDetailSchema = documentSummarySchema
  .extend({
    plainText: requiredTextSchema,
  })
  .strict()

export const listDocumentsRequestSchema = z.object({ requestId: requestIdSchema }).strict()
export const createDocumentFromTextRequestSchema = z
  .object({ requestId: requestIdSchema, document: documentDraftSchema })
  .strict()
export const getDocumentRequestSchema = z
  .object({ requestId: requestIdSchema, id: documentIdSchema })
  .strict()
export const removeDocumentRequestSchema = z
  .object({ requestId: requestIdSchema, id: documentIdSchema })
  .strict()

const voidDataSchema = z.object({}).strict()

export const listDocumentsResultSchema = createAppResultSchema(z.array(documentSummarySchema))
export const documentDetailResultSchema = createAppResultSchema(documentDetailSchema)
export const documentSummaryResultSchema = createAppResultSchema(documentSummarySchema)
export const removeDocumentResultSchema = createAppResultSchema(voidDataSchema)

export type DocumentTypeDto = z.infer<typeof documentTypeSchema>
export type DocumentSourceKindDto = z.infer<typeof documentSourceKindSchema>
export type DocumentDraftDto = z.infer<typeof documentDraftSchema>
export type DocumentSummaryDto = z.infer<typeof documentSummarySchema>
export type DocumentDetailDto = z.infer<typeof documentDetailSchema>
export type ListDocumentsRequest = z.infer<typeof listDocumentsRequestSchema>
export type CreateDocumentFromTextRequest = z.infer<typeof createDocumentFromTextRequestSchema>
export type GetDocumentRequest = z.infer<typeof getDocumentRequestSchema>
export type RemoveDocumentRequest = z.infer<typeof removeDocumentRequestSchema>
export type ListDocumentsResult = z.infer<typeof listDocumentsResultSchema>
export type DocumentSummaryResult = z.infer<typeof documentSummaryResultSchema>
export type DocumentDetailResult = z.infer<typeof documentDetailResultSchema>
export type RemoveDocumentResult = z.infer<typeof removeDocumentResultSchema>
```

Modify `packages/contracts/src/index.ts`:

```ts
export * from './app-info'
export * from './app-result'
export * from './document'
export * from './provider'
```

- [ ] **Step 4: Run Contract tests**

```bash
pnpm vitest run packages/contracts/src/document.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/document.ts packages/contracts/src/document.test.ts packages/contracts/src/index.ts
git commit -m "feat: add document ipc contracts"
```

---

## Task 3: Implement Document application use cases

**Files:**

- Create: `packages/application/src/document-ports.ts`
- Create: `packages/application/src/document-use-cases.ts`
- Create: `packages/application/src/document-use-cases.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing Application tests**

Create `packages/application/src/document-use-cases.test.ts` with an in-memory fake repository:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type {
  DocumentRepositoryPort,
  DocumentTextHasherPort,
  StoredDocument,
  StoredDocumentDetail,
} from './document-ports'
import {
  CreateDocumentFromText,
  DeleteDocument,
  DocumentUseCaseError,
  GetDocument,
  ListDocuments,
} from './document-use-cases'

const now = '2026-07-11T00:00:00.000Z'
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']

class FakeRepository implements DocumentRepositoryPort {
  public records = new Map<string, StoredDocumentDetail>()
  async list(): Promise<readonly StoredDocument[]> {
    return [...this.records.values()].map(({ plainText: _plainText, ...summary }) => summary)
  }
  async findById(id: string): Promise<StoredDocumentDetail | undefined> {
    return this.records.get(id)
  }
  async findByContentHash(hash: string): Promise<StoredDocument | undefined> {
    const found = [...this.records.values()].find((item) => item.contentHash === hash)
    if (!found) return undefined
    const { plainText: _plainText, ...summary } = found
    return summary
  }
  async create(document: StoredDocumentDetail): Promise<StoredDocumentDetail> {
    this.records.set(document.id, document)
    return document
  }
  async remove(id: string): Promise<boolean> {
    return this.records.delete(id)
  }
}

describe('document use cases', () => {
  let repo: FakeRepository
  let idIndex: number
  const hasher: DocumentTextHasherPort = { hash: async (input) => `hash:${input}` }
  const clock = { now: () => now }
  const idGenerator = { generate: () => ids[idIndex++]! }

  beforeEach(() => {
    repo = new FakeRepository()
    idIndex = 0
  })

  it('creates and lists a document summary without plain text', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: ' Notes ',
      plainText: ' body ',
      sourceKind: 'pasted_text',
    })

    expect(created.title).toBe('Notes')
    expect(created.characterCount).toBe(4)
    expect(created).not.toHaveProperty('plainText')

    const listed = await new ListDocuments(repo).execute()
    expect(listed).toEqual([created])
    expect(JSON.stringify(listed)).not.toContain('body')
  })

  it('returns detail with plain text', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })

    await expect(new GetDocument(repo).execute(created.id)).resolves.toMatchObject({
      id: created.id,
      plainText: 'body',
    })
  })

  it('rejects duplicate normalized text', async () => {
    const create = new CreateDocumentFromText(repo, hasher, clock, idGenerator)
    await create.execute({ title: 'A', plainText: ' same ', sourceKind: 'pasted_text' })

    await expect(
      create.execute({ title: 'B', plainText: 'same', sourceKind: 'text_file' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DUPLICATE', retryable: false })
  })

  it('maps invalid input to DOCUMENT_VALIDATION_FAILED', async () => {
    await expect(
      new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
        title: ' ',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VALIDATION_FAILED' })
  })

  it('deletes documents and reports not found', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })

    await expect(new DeleteDocument(repo).execute(created.id)).resolves.toBeUndefined()
    await expect(new GetDocument(repo).execute(created.id)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    })
  })

  it('exposes stable document errors', () => {
    const error = new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'Missing.', false)
    expect(error.code).toBe('DOCUMENT_NOT_FOUND')
    expect(error.message).toBe('Missing.')
    expect(error.retryable).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/application/src/document-use-cases.test.ts
```

Expected: FAIL because document use cases do not exist.

- [ ] **Step 3: Implement document ports and use cases**

Create `packages/application/src/document-ports.ts`:

```ts
import type { DocumentSourceKind, DocumentType } from '@deepstorming/domain'

export type StoredDocument = Readonly<{
  id: string
  documentType: DocumentType
  title: string
  sourceKind: DocumentSourceKind
  originalFileName?: string
  contentHash: string
  characterCount: number
  createdAt: string
  updatedAt: string
}>

export type StoredDocumentDetail = StoredDocument &
  Readonly<{ plainText: string; textVersionId: string }>

export interface DocumentRepositoryPort {
  list(): Promise<readonly StoredDocument[]>
  findById(id: string): Promise<StoredDocumentDetail | undefined>
  findByContentHash(hash: string): Promise<StoredDocument | undefined>
  create(document: StoredDocumentDetail): Promise<StoredDocumentDetail>
  remove(id: string): Promise<boolean>
}

export interface DocumentTextHasherPort {
  hash(input: string): Promise<string>
}

export interface ClockPort {
  now(): string
}

export interface IdGeneratorPort {
  generate(): string
}
```

Create `packages/application/src/document-use-cases.ts`:

```ts
import {
  countDocumentCharacters,
  documentHashInput,
  normalizeDocumentDraft,
  type DocumentDraft,
  type LearningDocument,
} from '@deepstorming/domain'
import type {
  ClockPort,
  DocumentRepositoryPort,
  DocumentTextHasherPort,
  IdGeneratorPort,
  StoredDocument,
  StoredDocumentDetail,
} from './document-ports'

export type DocumentUseCaseErrorCode =
  | 'DOCUMENT_VALIDATION_FAILED'
  | 'DOCUMENT_DUPLICATE'
  | 'DOCUMENT_NOT_FOUND'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export class DocumentUseCaseError extends Error {
  public constructor(
    public readonly code: DocumentUseCaseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export type DocumentDetail = LearningDocument & Readonly<{ plainText: string }>

const toSummary = (document: StoredDocument): LearningDocument => ({
  id: document.id,
  documentType: document.documentType,
  title: document.title,
  sourceKind: document.sourceKind,
  ...(document.originalFileName !== undefined
    ? { originalFileName: document.originalFileName }
    : {}),
  characterCount: document.characterCount,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
})

const toDetail = (document: StoredDocumentDetail): DocumentDetail => ({
  ...toSummary(document),
  plainText: document.plainText,
})

const validationError = (error: unknown): DocumentUseCaseError =>
  new DocumentUseCaseError(
    'DOCUMENT_VALIDATION_FAILED',
    error instanceof Error ? error.message : 'The document input is invalid.',
    false,
  )

export class ListDocuments {
  public constructor(private readonly repository: DocumentRepositoryPort) {}
  public async execute(): Promise<readonly LearningDocument[]> {
    return (await this.repository.list()).map(toSummary)
  }
}

export class GetDocument {
  public constructor(private readonly repository: DocumentRepositoryPort) {}
  public async execute(id: string): Promise<DocumentDetail> {
    const document = await this.repository.findById(id)
    if (!document)
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    return toDetail(document)
  }
}

export class CreateDocumentFromText {
  public constructor(
    private readonly repository: DocumentRepositoryPort,
    private readonly hasher: DocumentTextHasherPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: DocumentDraft): Promise<LearningDocument> {
    let draft
    try {
      draft = normalizeDocumentDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    const contentHash = await this.hasher.hash(documentHashInput(draft))
    if ((await this.repository.findByContentHash(contentHash)) !== undefined) {
      throw new DocumentUseCaseError(
        'DOCUMENT_DUPLICATE',
        'This document text has already been imported.',
        false,
      )
    }

    const createdAt = this.clock.now()
    const document: StoredDocumentDetail = {
      id: this.ids.generate(),
      textVersionId: this.ids.generate(),
      documentType: draft.documentType,
      title: draft.title,
      plainText: draft.plainText,
      sourceKind: draft.sourceKind,
      ...(draft.originalFileName !== undefined ? { originalFileName: draft.originalFileName } : {}),
      contentHash,
      characterCount: countDocumentCharacters(draft.plainText),
      createdAt,
      updatedAt: createdAt,
    }

    return toSummary(await this.repository.create(document))
  }
}

export class DeleteDocument {
  public constructor(private readonly repository: DocumentRepositoryPort) {}
  public async execute(id: string): Promise<void> {
    if (!(await this.repository.remove(id))) {
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    }
  }
}
```

Modify `packages/application/src/index.ts`:

```ts
export * from './app-info-port'
export * from './document-ports'
export * from './document-use-cases'
export * from './get-application-info'
export * from './provider-errors'
export * from './provider-ports'
export * from './provider-test-operations'
export * from './provider-use-cases'
```

- [ ] **Step 4: Run Application tests**

```bash
pnpm vitest run packages/application/src/document-use-cases.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/document-ports.ts packages/application/src/document-use-cases.ts packages/application/src/document-use-cases.test.ts packages/application/src/index.ts
git commit -m "feat: add document application use cases"
```

---

## Task 4: Add Migration 2 and SQLite document repository

**Files:**

- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/migrations.test.ts`
- Create: `packages/infrastructure/src/database/sqlite-document-repository.ts`
- Create: `packages/infrastructure/src/database/sqlite-document-repository.test.ts`
- Create: `packages/infrastructure/src/documents/sha256-document-text-hasher.ts`
- Create: `packages/infrastructure/src/documents/sha256-document-text-hasher.test.ts`
- Modify: `packages/infrastructure/src/index.ts`

- [ ] **Step 1: Write failing migration/repository tests**

Add to `packages/infrastructure/src/database/migrations.test.ts`:

```ts
test('applies migration two and creates document tables', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deepstorming-doc-migration-'))
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toContain('learning_documents')
  expect(tables.map((row) => row.name)).toContain('document_text_versions')
  expect(db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()).toEqual([
    { version: 1, name: 'provider_foundation' },
    { version: 2, name: 'document_text_import' },
  ])

  db.close()
  rmSync(dir, { recursive: true, force: true })
})
```

Create `packages/infrastructure/src/database/sqlite-document-repository.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredDocumentDetail } from '@deepstorming/application'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase } from './database'
import { SqliteDocumentRepository } from './sqlite-document-repository'

let dir: string
let db: SqliteDatabase
let repo: SqliteDocumentRepository

const document = (overrides: Partial<StoredDocumentDetail> = {}): StoredDocumentDetail => ({
  id: '00000000-0000-4000-8000-000000000001',
  textVersionId: '00000000-0000-4000-8000-000000000002',
  documentType: 'generic',
  title: 'Notes',
  sourceKind: 'pasted_text',
  contentHash: 'hash-a',
  characterCount: 4,
  plainText: 'body',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  ...overrides,
})

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'deepstorming-doc-repo-'))
  db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  repo = new SqliteDocumentRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteDocumentRepository', () => {
  it('creates, lists, and retrieves document details', async () => {
    await repo.create(document())

    expect(await repo.list()).toEqual([
      expect.objectContaining({ title: 'Notes', characterCount: 4 }),
    ])
    expect(JSON.stringify(await repo.list())).not.toContain('plainText')
    await expect(repo.findById(document().id)).resolves.toMatchObject({ plainText: 'body' })
  })

  it('finds duplicate content hashes', async () => {
    await repo.create(document())
    await expect(repo.findByContentHash('hash-a')).resolves.toMatchObject({ id: document().id })
  })

  it('enforces unique content hash', async () => {
    await repo.create(document())
    await expect(
      repo.create(document({ id: '00000000-0000-4000-8000-000000000003' })),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
  })

  it('deletes text versions through cascade', async () => {
    await repo.create(document())
    await expect(repo.remove(document().id)).resolves.toBe(true)
    expect(db.prepare('SELECT count(*) count FROM document_text_versions').get()).toEqual({
      count: 0,
    })
    await expect(repo.remove(document().id)).resolves.toBe(false)
  })
})
```

Create `packages/infrastructure/src/documents/sha256-document-text-hasher.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Sha256DocumentTextHasher } from './sha256-document-text-hasher'

describe('Sha256DocumentTextHasher', () => {
  it('hashes document text with SHA-256 hex', async () => {
    await expect(new Sha256DocumentTextHasher().hash('same text')).resolves.toBe(
      '2e68a7bba11b90d1bae1daea2dd4951779cf45d5897c62539d01f44054bcb1e0',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-repository.test.ts packages/infrastructure/src/documents/sha256-document-text-hasher.test.ts
```

Expected: FAIL because migration 2 and repository/hasher are missing.

- [ ] **Step 3: Implement Migration 2**

Modify `packages/infrastructure/src/database/migrations.ts`:

```ts
const DOCUMENT_SQL = `
CREATE TABLE learning_documents (
 id TEXT PRIMARY KEY,
 document_type TEXT NOT NULL CHECK (document_type IN ('generic','textbook','paper')),
 title TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK (source_kind IN ('pasted_text','text_file')),
 original_file_name TEXT,
 content_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX unique_learning_document_content_hash ON learning_documents(content_hash);
CREATE TABLE document_text_versions (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 plain_text TEXT NOT NULL,
 character_count INTEGER NOT NULL CHECK (character_count >= 0),
 created_at TEXT NOT NULL
);`

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'provider_foundation', sql: INITIAL_SQL },
  { version: 2, name: 'document_text_import', sql: DOCUMENT_SQL },
])
```

- [ ] **Step 4: Implement Repository and Hasher**

Create `packages/infrastructure/src/documents/sha256-document-text-hasher.ts`:

```ts
import { createHash } from 'node:crypto'
import type { DocumentTextHasherPort } from '@deepstorming/application'

export class Sha256DocumentTextHasher implements DocumentTextHasherPort {
  public async hash(input: string): Promise<string> {
    return createHash('sha256').update(input).digest('hex')
  }
}
```

Create `packages/infrastructure/src/database/sqlite-document-repository.ts` implementing `DocumentRepositoryPort`. Use transactions for create, map SQLite failures to `databaseError('DATABASE_UNAVAILABLE')`, and never include `plainText` from `list()`.

Use row mapping shape:

```ts
type DocumentRow = {
  id: string
  document_type: StoredDocument['documentType']
  title: string
  source_kind: StoredDocument['sourceKind']
  original_file_name: string | null
  content_hash: string
  character_count: number
  created_at: string
  updated_at: string
  plain_text?: string
  text_version_id?: string
}
```

Important queries:

```sql
SELECT d.*, v.id text_version_id, v.plain_text, v.character_count
FROM learning_documents d
JOIN document_text_versions v ON v.document_id = d.id
WHERE d.id=?
ORDER BY v.created_at DESC
LIMIT 1
```

```sql
INSERT INTO learning_documents VALUES (?,?,?,?,?,?,?,?)
INSERT INTO document_text_versions VALUES (?,?,?,?,?)
DELETE FROM learning_documents WHERE id=?
```

Modify `packages/infrastructure/src/index.ts` to export the repository and hasher.

- [ ] **Step 5: Run Infrastructure tests**

```bash
pnpm vitest run packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-repository.test.ts packages/infrastructure/src/documents/sha256-document-text-hasher.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/src/database/migrations.ts packages/infrastructure/src/database/migrations.test.ts packages/infrastructure/src/database/sqlite-document-repository.ts packages/infrastructure/src/database/sqlite-document-repository.test.ts packages/infrastructure/src/documents packages/infrastructure/src/index.ts
git commit -m "feat: persist text documents in sqlite"
```

---

## Task 5: Wire Document use cases into Main IPC and Preload

**Files:**

- Create: `apps/desktop/src/main/ipc/document-handlers.ts`
- Create: `apps/desktop/src/main/ipc/document-handlers.test.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`
- Modify: `apps/desktop/src/renderer/src/global.d.ts`

- [ ] **Step 1: Write failing IPC handler tests**

Create `apps/desktop/src/main/ipc/document-handlers.test.ts` with explicit document handler
fixtures and assertions:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentUseCaseError } from '@deepstorming/application'
import { createDocumentIpcHandlers } from './document-handlers'

const requestId = '00000000-0000-4000-8000-000000000001'
const documentId = '00000000-0000-4000-8000-000000000002'
const summary = {
  id: documentId,
  documentType: 'generic' as const,
  title: 'Notes',
  sourceKind: 'pasted_text' as const,
  characterCount: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const dependencies = () => ({
  listDocuments: { execute: vi.fn().mockResolvedValue([summary]) },
  createDocumentFromText: { execute: vi.fn().mockResolvedValue(summary) },
  getDocument: { execute: vi.fn().mockResolvedValue({ ...summary, plainText: 'body' }) },
  deleteDocument: { execute: vi.fn().mockResolvedValue(undefined) },
})

describe('document IPC handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists documents through one use case', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(deps).list({ requestId })
    expect(result).toEqual({ ok: true, data: [summary], requestId })
    expect(deps.listDocuments.execute).toHaveBeenCalledTimes(1)
  })

  it('strictly rejects malformed requests without calling use cases', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(deps).createFromText({
      requestId,
      document: { title: ' ', plainText: 'body', sourceKind: 'pasted_text' },
    })
    expect(result.ok).toBe(false)
    expect(deps.createDocumentFromText.execute).not.toHaveBeenCalled()
  })

  it('maps DocumentUseCaseError safely', async () => {
    const deps = dependencies()
    deps.getDocument.execute.mockRejectedValueOnce(
      new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false),
    )
    const result = await createDocumentIpcHandlers(deps).get({ requestId, id: documentId })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'The document was not found.',
        retryable: false,
      },
      requestId,
    })
  })
})
```

- [ ] **Step 2: Extend Preload tests first**

In `apps/desktop/src/preload/index.test.ts`, add tests proving:

```ts
expect(api.documents).toEqual({
  list: expect.any(Function),
  createFromText: expect.any(Function),
  get: expect.any(Function),
  remove: expect.any(Function),
})
```

and that each method invokes the matching `DOCUMENT_CHANNELS.*` channel with a UUID `requestId`.

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/preload/index.test.ts
```

Expected: FAIL because document handlers and Preload API are missing.

- [ ] **Step 4: Implement IPC handlers**

Create `apps/desktop/src/main/ipc/document-handlers.ts` with the same pattern as provider handlers:

- Parse each request using Contract schemas.
- Use a generated safe request ID when request ID is malformed.
- Call exactly one use case per handler.
- Map `DocumentUseCaseError` details to stable `AppResult`.
- Map unknown errors to `INTERNAL_ERROR`.

Define dependency type:

```ts
export type DocumentIpcDependencies = Readonly<{
  listDocuments: ListDocuments
  createDocumentFromText: CreateDocumentFromText
  getDocument: GetDocument
  deleteDocument: DeleteDocument
}>
```

- [ ] **Step 5: Wire composition and registration**

Modify `apps/desktop/src/main/composition-root.ts`:

```ts
const documentRepository = new SqliteDocumentRepository(db)
const documentHasher = new Sha256DocumentTextHasher()

listDocuments: new ListDocuments(documentRepository),
createDocumentFromText: new CreateDocumentFromText(documentRepository, documentHasher, clock, ids),
getDocument: new GetDocument(documentRepository),
deleteDocument: new DeleteDocument(documentRepository),
```

Modify `register-ipc.ts`:

- Import `DOCUMENT_CHANNELS`.
- Remove existing document handlers before registering.
- Register list/create/get/remove document handlers.

- [ ] **Step 6: Implement Preload API and global types**

Modify `apps/desktop/src/preload/index.ts` to add:

```ts
documents: {
  list: async () => invokeValidated(DOCUMENT_CHANNELS.list, { requestId }, listDocumentsResultSchema),
  createFromText: async (document) =>
    invokeValidated(DOCUMENT_CHANNELS.createFromText, { requestId, document }, documentSummaryResultSchema),
  get: async (id) =>
    invokeValidated(DOCUMENT_CHANNELS.get, { requestId, id }, documentDetailResultSchema),
  remove: async (id) =>
    invokeValidated(DOCUMENT_CHANNELS.remove, { requestId, id }, removeDocumentResultSchema),
}
```

Update `apps/desktop/src/renderer/src/global.d.ts` through the shared `DeepStormingBootstrapApi` type from Contracts.

- [ ] **Step 7: Run IPC/Preload tests**

```bash
pnpm vitest run apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/main/ipc/register-ipc.test.ts apps/desktop/src/preload/index.test.ts
```

Expected: PASS. If there is no `register-ipc.test.ts`, run the first and preload tests only.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/main/ipc/document-handlers.ts apps/desktop/src/main/ipc/document-handlers.test.ts apps/desktop/src/main/ipc/register-ipc.ts apps/desktop/src/main/composition-root.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/renderer/src/global.d.ts
git commit -m "feat: expose document library ipc"
```

---

## Task 6: Build Document library Renderer UI

**Files:**

- Create: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Create: `apps/desktop/src/renderer/src/document/DocumentForm.tsx`
- Create: `apps/desktop/src/renderer/src/document/DocumentList.tsx`
- Create: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write failing Renderer tests**

Create `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentLibrary } from './DocumentLibrary'

const document = {
  id: '00000000-0000-4000-8000-000000000001',
  documentType: 'generic' as const,
  title: 'Notes',
  sourceKind: 'pasted_text' as const,
  characterCount: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

beforeEach(() => {
  window.deepstorming.documents = {
    list: vi.fn().mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
    createFromText: vi
      .fn()
      .mockResolvedValue({ ok: true, data: document, requestId: crypto.randomUUID() }),
    get: vi.fn().mockResolvedValue({
      ok: true,
      data: { ...document, plainText: 'body' },
      requestId: crypto.randomUUID(),
    }),
    remove: vi.fn().mockResolvedValue({ ok: true, data: {}, requestId: crypto.randomUUID() }),
  }
})

describe('DocumentLibrary', () => {
  it('shows the empty document library state', async () => {
    render(<DocumentLibrary />)
    await expect(screen.findByText('还没有文档')).resolves.toBeVisible()
  })

  it('creates a pasted text document and opens its detail', async () => {
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    await user.click(await screen.findByRole('button', { name: '粘贴文本' }))
    await user.type(screen.getByLabelText('标题'), 'Notes')
    await user.type(screen.getByLabelText('正文'), 'body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    await expect(screen.findByText('文档已创建。')).resolves.toBeVisible()
    await expect(screen.findByRole('heading', { name: 'Notes' })).resolves.toBeVisible()
    expect(window.deepstorming.documents.createFromText).toHaveBeenCalledWith({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })
  })

  it('imports markdown file text without sending paths', async () => {
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    const file = new File(['# Heading\\nBody'], 'paper.md', { type: 'text/markdown' })
    await user.upload(await screen.findByLabelText('导入 .txt 或 .md'), file)
    await user.click(await screen.findByRole('button', { name: '保存文档' }))
    expect(window.deepstorming.documents.createFromText).toHaveBeenCalledWith({
      title: 'paper.md',
      plainText: '# Heading\\nBody',
      sourceKind: 'text_file',
      originalFileName: 'paper.md',
    })
  })

  it('confirms deletion', async () => {
    window.deepstorming.documents.list = vi.fn().mockResolvedValue({
      ok: true,
      data: [document],
      requestId: crypto.randomUUID(),
    })
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    await user.click(await screen.findByRole('button', { name: '删除 Notes' }))
    await expect(screen.findByRole('dialog', { name: '确认删除文档' })).resolves.toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(window.deepstorming.documents.remove).toHaveBeenCalledWith(document.id),
    )
  })
})
```

- [ ] **Step 2: Run Renderer test to verify it fails**

```bash
pnpm vitest run apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx
```

Expected: FAIL because Document UI does not exist.

- [ ] **Step 3: Implement Document UI components**

Create components with these responsibilities:

- `DocumentLibrary`: owns async state, selected document, create/delete operations, stale response tokens.
- `DocumentForm`: owns title/text/source form state and file reading; never logs file content.
- `DocumentList`: renders summaries and action buttons.

Use state shape:

```ts
type AsyncState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }
```

File input behavior:

```ts
const text = await file.text()
setDraft({
  title: file.name,
  plainText: text,
  sourceKind: 'text_file',
  originalFileName: file.name,
})
```

Reject non `.txt/.md` extensions in Renderer with:

```ts
setState({ status: 'error', message: '请选择 .txt 或 .md 文件。' })
```

- [ ] **Step 4: Update App navigation**

Modify `apps/desktop/src/renderer/src/app/App.tsx`:

- Add page state `'documents' | 'providers'`.
- Default to `documents`.
- Sidebar links are buttons or anchors that switch local page state.
- Keep Provider page reachable.

- [ ] **Step 5: Add styles**

Update `global.css` with compact styles for:

- `.document-layout`
- `.document-toolbar`
- `.document-card`
- `.document-detail`
- `.modal-backdrop`
- `.form-grid`

Do not rely on color alone for statuses.

- [ ] **Step 6: Run Renderer tests**

```bash
pnpm vitest run apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/document apps/desktop/src/renderer/src/app/App.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: add document library interface"
```

---

## Task 7: Add E2E coverage for text documents

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Optional Modify: `playwright.config.ts` only if timeout needs adjustment.

- [ ] **Step 1: Write failing E2E assertions**

Extend `tests/e2e/app.spec.ts` to cover document lifecycle before Provider lifecycle or in a new test:

```ts
test('creates text documents and persists them across restart', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-doc-e2e-user-'))
  try {
    const first = await launchDevApp(userDataDir)
    try {
      const page = await first.firstWindow()
      await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
      await expect(page.getByText('还没有文档')).toBeVisible()

      await page.getByRole('button', { name: '粘贴文本' }).click()
      await page.getByLabel('标题').fill('Socratic Notes')
      await page.getByLabel('正文').fill('Understanding needs retrieval and explanation.')
      await page.getByRole('button', { name: '保存文档' }).click()
      await expect(page.getByText('文档已创建。')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Socratic Notes' })).toBeVisible()

      await page.getByLabel('导入 .txt 或 .md').setInputFiles({
        name: 'paper.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Paper Map\\nWhy What How Evidence Limits Next', 'utf8'),
      })
      await page.getByRole('button', { name: '保存文档' }).click()
      await expect(page.getByRole('heading', { name: 'paper.md' })).toBeVisible()

      await page.getByRole('button', { name: '删除 Socratic Notes' }).click()
      await page.getByRole('button', { name: '确认删除' }).click()
      await expect(page.getByText('文档已删除。')).toBeVisible()
    } finally {
      await first.close()
    }

    const second = await launchDevApp(userDataDir)
    try {
      const page = await second.firstWindow()
      await expect(page.getByText('paper.md')).toBeVisible()
      await page.getByRole('button', { name: '打开 paper.md' }).click()
      await expect(page.getByText('Why What How Evidence Limits Next')).toBeVisible()
      await expect(page.getByText('Socratic Notes')).not.toBeVisible()
    } finally {
      await second.close()
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run E2E to verify it fails before implementation if this task starts early**

If Task 6 is not implemented yet:

```bash
pnpm test:e2e
```

Expected: FAIL because document UI/API are missing.

If Task 6 is already implemented, this may pass; in that case continue to Step 3 and rely on the unit-test RED steps from prior tasks.

- [ ] **Step 3: Run full E2E**

```bash
pnpm test:e2e
```

Expected: PASS. The packaged test may skip unless `pnpm package:dir` ran after the current build.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app.spec.ts playwright.config.ts
git commit -m "test: cover text document lifecycle"
```

---

## Task 8: Update docs and run final verification

**Files:**

- Modify: `docs/planning/current-status.md`
- Modify: `docs/database/database_schema.md`
- Optional Create: `docs/planning/phase-3-document-library-progress.md`

- [ ] **Step 1: Update documentation**

Update `docs/planning/current-status.md` with:

- Phase 3 text document library in progress/completed.
- Commands run and counts.
- Known non-goals: PDF/OCR/search/classroom not implemented.

Update `docs/database/database_schema.md` section 5 to add the implemented first two tables:

- `learning_documents`
- `document_text_versions`

- [ ] **Step 2: Run final gates**

```bash
pnpm check
pnpm test:e2e
git diff --check
```

Expected:

- `pnpm check`: PASS, with all test files passing.
- `pnpm test:e2e`: PASS for dev E2E; packaged proof may skip unless package is fresh.
- `git diff --check`: no output.

- [ ] **Step 3: Commit**

```bash
git add docs/planning/current-status.md docs/database/database_schema.md docs/planning/phase-3-document-library-progress.md
git commit -m "docs: record text document library progress"
```

- [ ] **Step 4: Optional packaged verification before release checkpoint**

Run if this branch is about to be merged:

```bash
pnpm package:dir
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
```

Expected: PASS. This still proves Provider packaged persistence; a separate packaged document persistence proof can be added later if Phase 3 release criteria require it.

---

## Self-Review Checklist

- Spec coverage: Domain, Contracts, Application, Infrastructure, Main/Preload, Renderer, E2E, and Docs are covered.
- Scope guard: Plan intentionally excludes PDF, OCR, chunking, search, embeddings, Provider classroom use, and background job queues.
- Architecture guard: Renderer reads files through browser `File.text()` only and does not import Node/Electron. Main remains composition root. Application does not import SQLite or Electron.
- TDD guard: Each implementation task starts with failing tests before production code.
- Verification guard: Final plan includes `pnpm check`, `pnpm test:e2e`, and `git diff --check`.
