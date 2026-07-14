import { describe, expect, it } from 'vitest'
import {
  LESSON_MESSAGE_ROLES,
  LESSON_MODEL_RUN_STATUSES,
  LESSON_SESSION_STATUSES,
  normalizeLessonSession,
  normalizeMasteryEvidence,
  normalizeMisconceptionSignal,
  normalizeReviewEvent,
  normalizeReviewItem,
  normalizeLessonContextChunkSummary,
  normalizeLessonStep,
  normalizeLessonModelRunInputSummary,
  normalizeTutorAction,
  type LessonModelRunInputSummary,
  normalizeLessonStartDraft,
  validateLessonStateTransition,
} from './lesson'

describe('lesson domain', () => {
  it('normalizes a lesson start draft with a source anchor', () => {
    expect(
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: '  Paper Map  ',
        source: {
          startOffset: 4,
          endOffset: 12,
          snippet: '  Evidence snippet  ',
        },
      }),
    ).toEqual({
      documentId: '00000000-0000-4000-8000-000000000001',
      title: 'Paper Map 课堂',
      documentTitle: 'Paper Map',
      lessonMode: 'standard',
      source: {
        startOffset: 4,
        endOffset: 12,
        snippet: 'Evidence snippet',
        target: { kind: 'text_range' },
      },
    })
  })

  it('normalizes lesson start drafts with paper mode', () => {
    expect(
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper Map',
        lessonMode: 'paper',
        source: {
          startOffset: 4,
          endOffset: 12,
          snippet: 'Evidence snippet',
        },
      }).lessonMode,
    ).toBe('paper')
  })

  it('normalizes a pdf block target', () => {
    expect(
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: {
          startOffset: 0,
          endOffset: 8,
          snippet: 'Evidence',
          target: { kind: 'pdf_block', pageNumber: 2, blockId: 'p2-b1', blockIndex: 1 },
        },
      }),
    ).toMatchObject({
      source: {
        target: { kind: 'pdf_block', pageNumber: 2, blockId: 'p2-b1', blockIndex: 1 },
      },
    })
  })

  it('rejects invalid pdf block targets', () => {
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: {
          startOffset: 0,
          endOffset: 8,
          snippet: 'Evidence',
          target: { kind: 'pdf_block', pageNumber: 0, blockId: 'p0-b1', blockIndex: 0 },
        },
      }),
    ).toThrow('Lesson source PDF page number is invalid')
  })

  it('rejects invalid lesson anchors', () => {
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: { startOffset: 12, endOffset: 4, snippet: 'Evidence' },
      }),
    ).toThrow('Lesson source end offset must be greater than start offset')
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: { startOffset: 0, endOffset: 4, snippet: '   ' },
      }),
    ).toThrow('Lesson source snippet must not be blank')
  })

  it('defines the accepted lesson session statuses', () => {
    expect(LESSON_SESSION_STATUSES).toEqual(['active', 'archived'])
  })

  it('defines the accepted lesson message roles', () => {
    expect(LESSON_MESSAGE_ROLES).toEqual(['system', 'tutor', 'learner'])
  })

  it('defines the accepted lesson model run statuses', () => {
    expect(LESSON_MODEL_RUN_STATUSES).toEqual(['started', 'succeeded', 'failed', 'cancelled'])
  })

  it('normalizes paper lesson profiles for paper lessons', () => {
    const session = normalizeLessonSession({
      id: '00000000-0000-4000-8000-000000000101',
      title: 'Paper Map 课堂',
      status: 'active',
      documentId: '00000000-0000-4000-8000-000000000201',
      documentTitle: 'Paper Map',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'opening',
      steps: [],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: 'We established the paper problem and the learner background.',
        termsIntroduced: ['Transformer'],
        citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    })

    expect(session.paperProfile?.currentStage).toBe('orientation')
    expect(session.lessonMode).toBe('paper')
  })

  it('rejects mismatched lessonMode and paperProfile', () => {
    expect(() =>
      normalizeLessonSession({
        id: '00000000-0000-4000-8000-000000000101',
        title: 'Notes 课堂',
        status: 'active',
        documentId: '00000000-0000-4000-8000-000000000201',
        documentTitle: 'Notes',
        sourceAnchors: [],
        messages: [],
        modelRuns: [],
        currentState: 'opening',
        steps: [],
        masteryEvidence: [],
        misconceptionSignals: [],
        reviewItems: [],
        reviewEvents: [],
        lessonMode: 'standard',
        paperProfile: {
          currentStage: 'orientation',
          stageSummary: null,
          termsIntroduced: [],
          citedAnchorIds: [],
        },
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Paper lesson profile is invalid')
  })

  it('normalizes mastery evidence rationale and rejects invalid confidence', () => {
    expect(
      normalizeMasteryEvidence({
        id: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        stepId: '00000000-0000-4000-8000-000000000701',
        learnerMessageId: '00000000-0000-4000-8000-000000000402',
        tutorMessageId: '00000000-0000-4000-8000-000000000403',
        kind: 'teach_back',
        judgement: 'partial_understanding',
        confidence: 0.55,
        rationale: '  Learner connected the answer to the cited evidence.  ',
        suggestedReview: false,
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'teach_back',
        judgement: 'partial_understanding',
        rationale: 'Learner connected the answer to the cited evidence.',
      }),
    )

    expect(() =>
      normalizeMasteryEvidence({
        id: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        stepId: '00000000-0000-4000-8000-000000000701',
        learnerMessageId: '00000000-0000-4000-8000-000000000402',
        tutorMessageId: '00000000-0000-4000-8000-000000000403',
        kind: 'teach_back',
        judgement: 'partial_understanding',
        confidence: 1.01,
        rationale: 'Learner connected the answer to the cited evidence.',
        suggestedReview: false,
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toThrow('Mastery confidence is invalid')

    expect(() =>
      normalizeMasteryEvidence({
        id: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        stepId: '00000000-0000-4000-8000-000000000701',
        learnerMessageId: '00000000-0000-4000-8000-000000000402',
        tutorMessageId: '00000000-0000-4000-8000-000000000403',
        kind: 'teach_back',
        judgement: 'partial_understanding',
        confidence: 0.55,
        rationale: 'a'.repeat(281),
        suggestedReview: false,
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toThrow('Mastery rationale is too long')
  })

  it('normalizes misconception signal severity and rejects blank labels', () => {
    expect(
      normalizeMisconceptionSignal({
        id: '00000000-0000-4000-8000-000000000901',
        evidenceId: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        label: '学习者表达卡住',
        severity: 'medium',
        rationale: 'Learner explicitly said they were stuck.',
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toEqual(expect.objectContaining({ severity: 'medium' }))

    expect(() =>
      normalizeMisconceptionSignal({
        id: '00000000-0000-4000-8000-000000000901',
        evidenceId: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        label: '   ',
        severity: 'medium',
        rationale: 'Learner explicitly said they were stuck.',
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toThrow('Misconception label is required')

    expect(() =>
      normalizeMisconceptionSignal({
        id: '00000000-0000-4000-8000-000000000901',
        evidenceId: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        label: 'a'.repeat(81),
        severity: 'medium',
        rationale: 'Learner explicitly said they were stuck.',
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toThrow('Misconception label is too long')

    expect(() =>
      normalizeMisconceptionSignal({
        id: '00000000-0000-4000-8000-000000000901',
        evidenceId: '00000000-0000-4000-8000-000000000801',
        lessonId: '00000000-0000-4000-8000-000000000101',
        label: '学习者表达卡住',
        severity: 'medium',
        rationale: 'a'.repeat(281),
        createdAt: '2026-07-11T00:01:00.000Z',
      }),
    ).toThrow('Misconception rationale is too long')
  })

  it('normalizes review items with trimmed prompts and outlines', () => {
    expect(
      normalizeReviewItem({
        id: '00000000-0000-4000-8000-000000000951',
        lessonId: '00000000-0000-4000-8000-000000000101',
        masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
        misconceptionSignalId: '00000000-0000-4000-8000-000000000901',
        prompt: '  复习：学习者把关键概念混淆了。请重新解释这段证据想说明什么。  ',
        answerOutline: ['  先解释原证据 ', ' 再指出误区 '],
        status: 'active',
        dueAt: '2026-07-14T00:00:00.000Z',
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }).answerOutline,
    ).toEqual(['先解释原证据', '再指出误区'])
  })

  it('rejects blank review outlines and invalid ratings', () => {
    expect(() =>
      normalizeReviewItem({
        id: '00000000-0000-4000-8000-000000000951',
        lessonId: '00000000-0000-4000-8000-000000000101',
        masteryEvidenceId: '00000000-0000-4000-8000-000000000801',
        misconceptionSignalId: null,
        prompt: '复习：请重新解释这段课堂证据。',
        answerOutline: ['   '],
        status: 'active',
        dueAt: '2026-07-14T00:00:00.000Z',
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Review answer outline item is required')

    expect(() =>
      normalizeReviewEvent({
        id: '00000000-0000-4000-8000-000000000961',
        reviewItemId: '00000000-0000-4000-8000-000000000951',
        lessonId: '00000000-0000-4000-8000-000000000101',
        rating: 'unknown' as never,
        response: 'I think I remember this now.',
        previousDueAt: '2026-07-14T00:00:00.000Z',
        nextDueAt: '2026-07-17T00:00:00.000Z',
        reviewedAt: '2026-07-14T09:00:00.000Z',
        createdAt: '2026-07-14T09:00:00.000Z',
      }),
    ).toThrow('Review rating is invalid')
  })

  it('validates lesson state transitions', () => {
    expect(validateLessonStateTransition('opening', 'probing')).toBeUndefined()
    expect(validateLessonStateTransition('probing', 'hinting')).toBeUndefined()
    expect(validateLessonStateTransition('hinting', 'explaining')).toBeUndefined()
    expect(() => validateLessonStateTransition('completed', 'probing')).toThrow(
      'Lesson state transition is invalid',
    )
  })

  it('normalizes tutor actions and rejects invalid transitions', () => {
    expect(
      normalizeTutorAction({
        actionType: 'ask',
        stateBefore: 'opening',
        stateAfter: 'probing',
        utterance: '你觉得这段证据想解决什么问题？',
        citedChunkIds: ['00000000-0000-4000-8000-000000000901'],
        rationale: 'Start with a source-grounded question.',
      }),
    ).toEqual(
      expect.objectContaining({
        actionType: 'ask',
        stateBefore: 'opening',
        stateAfter: 'probing',
      }),
    )

    expect(() =>
      normalizeTutorAction({
        actionType: 'ask',
        stateBefore: 'opening',
        stateAfter: 'completed',
        utterance: '直接结束。',
        citedChunkIds: [],
        rationale: 'Bad jump.',
      }),
    ).toThrow('Lesson state transition is invalid')
  })

  it('normalizes lesson steps and enforces status-specific fields', () => {
    expect(
      normalizeLessonStep({
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
        createdAt: '2026-07-13T00:00:00.000Z',
        finishedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toEqual(expect.objectContaining({ sequenceNo: 0, status: 'succeeded' }))

    expect(() =>
      normalizeLessonStep({
        id: '00000000-0000-4000-8000-000000000701',
        lessonId: '00000000-0000-4000-8000-000000000101',
        sequenceNo: 0,
        stateBefore: 'opening',
        stateAfter: 'completed',
        actionType: 'ask',
        status: 'succeeded',
        modelRunId: '00000000-0000-4000-8000-000000000501',
        messageId: '00000000-0000-4000-8000-000000000401',
        rationale: 'bad transition',
        errorSummary: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        finishedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).toThrow('Lesson state transition is invalid')

    expect(() =>
      normalizeLessonStep({
        id: '00000000-0000-4000-8000-000000000702',
        lessonId: '00000000-0000-4000-8000-000000000101',
        sequenceNo: 1,
        stateBefore: 'probing',
        stateAfter: 'probing',
        actionType: 'ask',
        status: 'started',
        modelRunId: '00000000-0000-4000-8000-000000000502',
        messageId: '00000000-0000-4000-8000-000000000402',
        rationale: null,
        errorSummary: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        finishedAt: null,
      }),
    ).toThrow('Started lesson step fields are invalid')
  })

  it('supports lesson model run summaries with required context chunks', () => {
    const summary: LessonModelRunInputSummary = normalizeLessonModelRunInputSummary({
      documentId: '00000000-0000-4000-8000-000000000001',
      documentTitle: 'Paper',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      sourceCharacterRange: { startOffset: 0, endOffset: 8 },
      snippetCharacterCount: 8,
      contextCharacterCount: 144,
      contextChunks: [
        {
          chunkId: '00000000-0000-4000-8000-000000000901',
          pageNumberStart: 1,
          pageNumberEnd: 2,
          charCount: 144,
        },
      ],
    })

    expect(summary.contextChunks).toHaveLength(1)
    expect(summary.contextCharacterCount).toBe(144)
  })

  it('normalizes lesson context chunk summaries and rejects invalid values', () => {
    expect(
      normalizeLessonContextChunkSummary({
        chunkId: '00000000-0000-4000-8000-000000000901',
        pageNumberStart: 1,
        pageNumberEnd: 2,
        charCount: 144,
      }),
    ).toEqual({
      chunkId: '00000000-0000-4000-8000-000000000901',
      pageNumberStart: 1,
      pageNumberEnd: 2,
      charCount: 144,
    })

    expect(() =>
      normalizeLessonContextChunkSummary({
        chunkId: '00000000-0000-4000-8000-000000000901',
        pageNumberStart: 2,
        pageNumberEnd: 1,
        charCount: 144,
      }),
    ).toThrow('Lesson context chunk page range is invalid')
  })

  it('rejects lesson model run summaries with inconsistent context totals', () => {
    expect(() =>
      normalizeLessonModelRunInputSummary({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 0, endOffset: 8 },
        snippetCharacterCount: 8,
        contextCharacterCount: 145,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 144,
          },
        ],
      }),
    ).toThrow('Lesson context character count is invalid')
  })
})
