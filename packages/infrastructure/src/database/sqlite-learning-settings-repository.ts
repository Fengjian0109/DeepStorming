import type {
  LearningSettingsRepositoryPort,
  LearningSettingsSnapshot,
  SettingsWriteResult,
} from '@deepstorming/application'
import {
  normalizeClassroomPreferences,
  normalizeTutorProfileDraft,
  normalizeUserProfileDraft,
  type ClassroomPreferences,
  type TutorProfile,
  type TutorProfileStatus,
  type UserProfile,
} from '@deepstorming/domain'

import { databaseError, type SqliteDatabase } from './database'

type Row = Record<string, unknown>

const stringValue = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('invalid stored settings')
  return value
}

const nullableString = (value: unknown): string | undefined => {
  if (value === null) return undefined
  return stringValue(value)
}

const positiveInteger = (value: unknown): number => {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error('invalid stored settings')
  return value as number
}

const stringArray = (value: unknown): readonly string[] => {
  const parsed: unknown = JSON.parse(stringValue(value))
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('invalid stored settings')
  }
  return parsed
}

const mapTutor = (row: Row): TutorProfile => {
  const status = stringValue(row['status'])
  if (!['active', 'archived'].includes(status)) throw new Error('invalid stored settings')
  const avatarAssetId = nullableString(row['avatar_asset_id'])
  const draft = normalizeTutorProfileDraft({
    name: stringValue(row['name']),
    ...(avatarAssetId === undefined ? {} : { avatarAssetId }),
    personality: stringValue(row['personality']),
    tone: stringValue(row['tone']),
    expertiseTags: stringArray(row['expertise_tags_json']),
    strictness: positiveInteger(row['strictness']),
    socraticIntensity: positiveInteger(row['socratic_intensity']),
    guidanceStyle: stringValue(row['guidance_style']) as TutorProfile['guidanceStyle'],
    bookStrategy: stringValue(row['book_strategy']),
    paperStrategy: stringValue(row['paper_strategy']),
    customInstructions: stringValue(row['custom_instructions']),
  })
  return {
    id: stringValue(row['id']),
    revision: positiveInteger(row['revision']),
    status: status as TutorProfileStatus,
    ...draft,
    promptVersion: stringValue(row['prompt_version']),
    createdAt: stringValue(row['created_at']),
    updatedAt: stringValue(row['updated_at']),
  }
}

const mapUserProfile = (row: Row): UserProfile => {
  const avatarAssetId = nullableString(row['avatar_asset_id'])
  const draft = normalizeUserProfileDraft({
    displayName: stringValue(row['display_name']),
    ...(avatarAssetId === undefined ? {} : { avatarAssetId }),
  })
  return {
    ...draft,
    revision: positiveInteger(row['revision']),
    updatedAt: stringValue(row['updated_at']),
  }
}

const mapPreferences = (row: Row): ClassroomPreferences =>
  normalizeClassroomPreferences({
    defaultBookTutorId: nullableString(row['default_book_tutor_id']) ?? null,
    defaultPaperTutorId: nullableString(row['default_paper_tutor_id']) ?? null,
    defaultPace: stringValue(row['default_pace']) as ClassroomPreferences['defaultPace'],
    sendShortcut: stringValue(row['send_shortcut']) as ClassroomPreferences['sendShortcut'],
    autoScroll: row['auto_scroll'] === 1,
    contextCompressionRemainingPercent: positiveInteger(
      row['context_compression_remaining_percent'],
    ),
    recentTurnCount: positiveInteger(row['recent_turn_count']),
  })

