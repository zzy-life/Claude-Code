import { randomUUID } from 'crypto'

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
    super(`已阻止并停止本轮：${stop.reason}`)
    this.name = 'ApprovalTurnStoppedError'
  }
}
