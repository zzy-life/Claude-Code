import { feature } from 'bun:bundle'
import { relative } from 'path'
import {
  getOriginalCwd,
  getIsRemoteMode,
  getIsNonInteractiveSession,
  handleAutoModeTransition,
  handlePlanModeTransition,
  setHasExitedPlanMode,
  setNeedsAutoModeExitAttachment,
} from '../../bootstrap/state.js'
import type {
  ToolPermissionContext,
} from '../../Tool.js'
import { getCwd } from '../cwd.js'
import { isEnvTruthy } from '../envUtils.js'
import type { SettingSource } from '../settings/constants.js'
import { SETTING_SOURCES } from '../settings/constants.js'
import {
  getSettings_DEPRECATED,
  getPermissionDefaultMode,
  getSettingsFilePathForSource,
  hasLocalAutoApprovalConsent,
} from '../settings/settings.js'
import {
  type PermissionMode,
  permissionModeFromString,
} from './PermissionMode.js'
import { applyPermissionRulesToPermissionContext } from './permissions.js'
import { loadAllPermissionRulesFromDisk } from './permissionsLoader.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./autoModeState.js') as typeof import('./autoModeState.js'))
  : null

import { resolve } from 'path'
import {
  checkSecurityRestrictionGate,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
} from 'src/services/analytics/growthbook.js'
import {
  addDirHelpMessage,
  validateDirectoryForWorkspace,
} from '../../commands/add-dir/validation.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { getToolsForDefaultPreset, parseToolPreset } from '../../tools.js'
import {
  getFsImplementation,
  safeResolvePath,
} from '../../utils/fsOperations.js'
import { isTeammate } from '../teammate.js'
import { logForDebugging } from '../debug.js'
import { gracefulShutdown } from '../gracefulShutdown.js'
import {
  CROSS_PLATFORM_CODE_EXEC,
  DANGEROUS_BASH_PATTERNS,
} from './dangerousPatterns.js'
import type {
  PermissionRule,
  PermissionRuleSource,
  PermissionRuleValue,
} from './PermissionRule.js'
import {
  type AdditionalWorkingDirectory,
  applyPermissionUpdate,
} from './PermissionUpdate.js'
import type { PermissionUpdateDestination } from './PermissionUpdateSchema.js'
import {
  normalizeLegacyToolName,
  permissionRuleValueFromString,
  permissionRuleValueToString,
} from './permissionRuleParser.js'

/**
 * Checks if a Bash permission rule is dangerous for auto mode.
 * A rule is dangerous if it would auto-allow commands that execute arbitrary code,
 * bypassing the classifier's safety evaluation.
 *
 * Dangerous patterns:
 * 1. Tool-level allow (Bash with no ruleContent) - allows ALL commands
 * 2. Prefix rules for script interpreters (python:*, node:*, etc.)
 * 3. Wildcard rules matching interpreters (python*, node*, etc.)
 */
export function isDangerousBashPermission(
  toolName: string,
  ruleContent: string | undefined,
): boolean {
  // Only check Bash rules
  if (toolName !== BASH_TOOL_NAME) {
    return false
  }

  // Tool-level allow (Bash with no content, or Bash(*)) - allows ALL commands
  if (ruleContent === undefined || ruleContent === '') {
    return true
  }

  const content = ruleContent.trim().toLowerCase()

  // Standalone wildcard (*) matches everything
  if (content === '*') {
    return true
  }

  // Check for dangerous patterns with prefix syntax (e.g., "python:*")
  // or wildcard syntax (e.g., "python*")
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    const lowerPattern = pattern.toLowerCase()

    // Exact match to the pattern itself (e.g., "python" as a rule)
    if (content === lowerPattern) {
      return true
    }

    // Prefix syntax: "python:*" allows any python command
    if (content === `${lowerPattern}:*`) {
      return true
    }

    // Wildcard at end: "python*" matches python, python3, etc.
    if (content === `${lowerPattern}*`) {
      return true
    }

    // Wildcard with space: "python *" would match "python script.py"
    if (content === `${lowerPattern} *`) {
      return true
    }

    // Check for patterns like "python -*" which would match "python -c 'code'"
    if (content.startsWith(`${lowerPattern} -`) && content.endsWith('*')) {
      return true
    }
  }

  return false
}

/**
 * Checks if a PowerShell permission rule is dangerous for auto mode.
 * A rule is dangerous if it would auto-allow commands that execute arbitrary
 * code (nested shells, Invoke-Expression, Start-Process, etc.), bypassing the
 * classifier's safety evaluation.
 *
 * PowerShell is case-insensitive, so rule content is lowercased before matching.
 */
