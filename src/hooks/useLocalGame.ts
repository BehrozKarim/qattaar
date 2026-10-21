import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyAction, createGame } from '../game/engine';
import type { Action } from '../game/engine';
import type { Difficulty } from '../game/ai';

export type LocalMode = 'ai' | 'local';
interface SavedGame { mode: LocalMode; difficulty: Difficulty; actions: Action[] }
const STORAGE_KEY = 'qattaar.game.v1';

function restore(): SavedGame {
  const fallback: SavedGame = { mode: 'ai', difficulty: 'medium', actions: [] };
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedGame | null;
    if (!value || !['ai', 'local'].includes(value.mode) || !['easy', 'medium', 'hard'].includes(value.difficulty) || !Array.isArray(value.actions) || value.actions.length > 2000) return fallback;
    value.actions.reduce(applyAction, createGame());
    return value;
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
    const timer = setTimeout(() => worker.postMessage({ state, difficulty: saved.difficulty }), 300);
    worker.onmessage = ({ data }: MessageEvent<Action | null>) => { if (data) { setFailedPly(null); move(data); } };
    worker.onerror = () => setFailedPly(state.ply);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [aiTurn, saved.difficulty, state, move]);

  const undo = () => {
    let length = saved.actions.length - 1;
    if (saved.mode === 'ai') while (length > 0 && (history[length].turn !== 1 || history[length].capture)) length--;
    setSaved((current) => ({ ...current, actions: current.actions.slice(0, Math.max(0, length)) }));
  };
  const reset = (mode = saved.mode, difficulty = saved.difficulty) => { setSaved({ mode, difficulty, actions: [] }); setFailedPly(null); };
  return { state, mode: saved.mode, difficulty: saved.difficulty, move, undo, reset, thinking, aiError, canUndo: saved.actions.length > 0 };
}
