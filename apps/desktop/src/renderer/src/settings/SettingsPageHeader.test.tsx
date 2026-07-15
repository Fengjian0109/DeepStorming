// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { SettingsPageHeader } from './SettingsPageHeader'

afterEach(cleanup)

it('renders a breadcrumb and accessible back action', async () => {
  const onBack = vi.fn()
  render(
    <SettingsPageHeader
      title="编辑导师"
      description="配置导师教学方式"
      breadcrumb={['设置', '导师与伙伴', '苏格拉底导师']}
      onBack={onBack}
    />,
  )

  expect(screen.getByRole('navigation', { name: '设置路径' }).textContent).toContain(
    '设置 / 导师与伙伴 / 苏格拉底导师',
  )
  await userEvent.setup().click(screen.getByRole('button', { name: '返回' }))
  expect(onBack).toHaveBeenCalledOnce()
})
