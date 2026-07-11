import type {
  LessonRepositoryPort,
  StoredLessonSession,
  StoredLessonSourceAnchor,
} from '@deepstorming/application'
import { databaseError, type SqliteDatabase } from './database'

type LessonRow = {
  id: string
  title: string
  status: StoredLessonSession['status']
  document_id: string
  document_title: string
  created_at: string
  updated_at: string
}

type AnchorRow = {
  id: string
  lesson_id: string
  document_id: string
  start_offset: number
  end_offset: number
  snippet: string
}

const mapAnchor = (row: AnchorRow): StoredLessonSourceAnchor => ({
  id: row.id,
  documentId: row.document_id,
  startOffset: row.start_offset,
  endOffset: row.end_offset,
  snippet: row.snippet,
})

const mapSession = (
  row: LessonRow,
  sourceAnchors: readonly StoredLessonSourceAnchor[],
): StoredLessonSession => ({
  id: row.id,
  title: row.title,
  status: row.status,
  documentId: row.document_id,
  documentTitle: row.document_title,
  sourceAnchors,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export class SqliteLessonRepository implements LessonRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}

  private safe<T>(fn: () => T): T {
    try {
      return fn()
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  private anchorsFor(lessonIds: readonly string[]): Map<string, StoredLessonSourceAnchor[]> {
    const anchors = new Map<string, StoredLessonSourceAnchor[]>()
    if (lessonIds.length === 0) return anchors
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_source_anchors
         WHERE lesson_id IN (${placeholders})
         ORDER BY start_offset,id`,
      )
      .all(...lessonIds) as AnchorRow[]
    for (const row of rows) {
      const existing = anchors.get(row.lesson_id) ?? []
      existing.push(mapAnchor(row))
      anchors.set(row.lesson_id, existing)
    }
    return anchors
  }

  public async list(): Promise<readonly StoredLessonSession[]> {
    return this.safe(() => {
      const rows = this.db
        .prepare('SELECT * FROM lesson_sessions ORDER BY created_at DESC,id DESC')
        .all() as LessonRow[]
      const anchors = this.anchorsFor(rows.map((row) => row.id))
      return rows.map((row) => mapSession(row, anchors.get(row.id) ?? []))
    })
  }

  public async findById(id: string): Promise<StoredLessonSession | undefined> {
    return this.safe(() => {
      const row = this.db.prepare('SELECT * FROM lesson_sessions WHERE id=?').get(id) as
        LessonRow | undefined
      if (row === undefined) return undefined
      const anchors = this.anchorsFor([id])
      return mapSession(row, anchors.get(id) ?? [])
    })
  }

  public async create(session: StoredLessonSession): Promise<StoredLessonSession> {
    return this.safe(() =>
      this.db.transaction(() => {
        this.db
          .prepare('INSERT INTO lesson_sessions VALUES (?,?,?,?,?,?,?)')
          .run(
            session.id,
            session.title,
            session.status,
            session.documentId,
            session.documentTitle,
            session.createdAt,
            session.updatedAt,
          )
        const insertAnchor = this.db.prepare(
          'INSERT INTO lesson_source_anchors VALUES (?,?,?,?,?,?)',
        )
        for (const anchor of session.sourceAnchors) {
          insertAnchor.run(
            anchor.id,
            session.id,
            anchor.documentId,
            anchor.startOffset,
            anchor.endOffset,
            anchor.snippet,
          )
        }
        return session
      })(),
    )
  }
}
