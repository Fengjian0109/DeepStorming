import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import {
  ActivateProvider,
  CancelProviderTest,
  CreateProvider,
  DeleteProvider,
  GetApplicationInfo,
  ListProviders,
  ProviderTestOperations,
  TestProviderConnection,
  UpdateProvider,
} from '@deepstorming/application'
import {
  EncryptedFileSecretVault,
  ProviderGatewayFactory,
  SecretCleanupReporter,
  SqliteProviderRepository,
  migrateDatabase,
  openDatabase,
  type SqliteDatabase,
} from '@deepstorming/infrastructure'
import type { App } from 'electron'

import { ElectronAppInfoAdapter } from './app-info-adapter'
import type { ProviderIpcDependencies } from './ipc/provider-handlers'
import { ElectronSafeStorageCipher } from './secrets/electron-safe-storage-cipher'

type AppLike = Pick<App, 'getName' | 'getPath'>

type LoggerLike = Readonly<{
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    event: string,
    context?: Record<string, unknown>,
  ): void
}>

export type DesktopCompositionRoot = ProviderIpcDependencies &
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
    const ids = { generate: randomUUID }
    const clock = { now: () => new Date().toISOString() }
    const vault = new EncryptedFileSecretVault(secretsDir, new ElectronSafeStorageCipher(), ids)

    await vault.reconcile(await repository.referencedSecretRefs())

    const cleanupReporter = new SecretCleanupReporter(logger)
    const operations = new ProviderTestOperations()

    return {
      getApplicationInfo: new GetApplicationInfo(
        new ElectronAppInfoAdapter(app, applicationVersion),
      ),
      listProviders: new ListProviders(repository),
      createProvider: new CreateProvider(repository, vault, clock, ids, cleanupReporter),
      updateProvider: new UpdateProvider(repository, vault, cleanupReporter, clock),
      deleteProvider: new DeleteProvider(repository, vault, cleanupReporter),
      activateProvider: new ActivateProvider(repository, clock),
      testProviderConnection: new TestProviderConnection(
        repository,
        vault,
        new ProviderGatewayFactory(),
        clock,
        operations,
      ),
      cancelProviderTest: new CancelProviderTest(operations),
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
