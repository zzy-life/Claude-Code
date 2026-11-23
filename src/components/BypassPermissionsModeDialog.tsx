import React from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { Box, Link, Newline, Text } from '../ink.js';
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { logError } from '../utils/log.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/index.js';
import { Dialog } from './design-system/Dialog.js';

type Props = {
  onAccept(): void;
  onDecline?(): void;
  isConsentCurrent?(): boolean;
};

export function BypassPermissionsModeDialog({ onAccept, onDecline, isConsentCurrent }: Props) {
  React.useEffect(() => {
    logEvent('tengu_bypass_permissions_mode_dialog_shown', {});
  }, []);

  function onChange(value: string) {
    if (isConsentCurrent && !isConsentCurrent()) {
      return;
    }
    if (value === 'decline') {
      if (onDecline) {
        onDecline();
      } else {
        gracefulShutdownSync(1);
      }
      return;
    }
    if (value !== 'accept') {
      return;
    }
    const result = updateSettingsForSource('userSettings', {
      skipDangerousModePermissionPrompt: true
    });
    if (result.error) {
      logError(result.error);
      return;
    }
    logEvent('tengu_bypass_permissions_mode_dialog_accept', {});
    onAccept();
  }

  function handleEscape() {
    if (onDecline) {
      onDecline();
    } else {
      gracefulShutdownSync(0);
    }
  }

  return <Dialog title="WARNING: Claude Code running in Bypass Permissions mode" color="error" onCancel={handleEscape}>
    <Box flexDirection="column" gap={1}>
      <Text>In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous commands.<Newline />This mode should only be used in a sandboxed container/VM that has restricted internet access and can easily be restored if damaged.</Text>
      <Text>By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.</Text>
      <Link url="https://code.claude.com/docs/en/security" />
    </Box>
    <Select options={[
      { label: onDecline ? 'No, go back' : 'No, exit', value: 'decline' },
      { label: 'Yes, I accept', value: 'accept' }
    ]} onChange={onChange} onCancel={handleEscape} />
  </Dialog>;
}
