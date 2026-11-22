import React, { useState } from 'react';
import type { CommandResultDisplay, LocalJSXCommandContext } from '../../commands.js';
import { type OptionWithDescription, Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '../../components/design-system/Dialog.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { logEvent } from '../../services/analytics/index.js';
import type { ToolUseContext } from '../../Tool.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getRateLimitTier, getSubscriptionType } from '../../utils/auth.js';
import upgrade from '../upgrade/index.js';
import { call as upgradeCall } from '../upgrade/upgrade.js';

type RateLimitOptionsMenuOptionType = 'upgrade' | 'cancel';
type RateLimitOptionsMenuProps = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  context: ToolUseContext & LocalJSXCommandContext;
};

function RateLimitOptionsMenu({ onDone, context }: RateLimitOptionsMenuProps): React.ReactNode {
  const [subCommandJSX, setSubCommandJSX] = useState<React.ReactNode>(null);
  const subscriptionType = getSubscriptionType();
  const isMax20x = subscriptionType === 'max' && getRateLimitTier() === 'default_claude_max_20x';
  const isTeamOrEnterprise = subscriptionType === 'team' || subscriptionType === 'enterprise';
  const buyFirst = getFeatureValue_CACHED_MAY_BE_STALE('tengu_jade_anvil_4', false);
  const options: OptionWithDescription<RateLimitOptionsMenuOptionType>[] = [];
  if (!isMax20x && !isTeamOrEnterprise && upgrade.isEnabled()) {
    options.push({ label: 'Upgrade your plan', value: 'upgrade' });
  }
  const cancelOption: OptionWithDescription<RateLimitOptionsMenuOptionType> = {
    label: 'Stop and wait for limit to reset', value: 'cancel',
  };
  if (buyFirst) {
    options.push(cancelOption);
  } else {
    options.unshift(cancelOption);
  }

  function handleCancel(): void {
    logEvent('tengu_rate_limit_options_menu_cancel', {});
    onDone(undefined, { display: 'skip' });
  }
  function handleSelect(value: RateLimitOptionsMenuOptionType): void {
    if (value === 'upgrade') {
      logEvent('tengu_rate_limit_options_menu_select_upgrade', {});
      void upgradeCall(onDone, context).then(jsx => {
        if (jsx) setSubCommandJSX(jsx);
      });
    } else if (value === 'cancel') {
      handleCancel();
    }
  }
  if (subCommandJSX) return subCommandJSX;
  return <Dialog title="What do you want to do?" onCancel={handleCancel} color="suggestion">
    <Select options={options} onChange={handleSelect} visibleOptionCount={options.length} />
  </Dialog>;
}

export async function call(onDone: LocalJSXCommandOnDone, context: ToolUseContext & LocalJSXCommandContext): Promise<React.ReactNode> {
  return <RateLimitOptionsMenu onDone={onDone} context={context} />;
}
