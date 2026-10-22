import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, ArrowRightIcon, BookOpenIcon, CircleNotchIcon, DotsThreeIcon, HouseIcon, SignOutIcon, SquaresFourIcon } from '@phosphor-icons/react';
import { Board } from './components/Board';
import { Modal } from './components/Modal';
import { MatchPlayers } from './components/MatchPlayers';
import { MatchResult } from './components/MatchResult';
import { VariantPicker } from './components/VariantPicker';
import { LastMoveNotice } from './components/LastMoveNotice';
import { NameField, TurnTimer } from './components/OnlineSettings';
import { TurnClock } from './components/TurnClock';
import { LocalSetup, ModeScreen, OnlineChoices, SetupScreen } from './components/SetupScreens';
import type { Mode } from './components/SetupScreens';
import { RoomDetails } from './components/RoomDetails';
import { WaitingRoom } from './components/WaitingRoom';
import { GameRules } from './components/GameRules';
import { ConnectionNotice } from './components/ConnectionNotice';
import { usePlayerName } from './hooks/usePlayerName';
import { useCountdown } from './hooks/useCountdown';
import { validName } from './multiplayer/room';
import type { MoveSeconds } from './multiplayer/room';
import { useLocalGame } from './hooks/useLocalGame';
import { useCaptureFeedback } from './hooks/useCaptureFeedback';
import { captureMessage, matchResult, opponentTurn } from './game/feedback';
import { VARIANTS } from './game/variants';
import type { Variant } from './game/variants';
import { createGame, instruction, phase, playerName } from './game/engine';
import type { Action } from './game/engine';
import type { Difficulty } from './game/ai';
import type { MultiplayerSession, RoomView } from './multiplayer/types';