export function isDangerousPowerShellPermission(
  toolName: string,
  ruleContent: string | undefined,
): boolean {
  if (toolName !== POWERSHELL_TOOL_NAME) {
    return false
  }

  // Tool-level allow (PowerShell with no content, or PowerShell(*)) - allows ALL commands
  if (ruleContent === undefined || ruleContent === '') {
    return true
  }

  const content = ruleContent.trim().toLowerCase()

  // Standalone wildcard (*) matches everything
  if (content === '*') {
    return true
  }

  // PS-specific cmdlet names. CROSS_PLATFORM_CODE_EXEC is shared with bash.
  const patterns: readonly string[] = [
    ...CROSS_PLATFORM_CODE_EXEC,
    // Nested PS + shells launchable from PS
    'pwsh',
    'powershell',
    'cmd',
    'wsl',
    // String/scriptblock evaluators
    'iex',
    'invoke-expression',
    'icm',
    'invoke-command',
    // Process spawners
    'start-process',
    'saps',
    'start',
    'start-job',
    'sajb',
    'start-threadjob', // bundled PS 6.1+; takes -ScriptBlock like Start-Job
    // Event/session code exec
    'register-objectevent',
    'register-engineevent',
    'register-wmievent',
    'register-scheduledjob',
    'new-pssession',
    'nsn', // alias
    'enter-pssession',
    'etsn', // alias
    // .NET escape hatches
    'add-type', // Add-Type -TypeDefinition '<C#>' → P/Invoke
    'new-object', // New-Object -ComObject WScript.Shell → .Run()
  ]

  for (const pattern of patterns) {
    // patterns stored lowercase; content lowercased above
    if (content === pattern) return true
    if (content === `${pattern}:*`) return true
    if (content === `${pattern}*`) return true
    if (content === `${pattern} *`) return true
    if (content.startsWith(`${pattern} -`) && content.endsWith('*')) return true
    // .exe — goes on the FIRST word. `python` → `python.exe`.
    // `npm run` → `npm.exe run` (npm.exe is the real Windows binary name).
    // A rule like `PowerShell(npm.exe run:*)` needs to match `npm run`.
    const sp = pattern.indexOf(' ')
    const exe =
      sp === -1
        ? `${pattern}.exe`
        : `${pattern.slice(0, sp)}.exe${pattern.slice(sp)}`
    if (content === exe) return true
    if (content === `${exe}:*`) return true
    if (content === `${exe}*`) return true
    if (content === `${exe} *`) return true
    if (content.startsWith(`${exe} -`) && content.endsWith('*')) return true
  }
  return false
}

/**
 * Checks if an Agent (sub-agent) permission rule is dangerous for auto mode.
 * Any Agent allow rule would auto-approve sub-agent spawns before the auto mode classifier
 * can evaluate the sub-agent's prompt, defeating delegation attack prevention.
 */
export function isDangerousTaskPermission(
  toolName: string,
  _ruleContent: string | undefined,
): boolean {
  return normalizeLegacyToolName(toolName) === AGENT_TOOL_NAME
}

function formatPermissionSource(source: PermissionRuleSource): string {
  if ((SETTING_SOURCES as readonly string[]).includes(source)) {
    const filePath = getSettingsFilePathForSource(source as SettingSource)
    if (filePath) {
      const relativePath = relative(getCwd(), filePath)
      return relativePath.length < filePath.length ? relativePath : filePath
    }
  }
  return source
}

export type DangerousPermissionInfo = {
  ruleValue: PermissionRuleValue
  source: PermissionRuleSource
  /** The permission rule formatted for display, e.g. "Bash(*)" or "Bash(python:*)" */
  ruleDisplay: string
  /** The source formatted for display, e.g. a file path or "--allowed-tools" */
  sourceDisplay: string
}

/**
 * Checks if a permission rule is dangerous for auto mode.
 * A rule is dangerous if it would auto-allow actions before the auto mode classifier
 * can evaluate them, bypassing safety checks.
 */
function isDangerousClassifierPermission(
  toolName: string,
  ruleContent: string | undefined,
): boolean {
  if (process.env.USER_TYPE === 'ant') {
    // Tmux send-keys executes arbitrary shell, bypassing the classifier same as Bash(*)
    if (toolName === 'Tmux') return true
  }
  return (
    isDangerousBashPermission(toolName, ruleContent) ||
    isDangerousPowerShellPermission(toolName, ruleContent) ||
    isDangerousTaskPermission(toolName, ruleContent)
  )
}

/**
 * Finds all dangerous permissions from rules loaded from disk and CLI arguments.
 * Returns structured info about each dangerous permission found.
 *
 * Checks Bash permissions (wildcard/interpreter patterns), PowerShell permissions
 * (wildcard/iex/Start-Process patterns), and Agent permissions (any allow rule
 * bypasses the classifier's sub-agent evaluation).
 */
