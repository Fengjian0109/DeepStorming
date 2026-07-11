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
