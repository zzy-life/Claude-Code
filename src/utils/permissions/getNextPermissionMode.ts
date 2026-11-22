import { getIsRemoteMode } from '../../bootstrap/state.js'
import { isInProcessTeammate } from '../teammateContext.js'
import type { ToolPermissionContext } from '../../Tool.js'
import { logForDebugging } from '../debug.js'
import type { PermissionMode } from './PermissionMode.js'
import {
  getAutoModeUnavailableReason,
  isAutoModeGateEnabled,
  transitionPermissionMode,
} from './permissionSetup.js'

// Availability follows the local policy, not classifier entitlement or consent.
// Consent is checked separately immediately before actual activation.
function canCycleToAuto(ctx: ToolPermissionContext): boolean {
  if (isInProcessTeammate() || getIsRemoteMode()) {
    return false
  }
  const gateEnabled = isAutoModeGateEnabled()
  const can = !!ctx.isAutoModeAvailable && gateEnabled
  if (!can) {
    logForDebugging(
      `[auto-mode] canCycleToAuto=false: ctx.isAutoModeAvailable=${ctx.isAutoModeAvailable} isAutoModeGateEnabled=${gateEnabled} reason=${getAutoModeUnavailableReason()}`,
    )
  }
  return can
}

/**
 * Determines the next permission mode when cycling through modes with Shift+Tab.
 */
export function getNextPermissionMode(
  toolPermissionContext: ToolPermissionContext,
  _teamContext?: { leadAgentId: string },
): PermissionMode {
  switch (toolPermissionContext.mode) {
    case 'default':
      return 'plan'

    case 'plan':
      return 'acceptEdits'

    case 'acceptEdits':
      if (canCycleToAuto(toolPermissionContext)) {
        return 'auto'
      }
      if (toolPermissionContext.isBypassPermissionsModeAvailable) {
        return 'bypassPermissions'
      }
      return 'default'

    case 'auto':
      if (toolPermissionContext.isBypassPermissionsModeAvailable) {
        return 'bypassPermissions'
      }
      return 'default'

    case 'bypassPermissions':
      return 'default'

    case 'dontAsk':
      // Not exposed in UI cycle yet, but return default if somehow reached
      return 'default'


    default:
      // Future modes always fall back to the normal permission flow.
      return 'default'
  }
}

/**
 * Computes the next permission mode and prepares the context for it.
 * Applies the shared transition policy without activating a mode before consent.
 *
 * @returns The next mode and its prepared permission context
 */
export function cyclePermissionMode(
  toolPermissionContext: ToolPermissionContext,
  teamContext?: { leadAgentId: string },
): { nextMode: PermissionMode; context: ToolPermissionContext } {
  const nextMode = getNextPermissionMode(toolPermissionContext, teamContext)
  return {
    nextMode,
    context: transitionPermissionMode(
      toolPermissionContext.mode,
      nextMode,
      toolPermissionContext,
    ),
  }
}
