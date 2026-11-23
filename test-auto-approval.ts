// 一键契约测试：真实审批服务/停止域/模型选择 + 内存依赖夹具。
// 不调用真实 API、不执行工具动作、不读写真实用户设置；不等同于终端端到端测试。
const TEST_TIMEOUT_MS = 5
const OVERSIZED_ACTION_LENGTH = 200_000
const TEST_MODEL_IDS = { opus: 'fixture-opus', sonnet: 'fixture-sonnet', haiku: 'fixture-haiku' }
const TEST_USAGE = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 }
const TEST_COST_USD = 0.01
const TEST_API_ERROR = 'Injected approval service failure'
const STOP_REASON = '测试：操作超出授权范围'
const TOOL_USE_ID = 'approval-test-tool'
const TEST_ROOT_MODEL = 'test-root-model'
const TEST_REVIEW_MODEL = 'test-review-model'
const MODE_CYCLE_CONTEXT: ToolPermissionContext = {
  mode: 'default', additionalWorkingDirectories: new Map(),
  alwaysAllowRules: {}, alwaysDenyRules: {}, alwaysAskRules: {},
  isBypassPermissionsModeAvailable: false,
  isAutoModeAvailable: false,
}
const MODE_CYCLE_CASES = [
  { mode: 'default', bypassAvailable: false, expected: 'plan' },
  { mode: 'default', bypassAvailable: true, expected: 'plan' },
  { mode: 'plan', bypassAvailable: false, expected: 'acceptEdits' },
  { mode: 'plan', bypassAvailable: true, expected: 'acceptEdits' },
  { mode: 'acceptEdits', bypassAvailable: true, expected: 'bypassPermissions' },
  { mode: 'acceptEdits', bypassAvailable: false, expected: 'default' },
  { mode: 'auto', bypassAvailable: true, expected: 'bypassPermissions' },
  { mode: 'auto', bypassAvailable: false, expected: 'default' },
  { mode: 'bypassPermissions', bypassAvailable: true, expected: 'default' },
  { mode: 'bypassPermissions', bypassAvailable: false, expected: 'default' },
] as const

import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import type { SideQueryOptions } from './src/utils/sideQuery.js'
import type { Message } from './src/types/message.js'

// 必须在动态加载生产模块前隔离边界，避免审批模块的传递导入初始化真实 API/UI。
let localGate = true
let modelOverrides: Record<string, string> = {}
let sessionCost = 0
let sessionUsageCalls = 0
mock.module('./src/utils/sideQuery.js', () => ({ sideQuery: async () => { throw new Error('禁止真实审批请求') } }))
mock.module('./src/utils/betas.js', () => ({ modelSupportsStructuredOutputs: () => true }))
mock.module('./src/utils/settings/settings.js', () => ({
  hasLocalAutoApprovalConsent: () => true,
  getInitialSettings: () => ({ modelOverrides }),
}))
mock.module('./src/utils/permissions/permissionSetup.js', () => ({
  isAutoModeGateEnabled: () => localGate,
  getAutoModeUnavailableReason: () => 'fixture gate disabled',
  transitionPermissionMode: () => { throw new Error('本夹具不模拟模式激活') },
}))
mock.module('./src/utils/teammateContext.js', () => ({ isInProcessTeammate: () => false }))
mock.module('./src/utils/cwd.js', () => ({ getCwd: () => 'fixture-workspace' }))
mock.module('./src/utils/debug.js', () => ({ logForDebugging: () => {} }))
mock.module('./src/utils/messages.js', () => ({ createSystemMessage: (message: string) => ({ type: 'system', message }) }))
mock.module('./src/services/tokenEstimation.js', () => ({ roughTokenCountEstimation: (text: string) => Math.round(text.length / 4) }))
mock.module('./src/utils/model/model.js', () => ({
  getDefaultOpusModel: () => TEST_MODEL_IDS.opus,
  getDefaultSonnetModel: () => TEST_MODEL_IDS.sonnet,
  getDefaultHaikuModel: () => TEST_MODEL_IDS.haiku,
  normalizeModelStringForAPI: (model: string) => model,
  parseUserSpecifiedModel: (model: string) => TEST_MODEL_IDS[model as keyof typeof TEST_MODEL_IDS] ?? model,
}))
mock.module('./src/utils/model/modelStrings.js', () => ({ getModelStrings: () => ({}) }))
mock.module('./src/cost-tracker.js', () => ({ addToTotalSessionCost: (cost: number) => { sessionCost += cost; sessionUsageCalls++ } }))
mock.module('./src/utils/modelCost.js', () => ({ calculateUSDCost: () => TEST_COST_USD }))

