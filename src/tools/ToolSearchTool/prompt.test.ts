import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { formatDeferredToolLine } from './prompt.js'

function tool(fields: Pick<Tool, 'name'> & Partial<Tool>): Tool {
  return {
    inputSchema: z.object({}),
    async call() {
      return { data: null }
    },
    async description() {
      return fields.name
    },
    isConcurrencySafe() {
      return true
    },
    isEnabled() {
      return true
    },
    isReadOnly() {
      return true
    },
    async checkPermissions(input) {
      return { behavior: 'allow', updatedInput: input }
    },
    async prompt() {
      return fields.name
    },
    userFacingName() {
      return fields.name
    },
    toAutoClassifierInput() {
      return ''
    },
    mapToolResultToToolResultBlockParam() {
      return []
    },
    renderToolUseMessage() {
      return null
    },
    ...fields,
  } as Tool
}

describe('formatDeferredToolLine', () => {
  test('prefers deferredSummary over searchHint', () => {
    expect(
      formatDeferredToolLine(
        tool({
          name: 'TeamCreate',
          searchHint: 'create teams',
          deferredSummary: 'requires user authorization before use',
        }),
      ),
    ).toBe('TeamCreate — requires user authorization before use')
  })

  test('falls back to searchHint and then bare name', () => {
    expect(
      formatDeferredToolLine(
        tool({ name: 'NotebookEdit', searchHint: 'jupyter notebooks' }),
      ),
    ).toBe('NotebookEdit — jupyter notebooks')
    expect(formatDeferredToolLine(tool({ name: 'CustomTool' }))).toBe(
      'CustomTool',
    )
  })
})
