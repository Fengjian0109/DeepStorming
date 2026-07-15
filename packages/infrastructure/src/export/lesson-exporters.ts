import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type {
  CancellationToken,
  LessonExportPayload,
  LessonTranscriptExporterPort,
} from '@deepstorming/application'
import katex from 'katex'

const assertActive = (token: CancellationToken): void => {
  if (token.cancelled) throw new Error('cancelled')
}
const safeAssetName = (id: string): string => id.replace(/[^\w.-]/gu, '_').slice(0, 120)
const tutorName = (payload: LessonExportPayload): string =>
  payload.session.tutorSnapshot?.name ?? '导师'

const toMarkdown = (payload: LessonExportPayload, assetDirectoryName: string): string => {
  const figures = new Map(payload.figures.map((entry) => [entry.figure.id, entry.figure]))
  const sections = payload.session.messages.map((message) => {
    const turn = message.tutorTurn
    const label = message.role === 'learner' ? '我' : tutorName(payload)
    const narration = turn?.narration ? `\n\n*${turn.narration.replace(/\*/gu, '\\*')}*` : ''
    const citations =
      turn?.citations
        .map((citation) => {
          const pages =
            citation.pageNumberStart === undefined
              ? ''
              : `（第 ${citation.pageNumberStart}${citation.pageNumberEnd === citation.pageNumberStart ? '' : `–${citation.pageNumberEnd}`} 页）`
          return `> ${citation.quote.replace(/\n/gu, '\n> ')}\n>\n> ${citation.rationale}${pages}`
        })
        .join('\n\n') ?? ''
    const images =
      turn?.figureReferences
        .flatMap((reference) => {
          const figure = figures.get(reference.figureId)
          return figure === undefined
            ? []
            : [
                `![${figure.label}](${assetDirectoryName}/${safeAssetName(figure.id)}.png)\n\n*${figure.caption} · ${reference.rationale}*`,
              ]
        })
        .join('\n\n') ?? ''
    return `## ${label}\n\n${turn?.responseMarkdown ?? message.content}${narration}${citations ? `\n\n${citations}` : ''}${images ? `\n\n${images}` : ''}`
  })
  return `# ${payload.session.title}\n\n- 教材：${payload.session.documentTitle}\n- 开始：${payload.session.createdAt}\n- 更新：${payload.session.updatedAt}\n\n${sections.join('\n\n---\n\n')}\n`
}

export class MarkdownLessonExporter implements LessonTranscriptExporterPort {
  async export(
    payload: LessonExportPayload,
    targetPath: string,
    token: CancellationToken,
  ): Promise<void> {
    assertActive(token)
    const base = basename(targetPath, extname(targetPath))
    const assetName = `${base}-assets`
    const assetDirectory = join(dirname(targetPath), assetName)
    await mkdir(dirname(targetPath), { recursive: true })
    if (payload.figures.length > 0) await mkdir(assetDirectory, { recursive: true })
    for (const entry of payload.figures) {
      assertActive(token)
      await writeFile(join(assetDirectory, `${safeAssetName(entry.figure.id)}.png`), entry.data)
    }
    assertActive(token)
    await writeFile(targetPath, toMarkdown(payload, assetName), 'utf8')
  }
}

export interface HtmlToPdfPort {
  render(html: string, targetPath: string, token: CancellationToken): Promise<void>
}
const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
const renderInline = (value: string): string =>
  value
    .split(/(\$[^$\n]+\$)/gu)
    .map((part) => {
      if (part.startsWith('$') && part.endsWith('$')) {
        try {
          return katex
            .renderToString(part.slice(1, -1), {
              throwOnError: false,
              output: 'html',
              strict: 'ignore',
            })
            .replace('class="katex"', 'class="katex math-inline"')
        } catch {
          return `<code class="math-inline">${escapeHtml(part)}</code>`
        }
      }
      return escapeHtml(part).replace(/\n/gu, '<br>')
    })
    .join('')

const printableHtml = (payload: LessonExportPayload): string => {
  const figures = new Map(payload.figures.map((entry) => [entry.figure.id, entry]))
  const messages = payload.session.messages
    .map((message) => {
      const turn = message.tutorTurn
      const narration = turn?.narration
        ? `<p class="narration">${renderInline(turn.narration)}</p>`
        : ''
      const citations =
        turn?.citations
          .map((citation) => {
            const page =
              citation.pageNumberStart === undefined
                ? ''
                : `<span>第 ${citation.pageNumberStart}${citation.pageNumberEnd === citation.pageNumberStart ? '' : `–${citation.pageNumberEnd}`} 页</span>`
            return `<blockquote><p>${renderInline(citation.quote)}</p><footer>${renderInline(citation.rationale)} ${page}</footer></blockquote>`
          })
          .join('') ?? ''
      const images =
        turn?.figureReferences
          .flatMap((reference) => {
            const entry = figures.get(reference.figureId)
            return entry === undefined
              ? []
              : [
                  `<figure><img src="data:image/png;base64,${Buffer.from(entry.data).toString('base64')}" alt="${escapeHtml(entry.figure.label)}"><figcaption>${escapeHtml(entry.figure.caption)} · ${escapeHtml(reference.rationale)}</figcaption></figure>`,
                ]
          })
          .join('') ?? ''
      const label = message.role === 'learner' ? '我' : escapeHtml(tutorName(payload))
      return `<article><h2>${label}</h2>${narration}<div>${renderInline(turn?.responseMarkdown ?? message.content)}</div>${citations}${images}</article>`
    })
    .join('')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans CJK SC",sans-serif;color:#1f2d28;line-height:1.65}h2{font-size:16px;color:#225c46}article{break-inside:avoid;margin:22px 0;padding:16px;border:1px solid #d8e1dc;border-radius:12px}.narration,figcaption,blockquote footer{color:#6c7772}.narration{font-style:italic}blockquote{padding:10px 14px;background:#eef3f0;border-left:4px solid #438768}img{max-width:100%;max-height:520px}.katex{font-family:KaTeX_Main,"Times New Roman",serif}.math-inline{white-space:nowrap}</style></head><body><h1>${escapeHtml(payload.session.title)}</h1><div>教材：${escapeHtml(payload.session.documentTitle)}</div>${messages}</body></html>`
}

export class PdfLessonExporter implements LessonTranscriptExporterPort {
  public constructor(private readonly renderer: HtmlToPdfPort) {}
  async export(
    payload: LessonExportPayload,
    targetPath: string,
    token: CancellationToken,
  ): Promise<void> {
    assertActive(token)
    await this.renderer.render(printableHtml(payload), targetPath, token)
  }
}
