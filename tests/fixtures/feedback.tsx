// Vite-only browser QA page. This is not an entry in the production build.
import { useState } from 'react';
import '@fontsource-variable/manrope';
import '../../src/styles.css';
import { Board } from '../../src/components/Board';
import { MatchPlayers } from '../../src/components/MatchPlayers';
import { MatchResult } from '../../src/components/MatchResult';
import { applyAction, createGame, instruction } from '../../src/game/engine';
import type { Cell, GameState, Player } from '../../src/game/engine';
import { captureMessage, matchResult } from '../../src/game/feedback';
import { useCaptureFeedback } from '../../src/hooks/useCaptureFeedback';

function position(white: number[], black: number[], extras: Partial<GameState> = {}): GameState {
  const board = Array<Cell>(24).fill(0);
  white.forEach((p) => board[p] = 1); black.forEach((p) => board[p] = 2);
  return { ...createGame(), board, reserves: [0, 0], ...extras };
}

const scenarios = {
  capture: { label: 'Capture during placement', state: position([0, 1], [3, 5, 6], { turn: 2, capture: true, reserves: [7, 6] }) },
  victory: { label: 'Winning capture', state: position([0, 1, 2, 21], [3, 5, 6], { capture: true }) },
  blockedWin: { label: 'Win by blocking', state: position([1, 4, 7, 9, 10, 11, 20], [0, 3, 6]) },
  blockedLoss: { label: 'Lose by blocking', state: position([0, 3, 6], [1, 4, 7, 9, 10, 11, 20], { turn: 2 }) },
};
type Scenario = keyof typeof scenarios;

function Table({ scenario, viewer }: { scenario: Scenario; viewer: Player | null }) {
  const [state, setState] = useState(scenarios[scenario].state);
  const [dismissed, setDismissed] = useState(false);
  const feedback = useCaptureFeedback(state, scenario);
  const result = matchResult(state, viewer);
  const message = state.lastCapture ? captureMessage(state.lastCapture, viewer) : null;
  return <section className="play-area" style={{ margin: '20px auto' }}>
    <MatchPlayers state={state} mode={viewer === null ? 'local' : 'ai'} room={null} difficulty="easy" thinking={false} captureFeedback={feedback} />
    <div className={`turn-status ${feedback ? 'capture-status' : ''}`} role="status" aria-live="polite"><div><h2>{feedback ? message?.title : result?.title ?? 'Feedback test'}</h2><p>{feedback ? message?.detail : result?.detail ?? instruction(state)}</p></div></div>
    <Board state={state} enabled={!feedback} captureFeedback={feedback} onMove={(action) => setState(applyAction(state, action))}>
      {result && !feedback && !dismissed && <MatchResult result={result} online={false} onAgain={() => { setDismissed(false); setState(scenarios[scenario].state); }} onDismiss={() => setDismissed(true)} />}
    </Board>
    {message && <p className="capture-history">Last capture · {message.detail}</p>}
    <p>Action count: {state.ply}</p>
  </section>;
}

export default function FeedbackQA() {
  const [scenario, setScenario] = useState<Scenario>('capture');
  const [viewer, setViewer] = useState<Player | null>(1);
  return <div className="app-shell"><h1>Qattaar feedback QA</h1><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
    {(Object.entries(scenarios) as [Scenario, typeof scenarios[Scenario]][]).map(([id, value]) => <button className="secondary-button" key={id} onClick={() => setScenario(id)}>{value.label}</button>)}
    <button className="secondary-button" onClick={() => setViewer(viewer === null ? 1 : null)}>{viewer === null ? 'View as White' : 'View as pass & play'}</button>
  </div><Table key={scenario} scenario={scenario} viewer={viewer} /></div>;
}

