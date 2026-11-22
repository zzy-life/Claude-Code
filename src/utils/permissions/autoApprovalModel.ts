import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages.js'
import { getAutoApprovalUsage, claimAutoApprovalUsage } from '../../bootstrap/state.js'
import { addToTotalSessionCost } from '../../cost-tracker.js'
import { ALL_MODEL_CONFIGS } from '../model/configs.js'
import { getModelStrings } from '../model/modelStrings.js'
import { getDefaultHaikuModel, getDefaultOpusModel, getDefaultSonnetModel, normalizeModelStringForAPI, parseUserSpecifiedModel } from '../model/model.js'
import { calculateUSDCost } from '../modelCost.js'
import { getInitialSettings } from '../settings/settings.js'

export type ApprovalModelFamily = 'opus' | 'sonnet' | 'haiku'

/** Exact reverse mapping only. Names merely containing "opus" are not evidence. */
export function identifyApprovalModelFamily(rootModel: string | undefined): ApprovalModelFamily | undefined {
  if (!rootModel) return undefined
  const normalize = normalizeModelStringForAPI
  const root = normalize(rootModel)
  const families = new Set<ApprovalModelFamily>()
  const strings = getModelStrings()
  const overrides = getInitialSettings().modelOverrides
  for (const [key, config] of Object.entries(ALL_MODEL_CONFIGS)) {
    let family: ApprovalModelFamily
    if (key.startsWith('opus')) family = 'opus'
    else if (key.startsWith('sonnet')) family = 'sonnet'
    else if (key.startsWith('haiku')) family = 'haiku'
    else continue
    const override = overrides?.[config.firstParty]
    const values = [...Object.values(config), strings[key as keyof typeof strings], ...(override ? [override] : [])]
    if (values.some(value => normalize(value) === root)) families.add(family)
  }
  for (const [family, model] of [
    ['opus', getDefaultOpusModel()], ['sonnet', getDefaultSonnetModel()], ['haiku', getDefaultHaikuModel()],
  ] as const) {
    if (root === family || normalize(model) === root) families.add(family)
  }
  if (families.size !== 1) return undefined
  return [...families][0]
}

export function resolveAutoApprovalModel(rootModel: string | undefined): string | undefined {
  const family = identifyApprovalModelFamily(rootModel)
  if (!family) return undefined
  const expected = family === 'opus' ? 'sonnet' : 'haiku'
  let target = family === 'opus' ? getDefaultSonnetModel() : getDefaultHaikuModel()
  if (target === 'opus' || target === 'sonnet' || target === 'haiku') {
    target = parseUserSpecifiedModel(target)
    if (target === 'opus' || target === 'sonnet' || target === 'haiku') return undefined
  }
  if (identifyApprovalModelFamily(target) !== expected) return undefined
  return target
}

/** Side-query usage never enters the main conversation/context token counters. */
export function recordAutoApprovalUsage(response: BetaMessage, model: string): void {
  if (!claimAutoApprovalUsage(response.id)) return
  const totals = getAutoApprovalUsage()
  const usage = response.usage
  const cost = calculateUSDCost(model, usage)
  addToTotalSessionCost(cost, usage, model)
  totals.calls++
  totals.input += usage.input_tokens
  totals.output += usage.output_tokens
  totals.cacheRead += usage.cache_read_input_tokens ?? 0
  totals.cacheWrite += usage.cache_creation_input_tokens ?? 0
  totals.costUSD += cost
}

