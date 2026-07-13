import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredLessonSession } from '@deepstorming/application'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase } from './database'
import { SqliteLessonRepository } from './sqlite-lesson-repository'

let dir: string
let db: SqliteDatabase
let repo: SqliteLessonRepository

const session = (overrides: Partial<StoredLessonSession> = {}): StoredLessonSession => ({
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Paper Map 课堂',
  status: 'active',
  documentId: '00000000-0000-4000-8000-000000000201',
  documentTitle: 'Paper Map',
  sourceAnchors: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      documentId: '00000000-0000-4000-8000-000000000201',
      startOffset: 4,
      endOffset: 12,
      snippet: 'Evidence',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId: '00000000-0000-4000-8000-000000000101',
      modelRunId: '00000000-0000-4000-8000-000000000501',
      role: 'tutor',
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId: '00000000-0000-4000-8000-000000000101',
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question',
      status: 'succeeded',
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId: '00000000-0000-4000-8000-000000000201',
        documentTitle: 'Paper Map',
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 8,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 8,
          },
        ],
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  currentState: 'probing',
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000701',
      lessonId: '00000000-0000-4000-8000-000000000101',
      sequenceNo: 0,
      stateBefore: 'opening',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'succeeded',
      modelRunId: '00000000-0000-4000-8000-000000000501',
      messageId: '00000000-0000-4000-8000-000000000401',
      rationale: 'Started with a source-grounded question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard',
  paperProfile: null,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  ...overrides,
})

