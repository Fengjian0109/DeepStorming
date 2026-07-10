import { expect, test, vi } from 'vitest'
import { ElectronSafeStorageCipher } from './electron-safe-storage-cipher'

test('delegates availability, encryption, and decryption to safeStorage', () => {
  const safeStorage = {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn(() => Buffer.from('cipher')),
    decryptString: vi.fn(() => 'plain'),
  }
  const cipher = new ElectronSafeStorageCipher(safeStorage)
  expect(cipher.isAvailable()).toBe(true)
  expect(cipher.encrypt('plain')).toEqual(Buffer.from('cipher'))
  expect(cipher.decrypt(Buffer.from('cipher'))).toBe('plain')
  expect(safeStorage.encryptString).toHaveBeenCalledWith('plain')
})

test('rejects encryption and decryption while safe storage is unavailable', () => {
  const cipher = new ElectronSafeStorageCipher({
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.from('x'),
    decryptString: () => 'x',
  })
  expect(() => cipher.encrypt('secret')).toThrow('Safe storage is unavailable')
  expect(() => cipher.decrypt(Buffer.from('x'))).toThrow('Safe storage is unavailable')
})
