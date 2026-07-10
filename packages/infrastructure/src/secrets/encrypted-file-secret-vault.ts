import type { IdGeneratorPort, SecretVaultPort } from '@deepstorming/application'
import { mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises'
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
const SECRET_REF = new RegExp(`^${UUID}\\.secret$`, 'i')
const TMP_REF = new RegExp(`^${UUID}\\.tmp$`, 'i')

type FileSystem = Readonly<{
  mkdir: typeof mkdir
  open: typeof open
  readdir: typeof readdir
  rename: typeof rename
  rm: typeof rm
  stat: typeof stat
}>

const nodeFileSystem: FileSystem = { mkdir, open, readdir, rename, rm, stat }

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
    try {
      if (!this.cipher.isAvailable()) throw new Error('unavailable')
      const encrypted = this.cipher.encrypt(secret)
      await this.fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
      const id = this.ids.generate()
      const ref = `${id}.secret`
      if (!SECRET_REF.test(ref)) throw new Error('invalid id')
      temporaryPath = join(this.directory, `${id}.tmp`)
      const finalPath = join(this.directory, ref)
      try {
        await this.fs.stat(finalPath)
        throw new Error('collision')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const handle = await this.fs.open(temporaryPath, 'wx', 0o600)
      try {
        await handle.writeFile(encrypted)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await this.fs.rename(temporaryPath, finalPath)
      temporaryPath = undefined
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
      throw new SecretVaultError('SECRET_WRITE_FAILED')
    }
  }

  public async get(ref: string): Promise<string> {
    if (!SECRET_REF.test(ref)) throw new SecretVaultError('SECRET_VAULT_UNAVAILABLE')
    try {
      if (!this.cipher.isAvailable()) throw new Error('unavailable')
      const handle = await this.fs.open(join(this.directory, ref), 'r')
      try {
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
      await this.fs.rm(join(this.directory, ref))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new SecretVaultError('SECRET_DELETE_FAILED')
      }
    }
  }

  public async reconcile(referencedRefs: ReadonlySet<string>): Promise<void> {
    if ([...referencedRefs].some((ref) => !SECRET_REF.test(ref))) {
      throw new SecretVaultError('SECRET_DELETE_FAILED')
    }
    let entries
    try {
      entries = await this.fs.readdir(this.directory, { withFileTypes: true })
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw new SecretVaultError('SECRET_DELETE_FAILED')
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ownedSecret = SECRET_REF.test(entry.name) && !referencedRefs.has(entry.name)
      if (!ownedSecret && !TMP_REF.test(entry.name)) continue
      try {
        await this.fs.rm(join(this.directory, entry.name))
      } catch {
        throw new SecretVaultError('SECRET_DELETE_FAILED')
      }
    }
  }
}
