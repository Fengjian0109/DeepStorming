import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  CreateDocumentFromText,
  DeleteDocument,
  ExtractDocumentFigures,
  GetDocument,
  GetDocumentPageBlocks,
  GetDocumentFigureAsset,
  GetDocumentPages,
  ActivateProvider,
  AssembleLessonContext,
  CancelLessonRun,
  CancelProviderTest,
  CreateProvider,
  GetApplicationInfo,
  GetLessonSession,
  ImportPdfDocument,
  ImportAvatar,
  ListDocuments,
  ListLessonSessions,
  GetLearningSettings,
  SaveUserProfile,
  CreateTutorProfile,
  UpdateTutorProfile,
  ArchiveTutorProfile,
  SaveClassroomPreferences,
  DeleteProvider,
  ListProviders,
  LessonRunOperations,
  RecordReviewEvent,
  ProviderTestOperations,
  ProviderLessonTutorReplyGenerator,
  ProviderLessonMemoryGenerator,
  EndLesson,
  ChoosePostLessonAction,
  CompleteLessonReview,
  RebuildDocumentChunks,
  RetryLessonRun,
  SearchDocuments,
  StartLessonFromDocument,
  SubmitLessonReply,
  TestProviderConnection,
  UpdateProvider,
  ExportLessonTranscript,
  CancelLessonExport,
  LessonExportOperations,
  ProviderContextCompressionGenerator,
  PrepareLessonContextCompression,
} from '@deepstorming/application'
import {
  EncryptedFileSecretVault,
  LocalPdfFileStore,
  LocalDocumentAssetStore,
  LocalAvatarStore,
  PdfParseTextExtractor,
  PdfFigureExtractor,
  ProviderGatewayFactory,
  SecretCleanupReporter,
  Sha256DocumentTextHasher,
  SqliteDocumentImportRepository,
  SqliteDocumentRepository,
  SqliteLessonRepository,
  SqliteLessonExportJobRepository,
  SqliteLearningSettingsRepository,
  SqliteProviderRepository,
  migrateDatabase,
  openDatabase,
  type SqliteDatabase,
  MarkdownLessonExporter,
  PdfLessonExporter,
  SqliteContextSnapshotRepository,
  SqliteContextCompressionJobRepository,
} from '@deepstorming/infrastructure'
import type { App } from 'electron'

import { ElectronAppInfoAdapter } from './app-info-adapter'
import type { DocumentIpcDependencies } from './ipc/document-handlers'
import type { DocumentAssetIpcDependencies } from './ipc/document-asset-handlers'
import type { LessonIpcDependencies } from './ipc/lesson-handlers'
import type { LearningSettingsIpcDependencies } from './ipc/learning-settings-handlers'
import type { ProviderIpcDependencies } from './ipc/provider-handlers'
import { ElectronSafeStorageCipher } from './secrets/electron-safe-storage-cipher'
import { ElectronHtmlToPdf, ElectronLessonExportDestination } from './lesson-export-adapters'

type AppLike = Pick<App, 'getName' | 'getPath'>

type LoggerLike = Readonly<{
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    event: string,
    context?: Record<string, unknown>,
  ): void
}>

export type DesktopCompositionRoot = ProviderIpcDependencies &
  DocumentIpcDependencies &
  DocumentAssetIpcDependencies &
  LessonIpcDependencies &
  LearningSettingsIpcDependencies &
  Readonly<{
    getApplicationInfo: GetApplicationInfo
    databasePath: string
    secretsDir: string
    dispose(): void
  }>

