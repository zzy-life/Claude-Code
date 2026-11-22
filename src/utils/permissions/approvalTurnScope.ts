import { randomUUID } from 'crypto'
import type { Message } from '../../types/message.js'
import type { PermissionDecision, ToolPermissionContext } from '../../types/permissions.js'

export type ApprovalTurnStop = {
  decision: 'hard_deny'
  toolUseID: string
  reason: string
}

/** Shared only by one root turn and its ordinary local descendants. */
export class ApprovalTurnScope {
  readonly turnId = randomUUID()
  private stopState: Readonly<ApprovalTurnStop> | undefined
  private readonly controller = new AbortController()
  private permissionState: ToolPermissionContext | undefined
  private permissionKey: string | undefined
  permissionRevision = 0
  rootModel: string | undefined
  rootMessages: Message[] = []
  constraints: Record<string, string> = {}
  readonly verifiedAnswers: Array<{ toolUseID: string; toolName: string; question: unknown; answer: unknown }> = []
  consecutiveDenials = 0
  readonly previousDenials: Array<{ toolName: string; reason: string }> = []
  readonly requests = new Map<string, { key: string; promise: Promise<PermissionDecision> }>()
  readonly hookDecisions = new Map<string, Promise<PermissionDecision | null>>()
  private lifecycleUsers = 0
  private unsubscribePermissions: (() => void) | undefined

  trackPermissions(unsubscribe: () => void): void {
    this.unsubscribePermissions = unsubscribe
  }

  retain(): () => void {
    this.lifecycleUsers++
    return () => {
      this.lifecycleUsers--
      if (this.lifecycleUsers === 0) {
        this.unsubscribePermissions?.()
        this.unsubscribePermissions = undefined
      }
    }
  }
  private readonly invalidationListeners = new Set<() => void>()

  /** Called from the root store subscription, including auto -> other -> auto. */
  updatePermissions(context: ToolPermissionContext): void {
    if (context === this.permissionState) return
    this.permissionState = context
    const key = JSON.stringify({
      mode: context.mode,
      allow: context.alwaysAllowRules,
      deny: context.alwaysDenyRules,
      ask: context.alwaysAskRules,
      directories: [...context.additionalWorkingDirectories],
    })
    if (key === this.permissionKey) return
    this.permissionKey = key
    this.permissionRevision++
    for (const invalidate of this.invalidationListeners) invalidate()
  }

  invalidateApprovals(): void {
    this.permissionRevision++
    for (const invalidate of this.invalidationListeners) invalidate()
  }

  onInvalidated(listener: () => void): () => void {
    this.invalidationListeners.add(listener)
    return () => this.invalidationListeners.delete(listener)
  }

  constructor(private readonly onStop: (stop: Readonly<ApprovalTurnStop>) => void) {}

  get stop(): Readonly<ApprovalTurnStop> | undefined {
    return this.stopState
  }

  /** This signal is deliberately independent of the user's ESC signal. */
  get signal(): AbortSignal {
    return this.controller.signal
  }

  throwIfStopped(): void {
    if (this.stopState) {
      throw new ApprovalTurnStoppedError(this.stopState)
    }
  }

  stopTurn(stop: ApprovalTurnStop): void {
    if (this.stopState) return
    // Lock synchronously before notifying pending approvals or running tools.
    this.stopState = Object.freeze({ ...stop })
    try {
      // Persist/show the reason before cancellation can tear down the query.
      this.onStop(this.stopState)
    } finally {
      this.controller.abort(this.stopState)
    }
  }

  registerController(controller: AbortController): () => void {
    const cancel = () => controller.abort(this.stopState)
    if (this.stopState) {
      cancel()
      return () => {}
    }
    this.signal.addEventListener('abort', cancel, { once: true })
    return () => this.signal.removeEventListener('abort', cancel)
  }
}

export class ApprovalTurnStoppedError extends Error {
  constructor(readonly stop: Readonly<ApprovalTurnStop>) {
    super(`Turn blocked and stopped: ${stop.reason}`)
    this.name = 'ApprovalTurnStoppedError'
  }
}
