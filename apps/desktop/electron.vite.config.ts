import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const workspacePackages = [
  '@deepstorming/application',
  '@deepstorming/contracts',
  '@deepstorming/domain',
  '@deepstorming/infrastructure',
]

export default defineConfig({
  main: {
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