export function findDangerousClassifierPermissions(
  rules: PermissionRule[],
  cliAllowedTools: string[],
): DangerousPermissionInfo[] {
  const dangerous: DangerousPermissionInfo[] = []

  // Check rules loaded from settings
  for (const rule of rules) {
    if (
      rule.ruleBehavior === 'allow' &&
      isDangerousClassifierPermission(
        rule.ruleValue.toolName,
        rule.ruleValue.ruleContent,
      )
    ) {
      const ruleString = rule.ruleValue.ruleContent
        ? `${rule.ruleValue.toolName}(${rule.ruleValue.ruleContent})`
        : `${rule.ruleValue.toolName}(*)`
      dangerous.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: ruleString,
        sourceDisplay: formatPermissionSource(rule.source),
      })
    }
  }

  // Check CLI --allowed-tools arguments
  for (const toolSpec of cliAllowedTools) {
    // Parse tool spec: "Bash" or "Bash(pattern)" or "Agent" or "Agent(subagent_type)"
    const match = toolSpec.match(/^([^(]+)(?:\(([^)]*)\))?$/)
    if (match) {
      const toolName = match[1]!.trim()
      const ruleContent = match[2]?.trim()

      if (isDangerousClassifierPermission(toolName, ruleContent)) {
        dangerous.push({
          ruleValue: { toolName, ruleContent },
          source: 'cliArg',
          ruleDisplay: ruleContent ? toolSpec : `${toolName}(*)`,
          sourceDisplay: '--allowed-tools',
        })
      }
    }
  }

  return dangerous
}

/**
 * Checks if a Bash allow rule is overly broad (equivalent to YOLO mode).
 * Returns true for tool-level Bash allow rules with no content restriction,
 * which auto-allow every bash command.
 *
 * Matches: Bash, Bash(*), Bash() — all parse to { toolName: 'Bash' } with no ruleContent.
 */
export function isOverlyBroadBashAllowRule(
  ruleValue: PermissionRuleValue,
): boolean {
  return (
    ruleValue.toolName === BASH_TOOL_NAME && ruleValue.ruleContent === undefined
  )
}

/**
 * PowerShell equivalent of isOverlyBroadBashAllowRule.
 *
 * Matches: PowerShell, PowerShell(*), PowerShell() — all parse to
 * { toolName: 'PowerShell' } with no ruleContent.
 */
export function isOverlyBroadPowerShellAllowRule(
  ruleValue: PermissionRuleValue,
): boolean {
  return (
    ruleValue.toolName === POWERSHELL_TOOL_NAME &&
    ruleValue.ruleContent === undefined
  )
}

/**
 * Finds all overly broad Bash allow rules from settings and CLI arguments.
 * An overly broad rule allows ALL bash commands (e.g., Bash or Bash(*)),
 * which is effectively equivalent to YOLO/bypass-permissions mode.
 */
export function findOverlyBroadBashPermissions(
  rules: PermissionRule[],
  cliAllowedTools: string[],
): DangerousPermissionInfo[] {
  const overlyBroad: DangerousPermissionInfo[] = []

  for (const rule of rules) {
    if (
      rule.ruleBehavior === 'allow' &&
      isOverlyBroadBashAllowRule(rule.ruleValue)
    ) {
      overlyBroad.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: `${BASH_TOOL_NAME}(*)`,
        sourceDisplay: formatPermissionSource(rule.source),
      })
    }
  }

  for (const toolSpec of cliAllowedTools) {
    const parsed = permissionRuleValueFromString(toolSpec)
    if (isOverlyBroadBashAllowRule(parsed)) {
      overlyBroad.push({
        ruleValue: parsed,
        source: 'cliArg',
        ruleDisplay: `${BASH_TOOL_NAME}(*)`,
        sourceDisplay: '--allowed-tools',
      })
    }
  }

  return overlyBroad
}

/**
 * PowerShell equivalent of findOverlyBroadBashPermissions.
 */
export function findOverlyBroadPowerShellPermissions(
  rules: PermissionRule[],
  cliAllowedTools: string[],
): DangerousPermissionInfo[] {
  const overlyBroad: DangerousPermissionInfo[] = []

  for (const rule of rules) {
    if (
      rule.ruleBehavior === 'allow' &&
      isOverlyBroadPowerShellAllowRule(rule.ruleValue)
    ) {
      overlyBroad.push({
        ruleValue: rule.ruleValue,
        source: rule.source,
        ruleDisplay: `${POWERSHELL_TOOL_NAME}(*)`,
        sourceDisplay: formatPermissionSource(rule.source),
      })
    }
  }

  for (const toolSpec of cliAllowedTools) {
    const parsed = permissionRuleValueFromString(toolSpec)
    if (isOverlyBroadPowerShellAllowRule(parsed)) {
      overlyBroad.push({
        ruleValue: parsed,
        source: 'cliArg',
        ruleDisplay: `${POWERSHELL_TOOL_NAME}(*)`,
        sourceDisplay: '--allowed-tools',
      })
    }
  }

  return overlyBroad
}

/**
 * Type guard to check if a PermissionRuleSource is a valid PermissionUpdateDestination.
 * Sources like 'flagSettings', 'policySettings', and 'command' are not valid destinations.
 */
