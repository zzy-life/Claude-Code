// 一键契约测试：真实审批服务/证据与权限 revision/模型选择 + 内存依赖夹具。
// 不调用真实 API、不执行工具动作、不读写真实用户设置；不等同于终端端到端测试。
// 运行：bun run ./test-auto-approval.ts。本轮仅编写，未执行；PASS 只会在实际运行后输出。
const TEST_TIMEOUT_MS = 5
const OVERSIZED_ACTION_LENGTH = 200_000
const TEST_MODEL_IDS = { opus: 'fixture-opus', sonnet: 'fixture-sonnet', haiku: 'fixture-haiku' }
const TEST_USAGE = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 }
const TEST_COST_USD = 0.01
const TEST_API_ERROR = 'Injected approval service failure'
const DENIAL_REASON = 'The action is outside the authorized scope'
const TEST_AGENT_ID = 'fixture-child-a'
const HISTORY_MEDIA_MARKER = 'FIXTURE_PRIVATE_MEDIA_PAYLOAD_'
const HISTORY_MEDIA_PAYLOAD = HISTORY_MEDIA_MARKER + 'a'.repeat(OVERSIZED_ACTION_LENGTH)
const TEST_MEDIA_TYPES = ['image', 'document'] as const
const TEST_ACTION_COUNT = 4
const TASK_ANSWER = {
  toolUseID: 'task-scope-question', toolName: 'AskUserQuestion',
  question: { questions: [{ question: '继续检查还是发布？', options: [{ label: '检查' }, { label: '发布' }] }] },
  answer: { answers: { '继续检查还是发布？': '仅检查临时目录，不要发布或上传' } },
}
const CONCURRENT_REVIEW_COUNT = 2
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
  isBypassPermissionsModeDisabled: () => false,
  getAutoModeUnavailableReason: () => 'fixture gate disabled',
  transitionPermissionMode: () => { throw new Error('本夹具不模拟模式激活') },
}))
mock.module('./src/utils/teammate.js', () => ({ isTeammate: () => false }))
mock.module('./src/utils/teammateContext.js', () => ({ isInProcessTeammate: () => false }))
mock.module('./src/utils/permissions/bypassPermissionsEnvironment.js', () => ({ isBypassPermissionsBlockedByRoot: () => false }))
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

const { ApprovalTurnScope } = await import('./src/utils/permissions/approvalTurnScope.js')
const { buildAutoApprovalEvidence } = await import('./src/utils/permissions/autoApprovalContext.js')
const { getNextPermissionMode } = await import('./src/utils/permissions/getNextPermissionMode.js')
const { allowsAutomaticWorkspaceEdits, requiresHumanApproval, supportsLocalAutoApproval, reviewToolWithAutoApproval, autoApprovalResultSchema } = await import('./src/utils/permissions/autoApproval.js')
const { identifyApprovalModelFamily, resolveAutoApprovalModel, recordAutoApprovalUsage } = await import('./src/utils/permissions/autoApprovalModel.js')
const { ALL_MODEL_CONFIGS } = await import('./src/utils/model/configs.js')
const { getAutoApprovalUsage } = await import('./src/bootstrap/state.js')
import type { Tool, ToolPermissionContext, ToolUseContext } from './src/Tool.js'
import { EXTERNAL_PERMISSION_MODES, INTERNAL_PERMISSION_MODES, PERMISSION_MODES } from './src/types/permissions.js'
import type { AssistantMessage } from './src/types/message.js'

// scope 仅管理证据/权限一致性及订阅生命周期，不管理代理取消。
const scope = new ApprovalTurnScope()
const otherTurn = new ApprovalTurnScope()
let invalidations = 0
let subscriptionsReleased = 0
scope.trackPermissions(() => { subscriptionsReleased++ })
const releaseRoot = scope.retain()
const releaseChild = scope.retain()
const removeInvalidationListener = scope.onInvalidated(() => { invalidations++ })
const initialRevision = scope.permissionRevision
scope.invalidateApprovals()
assert.equal(scope.permissionRevision, initialRevision + 1)
assert.equal(invalidations, 1)
assert.equal(otherTurn.permissionRevision, 0)
removeInvalidationListener()
scope.invalidateApprovals()
assert.equal(invalidations, 1)
releaseRoot()
assert.equal(subscriptionsReleased, 0)
releaseChild()
assert.equal(subscriptionsReleased, 1)

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
console.log('PASS：证据 revision、订阅生命周期、编辑能力及人工/环境边界契约')

