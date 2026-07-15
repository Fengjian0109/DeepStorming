import { expect, it, vi } from 'vitest'

import { canLeaveSettings } from './settings-navigation'

it('leaves a clean settings page without asking', () => {
  const confirmDiscard = vi.fn()

  expect(canLeaveSettings(false, confirmDiscard)).toBe(true)
  expect(confirmDiscard).not.toHaveBeenCalled()
})

it('blocks navigation when a dirty detail is not discarded', () => {
  const confirmDiscard = vi.fn().mockReturnValue(false)

  expect(canLeaveSettings(true, confirmDiscard)).toBe(false)
  expect(confirmDiscard).toHaveBeenCalledWith('当前修改尚未保存。要放弃修改吗？')
})