function isPermissionUpdateDestination(
  source: PermissionRuleSource,
): source is PermissionUpdateDestination {
  return [
    'userSettings',
    'projectSettings',
    'localSettings',
    'session',
    'cliArg',
  ].includes(source)
}

/**
 * Removes dangerous permissions from the in-memory context, and optionally
 * persists the removal to settings files on disk.
 */
export function removeDangerousPermissions(
  context: ToolPermissionContext,
  dangerousPermissions: DangerousPermissionInfo[],
): ToolPermissionContext {
  // Group dangerous rules by their source (destination for updates)
  const rulesBySource = new Map<
    PermissionUpdateDestination,
    PermissionRuleValue[]
  >()
  for (const perm of dangerousPermissions) {
    // Skip sources that can't be persisted (flagSettings, policySettings, command)
    if (!isPermissionUpdateDestination(perm.source)) {
      continue
    }
    const destination = perm.source
    const existing = rulesBySource.get(destination) || []
    existing.push(perm.ruleValue)
    rulesBySource.set(destination, existing)
  }

  let updatedContext = context
  for (const [destination, rules] of rulesBySource) {
    updatedContext = applyPermissionUpdate(updatedContext, {
      type: 'removeRules' as const,
      rules,
      behavior: 'allow' as const,
      destination,
    })
  }

  return updatedContext
}

/**
 * Restores allow rules stashed by the previous auto implementation.
 * New auto approval respects existing allow rules and never creates this stash.
 * Clears the stash so a second exit is a no-op.
 */
export function restoreDangerousPermissions(
  context: ToolPermissionContext,
): ToolPermissionContext {
  const stash = context.strippedDangerousRules
  if (!stash) {
    return context
  }
  let result = context
  for (const [source, ruleStrings] of Object.entries(stash)) {
    if (!ruleStrings || ruleStrings.length === 0) continue
    result = applyPermissionUpdate(result, {
      type: 'addRules',
      rules: ruleStrings.map(permissionRuleValueFromString),
      behavior: 'allow',
      destination: source as PermissionUpdateDestination,
    })
  }
  return { ...result, strippedDangerousRules: undefined }
}

/**
 * Handles all state transitions when switching permission modes.
 * Centralises side-effects so that every activation path (CLI Shift+Tab,
 * SDK control messages, etc.) behaves identically.
 *
 * Currently handles:
 * - Plan mode enter/exit attachments (via handlePlanModeTransition)
 * - Local auto policy and consent checks; restoration of legacy stripped rules
 *
 * Returns the (possibly modified) context. Caller is responsible for setting
 * the mode on the returned context.
 *
 * @param fromMode The current permission mode
 * @param toMode The target permission mode
 * @param context The current tool permission context
 */
export function transitionPermissionMode(
  fromMode: string,
  toMode: string,
  context: ToolPermissionContext,
): ToolPermissionContext {
  // Validate before emitting transition side effects, including repeated auto requests.
  if (toMode === 'auto') {
    if (!isAutoModeGateEnabled()) {
      throw new Error('Cannot transition to auto mode: local policy does not allow it')
    }
    if (!hasLocalAutoApprovalConsent()) {
      throw new Error('Cannot transition to auto mode: local approval consent is required')
    }
  }
  if (fromMode === toMode) return context

  handlePlanModeTransition(fromMode, toMode)
  handleAutoModeTransition(fromMode, toMode)

  if (fromMode === 'plan') {
    setHasExitedPlanMode(true)
  }

  if (fromMode === 'auto') {
    autoModeStateModule?.setAutoModeActive(false)
    setNeedsAutoModeExitAttachment(true)
    context = restoreDangerousPermissions(context)
  }

  if (toMode === 'plan') {
    // fromMode is authoritative; callers need not have updated context.mode yet.
    return prepareContextForPlanMode({ ...context, mode: fromMode as PermissionMode })
  }

  // Old plan sessions may still carry classifier state and stripped allow rules.
  if (fromMode === 'plan') {
    context = transitionPlanAutoMode(context)
    return { ...context, prePlanMode: undefined }
  }

  return context
}

/**
 * Parse base tools specification from CLI
 * Handles both preset names (default, none) and custom tool lists
 */
export function parseBaseToolsFromCLI(baseTools: string[]): string[] {
  // Join all array elements and check if it's a single preset name
  const joinedInput = baseTools.join(' ').trim()
  const preset = parseToolPreset(joinedInput)

  if (preset) {
    return getToolsForDefaultPreset()
  }

  // Parse as a custom tool list using the same parsing logic as allowedTools/disallowedTools
  const parsedTools = parseToolListFromCLI(baseTools)

  return parsedTools
}

/**
 * Check if processPwd is a symlink that resolves to originalCwd
 */
