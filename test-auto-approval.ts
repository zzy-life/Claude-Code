// 第一至三阶段契约测试；注入模型响应，不调用真实 API，不执行工具动作。
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
import { ApprovalTurnScope, ApprovalTurnStoppedError } from './src/utils/permissions/approvalTurnScope.js'
import type { Tool, ToolPermissionContext, ToolUseContext } from './src/Tool.js'
import { EXTERNAL_PERMISSION_MODES, INTERNAL_PERMISSION_MODES, PERMISSION_MODES } from './src/types/permissions.js'
import { getNextPermissionMode } from './src/utils/permissions/getNextPermissionMode.js'
import type { AssistantMessage } from './src/types/message.js'
import { buildAutoApprovalEvidence } from './src/utils/permissions/autoApprovalContext.js'
import { allowsAutomaticWorkspaceEdits, requiresHumanApproval, supportsLocalAutoApproval, reviewToolWithAutoApproval, autoApprovalResultSchema } from './src/utils/permissions/autoApproval.js'

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
      query: async () => {
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
  action: { toolName: 'Test', input: { command: 'x'.repeat(200_000) } },
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

// 生产函数没有 gate 注入入口；不修改真实设置、环境或模块来强行开启 auto。
// isAutoModeAvailable=false 保证 acceptEdits 无论实际 gate 如何都跳过 auto；
// 其他被测分支不读取 gate。这里只覆盖稳定链路及不可用跳档，不声称完整循环。
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
console.log('未覆盖：acceptEdits→auto（gate 无注入入口）、真实模型判断、真实终端队列、后台任务 UI；未提前开展第四阶段全量测试')
