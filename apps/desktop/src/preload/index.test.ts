import {
  APP_CHANNELS,
  DOCUMENT_CHANNELS,
  LESSON_CHANNELS,
  LEARNING_SETTINGS_CHANNELS,
  PROVIDER_CHANNELS,
  type DocumentDetailDto,
  type DocumentDraftDto,
  type DocumentImportJobDto,
  type DocumentFigureDto,
  type DocumentPageDto,
  type DocumentSearchResultDto,
  type DocumentSummaryDto,
  type DocumentTextBlockDto,
  type DeepStormingApi,
  type LessonSessionDto,
  type LessonStartDraftDto,
  type ProviderDraftDto,
  type ProviderProfileDto,
  type TutorProfileDraftDto,
  type TutorProfileDto,
  type ClassroomPreferencesDto,
} from '@deepstorming/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  getPathForFile: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: { invoke: mocks.invoke },
  webUtils: { getPathForFile: mocks.getPathForFile },
}))

const REQUEST_ID = 'f4b7fd8f-4f47-4a61-9224-151f51f347de'
const PROVIDER_ID = 'a1f6b565-7bdf-4d68-b5b6-88667b5a7f24'
const OPERATION_ID = 'f5c5a440-5b18-420e-a227-78ad35f4c19d'

const providerDraft: ProviderDraftDto = {
  providerType: 'openai_compatible',
  displayName: 'OpenAI Compatible',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'test-model',
  apiKey: 'sk-test-secret-value',
}

const providerProfile: ProviderProfileDto = {
  id: PROVIDER_ID,
  providerType: 'openai_compatible',
  displayName: 'OpenAI Compatible',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'test-model',
  hasApiKey: true,
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: false,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const tutorDraft: TutorProfileDraftDto = {
  name: '苏格拉底导师',
  personality: '耐心',
  tone: '清晰',
  expertiseTags: ['通识'],
  strictness: 3,
  socraticIntensity: 4,
  guidanceStyle: 'question_first',
  bookStrategy: '逐步提示',
  paperStrategy: '检查证据',
  customInstructions: '',
}
const tutorProfile: TutorProfileDto = {
  ...tutorDraft,
  id: PROVIDER_ID,
  revision: 1,
  status: 'active',
  promptVersion: 'tutor-profile-v1',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
}
const classroomPreferences: ClassroomPreferencesDto = {
  defaultBookTutorId: PROVIDER_ID,
  defaultPaperTutorId: PROVIDER_ID,
  defaultPace: 'standard',
  sendShortcut: 'enter',
  autoScroll: true,
  contextCompressionRemainingPercent: 30,
  recentTurnCount: 8,
}

const documentDraft: DocumentDraftDto = {
  title: 'Notes',
  plainText: 'body',
  sourceKind: 'pasted_text',
}

const documentSummary: DocumentSummaryDto = {
  id: PROVIDER_ID,
  documentType: 'generic',
  title: 'Notes',
  sourceKind: 'pasted_text',
  characterCount: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const documentDetail: DocumentDetailDto = {
  ...documentSummary,
  plainText: 'body',
}

const documentSearchResult: DocumentSearchResultDto = {
  documentId: documentSummary.id,
  documentType: documentSummary.documentType,
  title: documentSummary.title,
  sourceKind: documentSummary.sourceKind,
  characterCount: documentSummary.characterCount,
  snippet: 'body',
  startOffset: 0,
  endOffset: 4,
  createdAt: documentSummary.createdAt,
  updatedAt: documentSummary.updatedAt,
}
const documentImportJob: DocumentImportJobDto = {
  id: '00000000-0000-4000-8000-000000000101',
  documentId: documentSummary.id,
  sourceKind: 'pdf_file',
  status: 'ready',
  originalName: 'paper.pdf',
  fileSizeBytes: 1024,
  contentHash: 'a'.repeat(64),
  error: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:01:00.000Z',
  finishedAt: '2026-07-12T00:01:00.000Z',
}
const documentPage: DocumentPageDto = {
  id: '00000000-0000-4000-8000-000000000201',
  documentId: documentSummary.id,
  pageNumber: 1,
  width: 612,
  height: 792,
  text: 'body',
  textHash: 'b'.repeat(64),
  createdAt: '2026-07-12T00:01:00.000Z',
}
const documentTextBlock: DocumentTextBlockDto = {
  id: '00000000-0000-4000-8000-000000000301',
  documentId: documentSummary.id,
  pageId: documentPage.id,
  pageNumber: 1,
  blockIndex: 0,
  text: 'body',
  x: 10,
  y: 20,
  width: 100,
  height: 16,
  createdAt: '2026-07-12T00:01:00.000Z',
}
const documentFigure: DocumentFigureDto = {
  id: '00000000-0000-4000-8000-000000000302',
  documentId: documentSummary.id,
  pageNumber: 1,
  label: 'Figure 1',
  caption: 'Architecture',
  assetId: '00000000-0000-4000-8000-000000000402',
  assetKind: 'embedded_image',
  width: 320,
  height: 200,
  createdAt: '2026-07-12T00:01:00.000Z',
}

const lessonDraft: LessonStartDraftDto = {
  documentId: documentSummary.id,
  documentTitle: documentSummary.title,
  lessonMode: 'paper',
  source: {
    startOffset: 0,
    endOffset: 4,
    snippet: 'body',
  },
}

const lessonSession: LessonSessionDto = {
  id: OPERATION_ID,
  title: 'Notes 课堂',
  status: 'active',
  documentId: documentSummary.id,
  documentTitle: documentSummary.title,
  sourceAnchors: [
    {
      id: REQUEST_ID,
      documentId: documentSummary.id,
      startOffset: 0,
      endOffset: 4,
      snippet: 'body',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId: OPERATION_ID,
      modelRunId: '00000000-0000-4000-8000-000000000501',
      role: 'tutor',
      content: '我们先从《Notes》的这段证据开始：body\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: [REQUEST_ID],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId: OPERATION_ID,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question',
      status: 'succeeded',
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId: documentSummary.id,
        documentTitle: documentSummary.title,
        sourceAnchorIds: [REQUEST_ID],
        sourceCharacterRange: { startOffset: 0, endOffset: 4 },
        snippetCharacterCount: 4,
        contextCharacterCount: 4,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 4,
          },
        ],
      },
      sourceAnchorIds: [REQUEST_ID],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  currentState: 'probing',
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      lessonId: OPERATION_ID,
      sequenceNo: 0,
      stateBefore: 'opening',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'succeeded',
      modelRunId: '00000000-0000-4000-8000-000000000501',
      messageId: '00000000-0000-4000-8000-000000000401',
      rationale: 'Started with a source-grounded question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard',
  paperProfile: null,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const loadApi = async (): Promise<DeepStormingApi> => {
  vi.resetModules()
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => REQUEST_ID) })
  await import('./index')
  return mocks.exposeInMainWorld.mock.calls.at(-1)?.[1] as DeepStormingApi
}