function isSymlinkTo({
  processPwd,
  originalCwd,
}: {
  processPwd: string
  originalCwd: string
}): boolean {
  // Use safeResolvePath to check if processPwd is a symlink and get its resolved path
  const { resolvedPath: resolvedProcessPwd, isSymlink: isProcessPwdSymlink } =
    safeResolvePath(getFsImplementation(), processPwd)

  return isProcessPwdSymlink
    ? resolvedProcessPwd === resolve(originalCwd)
    : false
}

/**
 * Safely convert CLI flags to a PermissionMode
 */
export function initialPermissionModeFromCLI({
  permissionModeCli,
  dangerouslySkipPermissions,
  autoApprovalEnvironment,
}: {
  permissionModeCli: string | undefined
  dangerouslySkipPermissions: boolean | undefined
  autoApprovalEnvironment?: 'local-interactive' | 'headless' | 'teammate' | 'remote'
}): { mode: PermissionMode; notification?: string } {
  const settings = getSettings_DEPRECATED() || {}

  // Check GrowthBook gate first - highest precedence
  const growthBookDisableBypassPermissionsMode =
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
      'tengu_disable_bypass_permissions_mode',
    )

  // Then check settings - lower precedence
  const settingsDisableBypassPermissionsMode =
    settings.permissions?.disableBypassPermissionsMode === 'disable'

  // Statsig gate takes precedence over settings
  const disableBypassPermissionsMode =
    growthBookDisableBypassPermissionsMode ||
    settingsDisableBypassPermissionsMode

  // Explicit environment can further restrict startup, never override runtime policy.
  const autoEnvironmentSupported =
    autoApprovalEnvironment === undefined ||
    autoApprovalEnvironment === 'local-interactive'
  const autoModeAvailable = autoEnvironmentSupported && isAutoModeGateEnabled()

  // Modes in order of priority
  const orderedModes: PermissionMode[] = []
  let notification: string | undefined

  if (dangerouslySkipPermissions) {
    orderedModes.push('bypassPermissions')
  }
  if (permissionModeCli) {
    const parsedMode = permissionModeFromString(permissionModeCli)
    if (parsedMode === 'auto' && !autoModeAvailable) {
      let reason: AutoModeUnavailableReason = 'environment'
      if (isAutoModeDisabledBySettings()) {
        reason = 'settings'
      }
      throw new Error(getAutoModeUnavailableNotification(reason))
    }
    // Local auto may await the startup consent dialog; parsing never activates it.
    orderedModes.push(parsedMode)
  }
  const defaultMode = getPermissionDefaultMode()
  if (defaultMode) {
    const settingsMode = defaultMode as PermissionMode
    // CCR only supports acceptEdits and plan — ignore other defaultModes from
    // settings (e.g. bypassPermissions would otherwise silently grant full
    // access in a remote environment).
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
      !['acceptEdits', 'plan', 'default'].includes(settingsMode)
    ) {
      logForDebugging(
        `settings defaultMode "${settingsMode}" is not supported in CLAUDE_CODE_REMOTE — only acceptEdits and plan are allowed`,
        { level: 'warn' },
      )
      logEvent('tengu_ccr_unsupported_default_mode_ignored', {
        mode: settingsMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }
    // Unsupported defaults are ignored rather than granting auto outside local UI.
    else if (settingsMode === 'auto') {
      if (autoModeAvailable) {
        orderedModes.push('auto')
      }
    } else {
      orderedModes.push(settingsMode)
    }
  }

  let result: { mode: PermissionMode; notification?: string } | undefined

  for (const mode of orderedModes) {
    if (mode === 'bypassPermissions' && disableBypassPermissionsMode) {
      if (growthBookDisableBypassPermissionsMode) {
        logForDebugging('bypassPermissions mode is disabled by Statsig gate', {
          level: 'warn',
        })
        notification =
          'Bypass permissions mode was disabled by your organization policy'
      } else {
        logForDebugging('bypassPermissions mode is disabled by settings', {
          level: 'warn',
        })
        notification = 'Bypass permissions mode was disabled by settings'
      }
      continue // Skip this mode if it's disabled
    }

    result = { mode, notification } // Use the first valid mode
    break
  }

  if (!result) {
    result = { mode: 'default', notification }
  }

  return result
}

export function parseToolListFromCLI(tools: string[]): string[] {
  if (tools.length === 0) {
    return []
  }

  const result: string[] = []

  // Process each string in the array
  for (const toolString of tools) {
    if (!toolString) continue

    let current = ''
    let isInParens = false

    // Parse each character in the string
    for (const char of toolString) {
      switch (char) {
        case '(':
          isInParens = true
          current += char
          break
        case ')':
          isInParens = false
          current += char
          break
        case ',':
          if (isInParens) {
            current += char
          } else {
            // Comma separator - push current tool and start new one
            if (current.trim()) {
              result.push(current.trim())
            }
            current = ''
          }
          break
        case ' ':
          if (isInParens) {
            current += char
          } else if (current.trim()) {
            // Space separator - push current tool and start new one
            result.push(current.trim())
            current = ''
          }
          break
        default:
          current += char
      }
    }

    // Push any remaining tool
    if (current.trim()) {
      result.push(current.trim())
    }
  }

  return result
}

