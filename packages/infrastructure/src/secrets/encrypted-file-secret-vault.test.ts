import {
  chmod,
  link,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EncryptedFileSecretVault } from './encrypted-file-secret-vault'
import type { SecretCipher } from './secret-cipher'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER = '123e4567-e89b-42d3-a456-426614174001'
class FakeCipher implements SecretCipher {
  available = true
  isAvailable = () => this.available
  encrypt = (value: string) => Buffer.from(`cipher:${Buffer.from(value).toString('base64')}`)
  decrypt = (value: Uint8Array) => {
    const text = Buffer.from(value).toString()
    if (!text.startsWith('cipher:')) throw new Error('corrupt raw detail')
    return Buffer.from(text.slice(7), 'base64').toString()
  }
}

let dir: string, cipher: FakeCipher
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'deepstorming-vault-'))
  cipher = new FakeCipher()
})
afterEach(async () => rm(dir, { recursive: true, force: true }))

test('puts encrypted bytes atomically with a UUID reference and restrictive mode', async () => {
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ID })
  const ref = await vault.put('UNIQUE_TEST_KEY_7')
  expect(ref).toBe(`${ID}.secret`)
  expect((await readFile(join(dir, ref))).toString()).not.toContain('UNIQUE_TEST_KEY_7')
  expect(await readdir(dir)).toEqual([ref])
  if (process.platform !== 'win32') expect((await lstat(join(dir, ref))).mode & 0o777).toBe(0o600)
})

test('gets, removes idempotently, and maps unavailable or corrupt content safely', async () => {
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ID })
  const ref = await vault.put('value')
  expect(await vault.get(ref)).toBe('value')
  await vault.remove(ref)
  await vault.remove(ref)
  await expect(vault.get(ref)).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })
  cipher.available = false
  await expect(vault.put('hidden')).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
})

test('rejects malformed and foreign references before filesystem access', async () => {
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ID })
  for (const ref of ['../x.secret', '/tmp/x.secret', ID, `${ID}.tmp`, 'other.secret']) {
    await expect(vault.get(ref)).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })
    await expect(vault.remove(ref)).rejects.toMatchObject({ code: 'SECRET_DELETE_FAILED' })
  }
})

test('reconciles owned orphan and tmp files while retaining references, unknown files, and symlinks', async () => {
  const ids = [ID, OTHER]
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ids.shift()! })
  const kept = await vault.put('kept')
  const orphan = await vault.put('orphan')
  await import('node:fs/promises').then(({ writeFile }) =>
    Promise.all([
      writeFile(join(dir, 'notes.txt'), 'leave'),
      writeFile(join(dir, `${ID}.tmp`), 'stale'),
      symlink(join(dir, orphan), join(dir, 'linked.secret')),
    ]),
  )
  await vault.reconcile(new Set([kept]))
  expect((await readdir(dir)).sort()).toEqual([kept, 'linked.secret', 'notes.txt'].sort())
})

test('never overwrites a UUID collision or destination created immediately before publication', async () => {
  const first = new EncryptedFileSecretVault(dir, cipher, { generate: () => ID })
  await first.put('first')
  await expect(first.put('second')).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
  expect(await first.get(`${ID}.secret`)).toBe('first')

  const racing = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => OTHER },
    {
      link: async (temporaryPath, finalPath) => {
        await writeFile(finalPath, 'cipher:cmFjZXI=', { mode: 0o600 })
        await link(temporaryPath, finalPath)
      },
    },
  )
  await expect(racing.put('third')).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
  expect((await readFile(join(dir, `${OTHER}.secret`))).toString()).toBe('cipher:cmFjZXI=')
  expect((await readdir(dir)).filter((name) => name === `${OTHER}.tmp`)).toEqual([])
})

test('syncs the containing directory after exclusive publication and temporary unlink', async () => {
  const events: string[] = []
  const vault = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      link: async (from, to) => {
        await link(from, to)
        events.push('publish')
      },
      rm: async (path, options) => {
        await rm(path, options)
        if (String(path).endsWith('.tmp')) events.push('unlink-temp')
      },
      open: (async (path: string, flags: string | number, mode?: number) => {
        const handle = await open(path, flags, mode)
        if (path !== dir) return handle
        return {
          sync: async () => {
            events.push('sync-directory')
            await handle.sync()
          },
          close: () => handle.close(),
        }
      }) as never,
    },
  )
  await vault.put('value')
  expect(events).toEqual(['publish', 'unlink-temp', 'sync-directory'])
})

test('never follows a valid secret-reference symlink', async () => {
  const target = join(dir, 'external')
  await writeFile(target, 'cipher:c3RvbGVu')
  const ref = `${ID}.secret`
  await symlink(target, join(dir, ref))
  const decrypt = vi.spyOn(cipher, 'decrypt')
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => OTHER })
  await expect(vault.get(ref)).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })
  expect(decrypt).not.toHaveBeenCalled()
})

test('closes the read handle after decrypting', async () => {
  const close = vi.fn(async () => undefined)
  const regularFile = { isFile: () => true, isSymbolicLink: () => false, dev: 1, ino: 2, nlink: 1 }
  const vault = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      lstat: (async (path: string) => (path === dir ? lstat(dir) : regularFile)) as never,
      open: (async () => ({
        stat: async () => regularFile,
        readFile: async () => Buffer.from('cipher:dmFsdWU='),
        close,
      })) as never,
    },
  )
  expect(await vault.get(`${ID}.secret`)).toBe('value')
  expect(close).toHaveBeenCalledOnce()
})

