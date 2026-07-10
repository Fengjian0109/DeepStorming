import Database from 'better-sqlite3'
import { ProviderUseCaseError } from '@deepstorming/application'

export type SqliteDatabase = Database.Database

export const databaseError = (
  code: 'DATABASE_UNAVAILABLE' | 'DATABASE_MIGRATION_FAILED',
): ProviderUseCaseError =>
  new ProviderUseCaseError(
    code,
    code === 'DATABASE_UNAVAILABLE'
      ? 'The local database is unavailable.'
      : 'The local database could not be upgraded.',
    true,
  )

export const openDatabase = (path: string): SqliteDatabase => {
  try {
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    return db
  } catch {
    throw databaseError('DATABASE_UNAVAILABLE')
  }
}
