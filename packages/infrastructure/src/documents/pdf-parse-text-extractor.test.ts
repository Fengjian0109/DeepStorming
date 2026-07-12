import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { PdfParseTextExtractor } from './pdf-parse-text-extractor'

const dirs: string[] = []
const fixtureText = 'Evidence connects a claim to observable behavior.'

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const pdfStringWith = (text: string): string => {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${`BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return pdf
}

test('extracts text pages and blocks from a text PDF', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-pdf-extract-'))
  dirs.push(dir)
  const pdfPath = join(dir, 'paper.pdf')
  await writeFile(pdfPath, pdfStringWith(fixtureText), 'utf8')

  const result = await new PdfParseTextExtractor().extract(pdfPath)

  expect(result.pages).toEqual([
    {
      pageNumber: 1,
      width: 612,
      height: 792,
      text: fixtureText,
      blocks: [{ text: fixtureText }],
    },
  ])
})
