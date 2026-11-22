import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { NO_CONTENT_MESSAGE } from '../../constants/messages.js';
import { Box, Text } from '../../ink.js';
import { extractTag } from '../../utils/messages.js';
import { Markdown } from '../Markdown.js';
import { MessageResponse } from '../MessageResponse.js';
type Props = {
  content: string;
};
export function UserLocalCommandOutputMessage(t0) {
  const $ = _c(4);
  const {
    content
  } = t0;
  let lines;
  let t1;
  if ($[0] !== content) {
    t1 = Symbol.for("react.early_return_sentinel");
    bb0: {
      const stdout = extractTag(content, "local-command-stdout");
      const stderr = extractTag(content, "local-command-stderr");
      if (!stdout && !stderr) {
        let t2;
        if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
          t2 = <MessageResponse><Text dimColor={true}>{NO_CONTENT_MESSAGE}</Text></MessageResponse>;
          $[3] = t2;
        } else {
          t2 = $[3];
        }
        t1 = t2;
        break bb0;
      }
      lines = [];
      if (stdout?.trim()) {
        lines.push(<IndentedContent key="stdout">{stdout.trim()}</IndentedContent>);
      }
      if (stderr?.trim()) {
        lines.push(<IndentedContent key="stderr">{stderr.trim()}</IndentedContent>);
      }
    }
    $[0] = content;
    $[1] = lines;
    $[2] = t1;
  } else {
    lines = $[1];
    t1 = $[2];
  }
  if (t1 !== Symbol.for("react.early_return_sentinel")) {
    return t1;
  }
  return lines;
}
function IndentedContent(t0) {
  const $ = _c(3);
  const {
    children
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Text dimColor={true}>{"  \u23BF  "}</Text>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== children) {
    t2 = <Box flexDirection="row">{t1}<Box flexDirection="column" flexGrow={1}><Markdown>{children}</Markdown></Box></Box>;
    $[1] = children;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  return t2;
}
