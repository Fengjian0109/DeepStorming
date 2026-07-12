import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { PdfFileDescription, PdfFileStorePort, StoredPdfFile } from '@deepstorming/application'

export class LocalPdfFileStore implements PdfFileStorePort {
  public constructor(private readonly rootDir: string) {}

  public async describe(filePath: string): Promise<PdfFileDescription> {
    const [fileStat, content] = await Promise.all([stat(filePath), readFile(filePath)])
    return {
      fileSizeBytes: fileStat.size,
      contentHash: createHash('sha256').update(content).digest('hex'),
    }
  }

  public async copyIntoLibrary(
    input: Readonly<{ filePath: string; contentHash: string }>,
  ): Promise<StoredPdfFile> {
    const prefix = input.contentHash.slice(0, 2)
    const storedPath = join('documents', prefix, `${input.contentHash}.pdf`)
    const absolutePath = join(this.rootDir, storedPath)
    await mkdir(join(this.rootDir, 'documents', prefix), { recursive: true })
    await copyFile(input.filePath, absolutePath)
    return { storedPath }
  }
}
