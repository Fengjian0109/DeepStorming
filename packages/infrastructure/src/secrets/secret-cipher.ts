export interface SecretCipher {
  isAvailable(): boolean
  encrypt(secret: string): Uint8Array
  decrypt(ciphertext: Uint8Array): string
}
