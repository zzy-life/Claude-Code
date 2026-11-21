import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

// 一键运行：node test-official-telemetry-removal.mjs（Node 22.13+）。
const ROOT = dirname(fileURLToPath(import.meta.url))
const FEATURE_FILE = 'src/services/analytics/growthbook.ts'
const ENV_OVERRIDES = { env_only: true, precedence: 'environment', explicit_false: false }
const CONFIG_OVERRIDES = { config_only: 42, precedence: 'config', explicit_false: true }
const LEGACY_CACHE = { legacy_only: true }
const REMOVED_FILES = [
  'src/utils/telemetry/bigqueryExporter.ts',
  'src/services/api/metricsOptOut.ts',
  'src/constants/keys.ts',
  'src/components/FeedbackSurvey/submitTranscriptShare.ts',
  'src/components/FeedbackSurvey/TranscriptSharePrompt.tsx',
  'src/components/FeedbackSurvey/useFrustrationDetection.ts',
]
const REMOVED_REFERENCES = /initializeGrowthBook|refreshGrowthBook|resetGrowthBook|cachedGrowthBookFeatures|cachedStatsigGates|metricsStatusCache|bigqueryExporter|metricsOptOut|@growthbook\/growthbook|getGrowthBookClientKey|getUserForGrowthBook|markGroveNoticeViewed|grove_notice_viewed['"`]|submitTranscriptShare|TranscriptSharePrompt|handleTranscriptSelect|transcriptShareDismissed|claude_code_shared_session_transcripts|extractAgentIdsFromMessages|useFrustrationDetection/
const featureSource = readFileSync(resolve(ROOT, FEATURE_FILE), 'utf8')

function loadFeatures(userType, rawOverrides = JSON.stringify(ENV_OVERRIDES)) {
  let config = {
    growthBookOverrides: structuredClone(CONFIG_OVERRIDES),
    cachedGrowthBookFeatures: LEGACY_CACHE,
    cachedStatsigGates: LEGACY_CACHE,
  }
  const errors = []
  const listeners = new Set()
  // 仅隔离配置、日志与 signal；实际执行被测文件的全部本地取值逻辑。
  const context = vm.createContext({
    process: { env: { USER_TYPE: userType, CLAUDE_INTERNAL_FC_OVERRIDES: rawOverrides } },
    isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    getGlobalConfig: () => config,
    saveGlobalConfig: update => { config = update(config) },
    logError: error => errors.push(error),
    createSignal: () => ({
      subscribe: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      emit: () => { for (const listener of listeners) listener() },
    }),
  })
  const localSource = featureSource.replace(/^import .*$/gm, '')
  const executable = stripTypeScriptTypes(localSource).replace(/^export /gm, '')
  const names = [...featureSource.matchAll(/^export (?:async )?function (\w+)/gm)].map(match => match[1])
  const api = new vm.Script(`${executable}\n;({${names.join(',')}})`).runInContext(context)
  return { api, errors }
}

for (const path of REMOVED_FILES) {
  assert.equal(existsSync(resolve(ROOT, path)), false, `${path} should be removed`)
}
function checkSourceTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      checkSourceTree(path)
    } else if (/\.tsx?$/.test(entry.name)) {
      assert.doesNotMatch(readFileSync(path, 'utf8'), REMOVED_REFERENCES, path)
    }
  }
}
checkSourceTree(resolve(ROOT, 'src'))
assert.doesNotMatch(featureSource, /fetch\(|axios|setInterval|https?:\/\//)
assert.doesNotMatch(readFileSync(resolve(ROOT, 'package.json'), 'utf8'), /@growthbook\/growthbook/)
assert.doesNotMatch(readFileSync(resolve(ROOT, 'bun.lock'), 'utf8'), /@growthbook\/growthbook|dom-mutator/)
const instrumentation = readFileSync(resolve(ROOT, 'src/utils/telemetry/instrumentation.ts'), 'utf8')
assert.match(instrumentation, /CLAUDE_CODE_ENABLE_TELEMETRY/)
assert.match(instrumentation, /readers\.push\(\.\.\.\(await getOtlpReaders\(\)\)\)/)
assert.match(instrumentation, /initializeBetaTracing/)

const external = loadFeatures('external').api
assert.equal(external.getFeatureValue_CACHED_MAY_BE_STALE('legacy_only', false), false)
assert.equal(external.getFeatureValue_CACHED_MAY_BE_STALE('env_only', false), false)
assert.equal(external.getFeatureValue_CACHED_MAY_BE_STALE('config_only', 7), 7)
assert.equal(external.getFeatureValue_CACHED_MAY_BE_STALE('default_on', true), true)
assert.equal(await external.checkGate_CACHED_OR_BLOCKING('legacy_only'), false)
assert.equal(await external.checkSecurityRestrictionGate('legacy_only'), false)
assert.deepEqual(Object.keys(external.getAllGrowthBookFeatures()), [])

const internal = loadFeatures('ant').api
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('precedence', ''), 'environment')
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('config_only', 0), 42)
assert.equal(internal.checkStatsigFeatureGate_CACHED_MAY_BE_STALE('explicit_false'), false)
assert.equal(internal.checkStatsigFeatureGate_CACHED_MAY_BE_STALE('legacy_only'), false)
assert.equal(await internal.getFeatureValue_DEPRECATED('missing', 9), 9)
assert.equal(internal.getFeatureValue_CACHED_WITH_REFRESH('missing', 9, 1), 9)
assert.equal(await internal.getDynamicConfig_BLOCKS_ON_INIT('config_only', 0), 42)
assert.equal(internal.getDynamicConfig_CACHED_MAY_BE_STALE('config_only', 0), 42)
let refreshed = 0
const unsubscribe = internal.onGrowthBookRefresh(() => { refreshed++ })
internal.setGrowthBookConfigOverride('runtime', 123)
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('runtime', 0), 123)
internal.setGrowthBookConfigOverride('runtime', undefined)
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('runtime', 0), 0)
assert.equal(refreshed, 2)
unsubscribe()
internal.clearGrowthBookConfigOverrides()
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('config_only', 0), 0)
assert.equal(internal.getFeatureValue_CACHED_MAY_BE_STALE('env_only', false), true)
assert.equal(refreshed, 2)
const malformed = loadFeatures('ant', '{')
assert.equal(malformed.api.getFeatureValue_CACHED_MAY_BE_STALE('config_only', 0), 42)
assert.equal(malformed.errors.length, 1)
// 执行真实问卷状态机，确保评分后只感谢，不进入会话分享流程。
const surveySource = readFileSync(resolve(ROOT, 'src/components/FeedbackSurvey/useSurveyState.tsx'), 'utf8')
const surveyStateSlots = []
const surveyRefSlots = []
const surveyTimers = []
const surveyResponses = []
let stateIndex = 0
let refIndex = 0
const surveyContext = vm.createContext({
  randomUUID: () => 'test-appearance',
  useState: initial => {
    const index = stateIndex++
    if (!(index in surveyStateSlots)) surveyStateSlots[index] = initial
    return [surveyStateSlots[index], value => { surveyStateSlots[index] = value }]
  },
  useRef: initial => {
    const index = refIndex++
    if (!(index in surveyRefSlots)) surveyRefSlots[index] = { current: initial }
    return surveyRefSlots[index]
  },
  useCallback: callback => callback,
  setTimeout: (callback, delay, ...args) => surveyTimers.push(() => callback(...args)),
})
const surveyExecutable = stripTypeScriptTypes(surveySource.replace(/^import .*$/gm, '')).replace(/^export /gm, '')
const useSurveyState = new vm.Script(`${surveyExecutable}\n;useSurveyState`).runInContext(surveyContext)
function renderSurvey() {
  stateIndex = 0
  refIndex = 0
  return useSurveyState({
    hideThanksAfterMs: 3000,
    onOpen: () => {},
    onSelect: (id, response) => surveyResponses.push(response),
  })
}
for (const response of ['good', 'fine', 'bad', 'dismissed']) {
  renderSurvey().open()
  assert.equal(renderSurvey().state, 'open')
  assert.equal(renderSurvey().handleSelect(response), false)
  if (response === 'dismissed') {
    assert.equal(renderSurvey().state, 'closed')
  } else {
    assert.equal(renderSurvey().state, 'thanks')
    assert.equal(renderSurvey().lastResponse, response)
    surveyTimers.shift()()
    assert.equal(renderSurvey().state, 'closed')
    assert.equal(renderSurvey().lastResponse, null)
  }
}
assert.deepEqual(surveyResponses, ['good', 'fine', 'bad', 'dismissed'])
assert.equal('handleTranscriptSelect' in renderSurvey(), false)
assert.match(readFileSync(resolve(ROOT, 'src/components/Feedback.tsx'), 'utf8'), /claude_cli_feedback/)
assert.match(readFileSync(resolve(ROOT, 'src/commands/insights.ts'), 'utf8'), /queryWithModel/)
console.log('通过：官方通道及问卷会话分享已移除；本地配置、普通评分、用户自配监控、手动反馈和 insights 保留。')
