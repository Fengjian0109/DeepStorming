import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { LessonExportPayload } from '@deepstorming/application'
import { MarkdownLessonExporter, PdfLessonExporter } from './lesson-exporters'

const dirs: string[] = []
afterEach(async () =>
  Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))),
)
const token = { cancelled: false, onCancel: () => () => undefined }

const payload = (): LessonExportPayload => ({
  session: {
    id: 'lesson',
    title: '注意力',
    status: 'completed',
    documentId: 'document',
    documentTitle: '深度学习',
    sourceAnchors: [],
    modelRuns: [],
    steps: [],
    masteryEvidence: [],
    misconceptionSignals: [],
    reviewItems: [],
    reviewEvents: [],
    currentState: 'completed',
    lessonMode: 'standard',
    paperProfile: null,
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T01:00:00Z',
    tutorSnapshot: {
      tutorProfileId: 'tutor',
      tutorProfileRevision: 1,
      name: '苏格拉底',
      personality: '耐心',
      tone: '清晰',
      expertiseTags: [],
      strictness: 3,
      socraticIntensity: 4,
      guidanceStyle: 'question_first',
      bookStrategy: '',
      paperStrategy: '',
      customInstructions: '',
      promptVersion: 'secret-prompt',
    },
    messages: [
      {
        id: 'm1',
        lessonId: 'lesson',
        modelRunId: null,
        role: 'learner',
        content: '我得到 $a=\\sum_{i=1}^{N}i^2$',
        sourceAnchorIds: [],
        promptVersion: 'exported',
        createdAt: '2026-07-15T00:00:00Z',
      },
      {
        id: 'm2',
        lessonId: 'lesson',
        modelRunId: null,
        role: 'tutor',
        content: 'legacy',
        sourceAnchorIds: [],
        promptVersion: 'exported',
        createdAt: '2026-07-15T00:01:00Z',
        tutorTurn: {
          narration: '导师指向图示。',
          responseMarkdown: '观察这个映射。',
          citations: [
            {
              chunkId: 'private-chunk',
              quote: '注意力是一种映射',
              rationale: '核心定义',
              pageNumberStart: 2,
              pageNumberEnd: 2,
            },
          ],
          figureReferences: [{ figureId: 'figure-1', rationale: '展示结构' }],
        },
      },
    ],
  },
  figures: [
    {
      figure: {
        id: 'figure-1',
        documentId: 'document',
        pageNumber: 2,
        label: '图 1',
        caption: '注意力结构',
        assetId: 'asset-secret',
        assetKind: 'embedded_image',
        width: 20,
        height: 10,
        createdAt: '2026-07-15T00:00:00Z',
      },
      data: new Uint8Array([1, 2, 3]),
    },
  ],
})

it('writes UTF-8 Markdown with ordered turns, LaTeX, citations and relative figure assets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-export-'))
  dirs.push(dir)
  const path = join(dir, '课堂.md')
  await new MarkdownLessonExporter().export(payload(), path, token)
  const content = await readFile(path, 'utf8')
  expect(content).toContain('## 我')
  expect(content).toContain('$a=\\sum_{i=1}^{N}i^2$')
  expect(content).toContain('## 苏格拉底')
  expect(content).toContain('> 注意力是一种映射')
  expect(content).toContain('![图 1](课堂-assets/figure-1.png)')
  expect(content).not.toContain('private-chunk')
  expect(content).not.toContain('secret-prompt')
  expect([...(await readFile(join(dir, '课堂-assets', 'figure-1.png')))]).toEqual([1, 2, 3])
})

it('builds safe printable HTML and delegates the final PDF rendering', async () => {
  let captured = ''
  const exporter = new PdfLessonExporter({
    render: async (html) => {
      captured = html
    },
  })
  await exporter.export(payload(), '/tmp/课堂.pdf', token)
  expect(captured).toContain('lang="zh-CN"')
  expect(captured).toContain('data:image/png;base64,AQID')
  expect(captured).toContain('class="katex math-inline"')
  expect(captured).toContain('注意力是一种映射')
  expect(captured).not.toContain('private-chunk')
  expect(captured).not.toContain('secret-prompt')
})
