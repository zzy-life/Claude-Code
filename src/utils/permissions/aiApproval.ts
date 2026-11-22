import type {
  PermissionAskDecision,
  PermissionMode,
} from '../../types/permissions.js'

/** Only edit/path checks use this; callers must preserve the actual mode. */
export function allowsAutomaticWorkspaceEdits(mode: PermissionMode): boolean {
  return mode === 'acceptEdits' || mode === 'auto'
}

/** Apply after existing deny/allow checks, never as a replacement for them. */
export function requiresHumanApproval(
  decision: PermissionAskDecision,
  requiresUserInteraction: boolean,
  hookForcedAsk: boolean,
): boolean {
  if (requiresUserInteraction || hookForcedAsk) {
    return true
  }
  const reason = decision.decisionReason
  if (reason?.type === 'rule') {
    return reason.rule.ruleBehavior === 'ask'
  }
  if (reason?.type === 'hook') return true
  if (reason?.type === 'safetyCheck') {
    return !reason.classifierApprovable
  }
  // Compound command decisions must not hide a human-only subcommand.
  if (reason?.type === 'subcommandResults') {
    for (const result of reason.reasons.values()) {
      if (
        result.behavior === 'ask' &&
        requiresHumanApproval(result, false, false)
      ) {
        return true
      }
    }
  }
  return false
}

export type AutoApprovalEnvironment =
  | 'localInteractive'
  | 'localSubagent'
  | 'sdk'
  | 'headless'
  | 'bridge'
  | 'teammate'

/** Environment contract only; consent and policy must also pass before activation. */
export function supportsLocalAutoApproval(
  environment: AutoApprovalEnvironment,
): boolean {
  return environment === 'localInteractive' || environment === 'localSubagent'
}
