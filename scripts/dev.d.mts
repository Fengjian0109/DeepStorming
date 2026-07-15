export type DevPhase = 'clean' | 'rebuild' | 'dev' | 'restore'
export declare const runDevWithRestore: (
  run: (phase: DevPhase) => number | Promise<number>,
) => Promise<number>
