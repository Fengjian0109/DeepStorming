import { z } from 'zod'

import { appErrorDetailsSchema, appErrorCodeSchema } from './app-result'

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
export const documentBusinessErrorCodeSchema = z.enum([
  'DOCUMENT_VALIDATION_FAILED',
  'DOCUMENT_DUPLICATE',
  'DOCUMENT_NOT_FOUND',
])

export const documentErrorCodeSchema = z.union([appErrorCodeSchema, documentBusinessErrorCodeSchema])

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
export const removeDocumentResultSchema = createDocumentResultSchema(voidDataSchema)

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
