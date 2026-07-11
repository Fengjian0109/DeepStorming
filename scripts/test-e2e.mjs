import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

const run = (label, args, cwd) => {
  process.stdout.write(`[test-e2e] ${label}\n`)
  return spawnSync(process.execPath, args, { cwd, stdio: 'inherit' }).status ?? 1
}

export const runE2eWithRestore = (runPhase) => {
  const buildStatus = runPhase('build')
  if (buildStatus !== 0) return buildStatus

  let status = 1
  try {
    status = runPhase('rebuild')
    if (status === 0) status = runPhase('test')
  } finally {
    const restoreStatus = runPhase('restore')
    if (status === 0 && restoreStatus !== 0) status = restoreStatus
  }
  return status
}

const main = () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const pnpmCli = process.env.npm_execpath
  if (!pnpmCli) throw new Error('pnpm executable is unavailable')

  const require = createRequire(new URL('../packages/infrastructure/package.json', import.meta.url))
  const nativeDir = dirname(require.resolve('better-sqlite3/package.json'))
  const nativeBuildDir = new URL('../build/', new URL(`file://${nativeDir}/`))

  const cleanNativeBuild = () => {
    rmSync(nativeBuildDir, { recursive: true, force: true })
  }

  return runE2eWithRestore((phase) => {
    if (phase === 'build') return run('build desktop app', [pnpmCli, 'build'], root)
    if (phase === 'rebuild') {
      cleanNativeBuild()
      return run(
        'rebuild native modules for Electron',
        [
          pnpmCli,
          '--filter',
          '@deepstorming/desktop',
          'exec',
          'electron-builder',
          'install-app-deps',
        ],
        root,
      )
    }
    if (phase === 'test')
      return run('run Playwright desktop tests', [pnpmCli, 'exec', 'playwright', 'test'], root)
    cleanNativeBuild()
    return run(
      'restore native modules for Node',
      [pnpmCli, '--dir', nativeDir, 'run', 'build-release'],
      root,
    )
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main()
