import type { IdGeneratorPort, SecretVaultPort } from '@deepstorming/application'
import { constants } from 'node:fs'
import { chmod, link, lstat, mkdir, open, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SecretCipher } from './secret-cipher'

type VaultCode = 'SECRET_WRITE_FAILED' | 'SECRET_VAULT_UNAVAILABLE' | 'SECRET_DELETE_FAILED'

class SecretVaultError extends Error {
  public constructor(public readonly code: VaultCode) {
    super(code)
    this.name = 'SecretVaultError'
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const SECRET_REF = new RegExp(`^${UUID}\\.secret$`)
const TMP_REF = new RegExp(`^${UUID}\\.tmp$`)

type FileSystem = Readonly<{
  chmod: typeof chmod
  mkdir: typeof mkdir
  link: typeof link
  lstat: typeof lstat
  open: typeof open
  readdir: typeof readdir
  rm: typeof rm
}>

const nodeFileSystem: FileSystem = { chmod, mkdir, link, lstat, open, readdir, rm }
const UNSUPPORTED_DIRECTORY_SYNC_CODES = new Set(['EINVAL', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM'])
const NOFOLLOW = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0

export class EncryptedFileSecretVault implements SecretVaultPort {
  private readonly fs: FileSystem

  public constructor(
    private readonly directory: string,
    private readonly cipher: SecretCipher,
    private readonly ids: IdGeneratorPort,
    fileSystem: Partial<FileSystem> = {},
  ) {
    this.fs = { ...nodeFileSystem, ...fileSystem }
  }

  public async put(secret: string): Promise<string> {
    let temporaryPath: string | undefined
    let publishedPath: string | undefined
    try {
      if (!this.cipher.isAvailable()) throw new Error('unavailable')
      const encrypted = this.cipher.encrypt(secret)
      await this.ensureDirectory(true)
      const id = this.ids.generate()
      const ref = `${id}.secret`
      if (!SECRET_REF.test(ref)) throw new Error('invalid id')
      temporaryPath = join(this.directory, `${id}.tmp`)
      const finalPath = join(this.directory, ref)
      const handle = await this.fs.open(temporaryPath, 'wx', 0o600)
      try {
        await handle.writeFile(encrypted)
        await handle.sync()
      } finally {
        await handle.close()
      }
      // Hard-link publication is atomic and exclusive: an existing destination yields EEXIST.
      await this.fs.link(temporaryPath, finalPath)
      publishedPath = finalPath
      await this.fs.rm(temporaryPath)
      temporaryPath = undefined
      try {
        await this.syncDirectory()
      } catch {
        await this.cleanupAmbiguousPublication(finalPath)
        publishedPath = undefined
        throw new Error('directory sync failed')
      }
      publishedPath = undefined
      return ref
    } catch {
      if (temporaryPath !== undefined) {
        try {
          await this.fs.rm(temporaryPath, { force: true })
        } catch {
          // This nonthrow cleanup boundary deliberately discards only path-operation metadata.
          return Promise.reject(new SecretVaultError('SECRET_WRITE_FAILED'))
        }
      }
      if (publishedPath !== undefined) await this.cleanupAmbiguousPublication(publishedPath)
      throw new SecretVaultError('SECRET_WRITE_FAILED')
    }
  }

  public async get(ref: string): Promise<string> {
    if (!SECRET_REF.test(ref)) throw new SecretVaultError('SECRET_VAULT_UNAVAILABLE')
    try {
      if (!this.cipher.isAvailable()) throw new Error('unavailable')
      await this.ensureDirectory(false)
      const path = join(this.directory, ref)
      const beforeOpen = await this.fs.lstat(path)
      if (!this.isExclusiveRegularFile(beforeOpen)) throw new Error('not an exclusive regular file')
      const handle = await this.fs.open(path, constants.O_RDONLY | NOFOLLOW)
      try {
        const afterOpen = await handle.stat()
        if (
          !this.isExclusiveRegularFile(afterOpen) ||
          beforeOpen.dev !== afterOpen.dev ||
          beforeOpen.ino !== afterOpen.ino
        ) {
          throw new Error('file identity changed')
        }
        return this.cipher.decrypt(await handle.readFile())
      } finally {
        await handle.close()
      }
    } catch {
      throw new SecretVaultError('SECRET_VAULT_UNAVAILABLE')
    }
  }

  public async remove(ref: string): Promise<void> {
    if (!SECRET_REF.test(ref)) throw new SecretVaultError('SECRET_DELETE_FAILED')
    try {
      await this.ensureDirectory(false)
      const path = join(this.directory, ref)
      await this.assertStableExclusiveRegularFile(path)
      await this.fs.rm(path)
      await this.syncDirectory()
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new SecretVaultError('SECRET_DELETE_FAILED')
      }
    }
  }

  private async syncDirectory(): Promise<void> {
    let handle
    try {
      handle = await this.fs.open(this.directory, constants.O_RDONLY)
      await handle.sync()
    } catch (error: unknown) {
      if (!UNSUPPORTED_DIRECTORY_SYNC_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
        throw error
      }
      // Some platforms explicitly reject directory handles/fsync; file publication is still atomic.
    } finally {
      await handle?.close()
    }
  }

  public async reconcile(referencedRefs: ReadonlySet<string>): Promise<void> {
    if ([...referencedRefs].some((ref) => !SECRET_REF.test(ref))) {
      throw new SecretVaultError('SECRET_DELETE_FAILED')
    }
    let entries
    try {
      await this.ensureDirectory(false)
      entries = await this.fs.readdir(this.directory, { withFileTypes: true })
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw new SecretVaultError('SECRET_DELETE_FAILED')
    }
    let failed = false
    let deleted = false
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ownedSecret = SECRET_REF.test(entry.name) && !referencedRefs.has(entry.name)
      if (!ownedSecret && !TMP_REF.test(entry.name)) continue
      try {
        const path = join(this.directory, entry.name)
        await this.assertStableExclusiveRegularFile(path)
        await this.fs.rm(path)
        deleted = true
      } catch {
        failed = true
      }
    }
    if (deleted) {
      try {
        await this.syncDirectory()
      } catch {
        failed = true
      }
    }
    if (failed) throw new SecretVaultError('SECRET_DELETE_FAILED')
  }

  private isExclusiveRegularFile(metadata: {
    isFile(): boolean
    isSymbolicLink(): boolean
    nlink: number
  }): boolean {
    return metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1
  }

  private async assertStableExclusiveRegularFile(path: string): Promise<void> {
    const beforeOpen = await this.fs.lstat(path)
    if (!this.isExclusiveRegularFile(beforeOpen)) throw new Error('not an exclusive regular file')
    const handle = await this.fs.open(path, constants.O_RDONLY | NOFOLLOW)
    try {
      const afterOpen = await handle.stat()
      if (
        !this.isExclusiveRegularFile(afterOpen) ||
        beforeOpen.dev !== afterOpen.dev ||
        beforeOpen.ino !== afterOpen.ino
      ) {
        throw new Error('file identity changed')
      }
    } finally {
      await handle.close()
    }
  }

  private async ensureDirectory(create: boolean): Promise<void> {
    if (create) await this.fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const metadata = await this.fs.lstat(this.directory)
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error('unsafe vault directory')
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
      throw new Error('vault directory owner mismatch')
    }
    if (process.platform !== 'win32' && (metadata.mode & 0o777) !== 0o700) {
      await this.fs.chmod(this.directory, 0o700)
      if (((await this.fs.lstat(this.directory)).mode & 0o777) !== 0o700) {
        throw new Error('vault directory permissions unavailable')
      }
    }
  }

  private async cleanupAmbiguousPublication(path: string): Promise<void> {
    try {
      await this.fs.rm(path, { force: true })
      await this.syncDirectory()
    } catch {
      // Publication state is ambiguous only when both the durability sync and safe cleanup fail.
      return
    }
  }
}