export async function initializeToolPermissionContext({
  allowedToolsCli,
  disallowedToolsCli,
  baseToolsCli,
  permissionMode,
  allowDangerouslySkipPermissions,
  addDirs,
}: {
  allowedToolsCli: string[]
  disallowedToolsCli: string[]
  baseToolsCli?: string[]
  permissionMode: PermissionMode
  allowDangerouslySkipPermissions: boolean
  addDirs: string[]
}): Promise<{
  toolPermissionContext: ToolPermissionContext
  warnings: string[]
  dangerousPermissions: DangerousPermissionInfo[]
  overlyBroadBashPermissions: DangerousPermissionInfo[]
}> {
  // Parse comma-separated allowed and disallowed tools if provided
  // Normalize legacy tool names (e.g., 'Task' → 'Agent') for permission matching.
  const parsedAllowedToolsCli = parseToolListFromCLI(allowedToolsCli).map(
    rule => permissionRuleValueToString(permissionRuleValueFromString(rule)),
  )
  let parsedDisallowedToolsCli = parseToolListFromCLI(disallowedToolsCli)

  // If base tools are specified, automatically deny all tools NOT in the base set
  // We need to check if base tools were explicitly provided (not just empty default)
  if (baseToolsCli && baseToolsCli.length > 0) {
    const baseToolsResult = parseBaseToolsFromCLI(baseToolsCli)
    // Normalize legacy tool names (e.g., 'Task' → 'Agent') so user-provided
    // base tool lists using old names still match canonical names.
    const baseToolsSet = new Set(baseToolsResult.map(normalizeLegacyToolName))
    const allToolNames = getToolsForDefaultPreset()
    const toolsToDisallow = allToolNames.filter(tool => !baseToolsSet.has(tool))
    parsedDisallowedToolsCli = [...parsedDisallowedToolsCli, ...toolsToDisallow]
  }

  const warnings: string[] = []
  const additionalWorkingDirectories = new Map<
    string,
    AdditionalWorkingDirectory
  >()
  // process.env.PWD may be a symlink, while getOriginalCwd() uses the real path
  const processPwd = process.env.PWD
  if (
    processPwd &&
    processPwd !== getOriginalCwd() &&
    isSymlinkTo({ originalCwd: getOriginalCwd(), processPwd })
  ) {
    additionalWorkingDirectories.set(processPwd, {
      path: processPwd,
      source: 'session',
    })
  }

  // Check if bypassPermissions mode is available (not disabled by Statsig gate or settings)
  // Use cached values to avoid blocking on startup
  const growthBookDisableBypassPermissionsMode =
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
      'tengu_disable_bypass_permissions_mode',
    )
  const settings = getSettings_DEPRECATED() || {}
  const settingsDisableBypassPermissionsMode =
    settings.permissions?.disableBypassPermissionsMode === 'disable'
  const isBypassPermissionsModeAvailable =
    (permissionMode === 'bypassPermissions' ||
      allowDangerouslySkipPermissions) &&
    !growthBookDisableBypassPermissionsMode &&
    !settingsDisableBypassPermissionsMode

  // Load all permission rules from disk
  const rulesFromDisk = loadAllPermissionRulesFromDisk()

  // Ant-only: Detect overly broad shell allow rules for all modes.
  // Bash(*) or PowerShell(*) are equivalent to YOLO mode for that shell.
  // Skip in CCR/BYOC where --allowed-tools is the intended pre-approval mechanism.
  // Variable name kept for return-field compat; contains both shells.
  let overlyBroadBashPermissions: DangerousPermissionInfo[] = []
  if (
    process.env.USER_TYPE === 'ant' &&
    !isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) &&
    process.env.CLAUDE_CODE_ENTRYPOINT !== 'local-agent'
  ) {
    overlyBroadBashPermissions = [
      ...findOverlyBroadBashPermissions(rulesFromDisk, parsedAllowedToolsCli),
      ...findOverlyBroadPowerShellPermissions(
        rulesFromDisk,
        parsedAllowedToolsCli,
      ),
    ]
  }

  // Preserve the return contract without re-reviewing existing allow rules.
  const dangerousPermissions: DangerousPermissionInfo[] = []

  let toolPermissionContext = applyPermissionRulesToPermissionContext(
    {
      mode: permissionMode,
      additionalWorkingDirectories,
      alwaysAllowRules: { cliArg: parsedAllowedToolsCli },
      alwaysDenyRules: { cliArg: parsedDisallowedToolsCli },
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable,
      isAutoModeAvailable: isAutoModeGateEnabled(),
    },
    rulesFromDisk,
  )

  // Add directories from settings and --add-dir
  const allAdditionalDirectories = [
    ...(settings.permissions?.additionalDirectories || []),
    ...addDirs,
  ]
  // Parallelize fs validation; apply updates serially (cumulative context).
  // validateDirectoryForWorkspace only reads permissionContext to check if the
  // dir is already covered — behavioral difference from parallelizing is benign
  // (two overlapping --add-dirs both succeed instead of one being flagged
  // alreadyInWorkingDirectory, which was silently skipped anyway).
  const validationResults = await Promise.all(
    allAdditionalDirectories.map(dir =>
      validateDirectoryForWorkspace(dir, toolPermissionContext),
    ),
  )
  for (const result of validationResults) {
    if (result.resultType === 'success') {
      toolPermissionContext = applyPermissionUpdate(toolPermissionContext, {
        type: 'addDirectories',
        directories: [result.absolutePath],
        destination: 'cliArg',
      })
    } else if (
      result.resultType !== 'alreadyInWorkingDirectory' &&
      result.resultType !== 'pathNotFound'
    ) {
      // Warn for actual config mistakes (e.g. specifying a file instead of a
      // directory). But if the directory doesn't exist anymore (e.g. someone
      // was working under /tmp and it got cleared), silently skip. They'll get
      // prompted again if they try to access it later.
      warnings.push(addDirHelpMessage(result))
    }
  }

  return {
    toolPermissionContext,
    warnings,
    dangerousPermissions,
    overlyBroadBashPermissions,
  }
}

