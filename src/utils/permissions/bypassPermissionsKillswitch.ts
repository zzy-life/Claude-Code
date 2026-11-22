import { useEffect } from 'react'
import {
  type AppState,
  useAppState,
  useAppStateStore,
  useSetAppState,
} from 'src/state/AppState.js'
import type { ToolPermissionContext } from 'src/Tool.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import {
  createDisabledBypassPermissionsContext,
  shouldDisableBypassPermissions,
  verifyAutoModeGateAccess,
} from './permissionSetup.js'

let bypassPermissionsCheckRan = false

export async function checkAndDisableBypassPermissionsIfNeeded(
  toolPermissionContext: ToolPermissionContext,
  setAppState: (f: (prev: AppState) => AppState) => void,
): Promise<void> {
  // Check if bypassPermissions should be disabled based on Statsig gate
  // Do this only once, before the first query, to ensure we have the latest gate value
  if (bypassPermissionsCheckRan) {
    return
  }
  bypassPermissionsCheckRan = true

  if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
    return
  }

  const shouldDisable = await shouldDisableBypassPermissions()
  if (!shouldDisable) {
    return
  }

  setAppState(prev => {
    return {
      ...prev,
      toolPermissionContext: createDisabledBypassPermissionsContext(
        prev.toolPermissionContext,
      ),
    }
  })
}

/**
 * Reset the run-once flag for checkAndDisableBypassPermissionsIfNeeded.
 * Call this after /login so the gate check re-runs with the new org.
 */
export function resetBypassPermissionsCheck(): void {
  bypassPermissionsCheckRan = false
}

export function useKickOffCheckAndDisableBypassPermissionsIfNeeded(): void {
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)
  const setAppState = useSetAppState()

  // Run once, when the component mounts
  useEffect(() => {
    if (getIsRemoteMode()) return
    void checkAndDisableBypassPermissionsIfNeeded(
      toolPermissionContext,
      setAppState,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export async function checkAndDisableAutoModeIfNeeded(
  toolPermissionContext: ToolPermissionContext,
  setAppState: (f: (prev: AppState) => AppState) => void,
  fastMode?: boolean,
): Promise<void> {
  const { updateContext, notification } = await verifyAutoModeGateAccess(
    toolPermissionContext,
    fastMode,
  )
  setAppState(prev => {
    // Apply local policy to the current context: a mode change may have
    // occurred while awaiting verification.
    const nextCtx = updateContext(prev.toolPermissionContext)
    const newState =
      nextCtx === prev.toolPermissionContext
        ? prev
        : { ...prev, toolPermissionContext: nextCtx }
    if (!notification) return newState
    return {
      ...newState,
      notifications: {
        ...newState.notifications,
        queue: [
          ...newState.notifications.queue,
          {
            key: 'auto-mode-gate-notification',
            text: notification,
            color: 'warning' as const,
            priority: 'high' as const,
          },
        ],
      },
    }
  })
}

/** Compatibility for login callers; local policy is rechecked on every call. */
export function resetAutoModeGateCheck(): void {}

export function useKickOffCheckAndDisableAutoModeIfNeeded(): void {
  const mainLoopModel = useAppState(s => s.mainLoopModel)
  const mainLoopModelForSession = useAppState(s => s.mainLoopModelForSession)
  const fastMode = useAppState(s => s.fastMode)
  const settings = useAppState(s => s.settings)
  const setAppState = useSetAppState()
  const store = useAppStateStore()

  // Recheck local policy on startup and settings changes. Retain existing
  // model/speed triggers for callers, without caching the availability result.
  useEffect(() => {
    void checkAndDisableAutoModeIfNeeded(
      store.getState().toolPermissionContext,
      setAppState,
      fastMode,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLoopModel, mainLoopModelForSession, fastMode, settings])
}
