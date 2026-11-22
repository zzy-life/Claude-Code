export type OAuthTokens = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  [key: string]: unknown
}

export type SubscriptionType = string
export type BillingType = string
export type OAuthProfileResponse = Record<string, unknown>
