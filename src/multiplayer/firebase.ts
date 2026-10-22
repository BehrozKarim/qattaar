import { initializeApp, getApps } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, goOffline, goOnline, onDisconnect, onValue, ref, remove, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import type { Database, Unsubscribe } from 'firebase/database';
import { applyAction, opponent } from '../game/engine';
import { CAPTURE_FEEDBACK_MS } from '../game/feedback';
import { VARIANTS } from '../game/variants';
import type { Variant } from '../game/variants';
import type { Action } from '../game/engine';
import type { MultiplayerSession, RoomView, SessionCallbacks } from './types';
import { hasReadyLobby, hasRoomSettings, MOVE_TIMES, replayRoom, ROOM_PROTOCOL, scheduledStart, START_COUNTDOWN_MS, turnDeadline, validName } from './room';
import { absenceTime, recoveryState, RECONNECT_GRACE_MS } from './recovery';
import type { MoveSeconds, StoredRoom } from './room';
export { replayRoom } from './room';
export type { StoredRoom } from './room';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);
export const ROOM_LIMIT = 40;
const LEASE_MS = 300_000;
const ROOM_MS = 7_200_000;
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-9]/g, '');
export const displayCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

interface Lease { uid: string; code: string; expiresAt: number }
function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join('');
}

export function friendlyFirebaseError(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '');
  if (code.includes('permission') || code.includes('PERMISSION')) return 'Room access was denied. Check the code, or verify the Firebase database rules.';
  if (code.includes('operation-not-allowed')) return 'Anonymous sign-in is not enabled for this Firebase project.';
  if (code.includes('network')) return 'Could not reach multiplayer. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Multiplayer is unavailable. Please try again.';
}

class FirebaseSession implements MultiplayerSession {
  private db!: Database;
  private uid = '';
  private code = '';
  private slot = '';
  private host = false;
  private connected = false;
  private room: StoredRoom | null = null;
  private stopped = false;
  private clockOffset = 0;
  private listeners: Unsubscribe[] = [];
  private heartbeat?: ReturnType<typeof setInterval>;
  private clockTick?: ReturnType<typeof setInterval>;
  private settling = false;
  private timeoutRetryAt = 0;
  private restarting = false;
  private starting = false;
  private recovering = false;
  private renewing = false;
  private recoveryRetry?: ReturnType<typeof setTimeout>;

  constructor(private callbacks: SessionCallbacks) {}

