/**
 * Public event API. Remote event analytics have been removed; calls are discarded
 * immediately without collecting metadata, retaining a queue, or sending requests.
 */

export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = never
export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = never

type LogEventMetadata = { [key: string]: boolean | number | undefined }

// Keep call sites independent of the removed analytics backends.
export function logEvent(
  eventName: string,
  metadata: LogEventMetadata,
): void {}

export async function logEventAsync(
  eventName: string,
  metadata: LogEventMetadata,
): Promise<void> {}