const { ApprovalTurnScope, ApprovalTurnStoppedError } = await import('./src/utils/permissions/approvalTurnScope.js')
const { buildAutoApprovalEvidence } = await import('./src/utils/permissions/autoApprovalContext.js')
const { getNextPermissionMode } = await import('./src/utils/permissions/getNextPermissionMode.js')
const { allowsAutomaticWorkspaceEdits, requiresHumanApproval, supportsLocalAutoApproval, reviewToolWithAutoApproval, autoApprovalResultSchema } = await import('./src/utils/permissions/autoApproval.js')
const { identifyApprovalModelFamily, resolveAutoApprovalModel, recordAutoApprovalUsage } = await import('./src/utils/permissions/autoApprovalModel.js')
const { ALL_MODEL_CONFIGS } = await import('./src/utils/model/configs.js')
const { getAutoApprovalUsage } = await import('./src/bootstrap/state.js')
import type { Tool, ToolPermissionContext, ToolUseContext } from './src/Tool.js'
import { EXTERNAL_PERMISSION_MODES, INTERNAL_PERMISSION_MODES, PERMISSION_MODES } from './src/types/permissions.js'
import type { AssistantMessage } from './src/types/message.js'

let notifications = 0
const scope = new ApprovalTurnScope(() => { notifications++ })
const otherTurn = new ApprovalTurnScope(() => {})
const root = new AbortController()
const background = new AbortController()
const removed = new AbortController()
const unregisterRoot = scope.registerController(root)
const unregisterBackground = scope.registerController(background)
const unregisterRemoved = scope.registerController(removed)
unregisterRemoved()

// ESC 只取消原控制器，不触发轮次硬停止，也不取消独立后台代理。
root.abort('interrupt')
assert.equal(scope.stop === undefined, true)
assert.equal(background.signal.aborted, false)
scope.stopTurn({ decision: 'hard_deny', toolUseID: TOOL_USE_ID, reason: STOP_REASON })
assert.equal(background.signal.aborted, true)
assert.equal(removed.signal.aborted, false)
assert.equal(otherTurn.signal.aborted, false)
assert.equal(scope.stop?.reason, STOP_REASON)
assert.throws(() => scope.throwIfStopped(), ApprovalTurnStoppedError)
scope.stopTurn({ decision: 'hard_deny', toolUseID: TOOL_USE_ID, reason: '不得覆盖第一次拒绝' })
assert.equal(notifications, 1)
assert.equal(scope.stop?.reason, STOP_REASON)
const late = new AbortController()
scope.registerController(late)()
assert.equal(late.signal.aborted, true)
unregisterRoot()
unregisterBackground()

// 展示/记录回调失败也不能阻止安全取消。
const failingScope = new ApprovalTurnScope(() => { throw new Error('测试记录失败') })
const failingController = new AbortController()
failingScope.registerController(failingController)
assert.throws(() => failingScope.stopTurn({ decision: 'hard_deny', toolUseID: TOOL_USE_ID, reason: STOP_REASON }))
assert.equal(failingController.signal.aborted, true)
assert.throws(() => failingScope.throwIfStopped(), ApprovalTurnStoppedError)