function makeReviewFixture(decision: unknown) {
  const turn = new ApprovalTurnScope()
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
  const reports: Array<Parameters<NonNullable<ToolUseContext['reportAutoApprovalDenial']>>[0]> = []
  const requests: SideQueryOptions[] = []
  const context = {
    approvalTurnScope: turn, abortController: new AbortController(),
    agentId: TEST_AGENT_ID, autoApprovalDenials: [],
    reportAutoApprovalDenial: (denial: Parameters<NonNullable<ToolUseContext['reportAutoApprovalDenial']>>[0]) => { reports.push(denial) },
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
      query: async (options: SideQueryOptions) => {
        calls++
        requests.push(options)
        return { id: 'test-response', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(decision) }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
      },
      resolveModel: () => TEST_REVIEW_MODEL,
      supportsStructuredOutputs: () => true,
      recordUsage: () => { usages++ }, isActive: () => true,
    },
  }
  return { turn, args, reports, requests, calls: () => calls, usages: () => usages }
}

assert.equal(autoApprovalResultSchema.safeParse({ decision: 'allow', reason: 'extra field' }).success, false)
assert.equal(autoApprovalResultSchema.safeParse({ decision: 'deny', reason: '' }).success, false)
assert.equal(autoApprovalResultSchema.safeParse({ decision: 'deny', reason: DENIAL_REASON, unexpected: true }).success, false)
for (const decision of [
  { decision: 'allow' }, { decision: 'deny', reason: DENIAL_REASON },
  { decision: 'needs_user', reason: DENIAL_REASON }, { decision: 'invalid' },
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
  } else if (decision.decision === 'deny') {
    if (first.behavior !== 'deny') assert.fail('模型 deny 必须返回普通权限拒绝')
    assert.equal(first.message.includes(DENIAL_REASON), true)
    assert.deepEqual(fixture.reports, [{ agentId: TEST_AGENT_ID, toolUseID: TOOL_USE_ID, toolName: 'TestRead', reason: DENIAL_REASON }])
    assert.deepEqual(fixture.args.context.autoApprovalDenials, [{ toolName: 'TestRead', reason: DENIAL_REASON }])
    // 顺序重入也共享同一拒绝，不再次请求、记历史或通知父代理。
    assert.equal(await reviewToolWithAutoApproval(fixture.args), first)
    assert.equal(fixture.reports.length, 1)
    assert.equal(fixture.calls(), 1)
    assert.equal(fixture.args.context.autoApprovalDenials?.length, 1)
  } else {
    assert.equal(first.behavior, 'ask')
    assert.equal(fixture.reports.length, 0)
  }
}