export const createCompositionRoot = async (
  app: AppLike,
  applicationVersion: string,
  logger: LoggerLike,
): Promise<DesktopCompositionRoot> => {
  const userData = app.getPath('userData')
  const databasePath = join(userData, 'deepstorming.sqlite3')
  const secretsDir = join(userData, 'secrets')

  const db: SqliteDatabase = openDatabase(databasePath)
  try {
    await migrateDatabase(db, { databasePath, userDataPath: userData })

    const repository = new SqliteProviderRepository(db)
    const documentRepository = new SqliteDocumentRepository(db)
    const documentImportRepository = new SqliteDocumentImportRepository(db)
    const lessonRepository = new SqliteLessonRepository(db)
    const learningSettingsRepository = new SqliteLearningSettingsRepository(db)
    const lessonExportJobRepository = new SqliteLessonExportJobRepository(db)
    const contextSnapshotRepository = new SqliteContextSnapshotRepository(db)
    const contextCompressionJobRepository = new SqliteContextCompressionJobRepository(db)
    const ids = { generate: randomUUID }
    const clock = { now: () => new Date().toISOString() }
    const vault = new EncryptedFileSecretVault(secretsDir, new ElectronSafeStorageCipher(), ids)
    const documentHasher = new Sha256DocumentTextHasher()
    const pdfFileStore = new LocalPdfFileStore(join(userData, 'document-files'))
    const pdfTextExtractor = new PdfParseTextExtractor()
    const documentAssetStore = new LocalDocumentAssetStore(join(userData, 'managed-assets'))
    const pdfFigureExtractor = new PdfFigureExtractor()
    const avatarStore = new LocalAvatarStore(join(userData, 'managed-assets'))

    await vault.reconcile(await repository.referencedSecretRefs())

    const cleanupReporter = new SecretCleanupReporter(logger)
    const operations = new ProviderTestOperations()
    const lessonOperations = new LessonRunOperations()
    const lessonExportOperations = new LessonExportOperations()
    const providerGatewayFactory = new ProviderGatewayFactory()
    const rebuildDocumentChunks = new RebuildDocumentChunks(
      documentRepository,
      documentImportRepository,
    )
    const extractDocumentFigures = new ExtractDocumentFigures(
      documentImportRepository,
      pdfFigureExtractor,
      documentAssetStore,
      clock,
      ids,
    )
    const assembleLessonContext = new AssembleLessonContext(
      documentRepository,
      documentImportRepository,
    )
    const lessonTutorReplyGenerator = new ProviderLessonTutorReplyGenerator(
      repository,
      vault,
      providerGatewayFactory,
      documentImportRepository,
    )
    const lessonMemoryGenerator = new ProviderLessonMemoryGenerator(
      repository,
      vault,
      providerGatewayFactory,
    )
    const contextCompressionGenerator = new ProviderContextCompressionGenerator(
      repository,
      vault,
      providerGatewayFactory,
    )
    const prepareLessonContextCompression = new PrepareLessonContextCompression(
      contextSnapshotRepository,
      contextCompressionJobRepository,
      contextCompressionGenerator,
      clock.now,
      ids.generate,
    )

    return {
      getApplicationInfo: new GetApplicationInfo(
        new ElectronAppInfoAdapter(app, applicationVersion),
      ),
      listDocuments: new ListDocuments(documentRepository),
      createDocumentFromText: new CreateDocumentFromText(
        documentRepository,
        documentHasher,
        clock,
        ids,
      ),
      getDocument: new GetDocument(documentRepository),
      searchDocuments: new SearchDocuments(documentRepository),
      deleteDocument: new DeleteDocument(documentRepository),
      importPdfDocument: new ImportPdfDocument(
        documentRepository,
        documentImportRepository,
        pdfFileStore,
        pdfTextExtractor,
        documentHasher,
        clock,
        ids,
        rebuildDocumentChunks,
        extractDocumentFigures,
      ),
      getDocumentPages: new GetDocumentPages(documentImportRepository),
      getDocumentPageBlocks: new GetDocumentPageBlocks(documentImportRepository),
      getDocumentFigureAsset: new GetDocumentFigureAsset(
        documentImportRepository,
        documentAssetStore,
      ),
      listLessonSessions: new ListLessonSessions(lessonRepository),
      startLessonFromDocument: new StartLessonFromDocument(
        documentRepository,
        lessonRepository,
        clock,
        ids,
        documentImportRepository,
        assembleLessonContext,
        lessonTutorReplyGenerator,
        learningSettingsRepository,
      ),
      getLessonSession: new GetLessonSession(lessonRepository),
      submitLessonReply: new SubmitLessonReply(
        lessonRepository,
        clock,
        ids,
        assembleLessonContext,
        lessonTutorReplyGenerator,
        lessonOperations,
        prepareLessonContextCompression,
        learningSettingsRepository,
      ),
      retryLessonRun: new RetryLessonRun(
        lessonRepository,
        clock,
        ids,
        assembleLessonContext,
        lessonTutorReplyGenerator,
        lessonOperations,
      ),
      cancelLessonRun: new CancelLessonRun(lessonOperations),
      recordReviewEvent: new RecordReviewEvent(lessonRepository, clock, ids),
      endLesson: new EndLesson(
        lessonRepository,
        lessonRepository,
        lessonMemoryGenerator,
        clock,
        lessonOperations,
      ),
      choosePostLessonAction: new ChoosePostLessonAction(lessonRepository, clock),
      completeLessonReview: new CompleteLessonReview(lessonRepository, clock),
      exportLessonTranscript: new ExportLessonTranscript(
        lessonRepository,
        documentImportRepository,
        documentAssetStore,
        lessonExportJobRepository,
        new ElectronLessonExportDestination(),
        new MarkdownLessonExporter(),
        new PdfLessonExporter(new ElectronHtmlToPdf()),
        clock.now,
        lessonExportOperations,
      ),
      cancelLessonExport: new CancelLessonExport(lessonExportOperations),
      listProviders: new ListProviders(repository),
      createProvider: new CreateProvider(repository, vault, clock, ids, cleanupReporter),
      updateProvider: new UpdateProvider(repository, vault, cleanupReporter, clock),
      deleteProvider: new DeleteProvider(repository, vault, cleanupReporter),
      activateProvider: new ActivateProvider(repository, clock),
      testProviderConnection: new TestProviderConnection(
        repository,
        vault,
        providerGatewayFactory,
        clock,
        operations,
      ),
      cancelProviderTest: new CancelProviderTest(operations),
      getLearningSettings: new GetLearningSettings(learningSettingsRepository, clock, ids),
      saveUserProfile: new SaveUserProfile(learningSettingsRepository, clock),
      createTutorProfile: new CreateTutorProfile(learningSettingsRepository, clock, ids),
      updateTutorProfile: new UpdateTutorProfile(learningSettingsRepository, clock),
      archiveTutorProfile: new ArchiveTutorProfile(learningSettingsRepository, clock),
      saveClassroomPreferences: new SaveClassroomPreferences(learningSettingsRepository),
      importAvatar: new ImportAvatar(avatarStore),
      databasePath,
      secretsDir,
      dispose: () => {
        db.close()
      },
    }
  } catch (error) {
    try {
      db.close()
    } catch (closeError) {
      logger.log('warn', 'database.close_failed', { code: 'DATABASE_UNAVAILABLE' })
      void closeError
    }
    throw error
  }
}
