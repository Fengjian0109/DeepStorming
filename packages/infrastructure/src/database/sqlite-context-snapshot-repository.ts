import type { ContextSnapshotRepositoryPort } from '@deepstorming/application'
import { normalizeContextSnapshot, type ContextSnapshot } from '@deepstorming/domain'
import { databaseError, type SqliteDatabase } from './database'

type Row = { snapshot_json: string }
const parse = (row: Row): ContextSnapshot =>
  normalizeContextSnapshot(JSON.parse(row.snapshot_json) as ContextSnapshot)

export class SqliteContextSnapshotRepository implements ContextSnapshotRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}

  async create(value: ContextSnapshot): Promise<'created' | 'exists'> {
    const snapshot = normalizeContextSnapshot(value)
    try {
      const result = this.db
        .prepare(
          `INSERT OR IGNORE INTO context_snapshots
        (id,lesson_id,version,model_name,context_window_tokens,estimated_input_tokens,reserved_output_tokens,remaining_tokens,remaining_percent,threshold_percent,snapshot_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          snapshot.id,
          snapshot.lessonId,
          snapshot.version,
          snapshot.modelName,
          snapshot.contextWindowTokens,
          snapshot.estimatedInputTokens,
          snapshot.reservedOutputTokens,
          snapshot.remainingTokens,
          snapshot.remainingPercent,
          snapshot.thresholdPercent,
          JSON.stringify(snapshot),
          snapshot.createdAt,
        )
      return result.changes === 1 ? 'created' : 'exists'
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  async listForLesson(lessonId: string): Promise<readonly ContextSnapshot[]> {
    try {
      return (
        this.db
          .prepare('SELECT snapshot_json FROM context_snapshots WHERE lesson_id=? ORDER BY version')
          .all(lessonId) as Row[]
      ).map(parse)
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  async findActive(lessonId: string): Promise<ContextSnapshot | undefined> {
    try {
      const row = this.db
        .prepare(
          `SELECT c.snapshot_json FROM lesson_sessions l
        JOIN context_snapshots c ON c.id=l.active_context_snapshot_id
        WHERE l.id=? AND c.lesson_id=l.id`,
        )
        .get(lessonId) as Row | undefined
      return row === undefined ? undefined : parse(row)
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  async activate(lessonId: string, snapshotId: string): Promise<'activated' | 'not_found'> {
    try {
      const result = this.db
        .prepare(
          `UPDATE lesson_sessions SET active_context_snapshot_id=?
        WHERE id=? AND EXISTS (SELECT 1 FROM context_snapshots WHERE id=? AND lesson_id=?)`,
        )
        .run(snapshotId, lessonId, snapshotId, lessonId)
      return result.changes === 1 ? 'activated' : 'not_found'
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
}
