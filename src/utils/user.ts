import { execa } from 'execa'
import memoize from 'lodash-es/memoize.js'
import { getCwd } from './cwd.js'

/**
 * Reset the git email cache on auth changes (login/logout/account switch).
 */
export function resetUserCache(): void {
  getGitEmail.cache.clear?.()
}

/**
 * Get the user's git email from `git config user.email`.
 * Memoized so the subprocess only spawns once per process.
 */
export const getGitEmail = memoize(async (): Promise<string | undefined> => {
  const result = await execa('git config --get user.email', {
    shell: true,
    reject: false,
    cwd: getCwd(),
  })
  return result.exitCode === 0 && result.stdout
    ? result.stdout.trim()
    : undefined
})
