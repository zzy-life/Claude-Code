import type { Message } from '../../types/message.js'
import type { PermissionDecision, ToolPermissionContext } from '../../types/permissions.js'

/** Root evidence and permission revisions shared by ordinary local descendants, never a stop domain. */
export class ApprovalTurnScope {
  private permissionState: ToolPermissionContext | undefined
  private permissionKey: string | undefined
  permissionRevision = 0
  rootModel: string | undefined
  rootMessages: Message[] = []
  constraints: Record<string, string> = {}
  readonly verifiedAnswers: Array<{ toolUseID: string; toolName: string; question: unknown; answer: unknown }> = []
  /** Complete task questions/answers preserve restrictions, never dedicated permission grants. */
  readonly taskAnswers: Array<{ toolUseID: string; toolName: string; question: unknown; answer: unknown }> = []
  readonly requests = new Map<string, { key: string; promise: Promise<PermissionDecision> }>()
  readonly hookDecisions = new Map<string, Promise<PermissionDecision | null>>()
  private lifecycleUsers = 0
  private unsubscribePermissions: (() => void) | undefined
  private readonly invalidationListeners = new Set<() => void>()

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
    this.invalidateApprovals()
  }

  invalidateApprovals(): void {
    this.permissionRevision++
    for (const invalidate of this.invalidationListeners) invalidate()
  }

  onInvalidated(listener: () => void): () => void {
    this.invalidationListeners.add(listener)
    return () => this.invalidationListeners.delete(listener)
  }
}
