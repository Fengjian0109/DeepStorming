import { createHash } from 'node:crypto'
import type { DocumentTextHasherPort } from '@deepstorming/application'

export class Sha256DocumentTextHasher implements DocumentTextHasherPort {
  public async hash(input: string): Promise<string> {
    return createHash('sha256').update(input).digest('hex')
  }
}