export type AutoModeGateCheckResult = {
  // Apply to the current context inside setAppState so later mode changes survive.
  updateContext: (ctx: ToolPermissionContext) => ToolPermissionContext
  notification?: string
}

export type AutoModeUnavailableReason = 'settings' | 'environment'

export function getAutoModeUnavailableNotification(
  reason: AutoModeUnavailableReason,
): string {
  let base: string
  switch (reason) {
    case 'settings':
      base = 'auto mode disabled by settings'
      break
    case 'environment':
      base = 'auto mode is only available in a local interactive session'
      break
  }
  return process.env.USER_TYPE === 'ant'
    ? `${base} · #claude-code-feedback`
    : base
}

/**
 * Checks local auto availability while preserving the existing async API.
 * The returned transform re-checks runtime policy against the current context;
 * unrelated permission modes are never changed.
 */
export async function verifyAutoModeGateAccess(
  currentContext: ToolPermissionContext,
  // Retained for call-site compatibility; local availability is independent of speed.
  _fastMode?: boolean,
): Promise<AutoModeGateCheckResult> {
  const reason = getAutoModeUnavailableReason()
  const updateContext = (ctx: ToolPermissionContext): ToolPermissionContext => {
    // Re-read local policy when applying to the latest context.
    const available = isAutoModeGateEnabled()
    let updatedContext = ctx
    if (!available) {
      if (ctx.mode === 'auto') {
        autoModeStateModule?.setAutoModeActive(false)
        setNeedsAutoModeExitAttachment(true)
        updatedContext = applyPermissionUpdate(restoreDangerousPermissions(ctx), {
          type: 'setMode',
          mode: 'default',
          destination: 'session',
        })
      } else if (ctx.mode === 'plan') {
        updatedContext = transitionPlanAutoMode(ctx)
        if (updatedContext.prePlanMode === 'auto') {
          updatedContext = { ...updatedContext, prePlanMode: 'default' }
        }
      }
    }
    if (updatedContext.isAutoModeAvailable === available) {
      return updatedContext
    }
    return { ...updatedContext, isAutoModeAvailable: available }
  }

  if (
    reason !== null &&
    (currentContext.mode === 'auto' ||
      (currentContext.mode === 'plan' && currentContext.prePlanMode === 'auto'))
  ) {
    return { updateContext, notification: getAutoModeUnavailableNotification(reason) }
  }
  return { updateContext }
}

/**
 * Core logic to check if bypassPermissions should be disabled based on Statsig gate
 */
export function shouldDisableBypassPermissions(): Promise<boolean> {
  return checkSecurityRestrictionGate('tengu_disable_bypass_permissions_mode')
}

function isAutoModeDisabledBySettings(): boolean {
  const settings = getSettings_DEPRECATED() || {}
  return (
    (settings as { disableAutoMode?: 'disable' }).disableAutoMode ===
      'disable' ||
    (settings.permissions as { disableAutoMode?: 'disable' } | undefined)
      ?.disableAutoMode === 'disable'
  )
}

// The local REPL registers a live AppState reader. Do not reuse getIsRemoteMode:
// enabling local Remote Control does not turn the process into a remote worker.
let localAutoApprovalBridgeStateReader: (() => boolean) | undefined

export function setLocalAutoApprovalBridgeStateReader(
  reader: (() => boolean) | undefined,
): void {
  localAutoApprovalBridgeStateReader = reader
}

