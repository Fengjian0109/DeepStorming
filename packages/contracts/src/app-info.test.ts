import { describe, expect, expectTypeOf, it } from 'vitest'

import type { DeepStormingApi } from './app-info'
import { appInfoRequestSchema, appInfoResultSchema } from './app-info'
import type {
  CreateDocumentFromTextRequest,
  DocumentDetailResult,
  DocumentSummaryResult,
  DocumentDraftDto,
  ListDocumentsResult,
  RemoveDocumentResult,
} from './document'

describe('app info contracts', () => {
  it('rejects extra IPC request fields', () => {
    expect(
      appInfoRequestSchema.safeParse({
        requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de',
        unsafe: true,
      }).success,
    ).toBe(false)
  })

  it('accepts a valid success result', () => {
    expect(
      appInfoResultSchema.safeParse({
        ok: true,
        data: { name: 'DeepStorming', version: '0.0.0', platform: 'linux' },
        requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de',
      }).success,
    ).toBe(true)
  })

  it('accepts the allowlisted issue count from request validation failures', () => {
    expect(
      appInfoResultSchema.safeParse({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'The app information request is invalid.',
          retryable: false,
          details: { issueCount: 1 },
        },
        requestId: 'not-a-uuid',
      }).success,
    ).toBe(true)
  })

  it('exposes the shared documents API surface', () => {
    type DocumentsApi = DeepStormingApi['documents']

    expectTypeOf<DocumentsApi>().toMatchTypeOf<{
      list: () => Promise<ListDocumentsResult>
      createFromText: (document: DocumentDraftDto) => Promise<DocumentSummaryResult>
      get: (id: string) => Promise<DocumentDetailResult>
      remove: (id: string) => Promise<RemoveDocumentResult>
    }>()

    expectTypeOf<CreateDocumentFromTextRequest['document']>().toMatchTypeOf<DocumentDraftDto>()
  })
})
