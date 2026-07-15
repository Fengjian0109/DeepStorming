import { randomUUID } from 'node:crypto'

import { DocumentUseCaseError, type GetDocumentFigureAsset } from '@deepstorming/application'
import {
  documentFigureAssetResultSchema,
  getDocumentFigureAssetRequestSchema,
  type DocumentFigureAssetResult,
} from '@deepstorming/contracts'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u

export type DocumentAssetIpcDependencies = Readonly<{
  getDocumentFigureAsset: GetDocumentFigureAsset
}>

export type DocumentAssetIpcHandlers = Readonly<{
  getFigureAsset(input: unknown): Promise<DocumentFigureAssetResult>
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

const validated = (result: DocumentFigureAssetResult): DocumentFigureAssetResult => {
  const parsed = documentFigureAssetResultSchema.safeParse(result)
  if (!parsed.success) throw new Error('Document figure IPC result failed validation')
  return parsed.data
}

export const createDocumentAssetIpcHandlers = (
  dependencies: DocumentAssetIpcDependencies,
): DocumentAssetIpcHandlers => ({
  getFigureAsset: async (input) => {
    const requestId = requestIdFrom(input)
    const parsed = getDocumentFigureAssetRequestSchema.safeParse(input)
    if (!parsed.success) {
      return validated({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'The document figure request is invalid.',
          retryable: false,
          details: { issueCount: parsed.error.issues.length },
        },
        requestId,
      })
    }

    try {
      const asset = await dependencies.getDocumentFigureAsset.execute({
        documentId: parsed.data.documentId,
        figureId: parsed.data.figureId,
      })
      return validated({
        ok: true,
        data: {
          figure: asset.figure,
          mediaType: asset.mediaType,
          dataUrl: `data:image/png;base64,${Buffer.from(asset.data).toString('base64')}`,
        },
        requestId: parsed.data.requestId,
      })
    } catch (error) {
      if (error instanceof DocumentUseCaseError) {
        return validated({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(error.details === undefined ? {} : { details: error.details }),
          },
          requestId: parsed.data.requestId,
        })
      }
      return validated({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The document figure could not be loaded.',
          retryable: true,
        },
        requestId: parsed.data.requestId,
      })
    }
  },
})
