import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  ExtractDocumentFigures,
  ImportPdfDocument,
  RebuildDocumentChunks,
} from '@deepstorming/application'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { afterEach, expect, test } from 'vitest'

import { LocalDocumentAssetStore } from './local-document-asset-store'
import { PdfFigureExtractor } from './pdf-figure-extractor'
import { PdfParseTextExtractor } from './pdf-parse-text-extractor'
import { LocalPdfFileStore } from './local-pdf-file-store'
import { Sha256DocumentTextHasher } from './sha256-document-text-hasher'
import { migrateDatabase } from '../database/migrations'
import { openDatabase } from '../database/database'
import { SqliteDocumentImportRepository } from '../database/sqlite-document-import-repository'
import { SqliteDocumentRepository } from '../database/sqlite-document-repository'

const roots: string[] = []
const liveToken = { cancelled: false, onCancel: () => () => undefined }
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test('parses and persists figures from the rich desktop acceptance PDF', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deepstorming-rich-pipeline-'))
  roots.push(root)
  const filePath = join(root, 'rich-evidence.pdf')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(onePixelPng)
  const page = pdf.addPage([500, 500])
  page.drawText('Evidence connects claims to observations.', { x: 60, y: 440, size: 12, font })
  page.drawImage(image, { x: 80, y: 150, width: 300, height: 210 })
  page.drawText('Fig. 2. Embedded result', { x: 80, y: 120, size: 12, font })
  await writeFile(filePath, await pdf.save())

  const text = await new PdfParseTextExtractor().extract(filePath)
  expect(text.pages[0]?.text).toContain('Evidence connects claims to observations.')
  const figures = await new PdfFigureExtractor().extract(
    {
      filePath,
      pages: text.pages.map((value) => ({ pageNumber: value.pageNumber, text: value.text })),
    },
    liveToken,
  )
  expect(figures).toHaveLength(1)

  await expect(
    new LocalDocumentAssetStore(join(root, 'assets')).writeFigure({
      documentId: '00000000-0000-4000-8000-000000000001',
      assetId: '00000000-0000-4000-8000-000000000002',
      data: figures[0]!.data,
    }),
  ).resolves.toMatchObject({ assetId: '00000000-0000-4000-8000-000000000002' })
})

test('imports the rich desktop acceptance PDF through the complete persisted pipeline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deepstorming-rich-import-'))
  roots.push(root)
  const filePath = join(root, 'rich-evidence.pdf')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(onePixelPng)
  const page = pdf.addPage([500, 500])
  page.drawText('Evidence connects claims to observations.', { x: 60, y: 440, size: 12, font })
  page.drawImage(image, { x: 80, y: 150, width: 300, height: 210 })
  page.drawText('Fig. 2. Embedded result', { x: 80, y: 120, size: 12, font })
  await writeFile(filePath, await pdf.save())

  const databasePath = join(root, 'deepstorming.sqlite3')
  const db = openDatabase(databasePath)
  try {
    await migrateDatabase(db, { databasePath, userDataPath: root })
    const documents = new SqliteDocumentRepository(db)
    const imports = new SqliteDocumentImportRepository(db)
    const assets = new LocalDocumentAssetStore(join(root, 'assets'))
    const clock = { now: () => new Date().toISOString() }
    const figures = new ExtractDocumentFigures(imports, new PdfFigureExtractor(), assets, clock, {
      generate: randomUUID,
    })
    const result = await new ImportPdfDocument(
      documents,
      imports,
      new LocalPdfFileStore(join(root, 'files')),
      new PdfParseTextExtractor(),
      new Sha256DocumentTextHasher(),
      clock,
      { generate: randomUUID },
      new RebuildDocumentChunks(documents, imports),
      figures,
    ).execute({ filePath, originalName: 'rich-evidence.pdf' })

    expect(result).toMatchObject({ status: 'ready', error: null })
    await expect(imports.listFigures(result.documentId!)).resolves.toHaveLength(1)
  } finally {
    db.close()
  }
})