const invalidated = makeReviewFixture({ decision: 'allow' })
invalidated.args.deps.query = async () => {
  invalidated.turn.updatePermissions({ ...invalidated.args.context.getAppState().toolPermissionContext, mode: 'default' })
  invalidated.turn.updatePermissions({ ...invalidated.args.context.getAppState().toolPermissionContext, mode: 'auto' })
  return { id: 'late-response', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
}
assert.equal((await reviewToolWithAutoApproval(invalidated.args)).behavior, 'ask')

// 模拟另一个工具权限弹窗补充限制；即使传输忽略取消并返回 allow，也不得生效。
// 这里只注入宿主记录，不宣称直接运行了真实弹窗回调。
const answered = makeReviewFixture({ decision: 'allow' })
answered.args.deps.query = async () => {
  answered.turn.verifiedAnswers.push({
    toolUseID: 'parallel-permission-dialog', toolName: 'TestRead',
    question: { input: { path: 'temporary-safe-target' } }, answer: { feedback: '只检查，不要发布' },
  })
  answered.turn.invalidateApprovals()
  return { id: 'old-evidence-response', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
}
const answeredRevision = answered.turn.permissionRevision
const answeredResult = await reviewToolWithAutoApproval(answered.args)
assert.equal(answered.turn.permissionRevision, answeredRevision + 1)
assert.equal(answeredResult.behavior, 'ask')
assert.equal(answeredResult.behavior === 'ask' && answeredResult.autoApprovalNeedsUser, true)

// 两个独立 toolUseID 已进入 query 后，另一交互问答新增限制。
// 注入等价的宿主写入/失效，不执行真实 interactiveHandler；传输故意忽略 abort。
const taskAnswered = makeReviewFixture({ decision: 'allow' })
let releaseLateResponses!: () => void
const lateResponses = new Promise<void>(resolve => { releaseLateResponses = resolve })
let markBothStarted!: () => void
const bothStarted = new Promise<void>(resolve => { markBothStarted = resolve })
let startedReviews = 0
const reviewSignals: AbortSignal[] = []
const pendingTaskReviews = Array.from({ length: CONCURRENT_REVIEW_COUNT }, (_, index) => reviewToolWithAutoApproval({
  ...taskAnswered.args, toolUseID: `${TOOL_USE_ID}-task-inflight-${index}`,
  deps: {
    ...taskAnswered.args.deps,
    query: async (options: SideQueryOptions) => {
      assert.ok(options.signal)
      reviewSignals.push(options.signal)
      startedReviews++
      if (startedReviews === CONCURRENT_REVIEW_COUNT) markBothStarted()
      await lateResponses
      return { id: `late-task-answer-${index}`, stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
    },
  },
}))
await bothStarted
const beforeTaskAnswerRevision = taskAnswered.turn.permissionRevision
taskAnswered.turn.taskAnswers.push(TASK_ANSWER)
taskAnswered.turn.invalidateApprovals()
assert.equal(taskAnswered.turn.permissionRevision, beforeTaskAnswerRevision + 1)
for (const signal of reviewSignals) assert.equal(signal.aborted, true)
// 审批请求被失效，不代表调用代理被取消。
assert.equal(taskAnswered.args.context.abortController.signal.aborted, false)
for (const result of await Promise.all(pendingTaskReviews)) {
  assert.equal(result.behavior, 'ask')
  assert.equal(result.behavior === 'ask' && result.autoApprovalNeedsUser, true)
  assert.equal('autoApprovalReceipt' in result, false)
}
releaseLateResponses()
assert.deepEqual(taskAnswered.turn.verifiedAnswers, [])
assert.equal(taskAnswered.reports.length, 0)

// 新动作必须带上完整新增限制，但不能把问答提升为专用批准。
const afterTaskAnswer = await reviewToolWithAutoApproval({ ...taskAnswered.args, toolUseID: `${TOOL_USE_ID}-after-task-answer` })
assert.equal(afterTaskAnswer.behavior, 'allow')
const taskAnswerProjection = JSON.parse(String(taskAnswered.requests[0]!.messages[0]!.content))
assert.deepEqual(taskAnswerProjection.task_question_answers_not_permission_grants, [TASK_ANSWER])
assert.deepEqual(taskAnswerProjection.host_verified_tool_permission_feedback, [])
const directTaskProjection = buildAutoApprovalEvidence({
  rootMessages: taskAnswered.turn.rootMessages, constraints: {}, toolUseID: TOOL_USE_ID,
  action: { toolName: 'TestRead', input: {} }, environment: {}, previousDenials: [],
  taskAnswers: taskAnswered.turn.taskAnswers,
})
if (!('content' in directTaskProjection)) assert.fail('完整任务问答应保留为非授权证据')
assert.deepEqual(JSON.parse(directTaskProjection.content).task_question_answers_not_permission_grants, [TASK_ANSWER])

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
  verifiedAnswers: [{ toolUseID: 'permission-dialog', toolName: 'TestRead', question: { input: { path: 'temporary-safe-target' } }, answer: { feedback: '是，但不要发布' } }],
})
assert.equal('content' in provenance, true)
if ('content' in provenance) {
  const projected = JSON.parse(provenance.content)
  assert.equal(projected.root_conversation[1].source, 'root_user')
  assert.equal(projected.root_conversation[2].source, 'non_authorizing_summary')
  assert.equal(projected.host_verified_tool_permission_feedback[0].answer.feedback, '是，但不要发布')
}
console.log('PASS：allow/deny/needs_user 解析、请求与拒绝报告去重、准确输入收据、权限失效及完整动作预算')

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
interactive.args.tool = { name: 'AskUserQuestion', requiresUserInteraction: () => true } as unknown as Tool
assert.equal((await reviewToolWithAutoApproval(interactive.args)).behavior, 'ask')
assert.equal(interactive.calls(), 0)
assert.deepEqual(interactive.turn.verifiedAnswers, [])

// 已有 Question 调用/回答仍只是工具证据，普通文字不生成专用工具批准记录。
// 这里验证上下文投影，不模拟真实 AskUserQuestion 执行或授权回调。
const questionEvidence = buildAutoApprovalEvidence({
  rootMessages: [
    { type: 'user', message: { content: '完成检查，发布前必须单独确认' } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'ordinary-question', name: 'AskUserQuestion', input: { questions: ['是否继续检查？'] } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'ordinary-question', content: '继续' }] } },
  ] as unknown as Message[],
  constraints: {}, toolUseID: TOOL_USE_ID, action: { toolName: 'TestRead', input: {} },
  environment: {}, previousDenials: [],
})
if (!('content' in questionEvidence)) assert.fail('普通问答历史应能作为工具证据投影')
const projectedQuestion = JSON.parse(questionEvidence.content)
assert.deepEqual(projectedQuestion.host_verified_tool_permission_feedback, [])
assert.equal(projectedQuestion.root_conversation[2].source, 'tool_evidence_not_user_authorization')

