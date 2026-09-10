let teamToolsModeEnabled = false
const listeners = new Set<() => void>()

export function isTeamToolsModeEnabled(): boolean {
  return teamToolsModeEnabled
}

export function setTeamToolsModeEnabled(enabled: boolean): void {
  if (teamToolsModeEnabled === enabled) return
  teamToolsModeEnabled = enabled
  for (const listener of listeners) listener()
}

export function subscribeToTeamToolsMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
