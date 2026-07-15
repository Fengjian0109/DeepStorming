import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { LocalPdfFileStore } from './local-pdf-file-store'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-pdf-store-'))
  dirs.push(dir)
  await mkdir(join(dir, 'source'), { recursive: true })
  await writeFile(join(dir, 'source', 'paper.pdf'), 'pdf bytes')
  return dir
}

test('describes and copies PDF files into an app-private relative path', async () => {
  const dir = await setup()
  const store = new LocalPdfFileStore(join(dir, 'library'))
  const source = join(dir, 'source', 'paper.pdf')

  const description = await store.describe(source)
  const copied = await store.copyIntoLibrary({
    filePath: source,
    contentHash: description.contentHash,
  })

  expect(description).toEqual({
    fileSizeBytes: 9,
    contentHash: 'd1cb546b102fab8362de413fdacc187b05be10df72b72db3b3e50b4953f6a555',
  })
  expect(copied.storedPath).toBe(
    'documents/d1/d1cb546b102fab8362de413fdacc187b05be10df72b72db3b3e50b4953f6a555.pdf',
  )
  expect(copied.storedPath).not.toContain(dir)
  expect(copied.processingPath).toBe(join(dir, 'library', copied.storedPath))
  await expect(readFile(join(dir, 'library', copied.storedPath), 'utf8')).resolves.toBe('pdf bytes')
})
