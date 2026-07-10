import type { DeepStormingBootstrapApi } from '@deepstorming/contracts'

declare global {
  interface Window {
    deepstorming: DeepStormingBootstrapApi
  }
}

export {}
