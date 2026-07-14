import { createAxiosInstance } from '../../utils/proxy.js'

export type ProxyQuotaUsage = {
  seven_day?: {
    utilization: number | null
    resets_at: string | null
  } | null
}

/** Fetches the current proxy client's weekly quota utilization. */
export async function fetchProxyQuotaUsage(): Promise<number | undefined> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!baseUrl || !apiKey) return undefined

  const url = new URL('v1/usage', `${baseUrl.replace(/\/+$/, '')}/`).toString()
  const response = await createAxiosInstance().get<ProxyQuotaUsage>(url, {
    headers: { 'x-api-key': apiKey },
    timeout: 5000,
  })
  const utilization = response.data.seven_day?.utilization
  if (typeof utilization !== 'number' || !Number.isFinite(utilization)) {
    return undefined
  }

  return Math.round(Math.min(100, Math.max(0, 100 - utilization)))
}
