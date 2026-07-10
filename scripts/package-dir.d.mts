export type PackagePhase = 'package' | 'restore'
export declare const runPackageWithRestore: (run: (phase: PackagePhase) => number) => number