for (const mode of ['default', 'plan', 'dontAsk', 'bypassPermissions'] as const) {
  assert.equal(allowsAutomaticWorkspaceEdits(mode), false)
}
assert.equal(allowsAutomaticWorkspaceEdits('acceptEdits'), true)
assert.equal(allowsAutomaticWorkspaceEdits('auto'), true)
assert.equal(requiresHumanApproval({ behavior: 'ask', message: '' }, false, false), false)
assert.equal(requiresHumanApproval({ behavior: 'ask', message: '' }, true, false), true)
assert.equal(requiresHumanApproval({ behavior: 'ask', message: '' }, false, true), true)
assert.equal(requiresHumanApproval({ behavior: 'ask', message: '', decisionReason: {
  type: 'rule', rule: { source: 'userSettings', ruleBehavior: 'ask', ruleValue: { toolName: 'Bash' } },
} }, false, false), true)
for (const classifierApprovable of [false, true]) {
  assert.equal(requiresHumanApproval({ behavior: 'ask', message: '', decisionReason: {
    type: 'safetyCheck', reason: '测试安全检查', classifierApprovable,
  } }, false, false), !classifierApprovable)
}
for (const environment of ['sdk', 'headless', 'bridge', 'teammate'] as const) {
  assert.equal(supportsLocalAutoApproval(environment), false)
}
assert.equal(supportsLocalAutoApproval('localInteractive'), true)
assert.equal(supportsLocalAutoApproval('localSubagent'), true)
console.log('PASS：第一阶段轮次停止、ESC 隔离、编辑能力及人工/环境边界契约')

