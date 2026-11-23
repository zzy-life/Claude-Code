import type { Tool, ToolUseContext } from '../../Tool.js'
import type { AssistantMessage } from '../../types/message.js'
import { z } from 'zod/v4'
import { getCwd } from '../cwd.js'
import { AbortError, errorMessage } from '../errors.js'
import { createSystemMessage } from '../messages.js'
import { sideQuery, type SideQueryOptions } from '../sideQuery.js'
import { modelSupportsStructuredOutputs } from '../betas.js'
import { hasLocalAutoApprovalConsent } from '../settings/settings.js'
import { isAutoModeGateEnabled } from './permissionSetup.js'
import { buildAutoApprovalEvidence } from './autoApprovalContext.js'
import { AUTO_APPROVAL_OUTPUT_SCHEMA, AUTO_APPROVAL_SYSTEM_PROMPT } from './autoApprovalPrompt.js'
import { resolveAutoApprovalModel, recordAutoApprovalUsage } from './autoApprovalModel.js'
import type {
  AutoApprovalResult,
  PermissionDecision,
  PermissionAskDecision,
  PermissionMode,
} from '../../types/permissions.js'

/** Only edit/path checks use this; callers must preserve the actual mode. */
export function allowsAutomaticWorkspaceEdits(mode: PermissionMode): boolean {
  return mode === 'acceptEdits' || mode === 'auto'
}

/** Apply after existing deny/allow checks, never as a replacement for them. */
export function requiresHumanApproval(
  decision: PermissionAskDecision,
  requiresUserInteraction: boolean,
  hookForcedAsk: boolean,
): boolean {
  if (requiresUserInteraction || hookForcedAsk) {
    return true
  }
  const reason = decision.decisionReason
  if (reason?.type === 'rule') {
    return reason.rule.ruleBehavior === 'ask'
  }
  if (reason?.type === 'hook') return true
  if (reason?.type === 'safetyCheck') {
    return !reason.classifierApprovable
  }
  // Compound command decisions must not hide a human-only subcommand.
  if (reason?.type === 'subcommandResults') {
    for (const result of reason.reasons.values()) {
      if (
        result.behavior === 'ask' &&
        requiresHumanApproval(result, false, false)
      ) {
        return true
      }
    }
  }
  return false
}

export const AUTO_APPROVAL_TIMEOUT_MS = 60_000
export const AUTO_APPROVAL_MAX_OUTPUT_TOKENS = 512

export const autoApprovalResultSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('allow') }).strict(),
  z.object({ decision: z.literal('deny'), reason: z.string().trim().min(1) }).strict(),
  z.object({ decision: z.literal('needs_user'), reason: z.string().trim().min(1) }).strict(),
])

/** New implementation stays dormant until the new local consent is accepted. */
export function usesLocalAutoApproval(context: ToolUseContext): boolean {
  return !!context.approvalTurnScope &&
    context.getAppState().toolPermissionContext.mode === 'auto' &&
    !context.options.isNonInteractiveSession &&
    isAutoModeGateEnabled() && hasLocalAutoApprovalConsent()
}

function manualDecision(result: PermissionAskDecision, reason: string): PermissionAskDecision {
  return {
    ...result,
    message: `User approval required: ${reason}`,
    pendingClassifierCheck: undefined,
    autoApprovalNeedsUser: true,
  }
}

