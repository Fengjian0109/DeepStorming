import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

export const runDevWithRestore = async (runPhase) => {
  let status = 1
  try {
    status = await runPhase('clean')
    if (status === 0) status = await runPhase('rebuild')
    if (status === 0) status = await runPhase('dev')
  } finally {
    const restoreStatus = await runPhase('restore')
    if (status === 0 && restoreStatus !== 0) status = restoreStatus
  }
  return status
}

const runSync = (label, args, cwd) => {
  process.stdout.write(`[dev] ${label}\n`)
  return spawnSync(process.execPath, args, { cwd, stdio: 'inherit' }).status ?? 1
}

const runInteractive = (label, args, cwd) => {
  process.stdout.write(`[dev] ${label}\n`)
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' })
    const forwardSignal = (signal) => child.kill(signal)
    const onSigint = () => forwardSignal('SIGINT')
    const onSigterm = () => forwardSignal('SIGTERM')
    process.on('SIGINT', onSigint)
    process.on('SIGTERM', onSigterm)

    const finish = (status) => {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      resolve(status)
    }
    child.once('error', () => finish(1))
    child.once('exit', (code, signal) => {
      if (code !== null) return finish(code)
      return finish(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)
    })
  })
}

const main = async () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const pnpmCli = process.env.npm_execpath
  if (!pnpmCli) throw new Error('pnpm executable is unavailable')

  const require = createRequire(new URL('../packages/infrastructure/package.json', import.meta.url))
  const nativeDir = dirname(require.resolve('better-sqlite3/package.json'))
  const nativeBuildDir = new URL('../build/', new URL(`file://${nativeDir}/`))
  const cleanNativeBuild = () => rmSync(nativeBuildDir, { recursive: true, force: true })

  return runDevWithRestore((phase) => {
    if (phase === 'clean') {
      cleanNativeBuild()
      return 0
    }
    if (phase === 'rebuild') {
      return runSync(
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
    if (phase === 'dev') {
      return runInteractive(
        'start Electron development app',
        [pnpmCli, '--filter', '@deepstorming/desktop', 'dev'],
        root,
      )
    }
    cleanNativeBuild()
    return runSync(
      'restore native modules for Node',
      [pnpmCli, '--dir', nativeDir, 'run', 'build-release'],
      root,
    )
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main()
}
