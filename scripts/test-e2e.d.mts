export type E2ePhase = 'build' | 'rebuild' | 'test' | 'restore'
export declare const runE2eWithRestore: (run: (phase: E2ePhase) => number) => number
