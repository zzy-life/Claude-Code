// 一键运行：bun run ./test-bypass-mode-cycle.ts
// 内存夹具验证真实循环选择和环境检查；不发请求、不执行工具、不读写用户配置。
const START_MODE = 'default' as const
const EXPECTED_CYCLE = ['plan', 'acceptEdits', 'auto', 'bypassPermissions', 'default']
const BASE_CONTEXT = {
  mode: START_MODE,
  additionalWorkingDirectories: new Map(),
  alwaysAllowRules: {}, alwaysDenyRules: {}, alwaysAskRules: {},
  isBypassPermissionsModeAvailable: false,
  isAutoModeAvailable: true,
}
const ENV_KEYS = ['CLAUDE_CODE_REMOTE', 'USER_TYPE', 'CLAUDE_CODE_ENTRYPOINT', 'IS_SANDBOX', 'CLAUDE_CODE_BUBBLEWRAP'] as const
const SAVED_ENV = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))

import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import type { ToolPermissionContext } from './src/Tool.js'

let interactive = true
let remote = false
let teammate = false
let bypassDisabled = false
let autoAvailable = true

mock.module('./src/bootstrap/state.js', () => ({
  getIsNonInteractiveSession: () => !interactive,
  getIsRemoteMode: () => remote,
}))
mock.module('./src/utils/teammate.js', () => ({ isTeammate: () => teammate }))
mock.module('./src/utils/teammateContext.js', () => ({ isInProcessTeammate: () => teammate }))
mock.module('./src/utils/permissions/permissionSetup.js', () => ({
  isAutoModeGateEnabled: () => autoAvailable,
  isBypassPermissionsModeDisabled: () => bypassDisabled,
  getAutoModeUnavailableReason: () => 'fixture disabled',
  transitionPermissionMode: () => { throw new Error('本测试不激活权限模式') },
}))
mock.module('./src/utils/debug.js', () => ({ logForDebugging: () => {} }))

const { getNextPermissionMode, canOfferLocalBypassPermissions } = await import('./src/utils/permissions/getNextPermissionMode.js')
const { getBypassPermissionsEnvironmentError } = await import('./src/utils/permissions/bypassPermissionsEnvironment.js')

try {
  for (const key of ENV_KEYS) delete process.env[key]
  // 允许测试在 Unix root 环境运行，同时不改动真实系统或权限。
  process.env.IS_SANDBOX = '1'
  const context: ToolPermissionContext = { ...BASE_CONTEXT }
  let current = context
  for (const expected of EXPECTED_CYCLE) {
    const next = getNextPermissionMode(current, undefined, true)
    assert.equal(next, expected)
    current = { ...current, mode: next }
  }
  assert.equal(context.isBypassPermissionsModeAvailable, false, '本地候选档不得授予启动权限')
  assert.equal(getNextPermissionMode({ ...context, mode: 'auto' }), 'default', '旧入口不默认开放 bypass')
  assert.equal(getNextPermissionMode({ ...context, mode: 'auto', isBypassPermissionsModeAvailable: true }), 'bypassPermissions')

  autoAvailable = false
  assert.equal(getNextPermissionMode({ ...context, mode: 'acceptEdits' }, undefined, true), 'bypassPermissions')
  autoAvailable = true
  bypassDisabled = true
  assert.equal(canOfferLocalBypassPermissions(), false)
  assert.equal(getNextPermissionMode({ ...context, mode: 'auto', isBypassPermissionsModeAvailable: true }, undefined, true), 'default')
  bypassDisabled = false

  for (const boundary of ['headless', 'remote', 'teammate', 'ccr']) {
    interactive = boundary !== 'headless'
    remote = boundary === 'remote'
    teammate = boundary === 'teammate'
    process.env.CLAUDE_CODE_REMOTE = boundary === 'ccr' ? '1' : '0'
    assert.equal(canOfferLocalBypassPermissions(), false, boundary)
    assert.equal(getNextPermissionMode({ ...context, mode: 'auto' }, undefined, true), 'default', boundary)
    assert.equal(getNextPermissionMode({ ...context, mode: 'auto', isBypassPermissionsModeAvailable: true }), 'bypassPermissions', `${boundary} 保留旧启动授权`)
  }
  interactive = true
  remote = false
  teammate = false
  delete process.env.CLAUDE_CODE_REMOTE
  console.log('PASS：本地五档循环、无 Auto 跳档、管理禁用、远端/队友/非交互旧边界及启动标记隔离')

  delete process.env.IS_SANDBOX
  const rootBlocked = process.platform !== 'win32' && process.getuid?.() === 0
  // 用户类型和启动入口不再改变环境检查结果；Unix root 限制仍然生效。
  for (const userType of ['external', 'ant']) {
    process.env.USER_TYPE = userType
    for (const entrypoint of ['cli', 'local-agent', 'claude-desktop']) {
      process.env.CLAUDE_CODE_ENTRYPOINT = entrypoint
      const error = await getBypassPermissionsEnvironmentError()
      if (rootBlocked) {
        assert.match(error!, /root\/sudo/)
      } else {
        assert.equal(error, undefined)
      }
    }
  }
  process.env.IS_SANDBOX = '1'
  assert.equal(await getBypassPermissionsEnvironmentError(), undefined)
  delete process.env.IS_SANDBOX
  process.env.CLAUDE_CODE_BUBBLEWRAP = '1'
  assert.equal(await getBypassPermissionsEnvironmentError(), undefined)
  console.log('PASS：bypass 不再按 ant 或桌面入口区别处理，保留 Unix root 检查及沙箱例外')
} finally {
  for (const key of ENV_KEYS) {
    if (SAVED_ENV[key] === undefined) delete process.env[key]
    else process.env[key] = SAVED_ENV[key]
  }
}
