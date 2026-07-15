import type {
  ContextCompressionJob,
  ContextCompressionJobRepositoryPort,
} from '@deepstorming/application'
import { databaseError, type SqliteDatabase } from './database'

type Row = {
  operation_id: string
  lesson_id: string
  status: ContextCompressionJob['status']
  snapshot_id: string | null
  error_code: string | null
  started_at: string
  finished_at: string | null
}
const map = (row: Row): ContextCompressionJob => ({
  operationId: row.operation_id,
  lessonId: row.lesson_id,
  status: row.status,
  snapshotId: row.snapshot_id,
  errorCode: row.error_code,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
})
export class SqliteContextCompressionJobRepository implements ContextCompressionJobRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}
  async find(operationId: string) {
    try {
      const row = this.db
        .prepare('SELECT * FROM context_compression_jobs WHERE operation_id=?')
        .get(operationId) as Row | undefined
      return row === undefined ? undefined : map(row)
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
  async create(job: ContextCompressionJob) {
    try {
      const result = this.db
        .prepare(
          `INSERT OR IGNORE INTO context_compression_jobs(operation_id,lesson_id,status,snapshot_id,error_code,started_at,finished_at) VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          job.operationId,
          job.lessonId,
          job.status,
          job.snapshotId,
          job.errorCode,
          job.startedAt,
          job.finishedAt,
        )
      return result.changes === 1 ? ('created' as const) : ('exists' as const)
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
  async save(job: ContextCompressionJob) {
    try {
      const result = this.db
        .prepare(
          `UPDATE context_compression_jobs SET status=?,snapshot_id=?,error_code=?,started_at=?,finished_at=? WHERE operation_id=? AND lesson_id=?`,
        )
        .run(
          job.status,
          job.snapshotId,
          job.errorCode,
          job.startedAt,
          job.finishedAt,
          job.operationId,
          job.lessonId,
        )
      if (result.changes !== 1) throw new Error('missing context job')
      return job
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
}
