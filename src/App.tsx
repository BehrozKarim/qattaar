import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, CircleNotchIcon, CopyIcon, GlobeHemisphereWestIcon, LinkIcon, RobotIcon, SquaresFourIcon, UsersIcon, WifiHighIcon } from '@phosphor-icons/react';
import { Board } from './components/Board';
import { Modal } from './components/Modal';
import { MatchPlayers } from './components/MatchPlayers';
import { MatchResult } from './components/MatchResult';
import { VariantPicker } from './components/VariantPicker';
import { LastMoveNotice } from './components/LastMoveNotice';
import { OnlineSettings } from './components/OnlineSettings';
import { TurnClock } from './components/TurnClock';
import { usePlayerName } from './hooks/usePlayerName';
import { timerLabel, validName } from './multiplayer/room';
import type { MoveSeconds } from './multiplayer/room';
import { useLocalGame } from './hooks/useLocalGame';
import { useCaptureFeedback } from './hooks/useCaptureFeedback';
import { captureMessage, matchResult, opponentTurn } from './game/feedback';
import { VARIANTS } from './game/variants';
import type { Variant } from './game/variants';
import { createGame, instruction, phase, playerName } from './game/engine';
import type { Action } from './game/engine';
import type { Difficulty } from './game/ai';
import type { LocalMode } from './hooks/useLocalGame';
import type { MultiplayerSession, RoomView } from './multiplayer/types';

type Mode = LocalMode | 'online';
const initialCode = new URLSearchParams(window.location.search).get('room') ?? '';

