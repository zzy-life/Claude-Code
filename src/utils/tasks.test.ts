import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  clearKnownTaskPresence,
  createTask,
  getKnownTaskPresence,
  hydrateKnownTaskPresence,
  resetTaskList,
} from './tasks.js'

let tempConfigDir: string | undefined

async function useTempConfigDir(): Promise<void> {
  tempConfigDir = await mkdtemp(join(tmpdir(), 'claude-code-tasks-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
}

afterEach(async () => {
  delete process.env.CLAUDE_CONFIG_DIR
  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = undefined
  }
})

describe('task presence hydration', () => {
  test('hydrates false when no user tasks exist', async () => {
    await useTempConfigDir()
    const taskListId = 'empty-hydration-list'

    expect(getKnownTaskPresence(taskListId)).toBeUndefined()
    await expect(hydrateKnownTaskPresence(taskListId)).resolves.toBe(false)
    expect(getKnownTaskPresence(taskListId)).toBe(false)
  })

  test('hydrates true when persisted user tasks exist', async () => {
    await useTempConfigDir()
    const taskListId = 'populated-hydration-list'
    await createTask(taskListId, {
      subject: 'Review policy',
      description: 'Review dynamic exposure policy',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    // createTask marks presence true immediately; clear it to exercise disk hydration.
    clearKnownTaskPresence(taskListId)
    await expect(hydrateKnownTaskPresence(taskListId)).resolves.toBe(true)
    expect(getKnownTaskPresence(taskListId)).toBe(true)
  })

  test('ignores internal tasks when hydrating presence', async () => {
    await useTempConfigDir()
    const taskListId = 'internal-only-hydration-list'
    await createTask(taskListId, {
      subject: 'Internal bookkeeping',
      description: 'Hidden internal task',
      status: 'pending',
      blocks: [],
      blockedBy: [],
      metadata: { _internal: true },
    })

    // createTask marks presence true immediately; clear it to exercise disk hydration.
    clearKnownTaskPresence(taskListId)
    await expect(hydrateKnownTaskPresence(taskListId)).resolves.toBe(false)
  })

  test('resetTaskList publishes false presence', async () => {
    await useTempConfigDir()
    const taskListId = 'reset-presence-list'
    await createTask(taskListId, {
      subject: 'Temporary task',
      description: 'Will be reset',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    await resetTaskList(taskListId)
    expect(getKnownTaskPresence(taskListId)).toBe(false)
  })
})
