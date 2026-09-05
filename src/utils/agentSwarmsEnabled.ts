/**
 * Team and teammate features are part of the base external toolset.
 * Keep this centralized check so existing call sites share one contract.
 */
export function isAgentSwarmsEnabled(): boolean {
  return true
}