type Screen = 'home' | 'setup' | 'online' | 'create' | 'join' | 'match';
const initialCode = new URLSearchParams(window.location.search).get('room') ?? '';

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialCode ? 'join' : 'home');
  const [mode, setMode] = useState<Mode>(initialCode ? 'online' : 'ai');
  const local = useLocalGame(screen === 'match' && mode !== 'online');
  const [variant, setVariant] = useState<Variant>(local.variant);
  const [difficulty, setDifficulty] = useState<Difficulty>(local.difficulty);
  const profile = usePlayerName();
  const [moveSeconds, setMoveSeconds] = useState<MoveSeconds>(0);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<'rules' | 'menu' | 'room' | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; detail: string; run(): void } | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissedResult, setDismissedResult] = useState('');
  const session = useRef<MultiplayerSession | null>(null);
  const pendingSession = useRef(false);
  const restoringRoom = useRef(false);
  const main = useRef<HTMLElement>(null);
  const errorMessage = useRef<HTMLDivElement>(null);
  const online = mode === 'online';
  const state = room?.state ?? (online ? createGame(variant) : local.state);
  const countdown = useCountdown(room?.startsAt ?? null, room?.serverOffset ?? 0);
  const inLobby = Boolean(room?.supportsReady && (room.startsAt === null || countdown > 0));
  const view = screen === 'match' && inLobby ? 'lobby' : screen;
  const gameId = `${mode}:${room ? `${room.code}:${room.round}` : local.gameId}`;
  const captureFeedback = useCaptureFeedback(state, gameId);
  const viewer = mode === 'local' ? null : mode === 'ai' ? 1 : room?.player ?? null;
  const result = matchResult(state, viewer);
  const resultId = `${gameId}:${state.ply}`;
  const recentCapture = state.lastCapture ? captureMessage(state.lastCapture, viewer) : null;
  const lastTurn = opponentTurn(state, viewer);

  useEffect(() => () => { void session.current?.close().catch(() => undefined); }, []);
  useEffect(() => {
    main.current?.focus(); window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    if (error) { errorMessage.current?.focus(); errorMessage.current?.scrollIntoView({ block: 'nearest' }); }
  }, [error]);
  useEffect(() => {
    if (online) void import('./multiplayer/firebase').then((module) => setConfigured(module.firebaseConfigured))
      .catch(() => { setConfigured(false); setError('Online play could not load. Refresh the page and try again.'); });
  }, [online]);

  function navigate(next: Screen) { setError(''); setPanel(null); setScreen(next); }
  function chooseMode(next: Mode) { setMode(next); navigate(next === 'online' ? 'online' : 'setup'); }
  function rememberRoom(value: string | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('room', value); else url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
  }
  function leave() {
    setPanel(null);
    const run = () => {
      const current = session.current; session.current = null;
      if (current) { setBusy(true); void current.close().catch(() => undefined).finally(() => setBusy(false)); }
      try { sessionStorage.removeItem('qattaar.online'); } catch { /* Optional recovery hint. */ }
      setRoom(null); setFatal(false); rememberRoom(null); navigate('home');
    };
    if (room) setConfirm({ title: 'Leave this online room?', detail: room.player === 1 ? 'Leaving as the host closes the room for both players.' : 'You can rejoin with the same code while the host keeps the room open.', run });
    else run();
  }
  function startLocal() {
    if (mode === 'online') return;
    const run = () => { local.reset(mode, difficulty, variant); setFatal(false); navigate('match'); };
    if (local.state.ply > 0 && !local.state.winner) setConfirm({ title: 'Start a new game?', detail: 'This replaces the game saved on this device.', run });
    else run();
  }
  function resumeLocal() { setMode(local.mode); setVariant(local.variant); setDifficulty(local.difficulty); navigate('match'); }

  async function connect(kind: 'create' | 'join') {
    if (pendingSession.current || !validName(profile.name.trim())) return;
    pendingSession.current = true; setBusy(true); setError(''); setFatal(false);
    try {
      const module = await import('./multiplayer/firebase');
      const current = module.createMultiplayerSession({ onRoom: (value) => {
        if (session.current !== current) return;
        setRoom(value); setScreen('match'); rememberRoom(value.code);
        try { sessionStorage.setItem('qattaar.online', value.code); } catch { /* Optional recovery hint. */ }
      }, onError: (message) => { if (session.current === current) { setError(message); setFatal(true); } } });
      session.current = current;
      try { if (kind === 'create') await current.create(variant, profile.name.trim(), moveSeconds); else await current.join(code, profile.name.trim()); }
      catch (cause) { setError(module.friendlyFirebaseError(cause)); await current.close().catch(() => undefined); if (session.current === current) session.current = null; }
    } catch { setError('Online play could not load. Refresh the page and try again.'); }
    finally { pendingSession.current = false; setBusy(false); }
  }
  async function roomAction(action: 'ready' | 'rematch' | 'pause' | 'resume' | 'resign' | 'claim') {
    setBusy(true); setError('');
    try {
      const current = session.current;
      if (!current) return;
      if (action === 'ready') await current.markReady();
      else if (action === 'rematch') await current.requestRematch();
      else if (action === 'pause') await current.pauseWaiting();
      else if (action === 'resume') await current.resumeWaiting();
      else if (action === 'resign') await current.resign();
      else await current.claimDisconnect();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the room. Please try again.'); }
    finally { setBusy(false); }
  }
  async function move(action: Action) {
    if (!online) { local.move(action); return; }
    setBusy(true); setError('');
    try { await session.current?.move(action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit your move. Please try again.'); }
    finally { setBusy(false); }
  }
  function playAgain() {
    if (room) { if (room.supportsRematch) void roomAction('rematch'); else leave(); }
    else local.reset(local.mode, local.difficulty, local.variant);
  }
  async function copyRoom(link = false) {
    if (!room) return;
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('room', room.code);
    try { await navigator.clipboard.writeText(link ? url.toString() : `${room.code.slice(0, 4)}-${room.code.slice(4)}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError('Could not copy automatically. Select and copy the room code shown.'); }
  }

  function confirmResign() {
    setPanel(null);
    setConfirm({ title: 'Resign this game?', detail: 'Your opponent wins this round. You can both play again in the same room.', run: () => { void roomAction('resign'); } });
  }
  // Restore only an already joined room in this tab; opening an invitation still
  // shows name entry. The ref also prevents duplicate joins under StrictMode.
  useEffect(() => {
    if (restoringRoom.current || session.current || pendingSession.current || !initialCode || configured !== true) return;
    try {
      if (sessionStorage.getItem('qattaar.online') !== initialCode) return;
    } catch { return; }
    restoringRoom.current = true;
    queueMicrotask(() => { void connect('join'); });
  });

  const enabled = online ? Boolean(room?.ready && !inLobby && room.connected && !room.paused && (room.supportsRecovery || room.opponentOnline || room.moveSeconds > 0) && room.player === state.turn && !busy && !fatal) : !local.thinking && !(mode === 'ai' && state.turn === 2);
  const turnName = room ? room.names[state.turn - 1] : playerName(state.turn);
  const againLabel = room ? !room.supportsRematch ? 'New room' : room.rematchRequested ? 'Rematch requested' : room.opponentRequestedRematch ? 'Accept rematch' : 'Play again' : 'Play again';
  const againDisabled = busy || fatal || Boolean(room && (!room.connected || room.rematchRequested));
  const againNote = room?.rematchRequested ? `Waiting for ${room.names[room.player === 1 ? 1 : 0]}.` : room?.opponentRequestedRematch ? `${room.names[room.player === 1 ? 1 : 0]} wants to play again.` : room ? 'Both players must accept to start again.' : undefined;
  const statusTitle = captureFeedback && recentCapture ? recentCapture.title : result ? result.title
    : room && !room.ready ? 'Waiting for your friend…'
    : room && (!room.connected || room.paused || (!room.opponentOnline && !room.moveSeconds && !room.supportsRecovery)) ? 'Waiting for connection…'
      : state.capture ? 'Three in a row!' : local.thinking && !online ? 'Black is thinking…' : `${turnName} to play.`;
  const statusText = captureFeedback && recentCapture ? recentCapture.detail : result ? result.detail
    : room && !room.ready ? 'Open the game menu for your room code and invite link.'
    : room && !room.connected ? 'Reconnecting automatically. Keep this page open to return to the same game.'
      : room?.paused ? 'The game and turn clock are paused while a player reconnects.'
      : room && !room.opponentOnline ? room.moveSeconds ? room.player === state.turn ? 'Your opponent is away. You can still play; the clock keeps running.' : 'Your opponent is away. The turn clock keeps running.' : 'Your opponent is away. The game will continue when they return.' : instruction(state);
  const profileField = <NameField name={profile.name} busy={busy} onName={profile.setName} onRandomize={profile.randomize} />;
  const onlineAvailable = configured === true && !busy && validName(profile.name.trim());

  return <div className={`app-shell ${view === 'match' ? 'playing' : 'setting-up'}`}>
    <header className="site-header"><button className="brand" onClick={leave} aria-label="Qattaar home" disabled={busy}><SquaresFourIcon size={28} weight="duotone" aria-hidden="true" /><span>qattaar<span className="brand-dot">.</span></span></button><span className="header-caption">Nine Men’s Morris</span>{screen === 'match' ? <button className="icon-button game-menu-button" aria-label="Game menu" onClick={() => setPanel('menu')}><DotsThreeIcon size={26} weight="bold" aria-hidden="true" /></button> : <button className="text-button" onClick={() => setPanel('rules')}><BookOpenIcon size={19} aria-hidden="true" />How to play</button>}</header>
    <main ref={main} tabIndex={-1} className="flow-main" aria-label={view === 'match' ? 'Game' : view === 'lobby' ? 'Waiting room' : 'Game setup'}>
      {screen === 'home' && <ModeScreen onChoose={chooseMode} onResume={local.state.ply > 0 && !local.state.winner ? resumeLocal : undefined} resumeLabel={`${VARIANTS[local.variant].shortName} · ${local.mode === 'ai' ? 'Computer' : 'Pass & play'}`} />}
      {screen === 'setup' && mode !== 'online' && <LocalSetup mode={mode} variant={variant} difficulty={difficulty} onVariant={setVariant} onDifficulty={setDifficulty} onStart={startLocal} onBack={() => navigate('home')} />}
      {screen === 'online' && <SetupScreen title="Play a friend." step="PLAY ONLINE" detail="Your own private table. No account needed." busy={busy} onBack={() => navigate('home')}>{profileField}<OnlineChoices disabled={busy || !validName(profile.name.trim())} onCreate={() => navigate('create')} onJoin={() => navigate('join')} /></SetupScreen>}
      {screen === 'create' && <SetupScreen title="Make it your game." step="CREATE A ROOM" detail="Choose the rules and a pace. Your friend uses the same settings." busy={busy} onBack={() => navigate('online')}><VariantPicker variant={variant} disabled={busy} inRoom={false} onChange={setVariant} /><TurnTimer seconds={moveSeconds} busy={busy} onSeconds={setMoveSeconds} /><button className="primary-button setup-submit" disabled={!onlineAvailable} onClick={() => void connect('create')}>{busy ? <CircleNotchIcon size={20} className="spin" aria-hidden="true" /> : null}{busy ? 'Creating room…' : 'Create room'}<ArrowRightIcon size={18} aria-hidden="true" /></button></SetupScreen>}
      {screen === 'join' && <SetupScreen title="Take your seat." step="JOIN A ROOM" detail="Enter your friend’s code. They choose the rules and timer." busy={busy} onBack={() => navigate('online')}><form onSubmit={(event) => { event.preventDefault(); if (onlineAvailable) void connect('join'); }}>{profileField}<label htmlFor="room-code">Room code</label><input id="room-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-EFGH" maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy} /><button className="primary-button setup-submit" type="submit" disabled={!onlineAvailable || code.replace(/[^A-Z2-9]/g, '').length !== 8}>{busy ? <CircleNotchIcon size={20} className="spin" aria-hidden="true" /> : null}{busy ? 'Joining room…' : 'Join room'}<ArrowRightIcon size={18} aria-hidden="true" /></button></form></SetupScreen>}
      {online && configured === false && screen !== 'home' && <p className="setup-notice flow-message">Online rooms are unavailable. You can still play the computer or pass & play.</p>}
      {screen === 'match' && room && inLobby && <WaitingRoom room={room} countdown={countdown} busy={busy} fatal={fatal} copied={copied} onCopy={(link) => void copyRoom(link)} onReady={() => void roomAction('ready')} onLeave={leave} />}
      {screen === 'match' && !inLobby && <section className="match-screen" aria-label="Game table"><h1 className="sr-only">Qattaar game</h1><div className="match-topline"><span>{mode === 'ai' ? `Computer · ${local.difficulty}` : mode === 'local' ? 'Pass & play' : `Online · Game ${(room?.round ?? 0) + 1}`}</span><span className="rules-badge">{VARIANTS[state.variant].shortName}</span></div><MatchPlayers state={state} mode={mode} room={room} difficulty={local.difficulty} thinking={local.thinking} captureFeedback={captureFeedback} />
        {room && <TurnClock room={room} />}
        {room && <ConnectionNotice room={room} busy={busy} onPause={() => void roomAction('pause')} onResume={() => void roomAction('resume')} onClaim={() => void roomAction('claim')} />}
        <div className={`turn-status ${state.capture ? 'mill-status' : ''} ${captureFeedback ? 'capture-status' : ''} ${result ? `finished-status ${result.outcome}` : ''}`} role="status" aria-live={result ? 'assertive' : 'polite'} aria-atomic="true"><span className={`status-stone ${(captureFeedback?.player ?? state.turn) === 1 ? 'ivory' : 'onyx'}`} /><div><h2>{statusTitle}</h2><p>{statusText}</p></div>{mode !== 'online' && <button className="icon-button undo-button" aria-label="Undo last turn" disabled={!local.canUndo} onClick={local.undo}><ArrowCounterClockwiseIcon size={21} aria-hidden="true" /></button>}</div>
        <Board key={gameId} state={state} enabled={enabled && !captureFeedback} captureFeedback={captureFeedback} lastTurn={lastTurn} onMove={(action) => void move(action)}>{result && !captureFeedback && dismissedResult !== resultId && <MatchResult result={result} online={online} onAgain={playAgain} onDismiss={() => setDismissedResult(resultId)} onMenu={leave} againLabel={againLabel} againDisabled={againDisabled} againNote={againNote} />}</Board>
        {lastTurn && <LastMoveNotice move={lastTurn} />}{recentCapture && <p className="capture-history">Last capture · {recentCapture.detail}</p>}
        <div className="board-actions"><span>{state.winner ? online ? againNote : 'Game over. Ready for another?' : phase(state) === 'placing' ? 'Tap an empty point to place a piece.' : phase(state) === 'flying' ? 'Drag or tap to fly to any empty point.' : 'Drag to move, or tap a piece then its destination.'}</span>{Boolean(state.winner) && <button className="primary-button" disabled={againDisabled} onClick={playAgain}>{againLabel}</button>}</div>
        {!online && local.aiError && <div className="error-message" role="alert">{local.aiError}</div>}{!online && local.notice && <p className="setup-notice" role="status">{local.notice}</p>}
      </section>}
      {error && <div ref={errorMessage} tabIndex={-1} className="error-message flow-message" role="alert">{error}</div>}
    </main>
    {screen !== 'match' && <footer><span>Rooted in tradition. Played together.</span><span>QATTAAR / NINE MEN’S MORRIS</span></footer>}
    {panel === 'rules' && <Modal title={`${VARIANTS[screen === 'match' ? state.variant : variant].name} rules`} onClose={() => setPanel(null)}><GameRules variant={screen === 'match' ? state.variant : variant} /><button className="primary-button" onClick={() => setPanel(null)}>Got it<ArrowRightIcon size={18} aria-hidden="true" /></button></Modal>}
    {panel === 'room' && room && <Modal title="Room details" onClose={() => setPanel(null)}><RoomDetails room={room} copied={copied} onCopy={(link) => void copyRoom(link)} /><p className="field-hint">{room.connected ? 'Connected' : 'Reconnecting'} · You play {playerName(room.player)}</p></Modal>}
    {panel === 'menu' && <Modal title="Game menu" onClose={() => setPanel(null)}><div className="game-menu"><button className="secondary-button" onClick={() => setPanel('rules')}><BookOpenIcon size={20} aria-hidden="true" />How to play</button>{room && <button className="secondary-button" onClick={() => setPanel('room')}>Room details & invite</button>}{room?.supportsRecovery && room.startsAt && !state.winner && <button className="secondary-button" disabled={busy || !room.connected} onClick={confirmResign}>Resign game</button>}{!online && <button className="secondary-button" onClick={() => { setPanel(null); navigate('setup'); }}>New game</button>}<button className="secondary-button" onClick={leave}>{room ? <SignOutIcon size={20} aria-hidden="true" /> : <HouseIcon size={20} aria-hidden="true" />}{room ? 'Leave room' : 'Back to menu'}</button>{!online && <p className="field-hint">Your current game is saved on this device.</p>}{room?.moveSeconds ? <p className="field-hint">{room.paused ? 'The clock is paused while a player reconnects.' : 'The clock keeps running while this menu is open.'}</p> : null}</div></Modal>}
    {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><p className="confirm-copy">{confirm.detail}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Keep playing</button><button className="primary-button" onClick={() => { confirm.run(); setConfirm(null); }}>Continue<ArrowRightIcon size={18} aria-hidden="true" /></button></div></Modal>}
  </div>;
}
