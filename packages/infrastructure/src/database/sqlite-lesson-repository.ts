import type {
  StoredLessonMessage,
  StoredLessonModelRun,
  StoredLessonStep,
  LessonRepositoryPort,
  StoredLessonSession,
  StoredLessonSourceAnchor,
} from '@deepstorming/application'
import type { LessonSourceTarget } from '@deepstorming/domain'
import { databaseError, type SqliteDatabase } from './database'

type LessonRow = {
  id: string
  title: string
  status: StoredLessonSession['status']
  current_state: StoredLessonSession['currentState']
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
  target_json: string | null
}

type MessageRow = {
  id: string
  lesson_id: string
  role: StoredLessonMessage['role']
  content: string
  source_anchor_ids_json: string
  model_run_id: string | null
  prompt_version: string
  message_index: number
  created_at: string
}

type ModelRunRow = {
  id: string
  lesson_id: string
  provider_id: string | null
  model_name: string
  operation: StoredLessonModelRun['operation']
  status: StoredLessonModelRun['status']
  prompt_manifest_json: string
  input_summary_json: string
  source_anchor_ids_json: string
  output_message_id: string | null
  error_summary_json: string | null
  started_at: string
  finished_at: string | null
}

type StepRow = {
  id: string
  lesson_id: string
  sequence_no: number
  state_before: StoredLessonStep['stateBefore']
  state_after: StoredLessonStep['stateAfter']
  action_type: StoredLessonStep['actionType']
  status: StoredLessonStep['status']
  model_run_id: string
  message_id: string | null
  rationale: string | null
  error_summary_json: string | null
  created_at: string
  finished_at: string | null
}

const mapAnchor = (row: AnchorRow): StoredLessonSourceAnchor => ({
  id: row.id,
  documentId: row.document_id,
  startOffset: row.start_offset,
  endOffset: row.end_offset,
  snippet: row.snippet,
  ...(row.target_json === null
    ? {}
    : { target: parseJsonObject<LessonSourceTarget>(row.target_json) }),
})

const parseSourceAnchorIds = (value: string): readonly string[] => {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('invalid source anchor ids')
  }
  return parsed
}

const parseJsonObject = <T>(value: string): T => {
  const parsed = JSON.parse(value) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('invalid json object')
  }
  return parsed as T
}

const mapMessage = (row: MessageRow): StoredLessonMessage => ({
  id: row.id,
  lessonId: row.lesson_id,
  modelRunId: row.model_run_id,
  role: row.role,
  content: row.content,
  sourceAnchorIds: parseSourceAnchorIds(row.source_anchor_ids_json),
  promptVersion: row.prompt_version,
  createdAt: row.created_at,
})

const mapModelRun = (row: ModelRunRow): StoredLessonModelRun => ({
  id: row.id,
  lessonId: row.lesson_id,
  providerId: row.provider_id,
  modelName: row.model_name,
  operation: row.operation,
  status: row.status,
  promptManifest: parseJsonObject(row.prompt_manifest_json),
  inputSummary: parseJsonObject(row.input_summary_json),
  sourceAnchorIds: parseSourceAnchorIds(row.source_anchor_ids_json),
  outputMessageId: row.output_message_id,
  errorSummary: row.error_summary_json === null ? null : parseJsonObject(row.error_summary_json),
  startedAt: row.started_at,
  finishedAt: row.finished_at,
})

const mapStep = (row: StepRow): StoredLessonStep => ({
  id: row.id,
  lessonId: row.lesson_id,
  sequenceNo: row.sequence_no,
  stateBefore: row.state_before,
  stateAfter: row.state_after,
  actionType: row.action_type,
  status: row.status,
  modelRunId: row.model_run_id,
  messageId: row.message_id,
  rationale: row.rationale,
  errorSummary: row.error_summary_json === null ? null : parseJsonObject(row.error_summary_json),
  createdAt: row.created_at,
  finishedAt: row.finished_at,
})