const sessionWithMasteryEvidence = (): StoredLessonSession =>
  session({
    messages: [
      ...session().messages,
      {
        id: '00000000-0000-4000-8000-000000000403',
        lessonId: '00000000-0000-4000-8000-000000000101',
        modelRunId: null,
        role: 'learner',
        content: '我还是卡住了。',
        sourceAnchorIds: [],
        promptVersion: 'learner-input-v1',
        createdAt: '2026-07-11T00:01:00.000Z',
      },
    ],
    masteryEvidence: [
      {
        id: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        stepId: '00000000-0000-4000-8000-000000000701',
        learnerMessageId: '00000000-0000-4000-8000-000000000403',
        tutorMessageId: '00000000-0000-4000-8000-000000000401',
        kind: 'stuck_signal',
        judgement: 'needs_review',
        confidence: 0.82,
        rationale: 'Learner explicitly said they were stuck after the prompt.',
        suggestedReview: true,
        createdAt: '2026-07-11T00:01:00.000Z',
      },
    ],
    misconceptionSignals: [
      {
        id: '00000000-0000-4000-8000-000000000901',
        evidenceId: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        label: '学习者表达卡住',
        severity: 'medium',
        rationale: 'The learner cannot proceed without review.',
        createdAt: '2026-07-11T00:01:00.000Z',
      },
    ],
    updatedAt: '2026-07-11T00:01:00.000Z',
  })

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'deepstorming-lesson-repo-'))
  db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  db.prepare('INSERT INTO learning_documents VALUES (?,?,?,?,?,?,?,?)').run(
    '00000000-0000-4000-8000-000000000201',
    'generic',
    'Paper Map',
    'pasted_text',
    null,
    'hash-paper',
    '2026-07-11T00:00:00.000Z',
    '2026-07-11T00:00:00.000Z',
  )
  repo = new SqliteLessonRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteLessonRepository', () => {
  it('creates, lists, and retrieves sessions with source anchors and messages', async () => {
    await repo.create(session())

    await expect(repo.list()).resolves.toEqual([session()])
    await expect(repo.findById(session().id)).resolves.toEqual(session())
  })

  it('round-trips paper lesson metadata', async () => {
    const paperSession = session({
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: 'We established the paper problem and learner context.',
        termsIntroduced: ['Transformer'],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      },
    })

    await repo.create(paperSession)

    await expect(repo.findById(paperSession.id)).resolves.toEqual(paperSession)

    const updatedPaperSession = {
      ...paperSession,
      paperProfile: {
        currentStage: 'problem_framing' as const,
        stageSummary: 'The learner can now state the paper problem clearly.',
        termsIntroduced: ['Transformer', 'Attention'],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      },
      updatedAt: '2026-07-11T00:02:00.000Z',
    }

    await repo.save(updatedPaperSession)

    await expect(repo.findById(paperSession.id)).resolves.toEqual(updatedPaperSession)
  })

  it('persists mastery evidence and misconception signals', async () => {
    const created = await repo.create(sessionWithMasteryEvidence())

    expect(created.masteryEvidence).toHaveLength(1)
    expect(created.misconceptionSignals).toHaveLength(1)
    const reloaded = await repo.findById(session().id)
    expect(reloaded?.masteryEvidence[0]?.judgement).toBe('needs_review')
    expect(reloaded?.misconceptionSignals[0]?.label).toBe('学习者表达卡住')
  })

  it('rewrites mastery evidence and misconception signals on save', async () => {
    await repo.create(sessionWithMasteryEvidence())

    await repo.save({
      ...sessionWithMasteryEvidence(),
      masteryEvidence: [],
      misconceptionSignals: [],
      updatedAt: '2026-07-11T00:02:00.000Z',
    })

    const reloaded = await repo.findById(session().id)
    expect(reloaded?.masteryEvidence).toEqual([])
    expect(reloaded?.misconceptionSignals).toEqual([])
  })

  it('persists review items and review events with lesson sessions', async () => {
    const created = await repo.create(
      session({
        masteryEvidence: [
          {
            id: '00000000-0000-4000-8000-000000000801',
            lessonId: '00000000-0000-4000-8000-000000000101',
            stepId: '00000000-0000-4000-8000-000000000701',
            learnerMessageId: '00000000-0000-4000-8000-000000000401',
            tutorMessageId: '00000000-0000-4000-8000-000000000401',
            kind: 'teach_back',
            judgement: 'needs_review',
            confidence: 0.72,
            rationale: 'Learner still needs another review pass.',
            suggestedReview: true,
            createdAt: '2026-07-13T00:00:00.000Z',
          },
        ],
        reviewItems: [
          {
            id: '00000000-0000-4000-8000-000000000951',
            lessonId: '00000000-0000-4000-8000-000000000101',
            masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
            misconceptionSignalId: null,
            prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
            answerOutline: ['先说明证据', '再说明判断依据'],
            status: 'active',
            dueAt: '2026-07-14T00:00:00.000Z',
            createdAt: '2026-07-13T00:00:00.000Z',
            updatedAt: '2026-07-13T00:00:00.000Z',
          },
        ],
        reviewEvents: [
          {
            id: '00000000-0000-4000-8000-000000000961',
            reviewItemId: '00000000-0000-4000-8000-000000000951',
            lessonId: '00000000-0000-4000-8000-000000000101',
            rating: 'forgot',
            response: 'I still mix up the rationale.',
            previousDueAt: '2026-07-14T00:00:00.000Z',
            nextDueAt: '2026-07-15T09:00:00.000Z',
            reviewedAt: '2026-07-14T09:00:00.000Z',
            createdAt: '2026-07-14T09:00:00.000Z',
          },
        ],
      }),
    )

    const reloaded = await repo.findById(created.id)
    expect(reloaded?.reviewItems).toHaveLength(1)
    expect(reloaded?.reviewItems[0]?.prompt).toBe(
      '复习：请重新解释这段课堂证据，并说明你的判断依据。',
    )
    expect(reloaded?.reviewEvents[0]?.rating).toBe('forgot')
  })

  it('round-trips a pdf block target while keeping legacy anchors readable', async () => {
    const withTarget = session({
      sourceAnchors: [
        {
          ...session().sourceAnchors[0]!,
          target: { kind: 'pdf_block', pageNumber: 2, blockId: 'block-2', blockIndex: 0 },
        },
      ],
    })
    await repo.create(withTarget)
    await expect(repo.findById(withTarget.id)).resolves.toEqual(withTarget)

    db.prepare('UPDATE lesson_source_anchors SET target_json=NULL WHERE id=?').run(
      withTarget.sourceAnchors[0]!.id,
    )
    const legacy = await repo.findById(withTarget.id)
    expect(legacy?.sourceAnchors[0]?.target).toBeUndefined()
  })

  it('sorts newest sessions first', async () => {
    await repo.create(session({ createdAt: '2026-07-11T00:00:00.000Z' }))
    await repo.create(
      session({
        id: '00000000-0000-4000-8000-000000000102',
        title: 'Later',
        createdAt: '2026-07-11T00:01:00.000Z',
        updatedAt: '2026-07-11T00:01:00.000Z',
        sourceAnchors: [
          {
            ...session().sourceAnchors[0]!,
            id: '00000000-0000-4000-8000-000000000302',
          },
        ],
        messages: [
          {
            ...session().messages[0]!,
            id: '00000000-0000-4000-8000-000000000402',
            lessonId: '00000000-0000-4000-8000-000000000102',
            modelRunId: '00000000-0000-4000-8000-000000000502',
            sourceAnchorIds: ['00000000-0000-4000-8000-000000000302'],
          },
        ],
        modelRuns: [
          {
            ...session().modelRuns[0]!,
            id: '00000000-0000-4000-8000-000000000502',
            lessonId: '00000000-0000-4000-8000-000000000102',
            sourceAnchorIds: ['00000000-0000-4000-8000-000000000302'],
            outputMessageId: '00000000-0000-4000-8000-000000000402',
          },
        ],
        steps: [
          {
            ...session().steps[0]!,
            id: '00000000-0000-4000-8000-000000000702',
            lessonId: '00000000-0000-4000-8000-000000000102',
            modelRunId: '00000000-0000-4000-8000-000000000502',
            messageId: '00000000-0000-4000-8000-000000000402',
          },
        ],
      }),
    )

    await expect(repo.list()).resolves.toMatchObject([
      { title: 'Later' },
      { title: 'Paper Map 课堂' },
    ])
  })

  it('saves appended learner and tutor messages with follow-up model runs', async () => {
    await repo.create(session())
    const updated = session({
      messages: [
        ...session().messages,
        {
          id: '00000000-0000-4000-8000-000000000403',
          lessonId: '00000000-0000-4000-8000-000000000101',
          modelRunId: null,
          role: 'learner',
          content: '它在说明证据如何支撑判断。',
          sourceAnchorIds: [],
          promptVersion: 'learner-input-v1',
          createdAt: '2026-07-11T00:01:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000404',
          lessonId: '00000000-0000-4000-8000-000000000101',
          modelRunId: '00000000-0000-4000-8000-000000000503',
          role: 'tutor',
          content:
            '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来：下一步你会如何验证这个判断？',
          sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
          promptVersion: 'mock-tutor-follow-up-v2',
          createdAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      modelRuns: [
        ...session().modelRuns,
        {
          id: '00000000-0000-4000-8000-000000000503',
          lessonId: '00000000-0000-4000-8000-000000000101',
          providerId: null,
          modelName: 'mock-local',
          operation: 'lesson_tutor_follow_up',
          status: 'succeeded',
          promptManifest: {
            key: 'lesson.mockTutor.followUp',
            version: 2,
            hash: 'sha256:ad9d6476b98dc6a93a16144bb3ba2a79f7be4e9741176c1e564e0b02ab49265b',
          },
          inputSummary: {
            documentId: '00000000-0000-4000-8000-000000000201',
            documentTitle: 'Paper Map',
            sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
            sourceCharacterRange: { startOffset: 4, endOffset: 12 },
            snippetCharacterCount: 8,
            contextCharacterCount: 8,
            contextChunks: [
              {
                chunkId: '00000000-0000-4000-8000-000000000901',
                pageNumberStart: 1,
                pageNumberEnd: 1,
                charCount: 8,
              },
            ],
            learnerReplyCharacterCount: 13,
          },
          sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
          outputMessageId: '00000000-0000-4000-8000-000000000404',
          errorSummary: null,
          startedAt: '2026-07-11T00:01:00.000Z',
          finishedAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      steps: [
        ...session().steps,
        {
          id: '00000000-0000-4000-8000-000000000703',
          lessonId: '00000000-0000-4000-8000-000000000101',
          sequenceNo: 1,
          stateBefore: 'probing',
          stateAfter: 'probing',
          actionType: 'ask',
          status: 'succeeded',
          modelRunId: '00000000-0000-4000-8000-000000000503',
          messageId: '00000000-0000-4000-8000-000000000404',
          rationale: 'Continued probing with source-grounded question.',
          errorSummary: null,
          createdAt: '2026-07-11T00:01:00.000Z',
          finishedAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T00:01:00.000Z',
    })

    await repo.save(updated)

    await expect(repo.findById(session().id)).resolves.toEqual(updated)
  })

  it('persists safe error summaries on failed model runs', async () => {
    const failed = session({
      modelRuns: [
        {
          ...session().modelRuns[0]!,
          status: 'failed',
          outputMessageId: null,
          errorSummary: {
            code: 'INTERNAL_ERROR',
            message: 'The lesson operation could not be completed.',
            retryable: true,
          },
          finishedAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T00:01:00.000Z',
    })

    await repo.create(failed)

    await expect(repo.findById(session().id)).resolves.toEqual(failed)
  })

  it('saves current state and replaces lesson steps transactionally', async () => {
    await repo.create(session())

    const updated = session({
      currentState: 'hinting',
      steps: [
        ...session().steps,
        {
          id: '00000000-0000-4000-8000-000000000703',
          lessonId: '00000000-0000-4000-8000-000000000101',
          sequenceNo: 1,
          stateBefore: 'probing',
          stateAfter: 'hinting',
          actionType: 'hint',
          status: 'failed',
          modelRunId: '00000000-0000-4000-8000-000000000501',
          messageId: null,
          rationale: null,
          errorSummary: {
            code: 'INTERNAL_ERROR',
            message: 'The lesson operation could not be completed.',
            retryable: true,
          },
          createdAt: '2026-07-11T00:01:00.000Z',
          finishedAt: '2026-07-11T00:01:00.000Z',
        },
      ],
      updatedAt: '2026-07-11T00:01:00.000Z',
    })

    await repo.save(updated)

    await expect(repo.findById(session().id)).resolves.toEqual(updated)
    expect(
      db.prepare('SELECT count(*) count FROM lesson_steps WHERE lesson_id=?').get(session().id),
    ).toEqual({ count: 2 })
  })
})
