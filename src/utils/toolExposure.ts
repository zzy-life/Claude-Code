import { feature } from 'bun:bundle'
import type { AppState } from '../state/AppStateStore.js'
import { isPanelAgentTask } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import { isBackgroundTask } from '../tasks/types.js'
import type { Tool, Tools } from '../Tool.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../tools/AskUserQuestionTool/prompt.js'
import { ENTER_PLAN_MODE_TOOL_NAME } from '../tools/EnterPlanModeTool/constants.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../tools/ExitPlanModeTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../tools/EnterWorktreeTool/constants.js'
import { EXIT_WORKTREE_TOOL_NAME } from '../tools/ExitWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../tools/SendMessageTool/constants.js'
import { TASK_CREATE_TOOL_NAME } from '../tools/TaskCreateTool/constants.js'
import { TASK_GET_TOOL_NAME } from '../tools/TaskGetTool/constants.js'
import { TASK_LIST_TOOL_NAME } from '../tools/TaskListTool/constants.js'
import { TASK_STOP_TOOL_NAME } from '../tools/TaskStopTool/prompt.js'
import { TASK_UPDATE_TOOL_NAME } from '../tools/TaskUpdateTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../tools/TeamCreateTool/constants.js'
import { TEAM_DELETE_TOOL_NAME } from '../tools/TeamDeleteTool/constants.js'
import { getKnownTaskPresence, getTaskListId } from './tasks.js'

export type ToolExposureLevel =
  | 'core'
  | 'state'
  | 'discoverable'
  | 'hidden'

export type ToolExposureSurface =
  | 'repl'
  | 'headless'
  | 'coordinator'
  | 'agent'

type ToolExposureContext = {
  appState: AppState
  hasSharedTasks: boolean | undefined
  surface: ToolExposureSurface
}

export type ResolvedToolExposure = {
  tools: Tools
}

export type ToolAvailabilityLine = {
  name: string
  line: string
}

const resolvedToolSnapshots = new WeakMap<Tools, Map<string, Tools>>()
const promotedTools = new WeakMap<Tool, Tool>()

export function getToolExposureContext(
  appState: AppState,
  surface: ToolExposureSurface,
): ToolExposureContext {
  return {
    appState,
    hasSharedTasks: getKnownTaskPresence(getTaskListId()),
    surface,
  }
}

function hasRunningBackgroundTask(appState: AppState): boolean {
  return (
    appState.remoteBackgroundTaskCount > 0 ||
    Object.values(appState.tasks ?? {}).some(
      task => task.status === 'running' && isBackgroundTask(task),
    )
  )
}

function hasNonLeadTeamMember(appState: AppState): boolean {
  const teamContext = appState.teamContext
  if (!teamContext) return false
  return Object.keys(teamContext.teammates).some(
    teammateId => teammateId !== teamContext.leadAgentId,
  )
}

function hasAgentTarget(appState: AppState): boolean {
  return Object.values(appState.tasks ?? {}).some(isPanelAgentTask)
}

function hasMessageTarget(appState: AppState): boolean {
  if (appState.teamContext !== undefined) return true
  if (appState.agentNameRegistry.size > 0) return true
  if (hasAgentTarget(appState)) return true
  if (feature('UDS_INBOX')) return true
  return false
}

export function getExposureLevel(
  tool: Tool,
  context: ToolExposureContext,
): ToolExposureLevel {
  const { appState, surface } = context
  const inPlanMode = appState.toolPermissionContext.mode === 'plan'
  const hasTeam = appState.teamContext !== undefined
  const hasTasks = context.hasSharedTasks
  const runningTask = hasRunningBackgroundTask(appState)

  switch (tool.name) {
    case ASK_USER_QUESTION_TOOL_NAME:
      return 'core'
    case ENTER_PLAN_MODE_TOOL_NAME:
      return surface === 'agent' || inPlanMode ? 'hidden' : 'discoverable'
    case EXIT_PLAN_MODE_TOOL_NAME:
      return inPlanMode ? 'state' : 'hidden'
    case ENTER_WORKTREE_TOOL_NAME:
    case EXIT_WORKTREE_TOOL_NAME:
      return 'discoverable'
    case TEAM_CREATE_TOOL_NAME:
      return hasTeam ? 'hidden' : 'state'
    case TEAM_DELETE_TOOL_NAME:
      if (!hasTeam) return 'hidden'
      return hasNonLeadTeamMember(appState) ? 'discoverable' : 'state'
    case SEND_MESSAGE_TOOL_NAME:
      return hasMessageTarget(appState) ? 'state' : 'hidden'
    case TASK_CREATE_TOOL_NAME:
      return hasTeam ? 'state' : 'discoverable'
    case TASK_LIST_TOOL_NAME:
    case TASK_UPDATE_TOOL_NAME:
      if (hasTeam || hasTasks === true) return 'state'
      return hasTasks === false ? 'hidden' : 'discoverable'
    case TASK_GET_TOOL_NAME:
      return hasTeam || hasTasks !== false ? 'discoverable' : 'hidden'
    case TASK_STOP_TOOL_NAME:
      return runningTask ? 'state' : 'hidden'
    default:
      return tool.shouldDefer === true ? 'discoverable' : 'core'
  }
}

