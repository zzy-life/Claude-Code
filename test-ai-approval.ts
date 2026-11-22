// 第一阶段基础契约测试；不调用真实 API，不执行工具动作。
const STOP_REASON = '测试：操作超出授权范围'
const TOOL_USE_ID = 'approval-test-tool'

import assert from 'node:assert/strict'
import { ApprovalTurnScope, ApprovalTurnStoppedError } from './src/utils/permissions/approvalTurnScope.js'
import { allowsAutomaticWorkspaceEdits, requiresHumanApproval, supportsLocalAutoApproval } from './src/utils/permissions/aiApproval.js'

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
console.log('未覆盖：真实模型、后台任务状态更新、模式切换与完整审批闭环（后续阶段）')
