import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

import type { AvatarAssetStorePort } from '@deepstorming/application'

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const ASSET_ID = /^[a-f\d]{64}\.(?:png|jpg|jpeg|webp)$/u

export class LocalAvatarStore implements AvatarAssetStorePort {
  private readonly maxBytes: number

  public constructor(
    private readonly rootDir: string,
    options: Readonly<{ maxBytes?: number }> = {},
  ) {
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  }

  public async importAvatar(sourcePath: string): Promise<Readonly<{ assetId: string }>> {
    const extension = extname(sourcePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('Avatar file type is not supported')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('Avatar source is not a file')
    if (sourceStat.size > this.maxBytes) throw new Error('Avatar file is too large')

    const content = await readFile(sourcePath)
    const assetId = `${createHash('sha256').update(content).digest('hex')}${extension}`
    const avatarDirectory = join(this.rootDir, 'avatars')
    const destination = join(avatarDirectory, assetId)
    const temporary = join(avatarDirectory, `.${assetId}.${process.pid}.tmp`)
    await mkdir(avatarDirectory, { recursive: true })
    await copyFile(sourcePath, temporary)
    try {
      await rename(temporary, destination)
    } catch (error) {
      await rm(temporary, { force: true })
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return { assetId }
  }

  public async removeAvatar(assetId: string): Promise<void> {
    if (!ASSET_ID.test(assetId)) throw new Error('Avatar asset id is invalid')
    await rm(join(this.rootDir, 'avatars', assetId), { force: true })
  }
}
