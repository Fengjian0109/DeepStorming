import { z } from 'zod'

import { appErrorDetailsSchema, appErrorCodeSchema } from './app-result'

export const DOCUMENT_CHANNELS = {
  list: 'documents:list',
  createFromText: 'documents:create-from-text',
  get: 'documents:get',
  search: 'documents:search',
  remove: 'documents:remove',
  importPdf: 'documents:import-pdf',
  getPages: 'documents:get-pages',
  getPageBlocks: 'documents:get-page-blocks',
} as const

const requestIdSchema = z.string().uuid()
const documentIdSchema = z.string().uuid()
const requiredTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required text must not be blank',
})
const timestampSchema = z.iso.datetime()

export const documentTypeSchema = z.enum(['generic', 'textbook', 'paper'])
export const documentSourceKindSchema = z.enum(['pasted_text', 'text_file'])
export const documentImportStatusSchema = z.enum([
  'queued',
  'copying',
  'parsing',
  'ready',
  'failed',
  'cancelled',
])
export const documentBusinessErrorCodeSchema = z.enum([
  'DOCUMENT_VALIDATION_FAILED',
  'DOCUMENT_DUPLICATE',
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_IMPORT_FAILED',
  'DOCUMENT_FILE_UNSUPPORTED',
  'DOCUMENT_FILE_TOO_LARGE',
  'DOCUMENT_PDF_PASSWORD_PROTECTED',
  'DOCUMENT_PDF_TEXT_MISSING',
  'DOCUMENT_PDF_PARSE_FAILED',
])

const documentSharedErrorCodeSchema = appErrorCodeSchema.extract([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
  'DATABASE_UNAVAILABLE',
])

export const documentErrorCodeSchema = z.union([
  documentSharedErrorCodeSchema,
  documentBusinessErrorCodeSchema,
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
export const documentSearchResultSchema = documentSummarySchema
  .omit({ id: true })
  .extend({
    documentId: documentIdSchema,
    snippet: requiredTextSchema.max(280),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
  })
  .strict()

export const documentImportErrorSchema = z
  .object({
    code: documentErrorCodeSchema,
    message: z.string().min(1).max(240),
    retryable: z.boolean(),
  })
  .strict()

export const documentImportJobSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema.nullable(),
    sourceKind: z.literal('pdf_file'),
    status: documentImportStatusSchema,
    originalName: requiredTextSchema.max(240).regex(/\.pdf$/iu),
    fileSizeBytes: z.number().int().nonnegative(),
    contentHash: z.string().regex(/^[\da-f]{64}$/iu),
    error: documentImportErrorSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
  })
  .strict()

export const documentPageSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema,
    pageNumber: z.number().int().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    text: requiredTextSchema,
    textHash: z.string().regex(/^[\da-f]{64}$/iu),
    createdAt: timestampSchema,
  })
  .strict()

export const documentTextBlockSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema,
    pageId: z.string().uuid(),
    pageNumber: z.number().int().positive(),
    blockIndex: z.number().int().nonnegative(),
    text: requiredTextSchema,
    x: z.number().nonnegative().optional(),
    y: z.number().nonnegative().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    createdAt: timestampSchema,
  })
  .strict()

export const documentChunkSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema,
    pageNumberStart: z.number().int().positive(),
    pageNumberEnd: z.number().int().positive(),
    blockIds: z.array(requiredTextSchema).min(1),
    text: requiredTextSchema,
    charCount: z.number().int().nonnegative(),
    sourceVersion: requiredTextSchema.max(120),
    rebuildToken: requiredTextSchema.max(120),
  })
  .strict()
  .refine((value) => value.pageNumberEnd >= value.pageNumberStart, {
    message: 'pageNumberEnd must be greater than or equal to pageNumberStart',
  })
  .refine((value) => value.charCount === [...value.text.trim()].length, {
    message: 'charCount must match the normalized chunk text length',
  })

export const documentContextBudgetSchema = z
  .object({
    maxChunks: z.number().int().positive(),
    maxCharacters: z.number().int().positive(),
  })
  .strict()

export const listDocumentsRequestSchema = z.object({ requestId: requestIdSchema }).strict()
export const createDocumentFromTextRequestSchema = z
  .object({ requestId: requestIdSchema, document: documentDraftSchema })
  .strict()
export const getDocumentRequestSchema = z
  .object({ requestId: requestIdSchema, id: documentIdSchema })
  .strict()