function makeReviewFixture(decision: unknown) {
  const turn = new ApprovalTurnScope(() => {})
  turn.rootModel = TEST_ROOT_MODEL
  turn.rootMessages = [{ type: 'user', message: { content: '仅检查指定临时文件，不要外传任何内容' } }]
  const permissionContext = {
    mode: 'auto' as const, additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {}, alwaysDenyRules: {}, alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
  turn.updatePermissions(permissionContext)
  let calls = 0
  let usages = 0
  const context = {
    approvalTurnScope: turn, abortController: new AbortController(),
    options: { isNonInteractiveSession: false }, messages: [],
    getAppState: () => ({ toolPermissionContext: permissionContext }),
  } as unknown as ToolUseContext
  const args = {
    tool: { name: 'TestRead', requiresUserInteraction: () => false } as unknown as Tool,
    input: { path: 'temporary-safe-target' }, context,
    assistantMessage: {} as AssistantMessage, toolUseID: TOOL_USE_ID,
    result: { behavior: 'ask' as const, message: 'test ask' },
    recheck: async () => ({ behavior: 'ask' as const, message: 'still requires approval' }),
    deps: {
      query: async (_options: SideQueryOptions) => {
        calls++
        return { id: 'test-response', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(decision) }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
      },
      resolveModel: () => TEST_REVIEW_MODEL,
      supportsStructuredOutputs: () => true,
      recordUsage: () => { usages++ }, isActive: () => true,
    },
  }
  return { turn, args, calls: () => calls, usages: () => usages }
}

assert.equal(autoApprovalResultSchema.safeParse({ decision: 'allow', reason: 'extra field' }).success, false)
assert.equal(autoApprovalResultSchema.safeParse({ decision: 'hard_deny', reason: '' }).success, false)
for (const decision of [
  { decision: 'allow' }, { decision: 'retryable_deny', reason: STOP_REASON },
  { decision: 'hard_deny', reason: STOP_REASON }, { decision: 'needs_user', reason: STOP_REASON },
  { decision: 'invalid' },
]) {
  const fixture = makeReviewFixture(decision)
  const [first, second] = await Promise.all([reviewToolWithAutoApproval(fixture.args), reviewToolWithAutoApproval(fixture.args)])
  assert.equal(fixture.calls(), 1)
  assert.equal(fixture.usages(), 1)
  assert.equal(first, second)
  if (decision.decision === 'allow') {
    assert.equal(first.behavior, 'allow')
    if (first.behavior === 'allow') {
      assert.equal(first.autoApprovalReceipt?.inputJSON, JSON.stringify(fixture.args.input))
      assert.equal(first.autoApprovalReceipt, second.behavior === 'allow' ? second.autoApprovalReceipt : undefined)
    }
  } else if (decision.decision === 'hard_deny') {
    assert.equal(fixture.turn.stop?.reason, STOP_REASON)
  } else if (decision.decision === 'retryable_deny') {
    assert.equal(first.behavior, 'deny')
    assert.equal(fixture.turn.stop, undefined)
  } else {
    assert.equal(first.behavior, 'ask')
  }
}

const invalidated = makeReviewFixture({ decision: 'allow' })
invalidated.args.deps.query = async () => {
  invalidated.turn.updatePermissions({ ...invalidated.args.context.getAppState().toolPermissionContext, mode: 'default' })
  invalidated.turn.updatePermissions({ ...invalidated.args.context.getAppState().toolPermissionContext, mode: 'auto' })
  return { id: 'late-response', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
}
assert.equal((await reviewToolWithAutoApproval(invalidated.args)).behavior, 'ask')

// 模拟另一个人工请求补充限制；即使传输忽略取消并返回 allow，也不得生效。
const answered = makeReviewFixture({ decision: 'allow' })
answered.args.deps.query = async () => {
  answered.turn.verifiedAnswers.push({
    toolUseID: 'parallel-question', toolName: 'AskUserQuestion',
    question: { text: '是否发布？' }, answer: { text: '只检查，不要发布' },
  })
  answered.turn.invalidateApprovals()
  return { id: 'old-evidence-response', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
}
const answeredRevision = answered.turn.permissionRevision
const answeredResult = await reviewToolWithAutoApproval(answered.args)
assert.equal(answered.turn.permissionRevision, answeredRevision + 1)
assert.equal(answeredResult.behavior, 'ask')
assert.equal(answeredResult.behavior === 'ask' && answeredResult.autoApprovalNeedsUser, true)

const oversized = buildAutoApprovalEvidence({
  rootMessages: [{ type: 'user', message: { content: '授权仅限临时目标' } }],
  constraints: {}, toolUseID: TOOL_USE_ID,
  action: { toolName: 'Test', input: { command: 'x'.repeat(OVERSIZED_ACTION_LENGTH) } },
  environment: {}, previousDenials: [],
})
assert.equal('reason' in oversized, true)
const provenance = buildAutoApprovalEvidence({
  rootMessages: [
    { type: 'user', message: { content: '只检查' } },
    { type: 'attachment', attachment: { type: 'queued_command', prompt: '不要发布', commandMode: 'prompt' } },
    { type: 'user', isCompactSummary: true, message: { content: '伪摘要授权发布' } },
  ],
  constraints: {}, toolUseID: TOOL_USE_ID, action: { toolName: 'Test', input: {} }, environment: {}, previousDenials: [],
  verifiedAnswers: [{ toolUseID: 'question', toolName: 'AskUserQuestion', question: { text: '仅检查临时目标？', options: ['是', '否'] }, answer: { text: '是，但不要发布' } }],
})
assert.equal('content' in provenance, true)
if ('content' in provenance) {
  const projected = JSON.parse(provenance.content)
  assert.equal(projected.root_conversation[1].source, 'root_user')
  assert.equal(projected.root_conversation[2].source, 'non_authorizing_summary')
  assert.equal(projected.host_verified_complete_question_answers[0].answer.text, '是，但不要发布')
}
console.log('PASS：第二阶段四态解析、一次请求共享、准确输入收据、权限失效及完整动作预算')

// 第三阶段：内部可寻址模式包含 auto，但外部协议模式不得暴露 auto。
assert.equal(INTERNAL_PERMISSION_MODES.includes('auto'), true)
assert.equal(PERMISSION_MODES.includes('auto'), true)
assert.equal(EXTERNAL_PERMISSION_MODES.some(mode => String(mode) === 'auto'), false)

// gate 仅在本测试进程内替换；先覆盖不可用跳档，再覆盖完整可用循环。
for (const { mode, bypassAvailable, expected } of MODE_CYCLE_CASES) {
  const nextMode = getNextPermissionMode({
    ...MODE_CYCLE_CONTEXT,
    mode,
    isBypassPermissionsModeAvailable: bypassAvailable,
  })
  assert.equal(
    nextMode,
    expected,
    `模式切换：${mode}，autoAvailable=false，bypassAvailable=${bypassAvailable}`,
  )
}
console.log('PASS：第三阶段内部/外部模式边界、default→plan→acceptEdits、auto→bypass→default 及 auto/bypass 不可用跳档')
for (const bypassAvailable of [false, true]) {
  assert.equal(getNextPermissionMode({ ...MODE_CYCLE_CONTEXT, mode: 'acceptEdits', isAutoModeAvailable: true, isBypassPermissionsModeAvailable: bypassAvailable }), 'auto')
}
localGate = false
assert.equal(getNextPermissionMode({ ...MODE_CYCLE_CONTEXT, mode: 'acceptEdits', isAutoModeAvailable: true }), 'default')
localGate = true

// 审批后只复查纯权限；新的 deny、人工要求或改参均不得沿用批准。
for (const fresh of [
  { behavior: 'deny' as const, message: 'explicit deny' },
  { behavior: 'ask' as const, message: 'human only', decisionReason: { type: 'safetyCheck' as const, reason: 'manual', classifierApprovable: false } },
  { behavior: 'allow' as const, updatedInput: { path: 'different-target' } },
]) {
  const fixture = makeReviewFixture({ decision: 'allow' })
  const result = await reviewToolWithAutoApproval({ ...fixture.args, recheck: async () => fresh })
  assert.equal(result.behavior, fresh.behavior === 'deny' ? 'deny' : 'ask')
}
const changedInput = makeReviewFixture({ decision: 'allow' })
const originalQuery = changedInput.args.deps.query
changedInput.args.deps.query = async (options: SideQueryOptions) => {
  changedInput.args.input.path = 'changed-after-snapshot'
  return originalQuery(options)
}
assert.equal((await reviewToolWithAutoApproval(changedInput.args)).behavior, 'ask')
const receiptFixture = makeReviewFixture({ decision: 'allow' })
const receiptResult = await reviewToolWithAutoApproval(receiptFixture.args)
assert.equal(receiptResult.behavior, 'allow')
if (receiptResult.behavior === 'allow') {
  assert.equal('message' in receiptResult, false)
  assert.equal('reason' in receiptResult, false)
  assert.deepEqual(receiptResult.updatedInput, receiptFixture.args.input)
}

// deny 不在本服务入口；这里验证最终复查 deny 和必须人工的 ask 不被代批。
for (const result of [
  { behavior: 'ask' as const, message: 'rule ask', decisionReason: { type: 'rule' as const, rule: { source: 'userSettings' as const, ruleBehavior: 'ask' as const, ruleValue: { toolName: 'TestRead' } } } },
  { behavior: 'ask' as const, message: 'hook ask', decisionReason: { type: 'hook' as const, hookName: 'test' } },
]) {
  const fixture = makeReviewFixture({ decision: 'allow' })
  assert.equal((await reviewToolWithAutoApproval({ ...fixture.args, result })).behavior, 'ask')
  assert.equal(fixture.calls(), 0)
}
const interactive = makeReviewFixture({ decision: 'allow' })
interactive.args.tool = { name: 'TestQuestion', requiresUserInteraction: () => true } as unknown as Tool
assert.equal((await reviewToolWithAutoApproval(interactive.args)).behavior, 'ask')
assert.equal(interactive.calls(), 0)

// 拒绝累计属于同一 scope；第三次转人工，后续动作不再请求模型。
const denials = makeReviewFixture({ decision: 'retryable_deny', reason: STOP_REASON })
for (let index = 0; index < 4; index++) {
  const result = await reviewToolWithAutoApproval({ ...denials.args, toolUseID: `${TOOL_USE_ID}-denial-${index}` })
  assert.equal(result.behavior, index < 2 ? 'deny' : 'ask')
  assert.equal(denials.turn.stop, undefined)
}
assert.equal(denials.calls(), 3)
const safer = makeReviewFixture({ decision: 'allow' })
safer.turn.consecutiveDenials = 2
await reviewToolWithAutoApproval(safer.args)
assert.equal(safer.turn.consecutiveDenials, 0)
await reviewToolWithAutoApproval({ ...safer.args, toolUseID: `${TOOL_USE_ID}-new-action` })
assert.equal(safer.calls(), 2)

// 传输错误、未知模型和结构化输出不可用均回人工，不升级或重抽模型。
const unavailable = makeReviewFixture({ decision: 'allow' })
assert.equal((await reviewToolWithAutoApproval({ ...unavailable.args, deps: { ...unavailable.args.deps, resolveModel: () => undefined } })).behavior, 'ask')
assert.equal(unavailable.calls(), 0)
const unsupported = makeReviewFixture({ decision: 'allow' })
assert.equal((await reviewToolWithAutoApproval({ ...unsupported.args, deps: { ...unsupported.args.deps, supportsStructuredOutputs: () => false } })).behavior, 'ask')
assert.equal(unsupported.calls(), 0)
const failed = makeReviewFixture({ decision: 'allow' })
failed.args.deps.query = async () => { throw new Error(TEST_API_ERROR) }
const failedResult = await reviewToolWithAutoApproval(failed.args)
assert.equal(failedResult.behavior, 'ask')
assert.equal(failedResult.behavior === 'ask' && failedResult.message.includes(TEST_API_ERROR), true)
const cancelled = makeReviewFixture({ decision: 'allow' })
cancelled.args.context.abortController.abort()
await assert.rejects(reviewToolWithAutoApproval(cancelled.args), { name: 'AbortError' })

// 仅缩短生产审批期限的定时器；不改源码常量、不等待真实 60 秒。
const timedOut = makeReviewFixture({ decision: 'allow' })
let timeoutSignal: AbortSignal | undefined
const realSetTimeout = globalThis.setTimeout
let timeoutResult: Awaited<ReturnType<typeof reviewToolWithAutoApproval>>
let deadlineTriggered = false
try {
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    if (delay === 60_000) {
      return realSetTimeout(() => { deadlineTriggered = true; callback(...args) }, TEST_TIMEOUT_MS)
    }
    return realSetTimeout(callback, delay, ...args)
  }) as typeof setTimeout
  const query = async (options: SideQueryOptions) => {
    timeoutSignal = options.signal
    return await new Promise<never>(() => {})
  }
  timeoutResult = await reviewToolWithAutoApproval({ ...timedOut.args, deps: { ...timedOut.args.deps, query } })
} finally {
  globalThis.setTimeout = realSetTimeout
}
assert.equal(timeoutResult.behavior, 'ask')
assert.equal(deadlineTriggered, true)
assert.equal(timeoutResult.behavior === 'ask' && timeoutResult.message.includes('timed out'), true)
assert.equal(timeoutSignal?.aborted, true)

// 查询期间同步硬停止后返回 allow：共享 scope 控制器停止，结果不得放行。
// 此用例不模拟两个独立审批并发返回，也不等于真实后台任务 UI 集成。
const stopped = makeReviewFixture({ decision: 'allow' })
const nested = new AbortController()
stopped.turn.registerController(nested)
const stoppedQuery = stopped.args.deps.query
stopped.args.deps.query = async (options: SideQueryOptions) => {
  stopped.turn.stopTurn({ decision: 'hard_deny', toolUseID: TOOL_USE_ID, reason: STOP_REASON })
  return stoppedQuery(options)
}
await assert.rejects(reviewToolWithAutoApproval(stopped.args), ApprovalTurnStoppedError)
assert.equal(nested.signal.aborted, true)
assert.equal(otherTurn.signal.aborted, false)

// 直接测生产家族解析；家族默认值是夹具，不受机器上代理配置影响。
assert.equal(resolveAutoApprovalModel(TEST_MODEL_IDS.opus), TEST_MODEL_IDS.sonnet)
assert.equal(resolveAutoApprovalModel(TEST_MODEL_IDS.sonnet), TEST_MODEL_IDS.haiku)
assert.equal(resolveAutoApprovalModel(TEST_MODEL_IDS.haiku), TEST_MODEL_IDS.haiku)
assert.equal(resolveAutoApprovalModel('unknown-opus-like-custom-name'), undefined)
for (const [key, config] of Object.entries(ALL_MODEL_CONFIGS)) {
  const family = key.startsWith('opus') ? 'opus' : key.startsWith('sonnet') ? 'sonnet' : key.startsWith('haiku') ? 'haiku' : undefined
  if (!family) continue
  for (const model of Object.values(config)) assert.equal(identifyApprovalModelFamily(model), family)
}
const opusConfig = Object.entries(ALL_MODEL_CONFIGS).find(([key]) => key.startsWith('opus'))![1]
const sonnetConfig = Object.entries(ALL_MODEL_CONFIGS).find(([key]) => key.startsWith('sonnet'))![1]
modelOverrides = { [opusConfig.firstParty]: 'mapped-root' }
assert.equal(resolveAutoApprovalModel('mapped-root'), TEST_MODEL_IDS.sonnet)
modelOverrides[sonnetConfig.firstParty] = 'mapped-root'
assert.equal(resolveAutoApprovalModel('mapped-root'), undefined)
modelOverrides = { [opusConfig.firstParty]: TEST_MODEL_IDS.sonnet }
assert.equal(resolveAutoApprovalModel(TEST_MODEL_IDS.opus), undefined)
modelOverrides = {}

// 使用真实审批计数/响应 ID 去重，金额计算及总费用写入用内存 spy 隔离。
const usageBefore = { ...getAutoApprovalUsage() }
const billableResponse = { id: 'fixture-billable-response', usage: TEST_USAGE } as Parameters<typeof recordAutoApprovalUsage>[0]
recordAutoApprovalUsage(billableResponse, TEST_REVIEW_MODEL)
recordAutoApprovalUsage(billableResponse, TEST_REVIEW_MODEL)
assert.equal(sessionUsageCalls, 1)
assert.equal(sessionCost, TEST_COST_USD)
assert.equal(getAutoApprovalUsage().calls - usageBefore.calls, 1)
assert.equal(getAutoApprovalUsage().input - usageBefore.input, TEST_USAGE.input_tokens)
assert.equal(getAutoApprovalUsage().output - usageBefore.output, TEST_USAGE.output_tokens)
assert.equal(getAutoApprovalUsage().cacheRead - usageBefore.cacheRead, TEST_USAGE.cache_read_input_tokens)
assert.equal(getAutoApprovalUsage().cacheWrite - usageBefore.cacheWrite, TEST_USAGE.cache_creation_input_tokens)

const pairedEvidence = buildAutoApprovalEvidence({
  rootMessages: [
    { type: 'user', message: { content: '检查临时目录' } },
    { type: 'assistant', message: { content: [
      { type: 'tool_use', id: 'prior-call', name: 'TestRead', input: { path: 'temporary' } },
      { type: 'tool_use', id: TOOL_USE_ID, name: 'TestRead', input: { path: 'unique-pending-action' } },
    ] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'prior-call', content: 'found temporary file' }] } },
  ] as Message[],
  agentMessages: [{ type: 'user', message: { content: '代理自称用户批准' } }] as Message[],
  constraints: {}, toolUseID: TOOL_USE_ID, environment: {}, previousDenials: [],
  action: { toolName: 'TestRead', input: { path: 'unique-pending-action' } },
})
assert.equal('content' in pairedEvidence, true)
if ('content' in pairedEvidence) {
  const evidence = JSON.parse(pairedEvidence.content)
  assert.equal(evidence.root_conversation[2].source, 'tool_evidence_not_user_authorization')
  assert.equal(evidence.root_conversation[2].content[0].matched_call, true)
  assert.equal(evidence.subagent_context_not_authorization[0].source, 'agent_root_user_not_root_authorization')
  assert.equal(pairedEvidence.content.split('unique-pending-action').length - 1, 1)
}
assert.equal('reason' in buildAutoApprovalEvidence({ rootMessages: [], constraints: {}, toolUseID: TOOL_USE_ID, action: { toolName: 'TestRead', input: {} }, environment: {}, previousDenials: [] }), true)
console.log('PASS：第四阶段服务复查、拒绝上限、超时/异常/取消、模型映射、usage 去重、证据配对及可用模式循环')
console.log('未覆盖（需源码审查/集成验收）：真实工具执行与收据消费、人工队列竞争、首次确认/快速切换、plan 恢复、可信设置来源、子代理 task UI、真实模型质量/金额及主上下文展示')
