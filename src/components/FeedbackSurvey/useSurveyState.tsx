import { randomUUID } from 'crypto';
import { useCallback, useRef, useState } from 'react';
import type { FeedbackSurveyResponse } from './utils.js';
type SurveyState = 'closed' | 'open' | 'thanks';
type UseSurveyStateOptions = {
  hideThanksAfterMs: number;
  onOpen: (appearanceId: string) => void | Promise<void>;
  onSelect: (appearanceId: string, selected: FeedbackSurveyResponse) => void | Promise<void>;
};
export function useSurveyState({
  hideThanksAfterMs,
  onOpen,
  onSelect
}: UseSurveyStateOptions): {
  state: SurveyState;
  lastResponse: FeedbackSurveyResponse | null;
  open: () => void;
  handleSelect: (selected: FeedbackSurveyResponse) => boolean;
} {
  const [state, setState] = useState<SurveyState>('closed');
  const [lastResponse, setLastResponse] = useState<FeedbackSurveyResponse | null>(null);
  const appearanceId = useRef(randomUUID());
  const showThanksThenClose = useCallback(() => {
    setState('thanks');
    setTimeout((setState_0, setLastResponse_0) => {
      setState_0('closed');
      setLastResponse_0(null);
    }, hideThanksAfterMs, setState, setLastResponse);
  }, [hideThanksAfterMs]);
  const open = useCallback(() => {
    if (state !== 'closed') {
      return;
    }
    setState('open');
    appearanceId.current = randomUUID();
    void onOpen(appearanceId.current);
  }, [state, onOpen]);
  const handleSelect = useCallback((selected: FeedbackSurveyResponse): boolean => {
    setLastResponse(selected);
    void onSelect(appearanceId.current, selected);
    if (selected === 'dismissed') {
      setState('closed');
      setLastResponse(null);
    } else {
      showThanksThenClose();
    }
    return false;
  }, [showThanksThenClose, onSelect]);
  return { state, lastResponse, open, handleSelect };
}
