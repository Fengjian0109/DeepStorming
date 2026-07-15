import { tmpdir } from 'node:os'
import path from 'node:path'

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/acceptance',
  testMatch: 'real-deepseek.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['line']],
  outputDir: path.join(tmpdir(), 'deepstorming-real-deepseek-output'),
  preserveOutput: 'never',
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