function exposureKey(context: ToolExposureContext): string {
  const { appState } = context
  const hasUdsInbox = feature('UDS_INBOX') ? true : false
  return [
    context.surface,
    appState.toolPermissionContext.mode,
    appState.teamContext !== undefined,
    hasNonLeadTeamMember(appState),
    context.hasSharedTasks,
    hasRunningBackgroundTask(appState),
    appState.agentNameRegistry.size > 0,
    hasAgentTarget(appState),
    hasUdsInbox,
  ].join(':')
}

/**
 * Resolve one stable request snapshot. Hidden tools are removed from execution,
 * ToolSearch, and deferred announcements because all three consume this pool.
 */
export function resolveToolExposure(
  tools: Tools,
  context: ToolExposureContext,
): ResolvedToolExposure {
  const key = exposureKey(context)
  let snapshots = resolvedToolSnapshots.get(tools)
  const cached = snapshots?.get(key)
  if (cached) return { tools: cached }

  let changed = false
  const resolved: Tool[] = []
  for (const tool of tools) {
    const level = getExposureLevel(tool, context)
    if (level === 'hidden') {
      changed = true
      continue
    }

    if ((level === 'core' || level === 'state') && tool.shouldDefer === true) {
      changed = true
      const promoted = promotedTools.get(tool) ?? {
        ...tool,
        shouldDefer: false,
      }
      promotedTools.set(tool, promoted)
      resolved.push(promoted)
      continue
    }

    resolved.push(tool)
  }

  const snapshot = changed ? resolved : tools
  snapshots ??= new Map()
  snapshots.set(key, snapshot)
  resolvedToolSnapshots.set(tools, snapshots)
  return { tools: snapshot }
}

export function resolveCurrentToolExposure(
  tools: Tools,
  appState: AppState,
  surface: ToolExposureSurface,
): ResolvedToolExposure {
  return resolveToolExposure(tools, getToolExposureContext(appState, surface))
}

export function getToolAvailabilityLines(
  tools: Tools,
  context: ToolExposureContext,
): ToolAvailabilityLine[] {
  const lines: ToolAvailabilityLine[] = []
  const hasTeam = context.appState.teamContext !== undefined
  const hasNonLeadMember = hasNonLeadTeamMember(context.appState)
  const hasTasks = context.hasSharedTasks
  const hasMessageTargets = hasMessageTarget(context.appState)
  const hasRunningTask = hasRunningBackgroundTask(context.appState)

  for (const tool of tools) {
    switch (tool.name) {
      case TEAM_CREATE_TOOL_NAME:
        if (hasTeam) {
          lines.push({
            name: tool.name,
            line: `${tool.name}: hidden — already leading a team`,
          })
        } else {
          lines.push({
            name: tool.name,
            line: `${tool.name}: available — no active team in this session`,
          })
        }
        break
      case TEAM_DELETE_TOOL_NAME:
        if (!hasTeam) {
          lines.push({
            name: tool.name,
            line: `${tool.name}: hidden — no active team in this session`,
          })
        } else if (hasNonLeadMember) {
          lines.push({
            name: tool.name,
            line: `${tool.name}: blocked — non-lead team members remain`,
          })
        } else {
          lines.push({
            name: tool.name,
            line: `${tool.name}: available — no non-lead team members remain`,
          })
        }
        break
      case SEND_MESSAGE_TOOL_NAME:
        lines.push({
          name: tool.name,
          line: hasMessageTargets
            ? `${tool.name}: available — message targets exist`
            : `${tool.name}: hidden — no message targets exist`,
        })
        break
      case EXIT_PLAN_MODE_TOOL_NAME:
        lines.push({
          name: tool.name,
          line:
            context.appState.toolPermissionContext.mode === 'plan'
              ? `${tool.name}: available — currently in plan mode`
              : `${tool.name}: hidden — not currently in plan mode`,
        })
        break
      case TASK_LIST_TOOL_NAME:
      case TASK_UPDATE_TOOL_NAME:
        lines.push({
          name: tool.name,
          line:
            hasTeam || hasTasks === true
              ? `${tool.name}: available — shared tasks exist or team mode is active`
              : hasTasks === false
                ? `${tool.name}: hidden — no shared tasks exist`
                : `${tool.name}: discoverable — shared task presence is not hydrated yet`,
        })
        break
      case TASK_STOP_TOOL_NAME:
        lines.push({
          name: tool.name,
          line: hasRunningTask
            ? `${tool.name}: available — background task is running`
            : `${tool.name}: hidden — no background task is running`,
        })
        break
    }
  }

  return lines
}