describe('preload API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('exposes explicit app and provider APIs without a private invoke helper', async () => {
    const api = await loadApi()

    expect(mocks.exposeInMainWorld).toHaveBeenCalledWith('deepstorming', expect.any(Object))
    expect(Object.keys(api)).toEqual([
      'app',
      'documents',
      'lessons',
      'provider',
      'learningSettings',
    ])
    expect(api).not.toHaveProperty('invoke')
    expect(api.documents).toEqual({
      list: expect.any(Function),
      createFromText: expect.any(Function),
      get: expect.any(Function),
      search: expect.any(Function),
      remove: expect.any(Function),
      importPdf: expect.any(Function),
      getPathForFile: expect.any(Function),
      getPages: expect.any(Function),
      getPageBlocks: expect.any(Function),
      getFigureAsset: expect.any(Function),
    })
    expect(api.lessons).toEqual({
      list: expect.any(Function),
      startFromDocument: expect.any(Function),
      get: expect.any(Function),
      reply: expect.any(Function),
      retryRun: expect.any(Function),
      cancelRun: expect.any(Function),
      recordReview: expect.any(Function),
      end: expect.any(Function),
      choosePostLessonAction: expect.any(Function),
      completeReview: expect.any(Function),
    })
    expect(api.learningSettings).toEqual({
      get: expect.any(Function),
      saveUserProfile: expect.any(Function),
      createTutor: expect.any(Function),
      updateTutor: expect.any(Function),
      archiveTutor: expect.any(Function),
      saveClassroomPreferences: expect.any(Function),
      importAvatar: expect.any(Function),
    })
  })

  it.each([
    {
      name: 'app.getInfo',
      call: (api: DeepStormingApi) => api.app.getInfo(),
      channel: APP_CHANNELS.getInfo,
      payload: { requestId: REQUEST_ID },
      response: {
        ok: true,
        data: { name: 'DeepStorming', version: '0.0.0-test', platform: 'linux' },
        requestId: REQUEST_ID,
      },
    },
    {
      name: 'provider.list',
      call: (api: DeepStormingApi) => api.provider.list(),
      channel: PROVIDER_CHANNELS.list,
      payload: { requestId: REQUEST_ID },
      response: { ok: true, data: [providerProfile], requestId: REQUEST_ID },
    },
    {
      name: 'learningSettings.get',
      call: (api: DeepStormingApi) => api.learningSettings.get(),
      channel: LEARNING_SETTINGS_CHANNELS.get,
      payload: { requestId: REQUEST_ID },
      response: {
        ok: true,
        data: {
          userProfile: {
            displayName: '学习者',
            revision: 1,
            updatedAt: '2026-07-14T00:00:00.000Z',
          },
          tutorProfiles: [tutorProfile],
          classroomPreferences,
        },
        requestId: REQUEST_ID,
      },
    },
    {
      name: 'learningSettings.createTutor',
      call: (api: DeepStormingApi) => api.learningSettings.createTutor(tutorDraft),
      channel: LEARNING_SETTINGS_CHANNELS.createTutor,
      payload: { requestId: REQUEST_ID, profile: tutorDraft },
      response: { ok: true, data: tutorProfile, requestId: REQUEST_ID },
    },
    {
      name: 'learningSettings.saveClassroomPreferences',
      call: (api: DeepStormingApi) =>
        api.learningSettings.saveClassroomPreferences(classroomPreferences),
      channel: LEARNING_SETTINGS_CHANNELS.saveClassroomPreferences,
      payload: { requestId: REQUEST_ID, preferences: classroomPreferences },
      response: { ok: true, data: classroomPreferences, requestId: REQUEST_ID },
    },
    {
      name: 'provider.create',
      call: (api: DeepStormingApi) => api.provider.create(providerDraft),
      channel: PROVIDER_CHANNELS.create,
      payload: { requestId: REQUEST_ID, provider: providerDraft },
      response: { ok: true, data: providerProfile, requestId: REQUEST_ID },
    },
    {
      name: 'provider.update',
      call: (api: DeepStormingApi) => api.provider.update(PROVIDER_ID, providerDraft),
      channel: PROVIDER_CHANNELS.update,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID, provider: providerDraft },
      response: { ok: true, data: providerProfile, requestId: REQUEST_ID },
    },
    {
      name: 'provider.remove',
      call: (api: DeepStormingApi) => api.provider.remove(PROVIDER_ID),
      channel: PROVIDER_CHANNELS.remove,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID },
      response: { ok: true, data: {}, requestId: REQUEST_ID },
    },
    {
      name: 'provider.activate',
      call: (api: DeepStormingApi) => api.provider.activate(PROVIDER_ID),
      channel: PROVIDER_CHANNELS.activate,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID },
      response: { ok: true, data: providerProfile, requestId: REQUEST_ID },
    },
    {
      name: 'provider.testConnection',
      call: (api: DeepStormingApi) => api.provider.testConnection(PROVIDER_ID, OPERATION_ID),
      channel: PROVIDER_CHANNELS.testConnection,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID, operationId: OPERATION_ID },
      response: { ok: true, data: providerProfile, requestId: REQUEST_ID },
    },
    {
      name: 'provider.cancelTest',
      call: (api: DeepStormingApi) => api.provider.cancelTest(OPERATION_ID),
      channel: PROVIDER_CHANNELS.cancelTest,
      payload: { requestId: REQUEST_ID, operationId: OPERATION_ID },
      response: { ok: true, data: { cancelled: true }, requestId: REQUEST_ID },
    },
    {
      name: 'documents.list',
      call: (api: DeepStormingApi) => api.documents.list(),
      channel: DOCUMENT_CHANNELS.list,
      payload: { requestId: REQUEST_ID },
      response: { ok: true, data: [documentSummary], requestId: REQUEST_ID },
    },
    {
      name: 'documents.createFromText',
      call: (api: DeepStormingApi) => api.documents.createFromText(documentDraft),
      channel: DOCUMENT_CHANNELS.createFromText,
      payload: { requestId: REQUEST_ID, document: documentDraft },
      response: { ok: true, data: documentSummary, requestId: REQUEST_ID },
    },
    {
      name: 'documents.get',
      call: (api: DeepStormingApi) => api.documents.get(PROVIDER_ID),
      channel: DOCUMENT_CHANNELS.get,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID },
      response: { ok: true, data: documentDetail, requestId: REQUEST_ID },
    },
    {
      name: 'documents.search',
      call: (api: DeepStormingApi) => api.documents.search('body'),
      channel: DOCUMENT_CHANNELS.search,
      payload: { requestId: REQUEST_ID, query: 'body' },
      response: { ok: true, data: [documentSearchResult], requestId: REQUEST_ID },
    },
    {
      name: 'documents.remove',
      call: (api: DeepStormingApi) => api.documents.remove(PROVIDER_ID),
      channel: DOCUMENT_CHANNELS.remove,
      payload: { requestId: REQUEST_ID, id: PROVIDER_ID },
      response: { ok: true, data: {}, requestId: REQUEST_ID },
    },
    {
      name: 'documents.importPdf',
      call: (api: DeepStormingApi) =>
        api.documents.importPdf({ filePath: '/tmp/paper.pdf', originalName: 'paper.pdf' }),
      channel: DOCUMENT_CHANNELS.importPdf,
      payload: { requestId: REQUEST_ID, filePath: '/tmp/paper.pdf', originalName: 'paper.pdf' },
      response: { ok: true, data: documentImportJob, requestId: REQUEST_ID },
    },
    {
      name: 'documents.getPages',
      call: (api: DeepStormingApi) => api.documents.getPages(PROVIDER_ID),
      channel: DOCUMENT_CHANNELS.getPages,
      payload: { requestId: REQUEST_ID, documentId: PROVIDER_ID },
      response: { ok: true, data: [documentPage], requestId: REQUEST_ID },
    },
    {
      name: 'documents.getPageBlocks',
      call: (api: DeepStormingApi) => api.documents.getPageBlocks(PROVIDER_ID, 1),
      channel: DOCUMENT_CHANNELS.getPageBlocks,
      payload: { requestId: REQUEST_ID, documentId: PROVIDER_ID, pageNumber: 1 },
      response: { ok: true, data: [documentTextBlock], requestId: REQUEST_ID },
    },
    {
      name: 'documents.getFigureAsset',
      call: (api: DeepStormingApi) =>
        api.documents.getFigureAsset(documentSummary.id, documentFigure.id),
      channel: DOCUMENT_CHANNELS.getFigureAsset,
      payload: {
        requestId: REQUEST_ID,
        documentId: documentSummary.id,
        figureId: documentFigure.id,
      },
      response: {
        ok: true,
        data: {
          figure: documentFigure,
          mediaType: 'image/png',
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
        requestId: REQUEST_ID,
      },
    },
    {
      name: 'lessons.list',
      call: (api: DeepStormingApi) => api.lessons.list(),
      channel: LESSON_CHANNELS.list,
      payload: { requestId: REQUEST_ID },
      response: { ok: true, data: [lessonSession], requestId: REQUEST_ID },
    },
    {
      name: 'lessons.startFromDocument',
      call: (api: DeepStormingApi) => api.lessons.startFromDocument(lessonDraft),
      channel: LESSON_CHANNELS.startFromDocument,
      payload: { requestId: REQUEST_ID, lesson: lessonDraft },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.get',
      call: (api: DeepStormingApi) => api.lessons.get(OPERATION_ID),
      channel: LESSON_CHANNELS.get,
      payload: { requestId: REQUEST_ID, id: OPERATION_ID },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.reply',
      call: (api: DeepStormingApi) =>
        api.lessons.reply({ lessonId: OPERATION_ID, content: '它在说明证据如何支撑判断。' }),
      channel: LESSON_CHANNELS.reply,
      payload: {
        requestId: REQUEST_ID,
        lessonId: OPERATION_ID,
        content: '它在说明证据如何支撑判断。',
        operationId: REQUEST_ID,
      },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.retryRun',
      call: (api: DeepStormingApi) =>
        api.lessons.retryRun({
          lessonId: OPERATION_ID,
          modelRunId: '00000000-0000-4000-8000-000000000501',
          operationId: REQUEST_ID,
        }),
      channel: LESSON_CHANNELS.retryRun,
      payload: {
        requestId: REQUEST_ID,
        lessonId: OPERATION_ID,
        modelRunId: '00000000-0000-4000-8000-000000000501',
        operationId: REQUEST_ID,
      },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.cancelRun',
      call: (api: DeepStormingApi) => api.lessons.cancelRun(OPERATION_ID),
      channel: LESSON_CHANNELS.cancelRun,
      payload: { requestId: REQUEST_ID, operationId: OPERATION_ID },
      response: { ok: true, data: { cancelled: true }, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.recordReview',
      call: (api: DeepStormingApi) =>
        api.lessons.recordReview({
          lessonId: OPERATION_ID,
          reviewItemId: '00000000-0000-4000-8000-000000000951',
          rating: 'remembered',
          response: '我可以清楚解释这段证据了。',
        }),
      channel: LESSON_CHANNELS.recordReview,
      payload: {
        requestId: REQUEST_ID,
        lessonId: OPERATION_ID,
        reviewItemId: '00000000-0000-4000-8000-000000000951',
        rating: 'remembered',
        response: '我可以清楚解释这段证据了。',
      },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.end',
      call: (api: DeepStormingApi) => api.lessons.end({ lessonId: OPERATION_ID }),
      channel: LESSON_CHANNELS.end,
      payload: { requestId: REQUEST_ID, lessonId: OPERATION_ID, operationId: REQUEST_ID },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.choosePostLessonAction',
      call: (api: DeepStormingApi) =>
        api.lessons.choosePostLessonAction({
          lessonId: OPERATION_ID,
          action: 'rest',
        }),
      channel: LESSON_CHANNELS.choosePostLessonAction,
      payload: { requestId: REQUEST_ID, lessonId: OPERATION_ID, action: 'rest' },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
    {
      name: 'lessons.completeReview',
      call: (api: DeepStormingApi) =>
        api.lessons.completeReview({
          lessonId: OPERATION_ID,
          response: '我可以解释证据与结论的关系。',
        }),
      channel: LESSON_CHANNELS.completeReview,
      payload: {
        requestId: REQUEST_ID,
        lessonId: OPERATION_ID,
        response: '我可以解释证据与结论的关系。',
      },
      response: { ok: true, data: lessonSession, requestId: REQUEST_ID },
    },
  ])('invokes one fixed IPC channel and validates $name responses', async (testCase) => {
    const api = await loadApi()
    mocks.invoke.mockResolvedValueOnce(testCase.response)

    await expect(testCase.call(api)).resolves.toEqual(testCase.response)

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith(testCase.channel, testCase.payload)
  })

  it('maps invalid provider IPC output to IPC_RESPONSE_INVALID with the generated request ID', async () => {
    const api = await loadApi()
    mocks.invoke.mockResolvedValueOnce({ ok: true, data: { secretRef: 'hidden' }, requestId: '' })

    await expect(api.provider.list()).resolves.toEqual({
      ok: false,
      error: {
        code: 'IPC_RESPONSE_INVALID',
        message: 'DeepStorming received an invalid response from the desktop process.',
        retryable: true,
      },
      requestId: REQUEST_ID,
    })
  })

  it('maps IPC invoke rejections to INTERNAL_ERROR with the generated request ID', async () => {
    const api = await loadApi()
    mocks.invoke.mockRejectedValueOnce(new Error('desktop unavailable'))

    await expect(api.documents.list()).resolves.toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'DeepStorming could not reach the desktop process.',
        retryable: true,
      },
      requestId: REQUEST_ID,
    })
  })

  it('exposes a narrow file path helper through Electron webUtils', async () => {
    const api = await loadApi()
    const file = new File(['body'], 'paper.pdf', { type: 'application/pdf' })
    mocks.getPathForFile.mockReturnValueOnce(' /tmp/paper.pdf ')

    expect(api.documents.getPathForFile(file)).toBe('/tmp/paper.pdf')
    expect(mocks.getPathForFile).toHaveBeenCalledWith(file)
  })

  it('normalizes empty Electron file paths to undefined', async () => {
    const api = await loadApi()
    mocks.getPathForFile.mockReturnValueOnce('   ')

    expect(api.documents.getPathForFile(new File([], 'paper.pdf'))).toBeUndefined()
  })

  it('imports avatars through one dedicated IPC channel without exposing the path', async () => {
    const api = await loadApi()
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    mocks.getPathForFile.mockReturnValueOnce('/tmp/avatar.png')
    mocks.invoke.mockResolvedValueOnce({
      ok: true,
      data: { assetId: `${'a'.repeat(64)}.png` },
      requestId: REQUEST_ID,
    })

    await expect(api.learningSettings.importAvatar(file)).resolves.toMatchObject({ ok: true })
    expect(mocks.invoke).toHaveBeenCalledWith(LEARNING_SETTINGS_CHANNELS.importAvatar, {
      requestId: REQUEST_ID,
      sourcePath: '/tmp/avatar.png',
    })
  })
})