// 拒绝仅影响当前动作；父/调用子代理/兄弟及后台 Shell 控制器均保持存活。
// 这些是内存控制器及服务并发，不是运行真实 Agent、Shell 或 StreamingToolExecutor。
const deniedChild = makeReviewFixture({ decision: 'deny', reason: DENIAL_REASON })
const parentController = new AbortController()
const siblingController = new AbortController()
const backgroundShellController = new AbortController()
const childController = deniedChild.args.context.abortController
// 沿用普通父取消的传播方向；审批拒绝不应触发这条链。
parentController.signal.addEventListener('abort', () => {
  childController.abort()
  siblingController.abort()
  backgroundShellController.abort()
}, { once: true })
const siblingReports: typeof deniedChild.reports = []
const siblingContext = {
  ...deniedChild.args.context,
  abortController: siblingController,
  agentId: 'fixture-child-b', autoApprovalDenials: [],
  reportAutoApprovalDenial: (denial: typeof deniedChild.reports[number]) => { siblingReports.push(denial) },
} as ToolUseContext
let finishSiblingReview!: () => void
const siblingReady = new Promise<void>(resolve => { finishSiblingReview = resolve })
const siblingPending = reviewToolWithAutoApproval({
  ...deniedChild.args, context: siblingContext, toolUseID: `${TOOL_USE_ID}-sibling`,
  deps: {
    ...deniedChild.args.deps,
    query: async () => {
      await siblingReady
      return { id: 'sibling-response', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"decision":"allow"}' }] } as unknown as Awaited<ReturnType<typeof import('./src/utils/sideQuery.js').sideQuery>>
    },
  },
})
const childDenial = await reviewToolWithAutoApproval(deniedChild.args)
if (childDenial.behavior !== 'deny') assert.fail('拒绝必须正常返回，而不是抛出任务中止异常')
assert.equal(childDenial.message.includes(DENIAL_REASON), true)
for (const controller of [parentController, childController, siblingController, backgroundShellController]) {
  assert.equal(controller.signal.aborted, false)
}
assert.equal(deniedChild.reports.length, 1)
assert.equal(siblingReports.length, 0)
assert.deepEqual(siblingContext.autoApprovalDenials, [])
finishSiblingReview()
assert.equal((await siblingPending).behavior, 'allow')

// 同一子代理提交不同输入/新 toolUseID，第四个动作仍独立请求，不因历史拒绝转人工。
for (let index = 1; index < TEST_ACTION_COUNT; index++) {
  const result = await reviewToolWithAutoApproval({
    ...deniedChild.args,
    toolUseID: `${TOOL_USE_ID}-revised-${index}`,
    input: { path: `revised-target-${index}` },
  })
  assert.equal(result.behavior, 'deny')
  assert.equal(childController.signal.aborted, false)
}
assert.equal(deniedChild.calls(), TEST_ACTION_COUNT)
assert.equal(deniedChild.reports.length, TEST_ACTION_COUNT)
assert.equal(deniedChild.args.context.autoApprovalDenials?.length, TEST_ACTION_COUNT)
assert.deepEqual(siblingContext.autoApprovalDenials, [])
const revisedEvidence = JSON.parse(String(deniedChild.requests[1]!.messages[0]!.content))
assert.deepEqual(revisedEvidence.previous_denials, [{ toolName: 'TestRead', reason: DENIAL_REASON }])

