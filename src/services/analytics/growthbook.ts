import { isEqual } from 'lodash-es'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logError } from '../../utils/log.js'
import { createSignal } from '../../utils/signal.js'

// 保留现有调用接口，但只读取显式本地覆盖，不连接远程服务或读取历史远程缓存。
const refreshed = createSignal()
type GrowthBookRefreshListener = () => void | Promise<void>

export function onGrowthBookRefresh(
  listener: GrowthBookRefreshListener,
): () => void {
  return refreshed.subscribe(() => {
    try {
      void Promise.resolve(listener()).catch(logError)
    } catch (error) {
      logError(error)
    }
  })
}

let envOverrides: Record<string, unknown> | null = null
let envOverridesParsed = false

function getEnvOverrides(): Record<string, unknown> | null {
  if (!envOverridesParsed) {
    envOverridesParsed = true
    if (process.env.USER_TYPE === 'ant') {
      const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
      if (raw) {
        try {
          envOverrides = JSON.parse(raw) as Record<string, unknown>
        } catch {
          logError(new Error('Failed to parse local feature overrides'))
        }
      }
    }
  }
  return envOverrides
}

function getConfigOverrides(): Record<string, unknown> | undefined {
  if (process.env.USER_TYPE !== 'ant') {
    return undefined
  }
  try {
    return getGlobalConfig().growthBookOverrides
  } catch {
    // 启动早期尚未允许读取配置时，沿用调用方默认值。
    return undefined
  }
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return { ...getConfigOverrides(), ...getEnvOverrides() }
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return getConfigOverrides() ?? {}
}

export function setGrowthBookConfigOverride(
  feature: string,
  value: unknown,
): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }
  try {
    saveGlobalConfig(config => {
      const current = config.growthBookOverrides ?? {}
      if (value === undefined) {
        if (!(feature in current)) {
          return config
        }
        const remaining = { ...current }
        delete remaining[feature]
        if (Object.keys(remaining).length === 0) {
          const next = { ...config }
          delete next.growthBookOverrides
          return next
        }
        return { ...config, growthBookOverrides: remaining }
      }
      if (isEqual(current[feature], value)) {
        return config
      }
      return { ...config, growthBookOverrides: { ...current, [feature]: value } }
    })
    refreshed.emit()
  } catch (error) {
    logError(error)
  }
}

export function clearGrowthBookConfigOverrides(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }
  try {
    saveGlobalConfig(config => {
      if (!config.growthBookOverrides) {
        return config
      }
      const next = { ...config }
      delete next.growthBookOverrides
      return next
    })
    refreshed.emit()
  } catch (error) {
    logError(error)
  }
}

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string,
  defaultValue: T,
): T {
  const env = getEnvOverrides()
  if (env && feature in env) {
    return env[feature] as T
  }
  const config = getConfigOverrides()
  if (config && feature in config) {
    return config[feature] as T
  }
  return defaultValue
}

export async function getFeatureValue_DEPRECATED<T>(
  feature: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  feature: string,
  defaultValue: T,
  _refreshIntervalMs: number,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  gate: string,
): boolean {
  return Boolean(getFeatureValue_CACHED_MAY_BE_STALE(gate, false))
}

export async function checkSecurityRestrictionGate(
  gate: string,
): Promise<boolean> {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate)
}

export async function checkGate_CACHED_OR_BLOCKING(
  gate: string,
): Promise<boolean> {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate)
}

export async function getDynamicConfig_BLOCKS_ON_INIT<T>(
  configName: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  configName: string,
  defaultValue: T,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}
