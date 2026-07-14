import { describe, expect, it } from 'vitest'

import { normalizeTutorTurn } from './tutor-turn'

describe('TutorTurn', () => {
  it('keeps narration separate from the visible teaching response', () => {
    expect(
      normalizeTutorTurn({
        narration: '她翻到下一页，用铅笔圈出公式。',
        responseMarkdown: '你会如何解释 $a=\\sum_{i=1}^{N}i^2$ 中每一项的意义？',
        citations: [{ chunkId: 'chunk-1', quote: '每一项表示一个样本', rationale: '支撑公式含义' }],
        figureReferences: [{ figureId: 'figure-1', rationale: '对照模型结构' }],
      }),
    ).toEqual({
      narration: '她翻到下一页，用铅笔圈出公式。',
      responseMarkdown: '你会如何解释 $a=\\sum_{i=1}^{N}i^2$ 中每一项的意义？',
      citations: [{ chunkId: 'chunk-1', quote: '每一项表示一个样本', rationale: '支撑公式含义' }],
      figureReferences: [{ figureId: 'figure-1', rationale: '对照模型结构' }],
    })
  })

  it('rejects blank responses, duplicate ownership references, and oversized collections', () => {
    expect(() =>
      normalizeTutorTurn({
        narration: null,
        responseMarkdown: ' ',
        citations: [],
        figureReferences: [],
      }),
    ).toThrow('Tutor response must not be blank')
    expect(() =>
      normalizeTutorTurn({
        narration: null,
        responseMarkdown: '继续',
        citations: [
          { chunkId: 'chunk-1', quote: '证据', rationale: '理由' },
          { chunkId: 'chunk-1', quote: '证据', rationale: '理由' },
        ],
        figureReferences: [],
      }),
    ).toThrow('Tutor citations must be unique')
    expect(() =>
      normalizeTutorTurn({
        narration: null,
        responseMarkdown: '继续',
        citations: [
          {
            chunkId: 'chunk-1',
            quote: '证据',
            rationale: '理由',
            pageNumberStart: 3,
            pageNumberEnd: 2,
          },
        ],
        figureReferences: [],
      }),
    ).toThrow('Tutor citation page range is invalid')
  })
})
