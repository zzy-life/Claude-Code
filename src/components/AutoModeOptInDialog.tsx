import React from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { Box, Text } from '../ink.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { logError } from '../utils/log.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';

export const AUTO_MODE_DESCRIPTION = 'Auto mode uses a separate model to review tool permission requests, which incurs additional model charges. The review can make mistakes and allow harmful actions or reject safe ones. Some actions still require manual approval. A hard deny stops the entire current turn instead of letting Claude retry another approach. Auto mode is not a sandbox and does not isolate commands, files, or network access. Only enable it in an environment where you accept these risks. Shift+Tab to change mode.';

type Props = {
  onAccept(): void;
  onDecline(): void;
  declineExits?: boolean;
  // Reject callbacks from a dialog invalidated by a subsequent mode change.
  isConsentCurrent?(): boolean;
};

export function AutoModeOptInDialog({ onAccept, onDecline, declineExits, isConsentCurrent }: Props) {
  React.useEffect(() => {
    logEvent('tengu_auto_mode_opt_in_dialog_shown', {});
  }, []);

  function onChange(value: string) {
    if (isConsentCurrent && !isConsentCurrent()) {
      return;
    }
    if (value === 'decline') {
      logEvent('tengu_auto_mode_opt_in_dialog_decline', {});
      onDecline();
      return;
    }
    if (value !== 'accept' && value !== 'accept-default') {
      return;
    }
    // Persist only the versioned local protocol consent, never the old skip flag.
    const result = updateSettingsForSource('userSettings', {
      autoModeConsentVersion: 1,
      ...(value === 'accept-default' ? { permissions: { defaultMode: 'auto' as const } } : {})
    });
    if (result.error) {
      logError(result.error);
      return;
    }
    if (value === 'accept-default') {
      logEvent('tengu_auto_mode_opt_in_dialog_accept_default', {});
    } else {
      logEvent('tengu_auto_mode_opt_in_dialog_accept', {});
    }
    onAccept();
  }

  return <Dialog title="Enable auto mode?" color="warning" onCancel={onDecline}>
    <Box flexDirection="column" gap={1}><Text>{AUTO_MODE_DESCRIPTION}</Text></Box>
    <Select options={[
      { label: 'Yes, and make it my default mode', value: 'accept-default' },
      { label: 'Yes, enable auto mode', value: 'accept' },
      { label: declineExits ? 'No, exit' : 'No, go back', value: 'decline' }
    ]} onChange={onChange} onCancel={onDecline} />
  </Dialog>;
}
