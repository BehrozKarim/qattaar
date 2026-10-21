import { useCallback, useEffect, useRef, useState } from 'react';
import { CAPTURE_FEEDBACK_MS } from '../game/feedback';
import type { Capture, GameState } from '../game/engine';

/** Presentation follows capture events, independently of the authoritative turn. */
export function useCaptureFeedback(state: GameState, gameId: string) {
  const capture = state.lastCapture;
  const [notice, setNotice] = useState<{ gameId: string; seenPly: number; capture: Capture | null }>({ gameId, seenPly: capture?.ply ?? 0, capture: null });
  const previous = useRef({ gameId, ply: state.ply, capturePly: capture?.ply ?? 0 });
  const timers = useRef<{ frame?: number; timeout?: ReturnType<typeof setTimeout> }>({});
  const clearTimers = useCallback(() => {
    if (timers.current.frame !== undefined) cancelAnimationFrame(timers.current.frame);
    clearTimeout(timers.current.timeout);
  }, []);
  const at = capture?.at;
  const player = capture?.player;
  const by = capture?.by;
  const capturePly = capture?.ply ?? 0;

  useEffect(() => {
    const old = previous.current;
    previous.current = { gameId, ply: state.ply, capturePly };
    const reset = old.gameId !== gameId || state.ply < old.ply;
    const fresh = !reset && capturePly > old.capturePly;
    if (!reset && !fresh) return;
    clearTimers();
    timers.current.frame = requestAnimationFrame(() => {
      if (fresh && at !== undefined && player && by) setNotice({ gameId, seenPly: capturePly, capture: { at, player, by, ply: capturePly } });
      else setNotice({ gameId, seenPly: capturePly, capture: null });
    });
    if (fresh) timers.current.timeout = setTimeout(() => setNotice({ gameId, seenPly: capturePly, capture: null }), CAPTURE_FEEDBACK_MS);
  }, [gameId, state.ply, capturePly, at, player, by, clearTimers]);
  useEffect(() => clearTimers, [clearTimers]);

  if (notice.gameId !== gameId) return null;
  // Show new captures on the first render, before the effect schedules its timer.
  if (capturePly > notice.seenPly) return capture;
  return capturePly === notice.capture?.ply ? notice.capture : null;
}