// 父代理自身的新动作也重新审批；历史不是全轮锁定，也不授权未来动作。
const parentContext = {
  ...deniedChild.args.context,
  agentId: undefined, abortController: parentController, autoApprovalDenials: [],
} as ToolUseContext
await reviewToolWithAutoApproval({ ...deniedChild.args, context: parentContext, toolUseID: `${TOOL_USE_ID}-parent`, input: { path: 'parent-target' } })
assert.equal(deniedChild.calls(), TEST_ACTION_COUNT + 1)
assert.equal(deniedChild.reports.length, TEST_ACTION_COUNT)
assert.deepEqual(parentContext.autoApprovalDenials, [{ toolName: 'TestRead', reason: DENIAL_REASON }])

// 旧 toolUseID 改参不能偷用原决定；必须创建新动作。
assert.equal((await reviewToolWithAutoApproval({ ...deniedChild.args, input: { path: 'changed-with-old-id' } })).behavior, 'ask')
assert.equal(deniedChild.calls(), TEST_ACTION_COUNT + 1)
const explicitAskAfterDenial = await reviewToolWithAutoApproval({
  ...deniedChild.args, toolUseID: `${TOOL_USE_ID}-explicit-ask`,
  result: { behavior: 'ask', message: 'Must ask the user', decisionReason: {
    type: 'rule', rule: { source: 'userSettings', ruleBehavior: 'ask', ruleValue: { toolName: 'TestRead' } },
  } },
})
assert.equal(explicitAskAfterDenial.behavior, 'ask')
assert.equal(deniedChild.calls(), TEST_ACTION_COUNT + 1)

// 嵌套来源只送当前 context 的直接父回调，不复用其他代理的回调。
// 此处验证服务回调选择与去重，不验证真实通知队列路由。
const nestedReports: typeof deniedChild.reports = []
const nestedContext = {
  ...deniedChild.args.context,
  agentId: 'fixture-grandchild', abortController: new AbortController(), autoApprovalDenials: [],
  reportAutoApprovalDenial: (denial: typeof deniedChild.reports[number]) => { nestedReports.push(denial) },
} as ToolUseContext
const nestedArgs = { ...deniedChild.args, context: nestedContext, toolUseID: `${TOOL_USE_ID}-nested`, input: { path: 'nested-target' } }
await Promise.all([reviewToolWithAutoApproval(nestedArgs), reviewToolWithAutoApproval(nestedArgs)])
assert.deepEqual(nestedReports, [{ agentId: 'fixture-grandchild', toolUseID: nestedArgs.toolUseID, toolName: 'TestRead', reason: DENIAL_REASON }])
assert.equal(deniedChild.reports.length, TEST_ACTION_COUNT)
assert.equal(siblingReports.length, 0)
assert.equal(nestedContext.abortController.signal.aborted, false)

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

