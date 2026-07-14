import { defaultSchema, type Options } from 'rehype-sanitize'

const codeAttributes = defaultSchema.attributes?.['code'] ?? []

export const richMessageSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...codeAttributes, ['className', 'language-math', 'math-inline', 'math-display']],
  },
}