export const searchDocumentsRequestSchema = z
  .object({ requestId: requestIdSchema, query: requiredTextSchema })
  .strict()
export const removeDocumentRequestSchema = z
  .object({ requestId: requestIdSchema, id: documentIdSchema })
  .strict()
export const importPdfDocumentRequestSchema = z
  .object({
    requestId: requestIdSchema,
    filePath: requiredTextSchema,
    originalName: requiredTextSchema.max(240).regex(/\.pdf$/iu),
  })
  .strict()
export const getDocumentPagesRequestSchema = z
  .object({ requestId: requestIdSchema, documentId: documentIdSchema })
  .strict()
export const getDocumentPageBlocksRequestSchema = z
  .object({
    requestId: requestIdSchema,
    documentId: documentIdSchema,
    pageNumber: z.number().int().positive(),
  })
  .strict()

const voidDataSchema = z.object({}).strict()
const documentErrorSchema = z
  .object({
    code: documentErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: appErrorDetailsSchema.optional(),
  })
  .strict()

const createDocumentResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
        requestId: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: documentErrorSchema,
        requestId: z.string().min(1),
      })
      .strict(),
  ])

export const listDocumentsResultSchema = createDocumentResultSchema(z.array(documentSummarySchema))
export const documentDetailResultSchema = createDocumentResultSchema(documentDetailSchema)
export const documentSummaryResultSchema = createDocumentResultSchema(documentSummarySchema)
export const searchDocumentsResultSchema = createDocumentResultSchema(
  z.array(documentSearchResultSchema),
)
export const removeDocumentResultSchema = createDocumentResultSchema(voidDataSchema)
export const documentImportJobResultSchema = createDocumentResultSchema(documentImportJobSchema)
export const documentPagesResultSchema = createDocumentResultSchema(z.array(documentPageSchema))
export const documentTextBlocksResultSchema = createDocumentResultSchema(
  z.array(documentTextBlockSchema),
)

export type DocumentTypeDto = z.infer<typeof documentTypeSchema>
export type DocumentSourceKindDto = z.infer<typeof documentSourceKindSchema>
export type DocumentImportStatusDto = z.infer<typeof documentImportStatusSchema>
export type DocumentDraftDto = z.infer<typeof documentDraftSchema>
export type DocumentSummaryDto = z.infer<typeof documentSummarySchema>
export type DocumentDetailDto = z.infer<typeof documentDetailSchema>
export type DocumentSearchResultDto = z.infer<typeof documentSearchResultSchema>
export type DocumentImportErrorDto = z.infer<typeof documentImportErrorSchema>
export type DocumentImportJobDto = z.infer<typeof documentImportJobSchema>
export type DocumentPageDto = z.infer<typeof documentPageSchema>
export type DocumentTextBlockDto = z.infer<typeof documentTextBlockSchema>
export type DocumentChunkDto = z.infer<typeof documentChunkSchema>
export type DocumentContextBudgetDto = z.infer<typeof documentContextBudgetSchema>
export type ListDocumentsRequest = z.infer<typeof listDocumentsRequestSchema>
export type CreateDocumentFromTextRequest = z.infer<typeof createDocumentFromTextRequestSchema>
export type GetDocumentRequest = z.infer<typeof getDocumentRequestSchema>
export type SearchDocumentsRequest = z.infer<typeof searchDocumentsRequestSchema>
export type RemoveDocumentRequest = z.infer<typeof removeDocumentRequestSchema>
export type ImportPdfDocumentRequest = z.infer<typeof importPdfDocumentRequestSchema>
export type GetDocumentPagesRequest = z.infer<typeof getDocumentPagesRequestSchema>
export type GetDocumentPageBlocksRequest = z.infer<typeof getDocumentPageBlocksRequestSchema>
export type ListDocumentsResult = z.infer<typeof listDocumentsResultSchema>
export type DocumentSummaryResult = z.infer<typeof documentSummaryResultSchema>
export type DocumentDetailResult = z.infer<typeof documentDetailResultSchema>
export type SearchDocumentsResult = z.infer<typeof searchDocumentsResultSchema>
export type RemoveDocumentResult = z.infer<typeof removeDocumentResultSchema>
export type DocumentImportJobResult = z.infer<typeof documentImportJobResultSchema>
export type DocumentPagesResult = z.infer<typeof documentPagesResultSchema>
export type DocumentTextBlocksResult = z.infer<typeof documentTextBlocksResultSchema>