test('syncs the directory after remove and reconciles every candidate before one stable failure', async () => {
  const ids = [ID, OTHER]
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ids.shift()! })
  const first = await vault.put('first')
  const second = await vault.put('second')
  const events: string[] = []
  let failFirst = true
  const observed = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      rm: async (path, options) => {
        events.push(`remove:${String(path).split('/').at(-1)}`)
        if (failFirst && String(path).endsWith(first)) throw new Error('one failure')
        await rm(path, options)
      },
      open: (async (path: string, flags: string | number, mode?: number) => {
        const handle = await open(path, flags, mode)
        if (path !== dir) return handle
        return { sync: async () => events.push('sync'), close: () => handle.close() }
      }) as never,
    },
  )
  await expect(observed.reconcile(new Set())).rejects.toMatchObject({
    code: 'SECRET_DELETE_FAILED',
  })
  expect(events).toEqual([`remove:${first}`, `remove:${second}`, 'sync'])
  events.length = 0
  failFirst = false
  await observed.remove(first)
  expect(events).toEqual([`remove:${first}`, 'sync'])
})

test('rejects an lstat-to-open identity swap and multiply-linked managed secrets', async () => {
  const regular = (ino: number, nlink = 1) => ({
    isFile: () => true,
    isSymbolicLink: () => false,
    dev: 1,
    ino,
    nlink,
  })
  const decrypt = vi.spyOn(cipher, 'decrypt')
  const swapped = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      lstat: (async (path: string) => (path === dir ? lstat(dir) : regular(1))) as never,
      open: (async () => ({
        stat: async () => regular(2),
        readFile: async () => Buffer.from('cipher:c3RvbGVu'),
        close: async () => undefined,
      })) as never,
    },
  )
  await expect(swapped.get(`${ID}.secret`)).rejects.toMatchObject({
    code: 'SECRET_VAULT_UNAVAILABLE',
  })
  expect(decrypt).not.toHaveBeenCalled()

  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => ID })
  const ref = await vault.put('owned')
  await link(join(dir, ref), join(dir, 'foreign-hardlink'))
  await expect(vault.get(ref)).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })
  await expect(vault.remove(ref)).rejects.toMatchObject({ code: 'SECRET_DELETE_FAILED' })
  await expect(vault.reconcile(new Set())).rejects.toMatchObject({ code: 'SECRET_DELETE_FAILED' })
  expect(await readFile(join(dir, ref))).toBeDefined()
})

test('repairs a permissive existing vault directory and rejects a directory symlink', async () => {
  if (process.platform !== 'win32') {
    await chmod(dir, 0o755)
    await new EncryptedFileSecretVault(dir, cipher, { generate: () => ID }).put('value')
    expect((await lstat(dir)).mode & 0o777).toBe(0o700)
  }
  const target = await mkdtemp(join(tmpdir(), 'deepstorming-vault-target-'))
  const alias = join(dir, 'alias')
  await symlink(target, alias)
  await expect(
    new EncryptedFileSecretVault(alias, cipher, { generate: () => OTHER }).put('hidden'),
  ).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
  expect(await readdir(target)).toEqual([])
  await rm(target, { recursive: true, force: true })
})

test('accepts only lowercase canonical UUID references and never misclassifies mixed case', async () => {
  const uppercase = ID.toUpperCase()
  const vault = new EncryptedFileSecretVault(dir, cipher, { generate: () => uppercase })
  await expect(vault.put('hidden')).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
  expect(await readdir(dir)).toEqual([])
  const canonical = await new EncryptedFileSecretVault(dir, cipher, { generate: () => ID }).put(
    'retained',
  )
  for (const ref of [`${uppercase}.secret`, `${ID}.SECRET`]) {
    await expect(vault.get(ref)).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })
    await expect(vault.remove(ref)).rejects.toMatchObject({ code: 'SECRET_DELETE_FAILED' })
    await expect(vault.reconcile(new Set([ref]))).rejects.toMatchObject({
      code: 'SECRET_DELETE_FAILED',
    })
    expect(await readFile(join(dir, canonical))).toBeDefined()
  }
})

test('removes a published final file and resyncs when the first directory fsync fails', async () => {
  let directorySyncs = 0
  const vault = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      open: (async (path: string, flags: string | number, mode?: number) => {
        const handle = await open(path, flags, mode)
        if (path !== dir) return handle
        return {
          sync: async () => {
            directorySyncs += 1
            if (directorySyncs === 1)
              throw Object.assign(new Error('disk failure'), { code: 'EIO' })
            await handle.sync()
          },
          close: () => handle.close(),
        }
      }) as never,
    },
  )
  await expect(vault.put('never-returned')).rejects.toMatchObject({ code: 'SECRET_WRITE_FAILED' })
  expect(directorySyncs).toBe(2)
  expect(await readdir(dir)).toEqual([])
})

test('uses the named unsupported-directory-fsync branch and still closes the directory handle', async () => {
  const closeDirectory = vi.fn(async () => undefined)
  const vault = new EncryptedFileSecretVault(
    dir,
    cipher,
    { generate: () => ID },
    {
      open: (async (path: string, flags: string | number, mode?: number) => {
        if (path !== dir) return open(path, flags, mode)
        return {
          sync: async () => {
            throw Object.assign(new Error('unsupported'), { code: 'EINVAL' })
          },
          close: closeDirectory,
        }
      }) as never,
    },
  )
  await expect(vault.put('value')).resolves.toBe(`${ID}.secret`)
  expect(closeDirectory).toHaveBeenCalledOnce()
})
