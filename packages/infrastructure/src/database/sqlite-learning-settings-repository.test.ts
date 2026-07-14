import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LearningSettingsSnapshot } from '@deepstorming/application'

import { openDatabase, type SqliteDatabase } from './database'
import { migrateDatabase } from './migrations'
import { SqliteLearningSettingsRepository } from './sqlite-learning-settings-repository'

const now = '2026-07-14T00:00:00.000Z'
const tutor = {
  id: '0142b3c4-d5e6-4789-8abc-def012345678',
  revision: 1,
  status: 'active' as const,
  name: '苏格拉底导师',
  personality: '耐心',
  tone: '清晰',
  expertiseTags: ['通识'],
  strictness: 3,
  socraticIntensity: 4,
  guidanceStyle: 'question_first' as const,
  bookStrategy: '逐步提示',
  paperStrategy: '检查证据',
  customInstructions: '',
  promptVersion: 'tutor-profile-v1',
  createdAt: now,
  updatedAt: now,
}
const snapshot: LearningSettingsSnapshot = {
  userProfile: { displayName: '学习者', revision: 1, updatedAt: now },
  tutorProfiles: [tutor],
  classroomPreferences: {
    defaultBookTutorId: tutor.id,
    defaultPaperTutorId: tutor.id,
    defaultPace: 'standard',
    sendShortcut: 'enter',
    autoScroll: true,
    contextCompressionRemainingPercent: 30,
    recentTurnCount: 8,
  },
}

describe('SqliteLearningSettingsRepository', () => {
  let directory: string
  let db: SqliteDatabase
  let repository: SqliteLearningSettingsRepository

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'deepstorming-settings-'))
    const databasePath = join(directory, 'app.db')
    db = openDatabase(databasePath)
    await migrateDatabase(db, { databasePath, userDataPath: directory })
    repository = new SqliteLearningSettingsRepository(db)
  })

  afterEach(() => {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('bootstraps all settings atomically and restores them', async () => {
    expect(await repository.getSnapshot()).toBeUndefined()
    await repository.bootstrap(snapshot)

    await expect(repository.getSnapshot()).resolves.toEqual(snapshot)
    expect(db.prepare('SELECT count(*) count FROM tutor_profile_revisions').get()).toEqual({
      count: 1,
    })
  })

  it('returns the persisted snapshot when bootstrap is replayed', async () => {
    await repository.bootstrap(snapshot)
    const replay = await repository.bootstrap({
      ...snapshot,
      userProfile: { ...snapshot.userProfile, displayName: '不应覆盖' },
    })

    expect(replay.userProfile.displayName).toBe('学习者')
    await expect(repository.getSnapshot()).resolves.toEqual(snapshot)
  })

  it('uses revision CAS for user and tutor updates while retaining history', async () => {
    await repository.bootstrap(snapshot)

    await expect(
      repository.saveUserProfile(0, { displayName: '错误写入', revision: 2, updatedAt: now }),
    ).resolves.toEqual({ status: 'stale' })
    await expect(
      repository.saveUserProfile(1, { displayName: '何同学', revision: 2, updatedAt: now }),
    ).resolves.toMatchObject({ status: 'applied', value: { displayName: '何同学' } })

    const updated = { ...tutor, revision: 2, name: '林老师', promptVersion: 'tutor-profile-v2' }
    await expect(repository.updateTutor(0, updated)).resolves.toEqual({ status: 'stale' })
    await expect(repository.updateTutor(1, updated)).resolves.toEqual({
      status: 'applied',
      value: updated,
    })
    expect(db.prepare('SELECT count(*) count FROM tutor_profile_revisions').get()).toEqual({
      count: 2,
    })
  })

  it('persists classroom preferences and counts active tutors', async () => {
    await repository.bootstrap(snapshot)
    await expect(repository.countActiveTutors()).resolves.toBe(1)

    const preferences = { ...snapshot.classroomPreferences, defaultPace: 'fast' as const }
    await expect(repository.saveClassroomPreferences(preferences)).resolves.toEqual(preferences)
    await expect(repository.getSnapshot()).resolves.toMatchObject({
      classroomPreferences: { defaultPace: 'fast' },
    })
  })
})
