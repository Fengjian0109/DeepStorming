import { expect, it } from 'vitest'

import controls from './controls.css?inline'
import tokens from './tokens.css?inline'

it('loads theme and control styles through the renderer pipeline', () => {
  expect(tokens).toBeTypeOf('string')
  expect(controls).toBeTypeOf('string')
})