// 历史多模态递归省略；分别检查投影及实际交给 query 的最终请求，避免只测顶层块。
for (const mediaType of TEST_MEDIA_TYPES) {
  const media = { type: mediaType, source: { type: 'base64', media_type: mediaType === 'image' ? 'image/png' : 'application/pdf', data: HISTORY_MEDIA_PAYLOAD } }
  const history = makeReviewFixture({ decision: 'allow' })
  history.turn.rootMessages = [
    { type: 'user', message: { content: [{ type: 'text', text: '只检查临时文件' }, media] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'media-call', name: 'TestRead', input: { nested: [media] } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'media-call', is_error: true, content: [
      { type: 'text', text: 'before-media' }, media, { type: 'text', text: 'after-media' },
      { type: 'tool_result', tool_use_id: 'deep-call', content: [media] },
    ] }] } },
  ] as unknown as Message[]
  history.args.context.messages = [{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'child-media-call', content: [media] }] } }] as unknown as Message[]
  // 注入权限弹窗的宿主问答；不是 AskUserQuestion 专用批准。
  history.turn.verifiedAnswers.push({ toolUseID: 'media-dialog', toolName: 'TestRead', question: { payload: [media] }, answer: { feedback: '只检查', nested: { media } } })
  history.turn.taskAnswers.push({ ...TASK_ANSWER, question: { ...TASK_ANSWER.question, nested: [media] }, answer: { ...TASK_ANSWER.answer, nested: { media } } })
  const evidence = buildAutoApprovalEvidence({
    rootMessages: history.turn.rootMessages,
    agentMessages: history.args.context.messages,
    constraints: { text: '不要发布' }, verifiedAnswers: history.turn.verifiedAnswers,
    taskAnswers: history.turn.taskAnswers,
    toolUseID: TOOL_USE_ID, action: { toolName: 'TestRead', input: history.args.input },
    environment: {}, previousDenials: [],
  })
  if (!('content' in evidence)) assert.fail('大图片历史应先省略再计算预算，不应因 base64 转人工')
  assert.equal(evidence.content.includes(HISTORY_MEDIA_MARKER), false)
  const projected = JSON.parse(evidence.content)
  const resultBlock = projected.root_conversation[2].content[0]
  assert.equal(resultBlock.call_id, 'media-call')
  assert.equal(resultBlock.matched_call, true)
  assert.equal(resultBlock.is_error, true)
  assert.equal(resultBlock.content[0].text, 'before-media')
  assert.equal(resultBlock.content[1].type, 'omitted_non_text_evidence')
  assert.equal(resultBlock.content[2].text, 'after-media')
  assert.equal(resultBlock.content[3].tool_use_id, 'deep-call')
  assert.equal(resultBlock.content[3].content[0].type, 'omitted_non_text_evidence')
  assert.equal((await reviewToolWithAutoApproval(history.args)).behavior, 'allow')
  assert.equal(history.calls(), 1)
  const finalRequest = JSON.stringify(history.requests[0])
  assert.equal(finalRequest.includes(HISTORY_MEDIA_MARKER), false)
  assert.equal(finalRequest.includes('omitted_non_text_evidence'), true)
  // 省略仅发生在审批证据副本，不能破坏原对话与宿主记录。
  assert.equal(JSON.stringify(history.turn.rootMessages).includes(HISTORY_MEDIA_MARKER), true)
  assert.equal(JSON.stringify(history.turn.verifiedAnswers).includes(HISTORY_MEDIA_MARKER), true)
  assert.equal(JSON.stringify(history.turn.taskAnswers).includes(HISTORY_MEDIA_MARKER), true)

  // 当前动作使用预算内的小载荷，避免把“超预算回人工”误当成媒体检测通过。
  const actionMedia = { ...media, source: { ...media.source, data: HISTORY_MEDIA_MARKER } }
  // 当前完整动作包含结构化媒体（任意深度）时直接回人工，绝不发送裁剪后的动作。
  for (const input of [{ payload: actionMedia }, { nested: [{ payload: [actionMedia] }] }]) {
    const action = makeReviewFixture({ decision: 'allow' })
    const snapshot = JSON.stringify(input)
    const direct = buildAutoApprovalEvidence({
      rootMessages: action.turn.rootMessages, constraints: {}, toolUseID: TOOL_USE_ID,
      action: { toolName: 'TestRead', input }, environment: {}, previousDenials: [],
    })
    if (!('reason' in direct)) assert.fail('当前动作含媒体必须直接回人工')
    assert.match(direct.reason, /image|document/i)
    const result = await reviewToolWithAutoApproval({ ...action.args, input })
    assert.equal(result.behavior, 'ask')
    assert.equal(result.behavior === 'ask' && result.autoApprovalNeedsUser, true)
    assert.equal(action.calls(), 0)
    assert.equal(action.reports.length, 0)
    assert.equal(JSON.stringify(input), snapshot)
  }
}

// 普通路径/URL/文字描述并非多模态载荷，不应凭扩展名猜测或联网取图。
const mediaMention = makeReviewFixture({ decision: 'allow' })
assert.equal((await reviewToolWithAutoApproval({
  ...mediaMention.args, input: { path: 'temporary/photo.png', text: 'document: https://example.invalid/file.pdf' },
})).behavior, 'allow')
assert.equal(mediaMention.calls(), 1)

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
console.log('PASS：服务复查、deny 不取消与新动作重审、完整任务问答非授权投影及并发在途失效、普通问答来源、历史递归媒体省略/动作媒体回人工、超时/异常/取消、模型映射、usage 去重及模式循环')
// 不导入重型 forkedAgent/执行器链；previousDenials 是证据构建参数，不是已删除的 scope 字段。
console.log('未覆盖（需源码审查/集成验收）：REPL/fork 独立拒绝数组初始化、priority next 父通知队列、host-only autoApprovalDenied 生成与 Streaming Bash 兄弟取消分支、真实执行器路径还原与收据消费/二次消费、普通工具错误到 query 的续轮、真实子代理通知队列路由/嵌套/resume/后台 UI、弹窗唯一授权写入及人工队列竞争、首次确认/快速切换、plan 恢复、可信设置来源、真实模型质量/金额及主上下文展示')
