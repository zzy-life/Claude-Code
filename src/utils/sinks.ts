import { initializeErrorLogSink } from './errorLogSink.js'

/**
 * Attach the local error log sink, draining errors queued before
 * attachment. Initialization is idempotent. Called from setup() for the default
 * command; other entrypoints (subcommands, daemon, bridge) call this directly
 * since they bypass setup().
 *
 * Leaf module — kept out of setup.ts to avoid the setup → commands → bridge
 * → setup import cycle.
 */
export function initSinks(): void {
  initializeErrorLogSink()
}
