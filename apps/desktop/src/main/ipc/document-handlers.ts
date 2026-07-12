import { randomUUID } from 'node:crypto'

import type {
  CreateDocumentFromText,
  DeleteDocument,
  GetDocumentPageBlocks,
  GetDocumentPages,
  GetDocument,
  ImportPdfDocument,
  ListDocuments,
  SearchDocuments,
} from '@deepstorming/application'
import { DocumentUseCaseError } from '@deepstorming/application'
import {
  createDocumentFromTextRequestSchema,
  documentDetailResultSchema,
  documentImportJobResultSchema,
  documentPagesResultSchema,
  documentSummaryResultSchema,
  documentTextBlocksResultSchema,
  getDocumentPageBlocksRequestSchema,
  getDocumentPagesRequestSchema,
  getDocumentRequestSchema,
  importPdfDocumentRequestSchema,
  listDocumentsRequestSchema,
  listDocumentsResultSchema,
  removeDocumentRequestSchema,
  removeDocumentResultSchema,
  searchDocumentsRequestSchema,
  searchDocumentsResultSchema,
  type CreateDocumentFromTextRequest,
  type DocumentDetailResult,
  type DocumentImportJobResult,
  type DocumentPagesResult,
  type DocumentSummaryResult,
  type DocumentTextBlocksResult,
  type GetDocumentPageBlocksRequest,
  type ImportPdfDocumentRequest,
  type ListDocumentsResult,
  type RemoveDocumentResult,
  type SearchDocumentsResult,
} from '@deepstorming/contracts'

type Awaitable<T> = T | Promise<T>
type SafeParseResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: Readonly<{ issues: readonly unknown[] }> }>
type Schema<T> = Readonly<{ safeParse(input: unknown): SafeParseResult<T> }>
type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>
type DocumentIpcResult =
  | ListDocumentsResult
  | DocumentSummaryResult
  | DocumentDetailResult
  | SearchDocumentsResult
  | RemoveDocumentResult
  | DocumentImportJobResult
  | DocumentPagesResult
  | DocumentTextBlocksResult
type DocumentIpcError = Extract<DocumentIpcResult, { ok: false }>['error']

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u

export type DocumentIpcHandlers = Readonly<{
  list(input: unknown): Promise<ListDocumentsResult>
  createFromText(input: unknown): Promise<DocumentSummaryResult>
  get(input: unknown): Promise<DocumentDetailResult>
  search(input: unknown): Promise<SearchDocumentsResult>
  remove(input: unknown): Promise<RemoveDocumentResult>
  importPdf(input: unknown): Promise<DocumentImportJobResult>
  getPages(input: unknown): Promise<DocumentPagesResult>
  getPageBlocks(input: unknown): Promise<DocumentTextBlocksResult>
}>

export type DocumentIpcDependencies = Readonly<{
  listDocuments: ListDocuments
  createDocumentFromText: CreateDocumentFromText
  getDocument: GetDocument
  searchDocuments: SearchDocuments
  deleteDocument: DeleteDocument
  importPdfDocument: ImportPdfDocument
  getDocumentPages: GetDocumentPages
  getDocumentPageBlocks: GetDocumentPageBlocks
}>

const requestIdFrom = (input: unknown): string => {
  if (
    input !== null &&
    typeof input === 'object' &&
    'requestId' in input &&
    typeof input.requestId === 'string' &&
    UUID.test(input.requestId)
  ) {
    return input.requestId
  }

  return randomUUID()
}

const invalidRequest = (requestId: string, issueCount: number): DocumentIpcResult => ({
  ok: false,
  error: {
    code: 'INVALID_REQUEST',
    message: 'The document request is invalid.',
    retryable: false,
    details: { issueCount },
  },
  requestId,
})

const internalError = (requestId: string): DocumentIpcResult => ({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'The document request could not be completed.',
    retryable: true,
  },
  requestId,
})

const mapError = (error: unknown, requestId: string): DocumentIpcResult => {
  if (error instanceof DocumentUseCaseError) {
    const mapped: DocumentIpcError = {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    }

    return { ok: false, error: mapped, requestId }
  }

  return internalError(requestId)
}

const validated = <Result extends DocumentIpcResult>(
  result: Result,
  schema: ResultSchema<Result>,
): Result => {
  const parsed = schema.safeParse(result)
  if (!parsed.success) throw new Error('IPC result failed validation')
  return parsed.data
}

const handle = async <
  Request extends { requestId: string },
  Data,
  Result extends DocumentIpcResult,
>(
  input: unknown,
  requestSchema: Schema<Request>,
  resultSchema: ResultSchema<Result>,
  execute: (request: Request) => Awaitable<Data>,
): Promise<Result> => {
  const requestId = requestIdFrom(input)
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return validated(invalidRequest(requestId, parsed.error.issues.length) as Result, resultSchema)
  }

  try {
    const data = await execute(parsed.data)
    return validated(
      { ok: true, data, requestId: parsed.data.requestId } as unknown as Result,
      resultSchema,
    )
  } catch (error) {
    return validated(mapError(error, parsed.data.requestId) as Result, resultSchema)
  }
}

export const createDocumentIpcHandlers = (
  dependencies: DocumentIpcDependencies,
): DocumentIpcHandlers => ({
  list: (input) =>
    handle(input, listDocumentsRequestSchema, listDocumentsResultSchema, () =>
      dependencies.listDocuments.execute(),
    ),
  createFromText: (input) =>
    handle(
      input,
      createDocumentFromTextRequestSchema,
      documentSummaryResultSchema,
      (request: CreateDocumentFromTextRequest) =>
        dependencies.createDocumentFromText.execute({
          title: request.document.title,
          plainText: request.document.plainText,
          sourceKind: request.document.sourceKind,
          ...(request.document.originalFileName === undefined
            ? {}
            : { originalFileName: request.document.originalFileName }),
        }),
    ),
  get: (input) =>
    handle(input, getDocumentRequestSchema, documentDetailResultSchema, (request) =>
      dependencies.getDocument.execute(request.id),
    ),
  search: (input) =>
    handle(input, searchDocumentsRequestSchema, searchDocumentsResultSchema, (request) =>
      dependencies.searchDocuments.execute({ query: request.query }),
    ),
  remove: (input) =>
    handle(input, removeDocumentRequestSchema, removeDocumentResultSchema, async (request) => {
      await dependencies.deleteDocument.execute(request.id)
      return {}
    }),
  importPdf: (input) =>
    handle(
      input,
      importPdfDocumentRequestSchema,
      documentImportJobResultSchema,
      (request: ImportPdfDocumentRequest) =>
        dependencies.importPdfDocument.execute({
          filePath: request.filePath,
          originalName: request.originalName,
        }),
    ),
  getPages: (input) =>
    handle(input, getDocumentPagesRequestSchema, documentPagesResultSchema, (request) =>
      dependencies.getDocumentPages.execute(request.documentId),
    ),
  getPageBlocks: (input) =>
    handle(
      input,
      getDocumentPageBlocksRequestSchema,
      documentTextBlocksResultSchema,
      (request: GetDocumentPageBlocksRequest) =>
        dependencies.getDocumentPageBlocks.execute({
          documentId: request.documentId,
          pageNumber: request.pageNumber,
        }),
    ),
})
