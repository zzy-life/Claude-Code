import { isEnvTruthy } from '../envUtils.js'

export function isBypassPermissionsBlockedByRoot(): boolean {
  return (
    process.platform !== 'win32' &&
    typeof process.getuid === 'function' &&
    process.getuid() === 0 &&
    process.env.IS_SANDBOX !== '1' &&
    !isEnvTruthy(process.env.CLAUDE_CODE_BUBBLEWRAP)
  )
}

// Shared by startup and local mode switching: opening a UI slot must not
// bypass the environment restrictions previously enforced only at startup.
export async function getBypassPermissionsEnvironmentError(): Promise<string | undefined> {
  if (isBypassPermissionsBlockedByRoot()) {
    return '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons'
  }

  return undefined
}