export class SqliteLearningSettingsRepository implements LearningSettingsRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}

  private safe<T>(operation: () => T): T {
    try {
      return operation()
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  private insertTutor(profile: TutorProfile): void {
    this.db
      .prepare(
        `INSERT INTO tutor_profiles (
          id,revision,status,name,avatar_asset_id,personality,tone,expertise_tags_json,
          strictness,socratic_intensity,guidance_style,book_strategy,paper_strategy,
          custom_instructions,prompt_version,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        profile.id,
        profile.revision,
        profile.status,
        profile.name,
        profile.avatarAssetId ?? null,
        profile.personality,
        profile.tone,
        JSON.stringify(profile.expertiseTags),
        profile.strictness,
        profile.socraticIntensity,
        profile.guidanceStyle,
        profile.bookStrategy,
        profile.paperStrategy,
        profile.customInstructions,
        profile.promptVersion,
        profile.createdAt,
        profile.updatedAt,
      )
    this.insertTutorRevision(profile)
  }

  private readSnapshot(): LearningSettingsSnapshot | undefined {
    const userRow = this.db.prepare('SELECT * FROM user_profile WHERE singleton_id=1').get() as
      Row | undefined
    if (userRow === undefined) return undefined
    const preferenceRow = this.db
      .prepare('SELECT * FROM classroom_preferences WHERE singleton_id=1')
      .get() as Row | undefined
    const tutorRows = this.db
      .prepare('SELECT * FROM tutor_profiles ORDER BY created_at,id')
      .all() as Row[]
    if (preferenceRow === undefined || tutorRows.length === 0) {
      throw new Error('incomplete stored settings')
    }
    return {
      userProfile: mapUserProfile(userRow),
      tutorProfiles: tutorRows.map(mapTutor),
      classroomPreferences: mapPreferences(preferenceRow),
    }
  }

  private insertTutorRevision(profile: TutorProfile): void {
    this.db
      .prepare(
        'INSERT INTO tutor_profile_revisions(tutor_id,revision,snapshot_json,created_at) VALUES (?,?,?,?)',
      )
      .run(profile.id, profile.revision, JSON.stringify(profile), profile.updatedAt)
  }

  private replacePreferences(preferences: ClassroomPreferences): void {
    this.db
      .prepare(
        `INSERT INTO classroom_preferences VALUES (1,?,?,?,?,?,?,?)
         ON CONFLICT(singleton_id) DO UPDATE SET
          default_book_tutor_id=excluded.default_book_tutor_id,
          default_paper_tutor_id=excluded.default_paper_tutor_id,
          default_pace=excluded.default_pace,
          send_shortcut=excluded.send_shortcut,
          auto_scroll=excluded.auto_scroll,
          context_compression_remaining_percent=excluded.context_compression_remaining_percent,
          recent_turn_count=excluded.recent_turn_count`,
      )
      .run(
        preferences.defaultBookTutorId,
        preferences.defaultPaperTutorId,
        preferences.defaultPace,
        preferences.sendShortcut,
        preferences.autoScroll ? 1 : 0,
        preferences.contextCompressionRemainingPercent,
        preferences.recentTurnCount,
      )
  }

  public async getSnapshot(): Promise<LearningSettingsSnapshot | undefined> {
    return this.safe(() => this.readSnapshot())
  }

  public async bootstrap(snapshot: LearningSettingsSnapshot): Promise<LearningSettingsSnapshot> {
    return this.safe(() =>
      this.db.transaction(() => {
        const existing = this.db.prepare('SELECT 1 FROM user_profile WHERE singleton_id=1').get()
        if (existing !== undefined) {
          const loaded = this.readSnapshot()
          if (loaded === undefined) throw new Error('invalid settings')
          return loaded
        }
        this.db
          .prepare('INSERT INTO user_profile VALUES (1,?,?,?,?)')
          .run(
            snapshot.userProfile.displayName,
            snapshot.userProfile.avatarAssetId ?? null,
            snapshot.userProfile.revision,
            snapshot.userProfile.updatedAt,
          )
        for (const profile of snapshot.tutorProfiles) this.insertTutor(profile)
        this.replacePreferences(snapshot.classroomPreferences)
        return snapshot
      })(),
    )
  }

  public async saveUserProfile(
    expectedRevision: number,
    profile: UserProfile,
  ): Promise<SettingsWriteResult<UserProfile>> {
    return this.safe(() => {
      const result = this.db
        .prepare(
          'UPDATE user_profile SET display_name=?,avatar_asset_id=?,revision=?,updated_at=? WHERE singleton_id=1 AND revision=?',
        )
        .run(
          profile.displayName,
          profile.avatarAssetId ?? null,
          profile.revision,
          profile.updatedAt,
          expectedRevision,
        )
      if (result.changes === 1) return { status: 'applied', value: profile }
      return this.db.prepare('SELECT 1 FROM user_profile WHERE singleton_id=1').get() === undefined
        ? { status: 'not_found' }
        : { status: 'stale' }
    })
  }

  public async createTutor(profile: TutorProfile): Promise<SettingsWriteResult<TutorProfile>> {
    return this.safe<SettingsWriteResult<TutorProfile>>(() => {
      this.db.transaction(() => this.insertTutor(profile))()
      return { status: 'applied', value: profile }
    })
  }

  public async updateTutor(
    expectedRevision: number,
    profile: TutorProfile,
  ): Promise<SettingsWriteResult<TutorProfile>> {
    return this.safe<SettingsWriteResult<TutorProfile>>(() =>
      this.db.transaction((): SettingsWriteResult<TutorProfile> => {
        const result = this.db
          .prepare(
            `UPDATE tutor_profiles SET
              revision=?,status=?,name=?,avatar_asset_id=?,personality=?,tone=?,expertise_tags_json=?,
              strictness=?,socratic_intensity=?,guidance_style=?,book_strategy=?,paper_strategy=?,
              custom_instructions=?,prompt_version=?,updated_at=?
             WHERE id=? AND revision=?`,
          )
          .run(
            profile.revision,
            profile.status,
            profile.name,
            profile.avatarAssetId ?? null,
            profile.personality,
            profile.tone,
            JSON.stringify(profile.expertiseTags),
            profile.strictness,
            profile.socraticIntensity,
            profile.guidanceStyle,
            profile.bookStrategy,
            profile.paperStrategy,
            profile.customInstructions,
            profile.promptVersion,
            profile.updatedAt,
            profile.id,
            expectedRevision,
          )
        if (result.changes === 1) {
          this.insertTutorRevision(profile)
          return { status: 'applied', value: profile }
        }
        return this.db.prepare('SELECT 1 FROM tutor_profiles WHERE id=?').get(profile.id) ===
          undefined
          ? { status: 'not_found' }
          : { status: 'stale' }
      })(),
    )
  }

  public async countActiveTutors(): Promise<number> {
    return this.safe(() => {
      const row = this.db
        .prepare("SELECT count(*) count FROM tutor_profiles WHERE status='active'")
        .get() as { count: number }
      return row.count
    })
  }

  public async saveClassroomPreferences(
    preferences: ClassroomPreferences,
  ): Promise<ClassroomPreferences> {
    return this.safe(() => {
      this.replacePreferences(preferences)
      return preferences
    })
  }
}
