import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const rootPackageJsonPath = resolve(projectRoot, '../../package.json')
const rootPackageJson: unknown = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8'))

if (
  typeof rootPackageJson !== 'object' ||
  rootPackageJson === null ||
  !('version' in rootPackageJson) ||
  typeof rootPackageJson.version !== 'string' ||
  rootPackageJson.version.trim().length === 0
) {
  throw new Error('Root package.json must define a non-empty string version')
}

const applicationVersion = rootPackageJson.version.trim()
const workspacePackages = [
  '@deepstorming/application',
  '@deepstorming/contracts',
  '@deepstorming/domain',
  '@deepstorming/infrastructure',
]

export default defineConfig({
  main: {
    define: {
      __APP_VERSION__: JSON.stringify(applicationVersion),
    },
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve(projectRoot, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(projectRoot, 'src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(projectRoot, 'src/renderer/index.html'),
      },
    },
  },
})