const mapSession = (
  row: LessonRow,
  sourceAnchors: readonly StoredLessonSourceAnchor[],
  messages: readonly StoredLessonMessage[],
  modelRuns: readonly StoredLessonModelRun[],
  steps: readonly StoredLessonStep[],
): StoredLessonSession => ({
  id: row.id,
  title: row.title,
  status: row.status,
  currentState: row.current_state,
  documentId: row.document_id,
  documentTitle: row.document_title,
  sourceAnchors,
  messages,
  modelRuns,
  steps,
  masteryEvidence: [],
  misconceptionSignals: [],
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

  private modelRunsFor(lessonIds: readonly string[]): Map<string, StoredLessonModelRun[]> {
    const modelRuns = new Map<string, StoredLessonModelRun[]>()
    if (lessonIds.length === 0) return modelRuns
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_model_runs
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,started_at,id`,
      )
      .all(...lessonIds) as ModelRunRow[]
    for (const row of rows) {
      const existing = modelRuns.get(row.lesson_id) ?? []
      existing.push(mapModelRun(row))
      modelRuns.set(row.lesson_id, existing)
    }
    return modelRuns
  }

  private stepsFor(lessonIds: readonly string[]): Map<string, StoredLessonStep[]> {
    const steps = new Map<string, StoredLessonStep[]>()
    if (lessonIds.length === 0) return steps
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_steps
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,sequence_no,id`,
      )
      .all(...lessonIds) as StepRow[]
    for (const row of rows) {
      const existing = steps.get(row.lesson_id) ?? []
      existing.push(mapStep(row))
      steps.set(row.lesson_id, existing)
    }
    return steps
  }

  public async list(): Promise<readonly StoredLessonSession[]> {
    return this.safe(() => {
      const rows = this.db
        .prepare('SELECT * FROM lesson_sessions ORDER BY created_at DESC,id DESC')
        .all() as LessonRow[]
      const lessonIds = rows.map((row) => row.id)
      const anchors = this.anchorsFor(lessonIds)
      const messages = this.messagesFor(lessonIds)
      const modelRuns = this.modelRunsFor(lessonIds)
      const steps = this.stepsFor(lessonIds)
      return rows.map((row) =>
        mapSession(
          row,
          anchors.get(row.id) ?? [],
          messages.get(row.id) ?? [],
          modelRuns.get(row.id) ?? [],
          steps.get(row.id) ?? [],
        ),
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
      const modelRuns = this.modelRunsFor([id])
      const steps = this.stepsFor([id])
      return mapSession(
        row,
        anchors.get(id) ?? [],
        messages.get(id) ?? [],
        modelRuns.get(id) ?? [],
        steps.get(id) ?? [],
      )
    })
  }

  public async create(session: StoredLessonSession): Promise<StoredLessonSession> {
    return this.safe(() =>
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO lesson_sessions
             (id,title,status,document_id,document_title,created_at,updated_at,current_state)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            session.id,
            session.title,
            session.status,
            session.documentId,
            session.documentTitle,
            session.createdAt,
            session.updatedAt,
            session.currentState,
          )
        const insertAnchor = this.db.prepare(
          `INSERT INTO lesson_source_anchors
           (id,lesson_id,document_id,start_offset,end_offset,snippet,target_json)
           VALUES (?,?,?,?,?,?,?)`,
        )
        for (const anchor of session.sourceAnchors) {
          insertAnchor.run(
            anchor.id,
            session.id,
            anchor.documentId,
            anchor.startOffset,
            anchor.endOffset,
            anchor.snippet,
            anchor.target === undefined ? null : JSON.stringify(anchor.target),
          )
        }
        const insertMessage = this.db.prepare(
          'INSERT INTO lesson_messages VALUES (?,?,?,?,?,?,?,?,?)',
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
            message.modelRunId,
          )
        })
        const insertModelRun = this.db.prepare(
          `INSERT INTO lesson_model_runs
           (id,lesson_id,provider_id,model_name,operation,status,prompt_manifest_json,input_summary_json,source_anchor_ids_json,output_message_id,started_at,finished_at,error_summary_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        for (const modelRun of session.modelRuns) {
          insertModelRun.run(
            modelRun.id,
            session.id,
            modelRun.providerId,
            modelRun.modelName,
            modelRun.operation,
            modelRun.status,
            JSON.stringify(modelRun.promptManifest),
            JSON.stringify(modelRun.inputSummary),
            JSON.stringify(modelRun.sourceAnchorIds),
            modelRun.outputMessageId,
            modelRun.startedAt,
            modelRun.finishedAt,
            modelRun.errorSummary === null ? null : JSON.stringify(modelRun.errorSummary),
          )
        }
        const insertStep = this.db.prepare(
          `INSERT INTO lesson_steps
           (id,lesson_id,sequence_no,state_before,state_after,action_type,status,model_run_id,message_id,rationale,error_summary_json,created_at,finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        for (const step of session.steps) {
          insertStep.run(
            step.id,
            session.id,
            step.sequenceNo,
            step.stateBefore,
            step.stateAfter,
            step.actionType,
            step.status,
            step.modelRunId,
            step.messageId,
            step.rationale,
            step.errorSummary === null ? null : JSON.stringify(step.errorSummary),
            step.createdAt,
            step.finishedAt,
          )
        }
        return session
      })(),
    )
  }

  public async save(session: StoredLessonSession): Promise<StoredLessonSession> {
    return this.safe(() =>
      this.db.transaction(() => {
        this.db
          .prepare(
            'UPDATE lesson_sessions SET title=?,status=?,current_state=?,updated_at=? WHERE id=?',
          )
          .run(session.title, session.status, session.currentState, session.updatedAt, session.id)
        this.db.prepare('DELETE FROM lesson_steps WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_model_runs WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_messages WHERE lesson_id=?').run(session.id)

        const insertMessage = this.db.prepare(
          'INSERT INTO lesson_messages VALUES (?,?,?,?,?,?,?,?,?)',
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
            message.modelRunId,
          )
        })

        const insertModelRun = this.db.prepare(
          `INSERT INTO lesson_model_runs
           (id,lesson_id,provider_id,model_name,operation,status,prompt_manifest_json,input_summary_json,source_anchor_ids_json,output_message_id,started_at,finished_at,error_summary_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        for (const modelRun of session.modelRuns) {
          insertModelRun.run(
            modelRun.id,
            session.id,
            modelRun.providerId,
            modelRun.modelName,
            modelRun.operation,
            modelRun.status,
            JSON.stringify(modelRun.promptManifest),
            JSON.stringify(modelRun.inputSummary),
            JSON.stringify(modelRun.sourceAnchorIds),
            modelRun.outputMessageId,
            modelRun.startedAt,
            modelRun.finishedAt,
            modelRun.errorSummary === null ? null : JSON.stringify(modelRun.errorSummary),
          )
        }

        const insertStep = this.db.prepare(
          `INSERT INTO lesson_steps
           (id,lesson_id,sequence_no,state_before,state_after,action_type,status,model_run_id,message_id,rationale,error_summary_json,created_at,finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        for (const step of session.steps) {
          insertStep.run(
            step.id,
            session.id,
            step.sequenceNo,
            step.stateBefore,
            step.stateAfter,
            step.actionType,
            step.status,
            step.modelRunId,
            step.messageId,
            step.rationale,
            step.errorSummary === null ? null : JSON.stringify(step.errorSummary),
            step.createdAt,
            step.finishedAt,
          )
        }

        return session
      })(),
    )
  }
}