export default function App() {
  const [online, setOnline] = useState(Boolean(initialCode));
  const local = useLocalGame(!online);
  const [onlineVariant, setOnlineVariant] = useState(local.variant);
  const profile = usePlayerName();
  const [moveSeconds, setMoveSeconds] = useState<MoveSeconds>(0);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; run(): void } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissedResult, setDismissedResult] = useState('');
  const session = useRef<MultiplayerSession | null>(null);
  const pendingSession = useRef(false);
  const state = room?.state ?? (online ? createGame(onlineVariant) : local.state);
  const mode: Mode = online ? 'online' : local.mode;
  const gameId = `${mode}:${room ? `${room.code}:${room.round}` : online ? onlineVariant : local.gameId}`;
  const captureFeedback = useCaptureFeedback(state, gameId);
  const viewer = mode === 'local' ? null : mode === 'ai' ? 1 : room?.player ?? null;
  const result = matchResult(state, viewer);
  const resultId = `${gameId}:${state.ply}`;
  const recentCapture = state.lastCapture ? captureMessage(state.lastCapture, viewer) : null;
  const lastTurn = opponentTurn(state, viewer);

  useEffect(() => () => { void session.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    if (online) void import('./multiplayer/firebase').then((module) => setConfigured(module.firebaseConfigured))
      .catch(() => { setConfigured(false); setError('Online play could not load. Refresh the page and try again.'); });
  }, [online]);

  function newGame(nextMode: Mode = mode, difficulty: Difficulty = local.difficulty, variant: Variant = state.variant) {
    const run = () => {
      const current = session.current; session.current = null;
      if (current) { setBusy(true); void current.close().catch(() => undefined).finally(() => setBusy(false)); }
      setRoom(null); setError(''); setFatal(false); setOnline(nextMode === 'online');
      setOnlineVariant(variant);
      if (nextMode !== 'online') local.reset(nextMode, difficulty, variant);
    };
    if (room || (local.state.ply > 0 && !local.state.winner && !online)) setConfirm({ title: room ? 'Leave this online room?' : 'Start a new game?', run });
    else run();
  }

  async function connect(kind: 'create' | 'join') {
    if (pendingSession.current) return;
    pendingSession.current = true; setBusy(true); setError(''); setFatal(false);
    try {
      const module = await import('./multiplayer/firebase');
      const current = module.createMultiplayerSession({ onRoom: (value) => setRoom(value), onError: (message) => { setError(message); setFatal(true); } });
      session.current = current;
      try { if (kind === 'create') await current.create(onlineVariant, profile.name.trim(), moveSeconds); else await current.join(code, profile.name.trim()); }
      catch (cause) { setError(module.friendlyFirebaseError(cause)); await current.close().catch(() => undefined); if (session.current === current) session.current = null; }
    } catch { setError('Online play could not load. Refresh the page and try again.'); }
    finally { pendingSession.current = false; setBusy(false); }
  }

  async function move(action: Action) {
    if (!online) { local.move(action); return; }
    setBusy(true); setError('');
    try { await session.current?.move(action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit your move. Please try again.'); }
    finally { setBusy(false); }
  }

  async function playAgain() {
    if (!room || !room.supportsRematch) { newGame(); return; }
    setBusy(true); setError('');
    try { await session.current?.requestRematch(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request a rematch. Please try again.'); }
    finally { setBusy(false); }
  }

  async function copyRoom(link = false) {
    if (!room) return;
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(link ? url.toString() : `${room.code.slice(0, 4)}-${room.code.slice(4)}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Could not copy automatically. Select and copy the room code shown below.'); }
  }

  const enabled = online ? Boolean(room?.ready && room.connected && room.opponentOnline && room.player === state.turn && !busy && !fatal) : !local.thinking && !(local.mode === 'ai' && state.turn === 2);
  const turnName = room ? room.names[state.turn - 1] : playerName(state.turn);
  const againLabel = room ? !room.supportsRematch ? 'New room' : room.rematchRequested ? 'Rematch requested' : room.opponentRequestedRematch ? 'Accept rematch' : 'Play again' : 'Play again';
  const againDisabled = busy || Boolean(room && (!room.connected || room.rematchRequested));
  const againNote = room?.rematchRequested ? `Waiting for ${room.names[room.player === 1 ? 1 : 0]}.` : room?.opponentRequestedRematch ? `${room.names[room.player === 1 ? 1 : 0]} wants to play again.` : room ? 'Both players must accept to start again.' : undefined;
  const statusTitle = captureFeedback && recentCapture ? recentCapture.title : result ? result.title
    : online && !room ? 'A friend is a code away.'
      : room && !room.ready ? 'Your table is ready.'
        : room && (!room.connected || !room.opponentOnline) ? 'Waiting for connection…'
          : state.capture ? 'Three in a row!' : local.thinking && !online ? 'Black is thinking…' : `${turnName} to play.`;
  const statusText = captureFeedback && recentCapture ? recentCapture.detail : result ? result.detail : online && !room ? 'Create a private room or join a friend’s game.'
    : room && !room.ready ? 'Share your room code to invite a friend.'
      : room && !room.connected ? room.moveSeconds ? 'Reconnecting. The turn clock keeps running.' : 'Reconnecting. Moves are paused until you are back online.'
        : room && !room.opponentOnline ? room.moveSeconds ? 'Your opponent is away. The turn clock keeps running.' : 'Your opponent is away. The game will continue when they return.' : instruction(state);

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Qattaar home"><SquaresFourIcon size={30} weight="duotone" aria-hidden="true" /><span>qattaar<span className="brand-dot">.</span></span></a>
      <span className="header-caption">Nine Men’s Morris</span>
      <button className="text-button" onClick={() => setRules(true)}><BookOpenIcon size={19} aria-hidden="true" /><span>How to play</span></button>
    </header>

    <main>
      <h1 className="sr-only">Qattaar · Nine Men’s Morris</h1>
      <div className="game-layout">
        <aside className="game-sidebar" aria-label="Game settings">
          <div className="section-heading"><span>Game options</span></div>
          <div className="mode-options" role="group" aria-label="Game mode">
            {([{ id: 'ai', title: 'Play the computer', detail: 'A worthy opponent, anytime.', Icon: RobotIcon }, { id: 'local', title: 'Pass & play', detail: 'Two players. One screen.', Icon: UsersIcon }, { id: 'online', title: 'Play a friend', detail: 'Your own private online room.', Icon: GlobeHemisphereWestIcon }] as const).map(({ id, title, detail, Icon }) =>
              <button key={id} className={`mode-option ${mode === id ? 'chosen' : ''}`} aria-pressed={mode === id} disabled={busy} onClick={() => { if (mode !== id) newGame(id); }}><Icon size={23} aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><span className="radio-indicator" aria-hidden="true">{mode === id && <span />}</span></button>)}
          </div>
          <VariantPicker variant={state.variant} disabled={busy || Boolean(room)} inRoom={Boolean(room)} onChange={(variant) => newGame(mode, local.difficulty, variant)} />
          {mode === 'ai' && <div className="difficulty-section"><label id="difficulty-label">Choose your challenge</label><div className="difficulty-control" role="group" aria-labelledby="difficulty-label">{(['easy', 'medium', 'hard'] as const).map((level) => <button key={level} aria-pressed={local.difficulty === level} className={local.difficulty === level ? 'selected-level' : ''} onClick={() => { if (local.difficulty !== level) newGame('ai', level); }}>{level}</button>)}</div><p>{local.difficulty === 'easy' ? 'Find your rhythm. Room to experiment.' : local.difficulty === 'medium' ? 'A thoughtful challenge. Stay one move ahead.' : 'Thinks further ahead. Make every stone count.'}</p></div>}
          {mode === 'online' && <div className="online-controls">
            {!room ? <>
              <OnlineSettings name={profile.name} seconds={moveSeconds} busy={busy} onName={profile.setName} onRandomize={profile.randomize} onSeconds={setMoveSeconds} />
              {configured === false && <p className="setup-notice">Online rooms are not available yet. Play on this device or challenge the computer.</p>}
              <button className="primary-button" disabled={busy || configured !== true || !validName(profile.name.trim())} onClick={() => void connect('create')}>{busy ? <CircleNotchIcon className="spin" size={18} aria-hidden="true" /> : 'Create a room'}<ArrowRightIcon size={18} aria-hidden="true" /></button>
              <div className="or-divider">or join a friend</div>
              <form onSubmit={(event) => { event.preventDefault(); void connect('join'); }}><label htmlFor="room-code">Room code</label><div className="join-row"><input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} /><button className="icon-button" type="submit" aria-label="Join room" disabled={busy || configured !== true || !validName(profile.name.trim()) || code.replace(/[^A-Z2-9]/g, '').length !== 8}><ArrowRightIcon size={21} /></button></div></form>
            </> : <><span className="eyebrow">YOUR ROOM CODE</span><div className="room-code">{room.code.slice(0, 4)}-{room.code.slice(4)}<button className="icon-button" aria-label="Copy room code" onClick={() => void copyRoom()}>{copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}</button></div><button className="secondary-button" onClick={() => void copyRoom(true)}><LinkIcon size={18} aria-hidden="true" />Copy invite link</button><p className="connection-status"><WifiHighIcon size={17} aria-hidden="true" />{room.connected ? 'Connected' : 'Reconnecting'} · You play {playerName(room.player)}</p><button className="text-button leave-button" disabled={busy} onClick={() => newGame('online')}>Leave room</button></>}
          </div>}
          {room && <p className="room-settings">{timerLabel(room.moveSeconds)}{room.moveSeconds ? ' per turn' : ''} · Game {room.round + 1}</p>}
          <MatchPlayers state={state} mode={mode} room={room} difficulty={local.difficulty} thinking={local.thinking} captureFeedback={captureFeedback} />
          <div className="sidebar-note"><span className="note-line" /><p>{mode === 'online' ? 'Private rooms for two. No account to create. Just share a code and make your move.' : 'Known as Qattaar in Balochi. A game of lines, patience, and seeing what comes next.'}</p></div>
        </aside>

        <section className="play-area" aria-label="Game table">
          <div className="table-topline"><span><span className={`status-dot ${online ? 'network' : ''}`} />{mode === 'ai' ? `VS COMPUTER / ${local.difficulty.toUpperCase()}` : mode === 'local' ? 'LOCAL / TWO PLAYERS' : 'ONLINE / PRIVATE ROOM'}</span><span>{VARIANTS[state.variant].shortName.toUpperCase()} · {String(state.ply).padStart(2, '0')} MOVES</span></div>
          {room && <TurnClock room={room} />}
          <div className={`turn-status ${state.capture ? 'mill-status' : ''} ${captureFeedback ? 'capture-status' : ''} ${result ? `finished-status ${result.outcome}` : ''}`} role="status" aria-live={result ? 'assertive' : 'polite'} aria-atomic="true"><span className={`status-stone ${(captureFeedback?.player ?? state.turn) === 1 ? 'ivory' : 'onyx'}`} /><div><h2>{statusTitle}</h2><p>{statusText}</p></div>{mode !== 'online' && <button className="icon-button undo-button" aria-label="Undo last turn" title="Undo last turn" disabled={!local.canUndo} onClick={local.undo}><ArrowCounterClockwiseIcon size={21} /></button>}</div>
          <Board key={gameId} state={state} enabled={enabled && !captureFeedback && !(online && !room)} captureFeedback={captureFeedback} lastTurn={lastTurn} onMove={(action) => void move(action)}>
            {result && !captureFeedback && dismissedResult !== resultId && <MatchResult result={result} online={online} onAgain={() => void playAgain()} onDismiss={() => setDismissedResult(resultId)} againLabel={againLabel} againDisabled={againDisabled} againNote={againNote} />}
          </Board>
          {lastTurn && <LastMoveNotice move={lastTurn} />}
          {recentCapture && <p className="capture-history">Last capture · {recentCapture.detail}</p>}
          <div className="board-actions"><span>{state.winner ? online ? againNote : 'Game over. Start a new game to play again.' : phase(state) === 'placing' ? 'Tap an empty point to place a piece.' : phase(state) === 'flying' ? 'Drag or tap to fly to any empty point.' : 'Drag to move, or tap a piece then its destination.'}</span>{mode !== 'online' ? <button className="secondary-button" onClick={() => newGame()}>New game <ArrowRightIcon size={17} aria-hidden="true" /></button> : state.winner ? <button className="primary-button" disabled={againDisabled} onClick={() => void playAgain()}>{againLabel}</button> : null}</div>
          {room && !room.supportsRematch && <p className="setup-notice">This older room has no names, timer, or rematches. Create a fresh room for these features.</p>}
          {(error || (!online && local.aiError)) && <div className="error-message" role="alert">{error || local.aiError}</div>}
          {!online && local.notice && <p className="setup-notice" role="status">{local.notice}</p>}
        </section>

      </div>
    </main>
    <footer><span>Rooted in tradition. Played together.</span><span>QATTAAR <span className="footer-divider">/</span> NINE MEN’S MORRIS</span></footer>

    {rules && <Modal title={`${VARIANTS[state.variant].name} rules`} onClose={() => setRules(false)}><div className="rules-content"><p>Each player has nine pieces. White goes first. Choose Balochi or Classic in Game rules before starting a match.</p><ol><li><strong>Place your pieces.</strong> Take turns choosing empty points. Three pieces in a straight connected line form a mill.</li><li><strong>Make a capture.</strong> After forming a mill, remove one opposing piece. Pieces in mills are protected unless all of your opponent’s pieces are in mills. A double mill still earns one capture.</li><li><strong>Move along the lines.</strong> Once all pieces are placed, move one piece to an adjacent empty point. You can break a mill and form it again on a later turn.</li><li>{state.variant === 'balochi' ? <><strong>Three pieces still move normally.</strong> In Balochi Qattaar, every move stays adjacent, even with only three pieces. There is no flying.</> : <><strong>Fly with three pieces.</strong> In Classic Nine Men’s Morris, with exactly three pieces remaining, move to any empty point.</>}</li><li><strong>Win the game.</strong> After placement, leave your opponent with fewer than three pieces or no legal move.</li></ol><p>A position repeated three times, or 50 full moves without a capture after placement, is a draw.</p><p>The blue ring marks the opponent’s last destination. A hollow circle and arrow show where a moved piece came from.</p></div><button className="primary-button" onClick={() => setRules(false)}>Let’s play <ArrowRightIcon size={18} aria-hidden="true" /></button></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="confirm-copy">{room ? room.player === 1 ? 'Leaving as the host closes the room for both players. You can start a fresh room anytime.' : 'You can rejoin with this code while the host keeps the room open.' : 'Your current game will be replaced.'}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Keep playing</button><button className="primary-button" onClick={() => { confirm.run(); setConfirm(null); }}>Continue <ArrowRightIcon size={18} aria-hidden="true" /></button></div></Modal>}
  </div>;
}
