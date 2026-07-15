import type { GetApplicationInfo } from '@deepstorming/application'
import {
  APP_CHANNELS,
  DOCUMENT_CHANNELS,
  LESSON_CHANNELS,
  LEARNING_SETTINGS_CHANNELS,
  PROVIDER_CHANNELS,
} from '@deepstorming/contracts'
import { ipcMain } from 'electron'

import { createAppInfoHandler } from './app-info-handler'
import {
  createDocumentAssetIpcHandlers,
  type DocumentAssetIpcDependencies,
} from './document-asset-handlers'
import { createDocumentIpcHandlers, type DocumentIpcDependencies } from './document-handlers'
import { createLessonIpcHandlers, type LessonIpcDependencies } from './lesson-handlers'
import {
  createLearningSettingsIpcHandlers,
  type LearningSettingsIpcDependencies,
} from './learning-settings-handlers'
import { createProviderIpcHandlers, type ProviderIpcDependencies } from './provider-handlers'

export const registerIpc = (
  dependencies: { getApplicationInfo: GetApplicationInfo } & ProviderIpcDependencies &
    DocumentIpcDependencies &
    DocumentAssetIpcDependencies &
    LessonIpcDependencies &
    LearningSettingsIpcDependencies,
): void => {
  ipcMain.removeHandler(APP_CHANNELS.getInfo)
  for (const channel of Object.values(DOCUMENT_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }
  for (const channel of Object.values(PROVIDER_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }
  for (const channel of Object.values(LESSON_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }
  for (const channel of Object.values(LEARNING_SETTINGS_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }

  const handleAppInfo = createAppInfoHandler(dependencies.getApplicationInfo)
  const documentHandlers = createDocumentIpcHandlers(dependencies)
  const documentAssetHandlers = createDocumentAssetIpcHandlers(dependencies)
  const lessonHandlers = createLessonIpcHandlers(dependencies)
  const providerHandlers = createProviderIpcHandlers(dependencies)
  const learningSettingsHandlers = createLearningSettingsIpcHandlers(dependencies)

  ipcMain.handle(APP_CHANNELS.getInfo, (_event, input: unknown) => handleAppInfo(input))
  ipcMain.handle(DOCUMENT_CHANNELS.list, (_event, input: unknown) => documentHandlers.list(input))
  ipcMain.handle(DOCUMENT_CHANNELS.createFromText, (_event, input: unknown) =>
    documentHandlers.createFromText(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.get, (_event, input: unknown) => documentHandlers.get(input))
  ipcMain.handle(DOCUMENT_CHANNELS.search, (_event, input: unknown) =>
    documentHandlers.search(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.remove, (_event, input: unknown) =>
    documentHandlers.remove(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.importPdf, (_event, input: unknown) =>
    documentHandlers.importPdf(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.getPages, (_event, input: unknown) =>
    documentHandlers.getPages(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.getPageBlocks, (_event, input: unknown) =>
    documentHandlers.getPageBlocks(input),
  )
  ipcMain.handle(DOCUMENT_CHANNELS.getFigureAsset, (_event, input: unknown) =>
    documentAssetHandlers.getFigureAsset(input),
  )
  ipcMain.handle(LESSON_CHANNELS.list, (_event, input: unknown) => lessonHandlers.list(input))
  ipcMain.handle(LESSON_CHANNELS.startFromDocument, (_event, input: unknown) =>
    lessonHandlers.startFromDocument(input),
  )
  ipcMain.handle(LESSON_CHANNELS.get, (_event, input: unknown) => lessonHandlers.get(input))
  ipcMain.handle(LESSON_CHANNELS.reply, (_event, input: unknown) => lessonHandlers.reply(input))
  ipcMain.handle(LESSON_CHANNELS.retryRun, (_event, input: unknown) =>
    lessonHandlers.retryRun(input),
  )
  ipcMain.handle(LESSON_CHANNELS.cancelRun, (_event, input: unknown) =>
    lessonHandlers.cancelRun(input),
  )
  ipcMain.handle(LESSON_CHANNELS.recordReview, (_event, input: unknown) =>
    lessonHandlers.recordReview(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.list, (_event, input: unknown) => providerHandlers.list(input))
  ipcMain.handle(PROVIDER_CHANNELS.create, (_event, input: unknown) =>
    providerHandlers.create(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.update, (_event, input: unknown) =>
    providerHandlers.update(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.remove, (_event, input: unknown) =>
    providerHandlers.remove(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.activate, (_event, input: unknown) =>
    providerHandlers.activate(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.testConnection, (_event, input: unknown) =>
    providerHandlers.testConnection(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.cancelTest, (_event, input: unknown) =>
    providerHandlers.cancelTest(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.get, (_event, input: unknown) =>
    learningSettingsHandlers.get(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.saveUserProfile, (_event, input: unknown) =>
    learningSettingsHandlers.saveUser(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.createTutor, (_event, input: unknown) =>
    learningSettingsHandlers.createTutor(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.updateTutor, (_event, input: unknown) =>
    learningSettingsHandlers.updateTutor(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.archiveTutor, (_event, input: unknown) =>
    learningSettingsHandlers.archiveTutor(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.saveClassroomPreferences, (_event, input: unknown) =>
    learningSettingsHandlers.savePreferences(input),
  )
  ipcMain.handle(LEARNING_SETTINGS_CHANNELS.importAvatar, (_event, input: unknown) =>
    learningSettingsHandlers.importAvatar(input),
  )
}