/** Called after PermissionRequest hooks, with the final input and no concurrent approvers. */
export async function reviewToolWithAutoApproval(args: {
  tool: Tool
  input: Record<string, unknown>
  context: ToolUseContext
  assistantMessage: AssistantMessage
  toolUseID: string
  result: PermissionAskDecision
  recheck: () => Promise<PermissionDecision>
  /** Direct dependency injection for independent tests; not a production setting. */
  deps?: {
    query: (options: SideQueryOptions) => ReturnType<typeof sideQuery>
    resolveModel: typeof resolveAutoApprovalModel
    supportsStructuredOutputs: typeof modelSupportsStructuredOutputs
    recordUsage: typeof recordAutoApprovalUsage
    isActive: typeof usesLocalAutoApproval
  }
}): Promise<PermissionDecision> {
  const { tool, input, context, toolUseID, result } = args
  const scope = context.approvalTurnScope!
  const deps = args.deps ?? {
    query: sideQuery, resolveModel: resolveAutoApprovalModel,
    supportsStructuredOutputs: modelSupportsStructuredOutputs,
    recordUsage: recordAutoApprovalUsage, isActive: usesLocalAutoApproval,
  }
  const inputJSON = JSON.stringify(input)
  const revision = scope.permissionRevision
  const key = `${revision}:${tool.name}:${inputJSON}`
  const existing = scope.requests.get(toolUseID)
  if (existing) {
    if (existing.key === key) return existing.promise
    return manualDecision(result, 'The pending input or permissions changed; the previous approval cannot be reused')
  }
  const promise = (async (): Promise<PermissionDecision> => {
    if (context.abortController.signal.aborted) throw new AbortError()
    if (!deps.isActive(context)) return manualDecision(result, 'The current mode no longer allows AI approval')
    if (requiresHumanApproval(result, !!tool.requiresUserInteraction?.(), false)) {
      return manualDecision(result, result.message)
    }
    const model = deps.resolveModel(scope.rootModel)
    if (!model) return manualDecision(result, 'Cannot select an approval model because the root session model family could not be determined')
    if (!deps.supportsStructuredOutputs(model)) {
      return manualDecision(result, 'The approval model does not support the required structured output')
    }
    const evidence = buildAutoApprovalEvidence({
      rootMessages: scope.rootMessages,
      agentMessages: context.messages,
      constraints: scope.constraints,
      toolUseID,
      action: { toolName: tool.name, input: JSON.parse(inputJSON) },
      environment: {
        cwd: getCwd(), platform: process.platform,
        mode: context.getAppState().toolPermissionContext.mode,
        rules: context.getAppState().toolPermissionContext,
        additionalWorkingDirectories: [...context.getAppState().toolPermissionContext.additionalWorkingDirectories],
        notice: 'Existing deny/explicit ask/mandatory safety checks cannot be overridden; no system-level sandbox is promised.',
      },
      previousDenials: context.autoApprovalDenials ?? [],
      verifiedAnswers: scope.verifiedAnswers,
      taskAnswers: scope.taskAnswers,
    })
    if ('reason' in evidence) return manualDecision(result, evidence.reason)
    const controller = new AbortController()
    const cancel = () => controller.abort()
    context.abortController.signal.addEventListener('abort', cancel, { once: true })
    const unregisterInvalidation = scope.onInvalidated(cancel)
    const timer = setTimeout(cancel, AUTO_APPROVAL_TIMEOUT_MS)
    let approval: AutoApprovalResult
    try {
      const request = deps.query({
        model, querySource: 'auto_approval',
        system: [{ type: 'text', text: AUTO_APPROVAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: evidence.content }],
        output_format: { type: 'json_schema', schema: AUTO_APPROVAL_OUTPUT_SCHEMA },
        max_tokens: AUTO_APPROVAL_MAX_OUTPUT_TOKENS,
        signal: controller.signal, skipSystemPromptPrefix: true,
      }).then(response => {
        // A transport that ignores abort can still return billable usage later.
        deps.recordUsage(response, model)
        return response
      })
      let removeAbortWaiter = () => {}
      const cancelled = new Promise<never>((_resolve, reject) => {
        const rejectAbort = () => reject(new AbortError())
        controller.signal.addEventListener('abort', rejectAbort, { once: true })
        removeAbortWaiter = () => controller.signal.removeEventListener('abort', rejectAbort)
        if (controller.signal.aborted) rejectAbort()
      })
      let response: Awaited<typeof request>
      try {
        response = await Promise.race([request, cancelled])
      } finally {
        removeAbortWaiter()
      }
      if (controller.signal.aborted) {
        return manualDecision(result, 'Approval was cancelled or timed out; late results will not be applied')
      }
      if (response.stop_reason !== 'end_turn') {
        return manualDecision(result, `The approval response did not complete (${response.stop_reason})`)
      }
      if (response.content.length !== 1 || response.content[0]?.type !== 'text') {
        return manualDecision(result, 'The approval service returned unexpected response blocks')
      }
      approval = autoApprovalResultSchema.parse(JSON.parse(response.content[0].text))
    } catch (error) {
      if (context.abortController.signal.aborted) throw new AbortError()
      return manualDecision(result, controller.signal.aborted
        ? 'Approval timed out or permissions changed; the action was not executed'
        : `The approval service is unavailable: ${errorMessage(error)}`)
    } finally {
      clearTimeout(timer)
      unregisterInvalidation()
      context.abortController.signal.removeEventListener('abort', cancel)
      // Abandon every late result before opening the manual queue.
      controller.abort()
    }
    if (context.abortController.signal.aborted) throw new AbortError()
    if (scope.permissionRevision !== revision || !deps.isActive(context) || JSON.stringify(input) !== inputJSON) {
      return manualDecision(result, 'The input or permissions changed during approval; the previous result is no longer valid')
    }
    if (approval.decision === 'needs_user') return manualDecision(result, approval.reason)
    if (approval.decision === 'deny') {
      context.autoApprovalDenials ??= []
      context.autoApprovalDenials.push({ toolName: tool.name, reason: approval.reason })
      const message = `This action was denied: ${approval.reason}`
      context.appendSystemMessage?.(createSystemMessage(message, 'warning'))
      // The caller receives the tool error; the direct parent receives a separate notification.
      if (context.agentId) {
        context.reportAutoApprovalDenial?.({ agentId: context.agentId, toolUseID, toolName: tool.name, reason: approval.reason })
      }
      return { behavior: 'deny', message, decisionReason: { type: 'other', reason: 'auto_approval_deny' } }
    }
    // Re-run pure permission checks only, never side-effectful hooks.
    const fresh = await args.recheck()
    if (context.abortController.signal.aborted) throw new AbortError()
    if (fresh.behavior === 'deny') return fresh
    if (scope.permissionRevision !== revision || !deps.isActive(context) || JSON.stringify(input) !== inputJSON ||
      (fresh.behavior === 'ask' && requiresHumanApproval(fresh, !!tool.requiresUserInteraction?.(), false)) ||
      (fresh.updatedInput && JSON.stringify(fresh.updatedInput) !== inputJSON)) {
      return manualDecision(result, 'Permissions or arguments changed before execution; approval is required again')
    }
    return {
      behavior: 'allow', updatedInput: JSON.parse(inputJSON),
      decisionReason: { type: 'mode', mode: 'auto' },
      autoApprovalReceipt: { toolUseID, inputJSON, permissionRevision: revision, used: false },
    }
  })()
  scope.requests.set(toolUseID, { key, promise })
  return promise
}

export type AutoApprovalEnvironment =
  | 'localInteractive'
  | 'localSubagent'
  | 'sdk'
  | 'headless'
  | 'bridge'
  | 'teammate'

/** Environment contract only; consent and policy must also pass before activation. */
export function supportsLocalAutoApproval(
  environment: AutoApprovalEnvironment,
): boolean {
  return environment === 'localInteractive' || environment === 'localSubagent'
}
