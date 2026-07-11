import type {
  StoredLessonMessage,
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

type MessageRow = {
  id: string
  lesson_id: string
  role: StoredLessonMessage['role']
  content: string
  source_anchor_ids_json: string
  prompt_version: string
  message_index: number
  created_at: string
}

const mapAnchor = (row: AnchorRow): StoredLessonSourceAnchor => ({
  id: row.id,
  documentId: row.document_id,
  startOffset: row.start_offset,
  endOffset: row.end_offset,
  snippet: row.snippet,
})

const parseSourceAnchorIds = (value: string): readonly string[] => {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('invalid source anchor ids')
  }
  return parsed
}

const mapMessage = (row: MessageRow): StoredLessonMessage => ({
  id: row.id,
  lessonId: row.lesson_id,
  role: row.role,
  content: row.content,
  sourceAnchorIds: parseSourceAnchorIds(row.source_anchor_ids_json),
  promptVersion: row.prompt_version,
  createdAt: row.created_at,
})

const mapSession = (
  row: LessonRow,
  sourceAnchors: readonly StoredLessonSourceAnchor[],
  messages: readonly StoredLessonMessage[],
): StoredLessonSession => ({
  id: row.id,
  title: row.title,
  status: row.status,
  documentId: row.document_id,
  documentTitle: row.document_title,
  sourceAnchors,
  messages,
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

  private messagesFor(lessonIds: readonly string[]): Map<string, StoredLessonMessage[]> {
    const messages = new Map<string, StoredLessonMessage[]>()
    if (lessonIds.length === 0) return messages
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_messages
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,message_index,id`,
      )
      .all(...lessonIds) as MessageRow[]
    for (const row of rows) {
      const existing = messages.get(row.lesson_id) ?? []
      existing.push(mapMessage(row))
      messages.set(row.lesson_id, existing)
    }
    return messages
  }

  public async list(): Promise<readonly StoredLessonSession[]> {
    return this.safe(() => {
      const rows = this.db
        .prepare('SELECT * FROM lesson_sessions ORDER BY created_at DESC,id DESC')
        .all() as LessonRow[]
      const lessonIds = rows.map((row) => row.id)
      const anchors = this.anchorsFor(lessonIds)
      const messages = this.messagesFor(lessonIds)
      return rows.map((row) =>
        mapSession(row, anchors.get(row.id) ?? [], messages.get(row.id) ?? []),
      )
    })
  }

  public async findById(id: string): Promise<StoredLessonSession | undefined> {
    return this.safe(() => {
      const row = this.db.prepare('SELECT * FROM lesson_sessions WHERE id=?').get(id) as
        LessonRow | undefined
      if (row === undefined) return undefined
      const anchors = this.anchorsFor([id])
      const messages = this.messagesFor([id])
      return mapSession(row, anchors.get(id) ?? [], messages.get(id) ?? [])
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
        const insertMessage = this.db.prepare(
          'INSERT INTO lesson_messages VALUES (?,?,?,?,?,?,?,?)',
        )
        session.messages.forEach((message, index) => {
          insertMessage.run(
            message.id,
            session.id,
            message.role,
            message.content,
            JSON.stringify(message.sourceAnchorIds),
            message.promptVersion,
            index,
            message.createdAt,
          )
        })
        return session
      })(),
    )
  }
}
