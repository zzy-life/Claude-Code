import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import type { AppState } from '../state/AppStateStore.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { createTaskStateBase } from '../Task.js'
import type { Tool } from '../Tool.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../tools/EnterWorktreeTool/constants.js'
import { EXIT_WORKTREE_TOOL_NAME } from '../tools/ExitWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../tools/SendMessageTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '../tools/TaskCreateTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '../tools/TaskListTool/constants.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { TASK_UPDATE_TOOL_NAME } from '../tools/TaskUpdateTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '../tools/TeamDeleteTool/constants.js'
import {
  getExposureLevel,
  getToolAvailabilityLines,
  resolveToolExposure,
  type ToolExposureSurface,
} from './toolExposure.js'

type Context = Parameters<typeof getExposureLevel>[1]

function tool(name: string, shouldDefer = true): Tool {
  return {
    name,
    shouldDefer,
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

function context(
  appStateOverrides: Partial<AppState> = {},
  hasSharedTasks: boolean | undefined = undefined,
  surface: ToolExposureSurface = 'repl',
): Context {
  return {
    appState: {
      ...getDefaultAppState(),
      ...appStateOverrides,
    } as AppState,
    hasSharedTasks,
    surface,
  }
}

describe('tool exposure policy', () => {
  test('Plan tools switch between enter and exit by permission mode', () => {
    const normal = context()
    expect(getExposureLevel(tool(ENTER_PLAN_MODE_TOOL_NAME), normal)).toBe(
      'discoverable',
    )
    expect(getExposureLevel(tool(EXIT_PLAN_MODE_TOOL_NAME), normal)).toBe(
      'hidden',
    )

    const plan = context({
      toolPermissionContext: {
        ...getDefaultAppState().toolPermissionContext,
        mode: 'plan',
      },
    })
    expect(getExposureLevel(tool(ENTER_PLAN_MODE_TOOL_NAME), plan)).toBe(
      'hidden',
    )
    expect(getExposureLevel(tool(EXIT_PLAN_MODE_TOOL_NAME), plan)).toBe('state')
  })

  test('Worktree tools stay discoverable regardless of session state', () => {
    const ctx = context()
    expect(getExposureLevel(tool(ENTER_WORKTREE_TOOL_NAME), ctx)).toBe(
      'discoverable',
    )
    expect(getExposureLevel(tool(EXIT_WORKTREE_TOOL_NAME), ctx)).toBe(
      'discoverable',
    )
  })

  test('Team lifecycle hides create after team starts and promotes delete after members leave', () => {
    const noTeam = context()
    expect(getExposureLevel(tool(TEAM_CREATE_TOOL_NAME), noTeam)).toBe('state')
    expect(getExposureLevel(tool(TEAM_DELETE_TOOL_NAME), noTeam)).toBe('hidden')

    const teamWithMember = context({
      teamContext: {
        teamName: 'audit',
        teamFilePath: '/tmp/audit/config.json',
        leadAgentId: 'lead',
        teammates: {
          lead: {
            name: 'team-lead',
            tmuxSessionName: '',
            tmuxPaneId: '',
            cwd: '/tmp',
            spawnedAt: 1,
          },
          worker: {
            name: 'worker',
            tmuxSessionName: '',
            tmuxPaneId: '',
            cwd: '/tmp',
            spawnedAt: 1,
          },
        },
      },
    })
    expect(getExposureLevel(tool(TEAM_CREATE_TOOL_NAME), teamWithMember)).toBe(
      'hidden',
    )
    expect(getExposureLevel(tool(TEAM_DELETE_TOOL_NAME), teamWithMember)).toBe(
      'discoverable',
    )

    const teamWithoutMember = context({
      teamContext: {
        ...teamWithMember.appState.teamContext!,
        teammates: {
          lead: teamWithMember.appState.teamContext!.teammates.lead!,
        },
      },
    })
    expect(getExposureLevel(tool(TEAM_DELETE_TOOL_NAME), teamWithoutMember)).toBe(
      'state',
    )
  })

  test('Task tools depend on team mode and hydrated task presence', () => {
    const unknown = context({}, undefined)
    expect(getExposureLevel(tool(TASK_CREATE_TOOL_NAME), unknown)).toBe(
      'discoverable',
    )
    expect(getExposureLevel(tool(TASK_LIST_TOOL_NAME), unknown)).toBe(
      'discoverable',
    )

    const none = context({}, false)
    expect(getExposureLevel(tool(TASK_LIST_TOOL_NAME), none)).toBe('hidden')
    expect(getExposureLevel(tool(TASK_UPDATE_TOOL_NAME), none)).toBe('hidden')

    const some = context({}, true)
    expect(getExposureLevel(tool(TASK_LIST_TOOL_NAME), some)).toBe('state')
    expect(getExposureLevel(tool(TASK_UPDATE_TOOL_NAME), some)).toBe('state')
  })

  test('TaskStop promotes for local and remote running background tasks', () => {
    const local = createTaskStateBase('b123', 'local_bash', 'server')
    local.status = 'running'
    expect(
      getExposureLevel(
        tool(TASK_STOP_TOOL_NAME),
        context({ tasks: { [local.id]: local } as AppState['tasks'] }),
      ),
    ).toBe('state')

    expect(
      getExposureLevel(
        tool(TASK_STOP_TOOL_NAME),
        context({ remoteBackgroundTaskCount: 1 }),
      ),
    ).toBe('state')

    expect(getExposureLevel(tool(TASK_STOP_TOOL_NAME), context())).toBe('hidden')
  })

  test('SendMessage only loads when a message target exists', () => {
    expect(getExposureLevel(tool(SEND_MESSAGE_TOOL_NAME), context())).toBe(
      'hidden',
    )
    expect(
      getExposureLevel(
        tool(SEND_MESSAGE_TOOL_NAME),
        context({ agentNameRegistry: new Map([['reviewer', 'a1']]) }),
      ),
    ).toBe('state')
  })

  test('state and core tools are promoted out of deferred loading', () => {
    const tools = [tool(TEAM_CREATE_TOOL_NAME), tool('Read', false)]
    const resolved = resolveToolExposure(tools, context())
    expect(resolved.tools).toHaveLength(2)
    expect(resolved.tools[0]?.name).toBe(TEAM_CREATE_TOOL_NAME)
    expect(resolved.tools[0]?.shouldDefer).toBe(false)
  })

  test('availability lines include changed lifecycle notes', () => {
    const lines = getToolAvailabilityLines(
      [tool(TEAM_CREATE_TOOL_NAME), tool(TASK_STOP_TOOL_NAME)],
      context({ remoteBackgroundTaskCount: 1 }),
    ).map(line => line.line)

    expect(lines).toContain(
      `${TEAM_CREATE_TOOL_NAME}: available — no active team in this session`,
    )
    expect(lines).toContain(
      `${TASK_STOP_TOOL_NAME}: available — background task is running`,
    )
  })
})
