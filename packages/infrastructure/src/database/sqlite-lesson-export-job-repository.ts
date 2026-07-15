import type { LessonExportJob, LessonExportJobRepositoryPort } from '@deepstorming/application'
import { databaseError, type SqliteDatabase } from './database'

type Row = {
  operation_id: string
  lesson_id: string
  format: LessonExportJob['format']
  target_path: string
  status: LessonExportJob['status']
  error_code: string | null
  started_at: string
  finished_at: string | null
}
const map = (row: Row): LessonExportJob => ({
  operationId: row.operation_id,
  lessonId: row.lesson_id,
  format: row.format,
  targetPath: row.target_path,
  status: row.status,
  errorCode: row.error_code,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
})

export class SqliteLessonExportJobRepository implements LessonExportJobRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}
  async find(operationId: string): Promise<LessonExportJob | undefined> {
    try {
      const row = this.db
        .prepare('SELECT * FROM lesson_export_jobs WHERE operation_id = ?')
        .get(operationId) as Row | undefined
      return row === undefined ? undefined : map(row)
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
  async create(job: LessonExportJob): Promise<'created' | 'exists'> {
    try {
      const result = this.db
        .prepare(
          `INSERT OR IGNORE INTO lesson_export_jobs
        (operation_id,lesson_id,format,target_path,status,error_code,started_at,finished_at)
        VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(
          job.operationId,
          job.lessonId,
          job.format,
          job.targetPath,
          job.status,
          job.errorCode,
          job.startedAt,
          job.finishedAt,
        )
      return result.changes === 1 ? 'created' : 'exists'
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
  async save(job: LessonExportJob): Promise<LessonExportJob> {
    try {
      const result = this.db
        .prepare(
          `UPDATE lesson_export_jobs SET target_path=?,status=?,error_code=?,started_at=?,finished_at=?
        WHERE operation_id=? AND lesson_id=? AND format=?`,
        )
        .run(
          job.targetPath,
          job.status,
          job.errorCode,
          job.startedAt,
          job.finishedAt,
          job.operationId,
          job.lessonId,
          job.format,
        )
      if (result.changes !== 1) throw new Error('missing export job')
      return job
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
}
