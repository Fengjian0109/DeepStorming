import type {
  StoredLessonMessage,
  StoredLessonModelRun,
  StoredLessonStep,
  LessonRepositoryPort,
  StoredMasteryEvidence,
  StoredMisconceptionSignal,
  StoredReviewEvent,
  StoredReviewItem,
  StoredLessonSession,
  StoredLessonSourceAnchor,
} from '@deepstorming/application'
import type {
  LessonPace,
  LessonSourceTarget,
  LessonTutorSnapshot,
  TutorTurn,
} from '@deepstorming/domain'
import { databaseError, type SqliteDatabase } from './database'

type LessonRow = {
  id: string
  title: string
  status: StoredLessonSession['status']
  current_state: StoredLessonSession['currentState']
  document_id: string
  document_title: string
  lesson_mode: StoredLessonSession['lessonMode']
  paper_profile_json: string | null
  lesson_pace: LessonPace | null
  tutor_snapshot_json: string | null
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
  tutor_turn_json: string | null
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

type MasteryEvidenceRow = {
  id: string
  lesson_id: string
  step_id: string
  learner_message_id: string
  tutor_message_id: string
  kind: StoredMasteryEvidence['kind']
  judgement: StoredMasteryEvidence['judgement']
  confidence: number
  rationale: string
  suggested_review: number
  created_at: string
}

type MisconceptionSignalRow = {
  id: string
  evidence_id: string
  lesson_id: string
  label: string
  severity: StoredMisconceptionSignal['severity']
  rationale: string
  created_at: string
}

type ReviewItemRow = {
  id: string
  lesson_id: string
  mastery_evidence_id: string
  misconception_signal_id: string | null
  prompt: string
  answer_outline_json: string
  status: StoredReviewItem['status']
  due_at: string
  created_at: string
  updated_at: string
}

type ReviewEventRow = {
  id: string
  review_item_id: string
  lesson_id: string
  rating: StoredReviewEvent['rating']
  response: string
  previous_due_at: string
  next_due_at: string | null
  reviewed_at: string
  created_at: string
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
  ...(row.tutor_turn_json === null
    ? {}
    : { tutorTurn: parseJsonObject<TutorTurn>(row.tutor_turn_json) }),
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

const mapMasteryEvidence = (row: MasteryEvidenceRow): StoredMasteryEvidence => ({
  id: row.id,
  lessonId: row.lesson_id,
  stepId: row.step_id,
  learnerMessageId: row.learner_message_id,
  tutorMessageId: row.tutor_message_id,
  kind: row.kind,
  judgement: row.judgement,
  confidence: row.confidence,
  rationale: row.rationale,
  suggestedReview: row.suggested_review === 1,
  createdAt: row.created_at,
})

const mapMisconceptionSignal = (row: MisconceptionSignalRow): StoredMisconceptionSignal => ({
  id: row.id,
  evidenceId: row.evidence_id,
  lessonId: row.lesson_id,
  label: row.label,
  severity: row.severity,
  rationale: row.rationale,
  createdAt: row.created_at,
})

const mapReviewItem = (row: ReviewItemRow): StoredReviewItem => ({
  id: row.id,
  lessonId: row.lesson_id,
  masteryEvidenceId: row.mastery_evidence_id,
  misconceptionSignalId: row.misconception_signal_id,
  prompt: row.prompt,
  answerOutline: parseSourceAnchorIds(row.answer_outline_json),
  status: row.status,
  dueAt: row.due_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapReviewEvent = (row: ReviewEventRow): StoredReviewEvent => ({
  id: row.id,
  reviewItemId: row.review_item_id,
  lessonId: row.lesson_id,
  rating: row.rating,
  response: row.response,
  previousDueAt: row.previous_due_at,
  nextDueAt: row.next_due_at,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
})

const mapSession = (
  row: LessonRow,
  sourceAnchors: readonly StoredLessonSourceAnchor[],
  messages: readonly StoredLessonMessage[],
  modelRuns: readonly StoredLessonModelRun[],
  steps: readonly StoredLessonStep[],
  masteryEvidence: readonly StoredMasteryEvidence[],
  misconceptionSignals: readonly StoredMisconceptionSignal[],
  reviewItems: readonly StoredReviewItem[],
  reviewEvents: readonly StoredReviewEvent[],
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
  masteryEvidence,
  misconceptionSignals,
  reviewItems,
  reviewEvents,
  lessonMode: row.lesson_mode,
  paperProfile:
    row.paper_profile_json === null
      ? null
      : parseJsonObject<StoredLessonSession['paperProfile']>(row.paper_profile_json),
  ...(row.lesson_pace === null ? {} : { pace: row.lesson_pace }),
  ...(row.tutor_snapshot_json === null
    ? {}
    : { tutorSnapshot: parseJsonObject<LessonTutorSnapshot>(row.tutor_snapshot_json) }),
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

  private masteryEvidenceFor(lessonIds: readonly string[]): Map<string, StoredMasteryEvidence[]> {
    const evidence = new Map<string, StoredMasteryEvidence[]>()
    if (lessonIds.length === 0) return evidence
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_mastery_evidence
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,created_at,id`,
      )
      .all(...lessonIds) as MasteryEvidenceRow[]
    for (const row of rows) {
      const existing = evidence.get(row.lesson_id) ?? []
      existing.push(mapMasteryEvidence(row))
      evidence.set(row.lesson_id, existing)
    }
    return evidence
  }

  private misconceptionSignalsFor(
    lessonIds: readonly string[],
  ): Map<string, StoredMisconceptionSignal[]> {
    const signals = new Map<string, StoredMisconceptionSignal[]>()
    if (lessonIds.length === 0) return signals
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_misconception_signals
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,created_at,id`,
      )
      .all(...lessonIds) as MisconceptionSignalRow[]
    for (const row of rows) {
      const existing = signals.get(row.lesson_id) ?? []
      existing.push(mapMisconceptionSignal(row))
      signals.set(row.lesson_id, existing)
    }
    return signals
  }

  private reviewItemsFor(lessonIds: readonly string[]): Map<string, StoredReviewItem[]> {
    const items = new Map<string, StoredReviewItem[]>()
    if (lessonIds.length === 0) return items
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_review_items
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,due_at,created_at,id`,
      )
      .all(...lessonIds) as ReviewItemRow[]
    for (const row of rows) {
      const existing = items.get(row.lesson_id) ?? []
      existing.push(mapReviewItem(row))
      items.set(row.lesson_id, existing)
    }
    return items
  }

  private reviewEventsFor(lessonIds: readonly string[]): Map<string, StoredReviewEvent[]> {
    const events = new Map<string, StoredReviewEvent[]>()
    if (lessonIds.length === 0) return events
    const placeholders = lessonIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT * FROM lesson_review_events
         WHERE lesson_id IN (${placeholders})
         ORDER BY lesson_id,reviewed_at,id`,
      )
      .all(...lessonIds) as ReviewEventRow[]
    for (const row of rows) {
      const existing = events.get(row.lesson_id) ?? []
      existing.push(mapReviewEvent(row))
      events.set(row.lesson_id, existing)
    }
    return events
  }

  private insertMasteryEvidence(session: StoredLessonSession): void {
    const insertEvidence = this.db.prepare(
      `INSERT INTO lesson_mastery_evidence
       (id,lesson_id,step_id,learner_message_id,tutor_message_id,kind,judgement,confidence,rationale,suggested_review,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    for (const evidence of session.masteryEvidence) {
      insertEvidence.run(
        evidence.id,
        session.id,
        evidence.stepId,
        evidence.learnerMessageId,
        evidence.tutorMessageId,
        evidence.kind,
        evidence.judgement,
        evidence.confidence,
        evidence.rationale,
        evidence.suggestedReview ? 1 : 0,
        evidence.createdAt,
      )
    }

    const insertSignal = this.db.prepare(
      `INSERT INTO lesson_misconception_signals
       (id,evidence_id,lesson_id,label,severity,rationale,created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
    for (const signal of session.misconceptionSignals) {
      insertSignal.run(
        signal.id,
        signal.evidenceId,
        session.id,
        signal.label,
        signal.severity,
        signal.rationale,
        signal.createdAt,
      )
    }
  }

  private insertReviewData(session: StoredLessonSession): void {
    const insertReviewItem = this.db.prepare(
      `INSERT INTO lesson_review_items
       (id,lesson_id,mastery_evidence_id,misconception_signal_id,prompt,answer_outline_json,status,due_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    for (const item of session.reviewItems) {
      insertReviewItem.run(
        item.id,
        session.id,
        item.masteryEvidenceId,
        item.misconceptionSignalId,
        item.prompt,
        JSON.stringify(item.answerOutline),
        item.status,
        item.dueAt,
        item.createdAt,
        item.updatedAt,
      )
    }

    const insertReviewEvent = this.db.prepare(
      `INSERT INTO lesson_review_events
       (id,review_item_id,lesson_id,rating,response,previous_due_at,next_due_at,reviewed_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    for (const event of session.reviewEvents) {
      insertReviewEvent.run(
        event.id,
        event.reviewItemId,
        session.id,
        event.rating,
        event.response,
        event.previousDueAt,
        event.nextDueAt,
        event.reviewedAt,
        event.createdAt,
      )
    }
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
      const masteryEvidence = this.masteryEvidenceFor(lessonIds)
      const misconceptionSignals = this.misconceptionSignalsFor(lessonIds)
      const reviewItems = this.reviewItemsFor(lessonIds)
      const reviewEvents = this.reviewEventsFor(lessonIds)
      return rows.map((row) =>
        mapSession(
          row,
          anchors.get(row.id) ?? [],
          messages.get(row.id) ?? [],
          modelRuns.get(row.id) ?? [],
          steps.get(row.id) ?? [],
          masteryEvidence.get(row.id) ?? [],
          misconceptionSignals.get(row.id) ?? [],
          reviewItems.get(row.id) ?? [],
          reviewEvents.get(row.id) ?? [],
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
      const masteryEvidence = this.masteryEvidenceFor([id])
      const misconceptionSignals = this.misconceptionSignalsFor([id])
      const reviewItems = this.reviewItemsFor([id])
      const reviewEvents = this.reviewEventsFor([id])
      return mapSession(
        row,
        anchors.get(id) ?? [],
        messages.get(id) ?? [],
        modelRuns.get(id) ?? [],
        steps.get(id) ?? [],
        masteryEvidence.get(id) ?? [],
        misconceptionSignals.get(id) ?? [],
        reviewItems.get(id) ?? [],
        reviewEvents.get(id) ?? [],
      )
    })
  }

  public async create(session: StoredLessonSession): Promise<StoredLessonSession> {
    return this.safe(() =>
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO lesson_sessions
             (id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode,paper_profile_json,lesson_pace,tutor_snapshot_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
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
            session.lessonMode,
            session.paperProfile === null ? null : JSON.stringify(session.paperProfile),
            session.pace ?? null,
            session.tutorSnapshot === undefined ? null : JSON.stringify(session.tutorSnapshot),
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
          `INSERT INTO lesson_messages
           (id,lesson_id,role,content,source_anchor_ids_json,prompt_version,message_index,created_at,model_run_id,tutor_turn_json)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
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
            message.tutorTurn === undefined ? null : JSON.stringify(message.tutorTurn),
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
        this.insertMasteryEvidence(session)
        this.insertReviewData(session)
        return session
      })(),
    )
  }

  public async save(session: StoredLessonSession): Promise<StoredLessonSession> {
    return this.safe(() =>
      this.db.transaction(() => {
        this.db
          .prepare(
            'UPDATE lesson_sessions SET title=?,status=?,current_state=?,updated_at=?,lesson_mode=?,paper_profile_json=?,lesson_pace=?,tutor_snapshot_json=? WHERE id=?',
          )
          .run(
            session.title,
            session.status,
            session.currentState,
            session.updatedAt,
            session.lessonMode,
            session.paperProfile === null ? null : JSON.stringify(session.paperProfile),
            session.pace ?? null,
            session.tutorSnapshot === undefined ? null : JSON.stringify(session.tutorSnapshot),
            session.id,
          )
        this.db.prepare('DELETE FROM lesson_review_events WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_review_items WHERE lesson_id=?').run(session.id)
        this.db
          .prepare('DELETE FROM lesson_misconception_signals WHERE lesson_id=?')
          .run(session.id)
        this.db.prepare('DELETE FROM lesson_mastery_evidence WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_steps WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_model_runs WHERE lesson_id=?').run(session.id)
        this.db.prepare('DELETE FROM lesson_messages WHERE lesson_id=?').run(session.id)

        const insertMessage = this.db.prepare(
          `INSERT INTO lesson_messages
           (id,lesson_id,role,content,source_anchor_ids_json,prompt_version,message_index,created_at,model_run_id,tutor_turn_json)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
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
            message.tutorTurn === undefined ? null : JSON.stringify(message.tutorTurn),
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
        this.insertMasteryEvidence(session)
        this.insertReviewData(session)

        return session
      })(),
    )
  }
}