  private async connect() {
    if (!firebaseConfigured) throw new Error('Online rooms need Firebase configuration. Local play and AI are ready to use.');
    const existing = getApps()[0];
    const app = existing ?? initializeApp(config);
    const auth = getAuth(app);
    this.db = getDatabase(app);
    if (!existing && import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectDatabaseEmulator(this.db, '127.0.0.1', 9000);
    }
    await setPersistence(auth, browserSessionPersistence);
    this.uid = (auth.currentUser ?? (await signInAnonymously(auth)).user).uid;
    if (this.stopped) throw new Error('Connection cancelled.');
    goOnline(this.db);
    this.listeners.push(onValue(ref(this.db, '.info/serverTimeOffset'), (snapshot) => { this.clockOffset = Number(snapshot.val()) || 0; this.emit(); }));
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Multiplayer could not connect. It may be full or temporarily unavailable. Try again shortly.')), 10_000);
      const unsubscribe = onValue(ref(this.db, '.info/connected'), (snapshot) => {
        this.connected = snapshot.val() === true;
        this.emit();
        if (this.connected) { clearTimeout(timeout); resolve(); }
      }, (error) => { clearTimeout(timeout); reject(error); });
      this.listeners.push(unsubscribe);
    });
    if (this.stopped) throw new Error('Connection cancelled.');
  }

  async create(variant: Variant, name: string, moveSeconds: MoveSeconds) {
    name = name.trim();
    if (!validName(name) || !MOVE_TIMES.includes(moveSeconds)) throw new Error('Choose a name of 1–20 characters and a valid move timer.');
    await this.connect();
    const offset = crypto.getRandomValues(new Uint8Array(1))[0] % ROOM_LIMIT;
    for (let i = 0; i < ROOM_LIMIT; i++) {
      if (this.stopped) throw new Error('Connection cancelled.');
      const slot = String((offset + i) % ROOM_LIMIT);
      const code = randomCode();
      let oldCode: string | undefined;
      try {
        const lease = await runTransaction(ref(this.db, `capacity/${slot}`), (current: Lease | null) => {
          if (current && current.expiresAt > Date.now() + this.clockOffset) return;
          oldCode = current?.code;
          return { uid: this.uid, code, expiresAt: Date.now() + this.clockOffset + LEASE_MS - 1000 };
        }, { applyLocally: false });
        if (!lease.committed) continue;
      } catch (error) {
        if (String((error as { code?: string }).code).toLowerCase().includes('permission')) continue;
        throw error;
      }
      this.slot = slot; this.code = code; this.host = true;
      if (oldCode) await remove(ref(this.db, `rooms/${oldCode}`));
      const now = Date.now() + this.clockOffset;
      await set(ref(this.db, `rooms/${code}`), {
        ruleset: VARIANTS[variant].ruleset, host: this.uid, guest: '', slot, createdAt: now, expiresAt: now + ROOM_MS, revision: 0, turn: 1,
        protocol: ROOM_PROTOCOL, round: 0, hostName: name, guestName: '', moveSeconds, turnStartedAt: 0, turnDelayMs: 0, finished: 0, timeout: 0, startedAt: 0,
        clockPausedMs: 0, turnPausedBaseMs: 0, resigned: 0, abandoned: 0,
      } satisfies StoredRoom);
      await this.watch();
      return;
    }
    throw new Error('All 40 multiplayer rooms are occupied. Try again shortly, or play against AI.');
  }

  async join(input: string, name: string) {
    name = name.trim();
    if (!validName(name)) throw new Error('Choose a name of 1–20 characters.');
    const code = normalizeCode(input);
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('Enter the eight-character room code.');
    await this.connect();
    const snapshot = await get(ref(this.db, `rooms/${code}`));
    if (!snapshot.exists()) throw new Error('This room does not exist or has closed. Check the code with your friend.');
    replayRoom(snapshot.val() as StoredRoom);
    if (snapshot.child('host').val() === this.uid) {
      this.code = code; this.slot = snapshot.child('slot').val() as string; this.host = true;
      await this.watch();
      return;
    }
    const stored = snapshot.val() as StoredRoom;
    if (stored.guest && stored.guest !== this.uid) throw new Error('This room is full.');
    if (!stored.guest) {
      if (hasRoomSettings(stored)) await update(ref(this.db, `rooms/${code}`), { guest: this.uid, guestName: name, ...(stored.protocol === 2 ? { turnStartedAt: serverTimestamp() } : {}) });
      else {
        const result = await runTransaction(ref(this.db, `rooms/${code}/guest`), (guest: string | null) => guest === null || guest === '' || guest === this.uid ? this.uid : undefined, { applyLocally: false });
        if (!result.committed) throw new Error('This room is full or no longer exists.');
      }
    }
    this.code = code;
    await this.watch();
  }

  private async watch() {
    if (this.stopped) throw new Error('Connection cancelled.');
    this.listeners.push(onValue(ref(this.db, `rooms/${this.code}`), (snapshot) => {
      if (this.stopped) return;
      if (!snapshot.exists()) { this.callbacks.onError('The room has closed. Leave online play to start another game.'); return; }
      this.room = snapshot.val() as StoredRoom;
      this.host = this.room.host === this.uid;
      this.slot = this.room.slot;
      this.emit();
      if (this.connected && !document.hidden && this.room.presence?.[this.uid] !== true) void this.restoreConnection();
      void this.maybeStart();
      void this.maybeRestart();
    }, (error) => this.callbacks.onError(friendlyFirebaseError(error))));
    // Re-register server-side disconnect handlers on every connection. Backgrounding
    // a phone is an absence, never a request to destroy the host's room.
    this.listeners.push(onValue(ref(this.db, '.info/connected'), (snapshot) => {
      if (snapshot.val() === true && !this.stopped) {
        void this.restoreConnection();
      }
    }));
    const visibility = () => {
      if (document.visibilityState === 'hidden') void this.markAway();
      else { goOnline(this.db); if (this.connected) void this.restoreConnection(); }
    };
    const wake = () => { if (!document.hidden) { goOnline(this.db); if (this.connected) void this.restoreConnection(); } };
    const away = () => { void this.markAway(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('pagehide', away);
    this.listeners.push(() => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('pagehide', away);
    });
    this.heartbeat = setInterval(() => {
      void this.renewLease();
      if (!document.hidden && this.room?.presence?.[this.uid] !== true) void this.restoreConnection();
    }, 30_000);
    this.clockTick = setInterval(() => { this.emit(); if (!document.hidden) void this.maybeTimeout(); }, 500);
  }

  private async renewLease() {
    if (!this.room || !this.connected || this.stopped || this.renewing) return;
    this.renewing = true;
    try {
      // Either seated player keeps the host's reservation alive while a phone sleeps.
      const result = await runTransaction(ref(this.db, `capacity/${this.slot}`), (lease: Lease | null) => {
        if (lease && (lease.uid !== this.room!.host || lease.code !== this.code)) return;
        return { uid: this.room!.host, code: this.code, expiresAt: Date.now() + this.clockOffset + LEASE_MS - 1000 };
      }, { applyLocally: false });
      if (!result.committed) this.callbacks.onError('This room reservation was reclaimed. Leave the room to start another game.');
    } catch { /* Firebase reconnects automatically; retry on wake or the next heartbeat. */ }
    finally { this.renewing = false; }
  }

  private async markAway() {
    if (!this.connected || !this.room || this.stopped || this.room.presence?.[this.uid] === false) return;
    try {
      await update(ref(this.db, `rooms/${this.code}`), {
        [`presence/${this.uid}`]: false,
        ...(this.room.protocol === 4 ? { [`awayAt/${this.uid}`]: serverTimestamp(), [`backgroundAt/${this.uid}`]: serverTimestamp() } : {}),
      });
    } catch { /* The server-side onDisconnect handler covers an interrupted write. */ }
  }

  private async restoreConnection() {
    if (this.recovering || this.stopped || !this.connected || !this.room) return;
    this.recovering = true;
    try {
      const path = ref(this.db, `rooms/${this.code}`);
      await onDisconnect(path).update({ [`presence/${this.uid}`]: false, ...(this.room.protocol === 4 ? { [`awayAt/${this.uid}`]: serverTimestamp() } : {}) });
      await this.renewLease();
      if (document.hidden || this.stopped || !this.connected) return;
      if (this.room.protocol !== 4) { await set(ref(this.db, `rooms/${this.code}/presence/${this.uid}`), true); return; }
      await this.updateRecovery((current) => {
        if (!current || this.stopped || document.hidden) return;
        const pause = recoveryState(current, Date.now() + this.clockOffset);
        const other = this.uid === current.host ? current.guest : current.host;
        const stillAway = other && current.presence?.[other] === false;
        return { [`presence/${this.uid}`]: true, [`awayAt/${this.uid}`]: null, [`backgroundAt/${this.uid}`]: null,
          ...(pause.recovery && !pause.recovery.endedAt ? {
            clockPausedMs: pause.accumulated,
            recovery: { ...pause.recovery, endedAt: stillAway ? 0 : serverTimestamp() },
          } : {}),
        };
      });
    } catch { /* Temporary failures are recoverable, not a fatal game error. */ }
    finally {
      this.recovering = false;
      if (!this.stopped && this.connected && !document.hidden && this.room?.presence?.[this.uid] !== true) {
        clearTimeout(this.recoveryRetry);
        this.recoveryRetry = setTimeout(() => { void this.restoreConnection(); }, 2000);
      }
    }
  }

  private async updateRecovery(change: (current: StoredRoom) => object | undefined) {
    const path = ref(this.db, `rooms/${this.code}`);
    const snapshot = await get(path);
    if (!snapshot.exists() || !this.connected || this.stopped) throw new Error('Reconnect to your room before continuing.');
    const current = snapshot.val() as StoredRoom;
    const changes = change(current);
    if (!changes) throw new Error('The room changed. Please try again.');
    // The rules validate against the server's current pause, revision, and round.
    // Only these fields are written, so recovery cannot overwrite move history.
    await update(path, { round: current.round, revision: current.revision, ...changes });
  }

  private emit() {
    if (!this.room || this.stopped) return;
    try {
      const other = this.host ? this.room.guest : this.room.host;
      const now = Date.now() + this.clockOffset;
      const pause = recoveryState(this.room, now);
      const deadline = turnDeadline(this.room, now);
      const view: RoomView = {
        code: this.code, player: this.host ? 1 : 2, state: replayRoom(this.room),
        ready: Boolean(this.room.guest), opponentOnline: this.room.presence?.[other] === true, connected: this.connected,
        names: [this.room.hostName ?? 'Player one', this.room.guestName || 'Waiting for a friend'],
        round: this.room.round ?? 0, moveSeconds: this.room.moveSeconds ?? 0, deadline, serverOffset: this.clockOffset,
        rematchRequested: this.room.rematch?.[this.uid] === true, opponentRequestedRematch: this.room.rematch?.[other] === true,
        supportsRematch: hasRoomSettings(this.room), supportsReady: hasReadyLobby(this.room),
        youReady: this.room.ready?.[this.uid] === true, opponentReady: this.room.ready?.[other] === true, startsAt: scheduledStart(this.room),
        supportsRecovery: this.room.protocol === 4, paused: pause.paused,
        pausedByYou: !pause.recovery?.endedAt && pause.recovery?.extendedBy === this.uid,
        waitingLonger: Boolean(!pause.recovery?.endedAt && pause.recovery?.extendedBy), graceUntil: pause.graceUntil,
        canClaimDisconnect: this.room.protocol === 4 && Boolean(this.room.startedAt && !this.room.finished && this.room.presence?.[other] === false && absenceTime(this.room, other) && now >= absenceTime(this.room, other) + RECONNECT_GRACE_MS && !pause.paused),
        frozenRemainingMs: pause.paused && deadline !== null ? Math.max(0, deadline - now) : null,
      };
      this.callbacks.onRoom(view);
    } catch (error) { this.callbacks.onError(friendlyFirebaseError(error)); }
  }

  async move(action: Action) {
    if (!this.room || !this.connected || !this.room.guest) throw new Error('Wait for both players to connect.');
    const room = this.room;
    const startsAt = scheduledStart(room);
    if (hasReadyLobby(room) && (startsAt === null || Date.now() + this.clockOffset < startsAt)) throw new Error('Wait for both players to be ready and the countdown to finish.');
    const pause = recoveryState(room, Date.now() + this.clockOffset);
    if (pause.paused) throw new Error('The game is paused while a player reconnects.');
    const state = replayRoom(room);
    if ((state.turn === 1 ? room.host : room.guest) !== this.uid) throw new Error('It is your opponent’s turn.');
    const next = applyAction(state, action);
    // Atomic multipath update + append-only rules reject competing/stale writes.
    await update(ref(this.db, `rooms/${this.code}`), {
      [`moves/${room.revision}`]: { uid: this.uid, action }, revision: room.revision + 1, turn: next.turn,
      ...(hasRoomSettings(room) ? { round: room.round, finished: next.winner, turnStartedAt: next.turn === state.turn ? room.turnStartedAt : serverTimestamp(), turnDelayMs: next.turn === state.turn ? room.turnDelayMs : action.type === 'capture' ? CAPTURE_FEEDBACK_MS : 0 } : {}),
      ...(room.protocol === 4 ? { turnPausedBaseMs: next.turn === state.turn ? room.turnPausedBaseMs : pause.total } : {}),
    });
  }

  private async maybeTimeout() {
    const room = this.room;
    if (!room || !this.connected || this.stopped || this.settling || Date.now() < this.timeoutRetryAt || Date.now() + this.clockOffset >= room.expiresAt) return;
    const deadline = turnDeadline(room);
    if (deadline === null || recoveryState(room, Date.now() + this.clockOffset).paused || Date.now() + this.clockOffset < deadline + 100) return;
    this.settling = true;
    try { await update(ref(this.db, `rooms/${this.code}`), { round: room.round, finished: opponent(room.turn), timeout: room.turn }); }
    catch {
      // A competing write or expired reservation can reject a claim. Back off
      // instead of repeatedly writing while the room is unavailable.
      this.timeoutRetryAt = Date.now() + 5000;
    }
    finally { this.settling = false; }
  }

  async requestRematch() {
    if (!this.room || !this.connected) throw new Error('Reconnect before requesting a rematch.');
    if (!hasRoomSettings(this.room)) throw new Error('Create a fresh room to use rematches, names, and timers.');
    if (!replayRoom(this.room).winner) throw new Error('Finish this game before requesting a rematch.');
    await set(ref(this.db, `rooms/${this.code}/rematch/${this.uid}`), true);
    await this.maybeRestart();
  }

  async markReady() {
    if (!this.room || !this.connected || !hasReadyLobby(this.room) || this.room.startedAt) throw new Error('Reconnect to the waiting room before getting ready.');
    await set(ref(this.db, `rooms/${this.code}/ready/${this.uid}`), true);
    await this.maybeStart();
  }

  async pauseWaiting() {
    if (!this.room || !this.connected || this.room.protocol !== 4) throw new Error('Reconnect before pausing.');
    await this.updateRecovery((current) => {
      if (!current || current.finished) return;
      const other = this.uid === current.host ? current.guest : current.host;
      const pause = recoveryState(current, Date.now() + this.clockOffset);
      if (!other || current.presence?.[other] !== false || !pause.paused || !pause.recovery || pause.recovery.extendedBy) return;
      return { clockPausedMs: pause.accumulated, recovery: { ...pause.recovery, extendedBy: this.uid } };
    });
  }

  async resumeWaiting() {
    if (!this.room || !this.connected) throw new Error('Reconnect before resuming.');
    await this.updateRecovery((current) => {
      if (!current?.recovery || current.recovery.endedAt || current.recovery.extendedBy !== this.uid || current.finished) return;
      return { recovery: { ...current.recovery, endedAt: serverTimestamp() } };
    });
  }

  async resign() {
    if (!this.room || !this.connected || this.room.protocol !== 4 || !this.room.startedAt || this.room.finished) throw new Error('Reconnect to an active game before resigning.');
    const player = this.host ? 1 : 2;
    await update(ref(this.db, `rooms/${this.code}`), { round: this.room.round, resigned: player, finished: opponent(player) });
  }

  async claimDisconnect() {
    if (!this.room || !this.connected || this.room.protocol !== 4) throw new Error('Reconnect before claiming the game.');
    const player = this.host ? 1 : 2;
    await update(ref(this.db, `rooms/${this.code}`), { round: this.room.round, abandoned: opponent(player), finished: player });
  }

  private async maybeStart() {
    const room = this.room;
    if (!room || !hasReadyLobby(room) || room.startedAt || !this.connected || this.stopped || this.starting || !room.guest || !room.ready?.[room.host] || !room.ready?.[room.guest] || !room.presence?.[room.host] || !room.presence?.[room.guest]) return;
    this.starting = true;
    try {
      await runTransaction(ref(this.db, `rooms/${this.code}`), (current: StoredRoom | null) => {
        if (!current || current.startedAt || !current.guest || !current.ready?.[current.host] || !current.ready?.[current.guest] || !current.presence?.[current.host] || !current.presence?.[current.guest]) return;
        return { ...current, startedAt: serverTimestamp(), turnStartedAt: serverTimestamp(), turnDelayMs: START_COUNTDOWN_MS };
      }, { applyLocally: false });
    } catch (error) { if (!this.room?.startedAt) this.callbacks.onError(friendlyFirebaseError(error)); }
    finally { this.starting = false; }
  }

  private async maybeRestart() {
    const room = this.room;
    if (!room || !this.connected || this.stopped || this.restarting || !room.finished || !room.rematch?.[room.host] || !room.rematch?.[room.guest] || (room.protocol === 4 && (!room.presence?.[room.host] || !room.presence?.[room.guest]))) return;
    this.restarting = true;
    try {
      await runTransaction(ref(this.db, `rooms/${this.code}`), (current: StoredRoom | null) => {
        if (!current || current.round !== room.round || !current.finished || !current.rematch?.[current.host] || !current.rematch?.[current.guest] || (current.protocol === 4 && (!current.presence?.[current.host] || !current.presence?.[current.guest]))) return;
        return { ...current, round: (current.round ?? 0) + 1, revision: 0, turn: 1, moves: null, finished: 0, timeout: 0, rematch: null, turnStartedAt: serverTimestamp(), turnDelayMs: hasReadyLobby(current) ? START_COUNTDOWN_MS : 0, ...(hasReadyLobby(current) ? { startedAt: serverTimestamp() } : {}), ...(current.protocol === 4 ? { recovery: null, awayAt: null, backgroundAt: null, clockPausedMs: 0, turnPausedBaseMs: 0, resigned: 0, abandoned: 0 } : {}) };
      }, { applyLocally: false });
    } catch (error) { if (this.room?.round === room.round) this.callbacks.onError(friendlyFirebaseError(error)); }
    finally { this.restarting = false; }
  }

  async close() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    clearInterval(this.clockTick);
    clearTimeout(this.recoveryRetry);
    this.listeners.forEach((unsubscribe) => unsubscribe());
    if (!this.db) return;
    const cleanup = async () => {
      if (this.connected && this.code) {
        if (this.host) {
          await remove(ref(this.db, `rooms/${this.code}`));
          await runTransaction(ref(this.db, `capacity/${this.slot}`), (lease: Lease | null) => !lease || (lease.uid === this.uid && lease.code === this.code) ? null : undefined);
        } else await set(ref(this.db, `rooms/${this.code}/presence/${this.uid}`), false);
      }
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([cleanup(), new Promise<void>((resolve) => { timeout = setTimeout(resolve, 2000); })]);
    } finally { clearTimeout(timeout); goOffline(this.db); }
  }
}

export const createMultiplayerSession = (callbacks: SessionCallbacks): MultiplayerSession => new FirebaseSession(callbacks);
