// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { AppearanceProvider, useAppearance } from './AppearanceProvider'
import { APPEARANCE_STORAGE_KEY, readAppearance } from './appearance'
import { AppearanceEditor } from '../settings/AppearanceEditor'

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()
let systemDark = false

const Probe = () => {
  const appearance = useAppearance()
  return (
    <button type="button" onClick={() => appearance.setPreference('dark')}>
      {appearance.preference}:{appearance.resolved}
    </button>
  )
}

beforeEach(() => {
  localStorage.clear()
  mediaListeners.clear()
  systemDark = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      get matches() {
        return systemDark
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) =>
        mediaListeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('defaults to system and applies the resolved light theme', () => {
  render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )

  expect(screen.getByRole('button').textContent).toBe('system:light')
  expect(document.documentElement.dataset['theme']).toBe('light')
})

it('persists an explicit dark preference', async () => {
  render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )

  await userEvent.setup().click(screen.getByRole('button'))

  expect(document.documentElement.dataset['theme']).toBe('dark')
  expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')
})

it('tracks macOS appearance changes while following system', () => {
  render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )

  systemDark = true
  act(() => {
    for (const listener of mediaListeners) {
      listener({ matches: true } as MediaQueryListEvent)
    }
  })

  expect(screen.getByRole('button').textContent).toBe('system:dark')
  expect(document.documentElement.dataset['theme']).toBe('dark')
})

it('falls back to system when storage cannot be read', () => {
  expect(
    readAppearance({
      getItem: () => {
        throw new Error('storage unavailable')
      },
    }),
  ).toBe('system')
})

it('lets the user select a light or dark appearance explicitly', async () => {
  render(
    <AppearanceProvider>
      <AppearanceEditor />
    </AppearanceProvider>,
  )

  await userEvent.setup().click(screen.getByRole('radio', { name: '深色' }))

  expect((screen.getByRole('radio', { name: '深色' }) as HTMLInputElement).checked).toBe(true)
  expect(document.documentElement.dataset['theme']).toBe('dark')
})
