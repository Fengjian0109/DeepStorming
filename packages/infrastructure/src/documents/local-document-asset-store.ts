import { constants } from 'node:fs'
import { access, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import type { DocumentAssetStorePort } from '@deepstorming/application'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_FIGURE_BYTES = 20 * 1024 * 1024

const validateId = (value: string): void => {
  if (!UUID.test(value)) throw new Error('Document asset identifier is invalid')
}

const isPng = (data: Uint8Array): boolean =>
  data.length >= PNG_SIGNATURE.length &&
  PNG_SIGNATURE.every((value, index) => data[index] === value)

export class LocalDocumentAssetStore implements DocumentAssetStorePort {
  public constructor(private readonly rootDirectory: string) {}

  public async writeFigure(
    input: Readonly<{ documentId: string; assetId: string; data: Uint8Array }>,
  ): Promise<Readonly<{ assetId: string; storedPath: string }>> {
    validateId(input.documentId)
    validateId(input.assetId)
    if (!isPng(input.data)) throw new Error('Document figure asset must be PNG data')
    if (input.data.byteLength > MAX_FIGURE_BYTES)
      throw new Error('Document figure asset is too large')

    const directory = resolve(this.rootDirectory, 'figures', input.documentId)
    const storedPath = join(directory, `${input.assetId}.png`)
    await mkdir(directory, { recursive: true, mode: 0o700 })

    try {
      await access(storedPath, constants.F_OK)
      await this.assertSameContent(storedPath, input.data)
      return { assetId: input.assetId, storedPath }
    } catch (error) {
      if (error instanceof Error && !('code' in error && error.code === 'ENOENT')) throw error
    }

    const temporaryPath = join(directory, `.${input.assetId}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, input.data, { flag: 'wx', mode: 0o600 })
      try {
        await link(temporaryPath, storedPath)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
        await this.assertSameContent(storedPath, input.data)
      }
    } finally {
      await rm(temporaryPath, { force: true })
    }
    return { assetId: input.assetId, storedPath }
  }

  public async deleteFigure(documentId: string, assetId: string): Promise<void> {
    validateId(documentId)
    validateId(assetId)
    await rm(resolve(this.rootDirectory, 'figures', documentId, `${assetId}.png`), { force: true })
  }

  private async assertSameContent(path: string, data: Uint8Array): Promise<void> {
    if (!(await readFile(path)).equals(Buffer.from(data))) {
      throw new Error('Document figure retry contains different content')
    }
  }
}
