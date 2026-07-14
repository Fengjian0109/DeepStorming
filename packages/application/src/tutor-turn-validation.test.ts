import { describe, expect, it } from 'vitest'

import { parseTutorTurnCandidate, TutorTurnValidationError } from './tutor-turn-validation'

describe('parseTutorTurnCandidate', () => {
  const contextChunks = [
    {
      chunkId: 'chunk-1',
      text: '每一项表示一个样本的贡献。',
      pageNumberStart: 2,
      pageNumberEnd: 2,
      charCount: 15,
    },
  ]

  it('parses JSON and verifies citation and figure ownership', () => {
    expect(
      parseTutorTurnCandidate(
        JSON.stringify({
          narration: '她点了点公式。',
          responseMarkdown: '你会如何解释这个求和？',
          citations: [
            { chunkId: 'chunk-1', quote: '每一项表示一个样本', rationale: '支撑求和含义' },
          ],
          figureReferences: [{ figureId: 'figure-1', rationale: '对照结构' }],
        }),
        { contextChunks, allowedFigureIds: ['figure-1'] },
      ),
    ).toMatchObject({ responseMarkdown: '你会如何解释这个求和？' })
  })

  it('rejects malformed JSON, foreign chunks, unverifiable quotes, and foreign figures', () => {
    expect(() =>
      parseTutorTurnCandidate('not-json', { contextChunks, allowedFigureIds: [] }),
    ).toThrow(TutorTurnValidationError)
    for (const candidate of [
      {
        narration: null,
        responseMarkdown: '继续',
        citations: [{ chunkId: 'foreign', quote: '证据', rationale: '理由' }],
        figureReferences: [],
      },
      {
        narration: null,
        responseMarkdown: '继续',
        citations: [{ chunkId: 'chunk-1', quote: '不存在的文字', rationale: '理由' }],
        figureReferences: [],
      },
      {
        narration: null,
        responseMarkdown: '继续',
        citations: [],
        figureReferences: [{ figureId: 'foreign', rationale: '理由' }],
      },
    ]) {
      expect(() =>
        parseTutorTurnCandidate(JSON.stringify(candidate), { contextChunks, allowedFigureIds: [] }),
      ).toThrow(TutorTurnValidationError)
    }
  })
})
