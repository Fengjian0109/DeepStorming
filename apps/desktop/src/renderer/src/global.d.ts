import type { DeepStormingApi } from '@deepstorming/contracts'

declare global {
  interface Window {
    deepstorming: DeepStormingApi
  }
}

export {}
