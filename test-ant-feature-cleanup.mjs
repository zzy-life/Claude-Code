import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(fileURLToPath(import.meta.url))
const EFFORT_FILE = 'src/utils/effort.ts'
const SETTINGS_TYPES_FILE = 'src/utils/settings/types.ts'
const CONTEXT_DATA_FILE = 'src/utils/analyzeContext.ts'
const CONTEXT_UI_FILE = 'src/components/ContextVisualization.tsx'
const CONTEXT_TEXT_FILE = 'src/commands/context/context-noninteractive.ts'
const LEVELS = ['low', 'medium', 'high', 'max']
const EFFORT_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'custom-model']
const MODEL_PICKER_FILE = 'src/components/ModelPicker.tsx'
const API_FILE = 'src/services/api/claude.ts'
const COMMANDS_FILE = 'src/commands.ts'
const BUNDLED_SKILLS_FILE = 'src/skills/bundled/index.ts'
const INFERENCE_COMMANDS = ['model', 'fast', 'effort']
const REMOVED_FILES = [
  'src/commands/cost/index.ts',
  'src/commands/cost/cost.ts',
  'src/commands/version.ts',
  'src/commands/bridge-kick.ts',
  'src/skills/bundled/loremIpsum.ts',
  'src/utils/immediateCommand.ts',
  'src/utils/model/antModels.ts',
  'src/components/AntModelSwitchCallout.tsx',
  'src/services/PromptSuggestion/speculation.ts',
  'src/bridge/bridgeDebug.ts',
]
const BRIDGE_FILE = 'src/bridge/replBridge.ts'
const INSIGHTS_FILE = 'src/commands/insights.ts'
const API_COMPACT_FILE = 'src/services/compact/apiMicrocompact.ts'
const BETAS_FILE = 'src/utils/betas.ts'
const THINKING_CASES = [
  { options: undefined, expected: undefined },
  { options: {}, expected: undefined },
  { options: { clearAllThinking: true }, expected: undefined },
  { options: { hasThinking: true }, expected: { edits: [{ type: 'clear_thinking_20251015', keep: 'all' }] } },
  { options: { hasThinking: true, clearAllThinking: true }, expected: { edits: [{ type: 'clear_thinking_20251015', keep: { type: 'thinking_turns', value: 1 } }] } },
  { options: { hasThinking: true, isRedactThinkingActive: true }, expected: undefined },
  { options: { hasThinking: true, isRedactThinkingActive: true, clearAllThinking: true }, expected: undefined },
]
const REMOVED_BRIDGE_REFERENCES = /bridge-kick|bridgeDebug|wrapApiForFaultInjection|registerBridgeDebugHandle|clearBridgeDebugHandle|injectBridgeFault|debugFireClose/
const REMOVED_SPECULATION_REFERENCES = /speculation|isSpeculative|is_speculative/i
const PERFETTO_FILE = 'src/utils/telemetry/perfettoTracing.ts'
const BASH_PERMISSIONS_FILE = 'src/tools/BashTool/bashPermissions.ts'
const REMOVED_MODEL_REFERENCES = /antModels|resolveAntModel|getAntModels|getAntModelOverrideConfig|AntModelSwitchCallout|shouldShowAntModelSwitch|showModelSwitchCallout|setShowModelSwitchCallout|shouldShowModelSwitchCallout|['"]model-switch['"]/
const REMOVED_REFERENCES = /commands\/(?:cost\/|version\.js|bridge-kick\.js)|registerLoremIpsumSkill|loremIpsum\.js|shouldInferenceConfigCommandBeImmediate|utils\/immediateCommand\.js|(?<![\w/.-])\/(?:cost|version|lorem-ipsum)\b/

const read = path => readFileSync(join(ROOT, path), 'utf8')
const effort = read(EFFORT_FILE)
const data = read(CONTEXT_DATA_FILE)
const ui = read(CONTEXT_UI_FILE)
const text = read(CONTEXT_TEXT_FILE)

// 单独执行真实函数正文，避免为一个纯函数加载整个 CLI 和 Bun 构建环境。
const persistBody = effort.match(/export function toPersistableEffort\([\s\S]*?\): EffortLevel \| undefined \{([\s\S]*?)\n\}/)?.[1]
assert.ok(persistBody, '应存在 max 持久化函数')
assert.doesNotMatch(persistBody, /USER_TYPE/, '持久化不应再按员工身份分流')
const persist = new Function('value', persistBody)
for (const level of LEVELS) {
  assert.equal(persist(level), level)
}
assert.equal(persist(100), undefined, '数值 effort 仍不应持久化')
assert.equal(persist(undefined), undefined)

const appliedBody = effort.match(/export function resolveAppliedEffort\([\s\S]*?\): EffortValue \| undefined \{([\s\S]*?)\n\}/)?.[1]
assert.ok(appliedBody, '应存在请求 effort 解析函数')
const applyEffort = new Function('model', 'appStateEffortValue', 'getEffortEnvOverride', 'getDefaultEffortForModel', appliedBody)
for (const model of EFFORT_MODELS) {
  for (const level of LEVELS) {
    assert.equal(applyEffort(model, level, () => undefined, () => 'medium'), level, `${model} 不应降档或丢弃 ${level}`)
  }
}
assert.equal(applyEffort('custom-model', 'max', () => null, () => 'medium'), undefined, '保留 env auto/unset 优先级')
assert.equal(applyEffort('custom-model', 'low', () => 'max', () => 'medium'), 'max', '保留环境覆盖')
assert.equal(applyEffort('custom-model', undefined, () => undefined, () => 'medium'), 'medium', '保留模型默认')
assert.match(read(MODEL_PICKER_FILE), /const displayEffort = effort;/, '菜单不应仅在显示层降档')
const api = read(API_FILE)
const configureBody = api.match(/function configureEffortParams\([\s\S]*?\): void \{([\s\S]*?)\n\}/)?.[1]
assert.ok(configureBody, '应存在请求 effort 配置函数')
assert.doesNotMatch(configureBody, /modelSupports/, '请求不再以客户端模型名单过滤 effort')
assert.match(configureBody, /outputConfig\.effort = effortValue/, '字符串 effort 应原样写入请求')

// 配置 schema 也必须接受 max，否则 .catch(undefined) 会在重启读取时静默丢弃。
const effortSchema = read(SETTINGS_TYPES_FILE).match(/effortLevel: z([\s\S]*?)\.describe\('Persisted effort level for supported models\.'\)/)?.[1]
assert.ok(effortSchema, '应存在 effort 配置 schema')
assert.doesNotMatch(effortSchema, /USER_TYPE/, '配置校验不应按员工身份限制 max')
assert.match(effortSchema, /\.enum\(\['low', 'medium', 'high', 'max'\]\)/, '配置读写必须接受所有命名 effort 级别')

for (const field of ['deferredBuiltinTools: deferredBuiltinDetails', 'systemTools: systemToolDetails', 'systemPromptSections,']) {
  assert.ok(data.includes(field), `context 应直接返回 ${field}`)
}
assert.doesNotMatch(data, /USER_TYPE|\[ANT-ONLY\]/, 'context 数据不应再隐藏员工明细')
assert.doesNotMatch(ui, /\[ANT-ONLY\]|&& false &&/, '交互明细不应被固定关闭')
assert.doesNotMatch(text, /USER_TYPE|\[ANT-ONLY\]/, '文本明细不应限制员工')
assert.match(text, /^  if \(systemTools && systemTools.length > 0\) \{/m)
assert.match(text, /^  if \(systemPromptSections && systemPromptSections.length > 0\) \{/m)
assert.match(text, /^  if \(messageBreakdown\) \{/m)
for (const title of ['System tools', 'System prompt sections', 'Message breakdown']) {
  assert.ok(ui.includes(title), `交互输出应保留 ${title}`)
}
for (const title of ['System Tools', 'System Prompt Sections', 'Message Breakdown']) {
  assert.ok(text.includes(title), `文本输出应保留 ${title}`)
}

for (const path of REMOVED_FILES) {
  assert.equal(existsSync(join(ROOT, path)), false, `专用文件应已删除：${path}`)
}
const commands = read(COMMANDS_FILE)
assert.doesNotMatch(commands, /\b(?:cost|bridgeKick|version)\b/, '命令列表和远程白名单不应残留已删入口')
assert.doesNotMatch(read(BUNDLED_SKILLS_FILE), /LoremIpsum|loremIpsum/, '不再注册填充文本技能')
for (const name of INFERENCE_COMMANDS) {
  const source = read(`src/commands/${name}/index.ts`)
  assert.ok(source.includes(`name: '${name}'`), `应保留 /${name}`)
  assert.doesNotMatch(source, /\bimmediate\b|immediateCommand/, `/${name} 不应立即执行`)
}
assert.match(read('src/utils/handlePromptSubmit.ts'), /cmd\.immediate/, '保留通用立即执行机制')
assert.match(read('src/commands/exit/index.ts'), /immediate: true/, '不影响其他命令的立即执行')
assert.ok(existsSync(join(ROOT, 'src/cost-tracker.ts')), '保留成本统计基础设施')
assert.ok(read('src/main.tsx').includes('--version'), '保留 CLI --version')
const perfetto = read(PERFETTO_FILE)
assert.match(perfetto, /export function startLLMRequestPerfettoSpan/, '保留正常 API 追踪入口')
for (const field of ['model: args.model', 'prompt_tokens: args.promptTokens', 'message_id: args.messageId', 'query_source: args.querySource']) {
  assert.ok(perfetto.includes(field), `保留正常 API 追踪字段：${field}`)
}
assert.match(read(BASH_PERMISSIONS_FILE), /const speculativeChecks = new Map/, '保留 Bash 权限分类预检查')

const bridge = read(BRIDGE_FILE)
assert.match(bridge, /const api = createBridgeApiClient\(/, 'Bridge 直接使用正常 API 客户端')
assert.match(bridge, /if \(transport !== newTransport\) return\s+handleTransportPermanentClose\(closeCode\)/, '保留正常关闭回调与过时 transport 保护')
assert.match(bridge, /async function reconnectEnvironmentWithSession\(/, '保留正常 Bridge 重连')
const insights = read(INSIGHTS_FILE)
assert.doesNotMatch(insights, /homespace|shareable insights report/i, '不再提供内部收集或分享提示')
assert.ok(insights.includes('const reportUrl = `file://${htmlPath}`'), 'insights 保留本地文件链接')
assert.match(insights, /await writeFile\(htmlPath, htmlReport/, '保留本地 HTML 报告生成')
assert.doesNotMatch(insights, /facets: substantiveFacets/, '不再返回未消费的 facets')
const apiCompact = read(API_COMPACT_FILE)
assert.match(apiCompact, /clear_thinking_20251015/, '保留 thinking 管理策略')
// 仅剥离参数和局部变量的类型标注，执行源码中的实际策略分支。
const thinkingBody = apiCompact.match(/export function getAPIContextManagement\([\s\S]*?\): ContextManagementConfig \| undefined \{([\s\S]*?)\n\}/)?.[1]
assert.ok(thinkingBody, '应存在 API thinking 策略函数')
const getContextManagement = new Function('options', thinkingBody.replace('const strategies: ContextEditStrategy[] = []', 'const strategies = []'))
for (const { options, expected } of THINKING_CASES) {
  assert.deepEqual(getContextManagement(options), expected, `thinking 策略不符合预期：${JSON.stringify(options)}`)
}
assert.match(read(BETAS_FILE), /betaHeaders\.push\(CONTEXT_MANAGEMENT_BETA_HEADER\)/, '保留 thinking 所需 beta')

function checkSourceReferences(directory) {
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      checkSourceReferences(path)
    } else if (/\.tsx?$/.test(entry.name)) {
      const source = read(path)
      assert.doesNotMatch(source, REMOVED_REFERENCES, `发现已删入口引用：${path}`)
      assert.doesNotMatch(source, REMOVED_MODEL_REFERENCES, `发现内部模型配置或 UI 残留：${path}`)
      assert.doesNotMatch(source, REMOVED_SPECULATION_REFERENCES, `发现推测执行残留：${path}`)
      assert.doesNotMatch(source, REMOVED_BRIDGE_REFERENCES, `发现 Bridge 故障注入残留：${path}`)
      assert.doesNotMatch(source, /clear_tool_uses_20250919/, `发现 API 工具清理策略残留：${path}`)
    }
  }
}
checkSourceReferences('src')

console.log('PASS：max/context 开放、命令入口、内部模型、推测执行、Bridge 故障注入及本地 insights／thinking 策略的静态回归检查。')
console.log('本脚本不构建、不启动应用；交互、运行中命令排队和 CLI --version 仍需手动验收。')
