import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { getDefaultAppState } from '../state/AppStateStore.js'
import type { Tool, ToolUseContext } from '../Tool.js'
import type { Message } from '../types/message.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { createTaskStateBase } from '../Task.js'
import { getToolAvailabilityDeltaAttachment } from './attachments.js'

function tool(name: string): Tool {
  return {
    name,
    shouldDefer: true,
    inputSchema: z.object({}),
    async call() {
      return { data: null }
    },
    async description() {
      return name
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
      return name
    },
    userFacingName() {
      return name
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
  } as Tool
}

function contextWithTasks(running: boolean): ToolUseContext {
  const appState = getDefaultAppState()
  if (running) {
    const task = createTaskStateBase('b123', 'local_bash', 'server')
    task.status = 'running'
    appState.tasks = { [task.id]: task } as typeof appState.tasks
  }

  return {
    abortController: new AbortController(),
    options: {
      tools: [tool(TASK_STOP_TOOL_NAME)],
      commands: [],
      debug: false,
      verbose: false,
      mainLoopModel: 'claude-opus-4-6',
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    getAppState: () => appState,
    setAppState() {},
    messages: [],
    setMessages() {},
    readFileState: new Map(),
  } as unknown as ToolUseContext
}

describe('tool availability delta attachment', () => {
  test('emits again when a lifecycle note changes for the same tool name', () => {
    const first = getToolAvailabilityDeltaAttachment(
      contextWithTasks(false),
      [],
      'repl',
    )[0]
    expect(first?.type).toBe('tool_availability_delta')
    expect(first?.addedLines[0]).toBe(
      `${TASK_STOP_TOOL_NAME}: hidden — no background task is running`,
    )

    const messages = [
      { type: 'attachment', attachment: first },
    ] as unknown as Message[]
    const second = getToolAvailabilityDeltaAttachment(
      contextWithTasks(true),
      messages,
      'repl',
    )[0]

    expect(second?.type).toBe('tool_availability_delta')
    expect(second?.addedNames).toEqual([TASK_STOP_TOOL_NAME])
    expect(second?.addedLines).toEqual([
      `${TASK_STOP_TOOL_NAME}: available — background task is running`,
    ])
  })
})
