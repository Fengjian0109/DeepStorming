import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { afterEach, describe, expect, it } from 'vitest'

import { PdfFigureExtractor } from './pdf-figure-extractor'

const roots: string[] = []
const liveToken = { cancelled: false, onCancel: () => () => undefined }
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const writePdf = async (withImage: boolean): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'deepstorming-figure-'))
  roots.push(root)
  const path = join(root, 'paper.pdf')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([400, 400])
  if (withImage) {
    const image = await pdf.embedPng(onePixelPng)
    page.drawImage(image, { x: 70, y: 100, width: 240, height: 180 })
  } else {
    page.drawRectangle({ x: 70, y: 100, width: 240, height: 180, color: rgb(0.2, 0.6, 0.4) })
  }
  page.drawText(withImage ? 'Fig. 2. Embedded result' : 'Figure 1: Vector result', {
    x: 70,
    y: 70,
    size: 12,
    font,
  })
  await writeFile(path, await pdf.save())
  return path
}

describe('PdfFigureExtractor', () => {
  it('uses an embedded image when a caption is present', async () => {
    const path = await writePdf(true)
    const result = await new PdfFigureExtractor().extract(
      {
        filePath: path,
        pages: [{ pageNumber: 1, text: 'Fig. 2. Embedded result' }],
      },
      liveToken,
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      pageNumber: 1,
      label: 'Fig. 2',
      caption: 'Embedded result',
      assetKind: 'embedded_image',
    })
    expect([...result[0]!.data.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  it('falls back to a rendered page when no embedded image can be matched', async () => {
    const path = await writePdf(false)
    const result = await new PdfFigureExtractor().extract(
      {
        filePath: path,
        pages: [{ pageNumber: 1, text: 'Figure 1: Vector result' }],
      },
      liveToken,
    )

    expect(result[0]).toMatchObject({ assetKind: 'page_render', width: 1200 })
    expect(result[0]!.data.byteLength).toBeGreaterThan(100)
  })

  it('returns no assets for a text-only page without captions and honors cancellation', async () => {
    const path = await writePdf(false)
    await expect(
      new PdfFigureExtractor().extract(
        { filePath: path, pages: [{ pageNumber: 1, text: 'Ordinary paragraph' }] },
        liveToken,
      ),
    ).resolves.toEqual([])
    await expect(
      new PdfFigureExtractor().extract(
        { filePath: path, pages: [{ pageNumber: 1, text: 'Figure 1: Vector result' }] },
        { cancelled: true, onCancel: () => () => undefined },
      ),
    ).rejects.toThrow('cancelled')
  })
})
