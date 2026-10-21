import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyAction, createGame, RULESET } from '../game/engine';
import { CAPTURE_FEEDBACK_MS, MILL_PREVIEW_MS } from '../game/feedback';
import type { Action } from '../game/engine';
import type { Difficulty } from '../game/ai';

export type LocalMode = 'ai' | 'local';
interface SavedGame { id: string; ruleset: string; mode: LocalMode; difficulty: Difficulty; actions: Action[]; notice?: string }
const STORAGE_KEY = 'qattaar.game.v1';

function restore(): SavedGame {
  const fallback: SavedGame = { id: crypto.randomUUID(), ruleset: RULESET, mode: 'ai', difficulty: 'medium', actions: [] };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedGame | null;
    if (!value || !['ai', 'local'].includes(value.mode) || !['easy', 'medium', 'hard'].includes(value.difficulty) || !Array.isArray(value.actions) || value.actions.length > 2000) return fallback;
    try { value.actions.reduce(applyAction, createGame()); }
    catch {
      localStorage.setItem('qattaar.game.legacy-rules', JSON.stringify(value));
      return { ...fallback, notice: 'Your old game used different rules and was saved separately. This new game uses Balochi Qattaar: adjacent moves only.' };
    }
    return { ...value, id: value.id ?? crypto.randomUUID(), ruleset: RULESET };
  } catch { return fallback; }
}

export function useLocalGame(active: boolean) {
  const [saved, setSaved] = useState(restore);
  const [failedPly, setFailedPly] = useState<number | null>(null);
  const history = useMemo(() => {
    const states = [createGame()];
    for (const action of saved.actions) states.push(applyAction(states[states.length - 1], action));
    return states;
  }, [saved.actions]);
  const state = history[history.length - 1];
  const aiTurn = active && saved.mode === 'ai' && state.turn === 2 && !state.winner;
  const thinking = Boolean(aiTurn && failedPly !== state.ply);
  const aiError = aiTurn && failedPly === state.ply ? 'The AI could not finish its move. Undo the last turn or start a new game.' : '';
  const move = useCallback((action: Action) => setSaved((current) => ({ ...current, actions: [...current.actions, action] })), []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Play remains available when storage is blocked or full. */ }
  }, [saved]);

  useEffect(() => {
    if (!aiTurn) return;
    const worker = new Worker(new URL('../game/ai.worker.ts', import.meta.url), { type: 'module' });
    const delay = state.lastMove?.action.type === 'capture' ? CAPTURE_FEEDBACK_MS + 300 : state.capture ? MILL_PREVIEW_MS : 450;
    const timer = setTimeout(() => worker.postMessage({ state, difficulty: saved.difficulty }), delay);
    worker.onmessage = ({ data }: MessageEvent<Action | null>) => { if (data) { setFailedPly(null); move(data); } };
    worker.onerror = () => setFailedPly(state.ply);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [aiTurn, saved.difficulty, state, move]);

  const undo = () => {
    let length = saved.actions.length - 1;
    if (saved.mode === 'ai') while (length > 0 && (history[length].turn !== 1 || history[length].capture)) length--;
    setSaved((current) => ({ ...current, actions: current.actions.slice(0, Math.max(0, length)) }));
  };
  const reset = (mode = saved.mode, difficulty = saved.difficulty) => { setSaved({ id: crypto.randomUUID(), ruleset: RULESET, mode, difficulty, actions: [] }); setFailedPly(null); };
  return { state, gameId: saved.id, notice: saved.notice, mode: saved.mode, difficulty: saved.difficulty, move, undo, reset, thinking, aiError, canUndo: saved.actions.length > 0 };
}
