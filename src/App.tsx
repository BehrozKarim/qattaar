import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, ArrowRightIcon, BookOpenIcon, CheckIcon, CircleNotchIcon, CopyIcon, GlobeHemisphereWestIcon, LinkIcon, RobotIcon, SquaresFourIcon, UsersIcon, WifiHighIcon } from '@phosphor-icons/react';
import { Board } from './components/Board';
import { Modal } from './components/Modal';
import { PlayerCard } from './components/PlayerCard';
import { useLocalGame } from './hooks/useLocalGame';
import { createGame, instruction, phase } from './game/engine';
import type { Action } from './game/engine';
import type { Difficulty } from './game/ai';
import type { LocalMode } from './hooks/useLocalGame';
import type { MultiplayerSession, RoomView } from './multiplayer/types';

type Mode = LocalMode | 'online';
const initialCode = new URLSearchParams(window.location.search).get('room') ?? '';

export default function App() {
  const [online, setOnline] = useState(Boolean(initialCode));
  const local = useLocalGame(!online);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; run(): void } | null>(null);
  const [copied, setCopied] = useState(false);
  const session = useRef<MultiplayerSession | null>(null);
  const pendingSession = useRef(false);
  const state = room?.state ?? (online ? createGame() : local.state);
  const mode: Mode = online ? 'online' : local.mode;

  useEffect(() => () => { void session.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    if (online) void import('./multiplayer/firebase').then((module) => setConfigured(module.firebaseConfigured))
      .catch(() => { setConfigured(false); setError('Online play could not load. Refresh the page and try again.'); });
  }, [online]);

  function newGame(nextMode: Mode = mode, difficulty: Difficulty = local.difficulty) {
    const run = () => {
      const current = session.current; session.current = null;
      if (current) { setBusy(true); void current.close().catch(() => undefined).finally(() => setBusy(false)); }
      setRoom(null); setError(''); setFatal(false); setOnline(nextMode === 'online');
      if (nextMode !== 'online') local.reset(nextMode, difficulty);
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
      try { if (kind === 'create') await current.create(); else await current.join(code); }
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

  async function copyRoom(link = false) {
    if (!room) return;
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(link ? url.toString() : `${room.code.slice(0, 4)}-${room.code.slice(4)}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Could not copy automatically. Select and copy the room code shown below.'); }
  }

  const enabled = online ? Boolean(room?.ready && room.connected && room.opponentOnline && room.player === state.turn && !busy && !fatal) : !local.thinking && !(local.mode === 'ai' && state.turn === 2);
  const turnName = state.turn === 1 ? 'Ivory' : 'Onyx';
  const statusTitle = state.winner ? state.winner === 3 ? 'An even match.' : `${state.winner === 1 ? 'Ivory' : 'Onyx'} takes the game.`
    : online && !room ? 'A friend is a code away.'
      : room && !room.ready ? 'Your table is ready.'
        : room && (!room.connected || !room.opponentOnline) ? 'Waiting for connection…'
          : local.thinking && !online ? 'Onyx is thinking…' : state.capture ? 'Three in a row.' : `${turnName} to play.`;
  const statusText = online && !room ? 'Create a private room or join a friend’s game.'
    : room && !room.ready ? 'Share your room code to invite a friend.'
      : room && !room.connected ? 'Reconnecting. Moves are paused until you are back online.'
        : room && !room.opponentOnline ? 'Your opponent is away. The game will continue when they return.' : instruction(state);

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Qattaar home"><SquaresFourIcon size={30} weight="duotone" aria-hidden="true" /><span>qattaar<span className="brand-dot">.</span></span></a>
      <span className="header-caption">An old game. A new connection.</span>
      <button className="text-button" onClick={() => setRules(true)}><BookOpenIcon size={19} aria-hidden="true" /><span>How to play</span></button>
    </header>

    <main>
      <div className="page-heading"><div><span className="eyebrow">THE CLASSIC GAME OF NINE MEN’S MORRIS</span><h1>Nine stones.<br className="mobile-break" /> Endless possibilities.</h1></div><p>A little strategy.<br />A good opponent. Your next move.</p></div>
      <div className="game-layout">
        <aside className="game-sidebar" aria-label="Game settings">
          <div className="section-heading"><span>Make it your game</span><span className="small-index">01 / 03</span></div>
          <div className="mode-options" role="group" aria-label="Game mode">
            {([{ id: 'ai', title: 'Play the computer', detail: 'A worthy opponent, anytime.', Icon: RobotIcon }, { id: 'local', title: 'Pass & play', detail: 'Two players. One screen.', Icon: UsersIcon }, { id: 'online', title: 'Play a friend', detail: 'Your own private online room.', Icon: GlobeHemisphereWestIcon }] as const).map(({ id, title, detail, Icon }) =>
              <button key={id} className={`mode-option ${mode === id ? 'chosen' : ''}`} aria-pressed={mode === id} disabled={busy} onClick={() => { if (mode !== id) newGame(id); }}><Icon size={23} aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><span className="radio-indicator" aria-hidden="true">{mode === id && <span />}</span></button>)}
          </div>
          {mode === 'ai' && <div className="difficulty-section"><label id="difficulty-label">Choose your challenge</label><div className="difficulty-control" role="group" aria-labelledby="difficulty-label">{(['easy', 'medium', 'hard'] as const).map((level) => <button key={level} aria-pressed={local.difficulty === level} className={local.difficulty === level ? 'selected-level' : ''} onClick={() => { if (local.difficulty !== level) newGame('ai', level); }}>{level}</button>)}</div><p>{local.difficulty === 'easy' ? 'Find your rhythm. Room to experiment.' : local.difficulty === 'medium' ? 'A thoughtful challenge. Stay one move ahead.' : 'Thinks further ahead. Make every stone count.'}</p></div>}
          {mode !== 'online' ? <button className="primary-button new-game" onClick={() => newGame()}>New game <ArrowRightIcon size={19} aria-hidden="true" /></button> : <div className="online-controls">
            {!room ? <>
              {configured === false && <p className="setup-notice">Online rooms are not available yet. Play on this device or challenge the computer.</p>}
              <button className="primary-button" disabled={busy || configured !== true} onClick={() => void connect('create')}>{busy ? <CircleNotchIcon className="spin" size={18} aria-hidden="true" /> : 'Create a room'}<ArrowRightIcon size={18} aria-hidden="true" /></button>
              <div className="or-divider">or join a friend</div>
              <form onSubmit={(event) => { event.preventDefault(); void connect('join'); }}><label htmlFor="room-code">Room code</label><div className="join-row"><input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} /><button className="icon-button" type="submit" aria-label="Join room" disabled={busy || configured !== true || code.replace(/[^A-Z2-9]/g, '').length !== 8}><ArrowRightIcon size={21} /></button></div></form>
            </> : <><span className="eyebrow">YOUR ROOM CODE</span><div className="room-code">{room.code.slice(0, 4)}-{room.code.slice(4)}<button className="icon-button" aria-label="Copy room code" onClick={() => void copyRoom()}>{copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}</button></div><button className="secondary-button" onClick={() => void copyRoom(true)}><LinkIcon size={18} aria-hidden="true" />Copy invite link</button><p className="connection-status"><WifiHighIcon size={17} aria-hidden="true" />{room.connected ? 'Connected' : 'Reconnecting'} · You play {room.player === 1 ? 'Ivory' : 'Onyx'}</p><button className="text-button leave-button" disabled={busy} onClick={() => newGame('online')}>Leave room</button></>}
          </div>}
          <div className="sidebar-note"><span className="note-line" /><p>{mode === 'online' ? 'Private rooms for two. No account to create. Just share a code and make your move.' : 'Known as Qattaar in Balochi. A game of lines, patience, and seeing what comes next.'}</p></div>
        </aside>

        <section className="play-area" aria-label="Game table">
          <div className="table-topline"><span><span className={`status-dot ${online ? 'network' : ''}`} />{mode === 'ai' ? `VS COMPUTER / ${local.difficulty.toUpperCase()}` : mode === 'local' ? 'LOCAL / TWO PLAYERS' : 'ONLINE / PRIVATE ROOM'}</span><span>{String(state.ply).padStart(2, '0')} MOVES</span></div>
          <Board key={`${mode}-${room?.code ?? ''}`} state={state} enabled={enabled && !(online && !room)} onMove={(action) => void move(action)} />
          <div className={`turn-status ${state.capture ? 'mill-status' : ''}`} role="status" aria-live="polite"><span className={`status-stone ${state.turn === 1 ? 'ivory' : 'onyx'}`} /><div><h2>{statusTitle}</h2><p>{statusText}</p></div>{mode !== 'online' && <button className="icon-button undo-button" aria-label="Undo last turn" title="Undo last turn" disabled={!local.canUndo} onClick={local.undo}><ArrowCounterClockwiseIcon size={21} /></button>}</div>
          {(error || (!online && local.aiError)) && <div className="error-message" role="alert">{error || local.aiError}</div>}
        </section>

        <aside className="match-sidebar" aria-label="Players and match information">
          <div className="section-heading"><span>At the table</span><span className="small-index">02 / 03</span></div>
          <PlayerCard player={1} state={state} name={mode === 'ai' ? 'You' : room ? room.player === 1 ? 'You' : 'Your friend' : 'Player one'} subtitle="Ivory stones" />
          <div className="versus-label"><span />VS<span /></div>
          <PlayerCard player={2} state={state} name={mode === 'ai' ? 'The computer' : room ? room.player === 2 ? 'You' : room.ready ? 'Your friend' : 'Waiting for a friend' : 'Player two'} subtitle={mode === 'ai' ? `${local.difficulty[0].toUpperCase()}${local.difficulty.slice(1)} · Onyx stones` : 'Onyx stones'} robot={mode === 'ai'} thinking={mode === 'ai' && local.thinking} />
          <div className="match-guide"><div className="section-heading"><span>The rhythm of the game</span><span className="small-index">03 / 03</span></div>{[{ title: 'Place', text: 'Take turns placing your nine stones.' }, { title: 'Make a mill', text: 'Line up three. Remove one of theirs.' }, { title: 'Move', text: 'Slide along a line. Keep making mills.' }].map((item, index) => <div className={`guide-step ${(index === 0 && phase(state) === 'placing') || (index === 1 && state.capture) || (index === 2 && phase(state) !== 'placing') ? 'current' : ''}`} key={item.title}><span>{index + 1}</span><div><strong>{item.title}</strong><p>{item.text}</p></div></div>)}<button className="text-button" onClick={() => setRules(true)}>The finer details <ArrowRightIcon size={16} aria-hidden="true" /></button></div>
        </aside>
      </div>
    </main>
    <footer><span>Rooted in tradition. Played together.</span><span>QATTAAR <span className="footer-divider">/</span> NINE MEN’S MORRIS</span></footer>

    {rules && <Modal title="A game of three in a row." onClose={() => setRules(false)}><div className="rules-content"><p>Each player has nine stones. Ivory goes first.</p><ol><li><strong>Place your stones.</strong> Take turns choosing empty points. Three stones in a straight connected line form a mill.</li><li><strong>Make a capture.</strong> After forming a mill, remove one opposing stone. Stones in mills are protected unless all of your opponent’s stones are in mills. A double mill still earns one capture.</li><li><strong>Move along the lines.</strong> Once all stones are placed, move one stone to an adjacent empty point. You can break a mill and form it again on a later turn.</li><li><strong>Fly with three.</strong> With exactly three stones remaining, you can move to any empty point.</li><li><strong>Win the game.</strong> After placement, leave your opponent with fewer than three stones or no legal move.</li></ol><p>A position repeated three times, or 50 full moves without a capture after placement, is a draw.</p><p className="muted">This version uses the Nine Men’s Morris rules above. Local Qattaar rules can vary.</p></div><button className="primary-button" onClick={() => setRules(false)}>Let’s play <ArrowRightIcon size={18} aria-hidden="true" /></button></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="confirm-copy">{room ? room.player === 1 ? 'Leaving as the host closes the room for both players. You can start a fresh room anytime.' : 'You can rejoin with this code while the host keeps the room open.' : 'Your current game will be replaced.'}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Keep playing</button><button className="primary-button" onClick={() => { confirm.run(); setConfirm(null); }}>Continue <ArrowRightIcon size={18} aria-hidden="true" /></button></div></Modal>}
  </div>;
}