/**
 * Exposes auto only in local interactive sessions allowed by management policy.
 * Consent is checked on entry, not here, so first-time users can select the UI.
 */
export function isAutoModeGateEnabled(): boolean {
  if (isAutoModeDisabledBySettings()) return false
  if (getIsRemoteMode()) return false
  if (localAutoApprovalBridgeStateReader?.()) return false
  if (getIsNonInteractiveSession()) return false
  if (isTeammate()) return false
  return true
}

/**
 * Returns the reason auto mode is currently unavailable, or null if available.
 * Synchronous — reads only local settings and runtime environment.
 */
export function getAutoModeUnavailableReason(): AutoModeUnavailableReason | null {
  if (isAutoModeDisabledBySettings()) return 'settings'
  if (!isAutoModeGateEnabled()) return 'environment'
  return null
}

/**
 * Legacy return type retained for callers. Local policy returns enabled/disabled;
 * the opt-in member remains for source compatibility only.
 */
export type AutoModeEnabledState = 'enabled' | 'disabled' | 'opt-in'

/** Compatibility entry point backed by synchronous local policy, not experiments. */
export function getAutoModeEnabledState(): AutoModeEnabledState {
  if (isAutoModeGateEnabled()) {
    return 'enabled'
  }
  return 'disabled'
}

/** Local policy is always available; no remote cache is needed. */
export function getAutoModeEnabledStateIfCached():
  | AutoModeEnabledState
  | undefined {
  return getAutoModeEnabledState()
}

/**
 * Compatibility entry point for versioned local approval consent.
 * CLI intent and the old skipAutoPermissionPrompt flag do not constitute consent.
 */
export function hasAutoModeOptInAnySource(): boolean {
  return hasLocalAutoApprovalConsent()
}

/**
 * Checks if bypassPermissions mode is currently disabled by Statsig gate or settings.
 * This is a synchronous version that uses cached Statsig values.
 */
export function isBypassPermissionsModeDisabled(): boolean {
  const growthBookDisableBypassPermissionsMode =
    checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
      'tengu_disable_bypass_permissions_mode',
    )
  const settings = getSettings_DEPRECATED() || {}
  const settingsDisableBypassPermissionsMode =
    settings.permissions?.disableBypassPermissionsMode === 'disable'

  return (
    growthBookDisableBypassPermissionsMode ||
    settingsDisableBypassPermissionsMode
  )
}

/**
 * Creates an updated context with bypassPermissions disabled
 */
export function createDisabledBypassPermissionsContext(
  currentContext: ToolPermissionContext,
): ToolPermissionContext {
  let updatedContext = currentContext
  if (currentContext.mode === 'bypassPermissions') {
    updatedContext = applyPermissionUpdate(currentContext, {
      type: 'setMode',
      mode: 'default',
      destination: 'session',
    })
  }

  return {
    ...updatedContext,
    isBypassPermissionsModeAvailable: false,
  }
}

/**
 * Asynchronously checks if the bypassPermissions mode should be disabled based on Statsig gate
 * and returns an updated toolPermissionContext if needed
 */
export async function checkAndDisableBypassPermissions(
  currentContext: ToolPermissionContext,
): Promise<void> {
  // Only proceed if bypassPermissions mode is available
  if (!currentContext.isBypassPermissionsModeAvailable) {
    return
  }

  const shouldDisable = await shouldDisableBypassPermissions()
  if (!shouldDisable) {
    return
  }

  // Gate is enabled, need to disable bypassPermissions mode
  logForDebugging(
    'bypassPermissions mode is being disabled by Statsig gate (async check)',
    { level: 'warn' },
  )

  void gracefulShutdown(1, 'bypass_permissions_disabled')
}

export function isDefaultPermissionModeAuto(): boolean {
  return getPermissionDefaultMode() === 'auto'
}

/**
 * Plan mode never enables automatic AI approval, regardless of consent.
 */
export function shouldPlanUseAutoMode(): boolean {
  return false
}

/**
 * Centralized plan-mode entry. Stashes the current mode as prePlanMode so
 * ExitPlanMode can restore it. Restore any legacy stripped allow rules without
 * activating automatic approval.
 */
export function prepareContextForPlanMode(
  context: ToolPermissionContext,
): ToolPermissionContext {
  if (context.mode === 'plan') return context
  return {
    ...restoreDangerousPermissions(context),
    prePlanMode: context.mode,
  }
}

/**
 * Cleans up legacy classifier state during plan mode after settings changes.
 * Never activates auto or removes user allow rules.
 */
export function transitionPlanAutoMode(
  context: ToolPermissionContext,
): ToolPermissionContext {
  if (context.mode !== 'plan') return context
  if (autoModeStateModule?.isAutoModeActive()) {
    autoModeStateModule.setAutoModeActive(false)
    setNeedsAutoModeExitAttachment(true)
  }
  return restoreDangerousPermissions(context)
}
