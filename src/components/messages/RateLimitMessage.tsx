import React from 'react';
import { Box, Text } from 'src/ink.js';
import { getRateLimitTier, isClaudeAISubscriber } from 'src/utils/auth.js';
import { MessageResponse } from '../MessageResponse.js';

type RateLimitMessageProps = {
  text: string;
};

export function RateLimitMessage({ text }: RateLimitMessageProps) {
  const showLoginHint = isClaudeAISubscriber() && getRateLimitTier() === 'default_claude_max_20x';

  return <MessageResponse>
    <Box flexDirection="column">
      <Text color="error">{text}</Text>
      {showLoginHint && <Text dimColor>/login to switch to an API usage-billed account.</Text>}
    </Box>
  </MessageResponse>;
}
