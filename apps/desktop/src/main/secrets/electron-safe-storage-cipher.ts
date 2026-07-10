import type { SecretCipher } from '@deepstorming/infrastructure'
import { safeStorage } from 'electron'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export class ElectronSafeStorageCipher implements SecretCipher {
  public constructor(private readonly storage: SafeStorageLike = safeStorage) {}

  public isAvailable(): boolean {
    return this.storage.isEncryptionAvailable()
  }

  public encrypt(secret: string): Uint8Array {
    if (!this.isAvailable()) throw new Error('Safe storage is unavailable')
    return this.storage.encryptString(secret)
  }

  public decrypt(ciphertext: Uint8Array): string {
    if (!this.isAvailable()) throw new Error('Safe storage is unavailable')
    return this.storage.decryptString(Buffer.from(ciphertext))
  }
}
