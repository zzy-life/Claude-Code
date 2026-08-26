import { createAxiosInstance } from '../../utils/proxy.js'

type ProxyQuotaWindow = {
  utilization: number | null
  resets_at: string | null
}

export type ProxyQuotaUsage = {
  five_hour?: ProxyQuotaWindow | null
  seven_day?: ProxyQuotaWindow | null
}

export type ProxyQuotaRemaining = {
  fiveHour?: number
  sevenDay?: number
}

/** Fetches the current proxy client's quota remaining percentages. */
export async function fetchProxyQuotaUsage(): Promise<ProxyQuotaRemaining | undefined> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return undefined

  const url = new URL('v1/usage', `${baseUrl.replace(/\/+$/, '')}/`).toString()
  const response = await createAxiosInstance().get<ProxyQuotaUsage>(url, {
    headers: { 'x-api-key': apiKey },
    timeout: 5000,
  })
  const toRemainingPercentage = (utilization: number | null | undefined) =>
    typeof utilization === 'number' && Number.isFinite(utilization)
      ? Math.round(Math.min(100, Math.max(0, 100 - utilization)))
      : undefined

  const remaining = {
    fiveHour: toRemainingPercentage(response.data.five_hour?.utilization),
    sevenDay: toRemainingPercentage(response.data.seven_day?.utilization),
  }

  return remaining.fiveHour === undefined && remaining.sevenDay === undefined
    ? undefined
    : remaining
}
