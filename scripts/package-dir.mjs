import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

export const runPackageWithRestore = (run) => {
  let packageStatus
  try {
    packageStatus = run('package')
  } finally {
    const restoreStatus = run('restore')
    if ((packageStatus ?? 1) === 0 && restoreStatus !== 0) packageStatus = restoreStatus
  }
  return packageStatus ?? 1
}

const main = () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const pnpmCli = process.env.npm_execpath
  if (!pnpmCli) throw new Error('pnpm executable is unavailable')
  const require = createRequire(new URL('../packages/infrastructure/package.json', import.meta.url))
  const nativeDir = dirname(require.resolve('better-sqlite3/package.json'))
  return runPackageWithRestore((phase) => {
    const args =
      phase === 'package'
        ? [pnpmCli, '--filter', '@deepstorming/desktop', 'package:dir']
        : [pnpmCli, '--dir', nativeDir, 'run', 'build-release']
    return spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status ?? 1
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main()
