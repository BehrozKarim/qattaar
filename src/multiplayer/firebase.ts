import { initializeApp, getApps } from 'firebase/app';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence, signInAnonymously } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase, goOffline, goOnline, onDisconnect, onValue, ref, remove, runTransaction, set, update } from 'firebase/database';
import type { Database, Unsubscribe } from 'firebase/database';
import { applyAction, createGame } from '../game/engine';
import type { Action, Player } from '../game/engine';
import type { MultiplayerSession, RoomView, SessionCallbacks } from './types';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);
export const ROOM_LIMIT = 40;
const LEASE_MS = 120_000;
const ROOM_MS = 7_200_000;
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-9]/g, '');
export const displayCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

interface Lease { uid: string; code: string; expiresAt: number }
export interface StoredRoom {
  host: string;
  guest: string;
  slot: string;
  createdAt: number;
  expiresAt: number;
  revision: number;
  turn: Player;
  moves?: Record<string, { uid: string; action: Action }>;
  presence?: Record<string, boolean>;
}

/** Replay is the single source of truth; clients never trust a remote board snapshot. */
export function replayRoom(room: StoredRoom) {
  if (!Number.isInteger(room.revision) || room.revision < 0 || room.revision > 2000) throw new Error('This room has an invalid move history.');
  let state = createGame();
  for (let i = 0; i < room.revision; i++) {
    const move = room.moves?.[i];
    if (!move || move.uid !== (state.turn === 1 ? room.host : room.guest)) throw new Error('This room has an invalid move history.');
    state = applyAction(state, move.action);
  }
  if (state.turn !== room.turn) throw new Error('The room is out of sync. Please leave and create a new room.');
  return state;
}

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
    this.listeners.push(onValue(ref(this.db, '.info/serverTimeOffset'), (snapshot) => { this.clockOffset = Number(snapshot.val()) || 0; }));
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

  async create() {
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
        host: this.uid, guest: '', slot, createdAt: now, expiresAt: now + ROOM_MS, revision: 0, turn: 1,
      } satisfies StoredRoom);
      await this.watch();
      return;
    }
    throw new Error('All 40 multiplayer rooms are occupied. Try again shortly, or play against AI.');
  }

  async join(input: string) {
    const code = normalizeCode(input);
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('Enter the eight-character room code.');
    await this.connect();
    const snapshot = await get(ref(this.db, `rooms/${code}`));
    if (!snapshot.exists()) throw new Error('This room does not exist or has closed. Check the code with your friend.');
    if (snapshot.child('host').val() === this.uid) {
      this.code = code; this.slot = snapshot.child('slot').val() as string; this.host = true;
      await this.watch();
      return;
    }
    const result = await runTransaction(ref(this.db, `rooms/${code}/guest`), (guest: string | null) => {
      if (guest !== null && guest !== '' && guest !== this.uid) return;
      return this.uid;
    }, { applyLocally: false });
    if (!result.committed) throw new Error('This room is full or no longer exists.');
    this.code = code;
    await this.watch();
  }

  private async watch() {
    if (this.stopped) throw new Error('Connection cancelled.');
    const presence = ref(this.db, `rooms/${this.code}/presence/${this.uid}`);
    await onDisconnect(presence).set(false);
    await set(presence, true);
    this.listeners.push(onValue(ref(this.db, `rooms/${this.code}`), (snapshot) => {
      if (this.stopped) return;
      if (!snapshot.exists()) { this.callbacks.onError('The room has closed. Leave online play to start another game.'); return; }
      this.room = snapshot.val() as StoredRoom;
      this.host = this.room.host === this.uid;
      this.slot = this.room.slot;
      this.emit();
    }, (error) => this.callbacks.onError(friendlyFirebaseError(error))));
    // Presence operations are registered again after each network reconnection.
    this.listeners.push(onValue(ref(this.db, '.info/connected'), (snapshot) => {
      if (snapshot.val() === true && !this.stopped) {
        void onDisconnect(presence).set(false).then(() => set(presence, true)).catch((error) => this.callbacks.onError(friendlyFirebaseError(error)));
      }
    }));
    this.heartbeat = setInterval(() => {
      if (!this.host || !this.connected || this.stopped) return;
      void runTransaction(ref(this.db, `capacity/${this.slot}`), (lease: Lease | null) => {
        // Transactions can start with an empty local cache even when server data exists.
        // Returning a proposal lets Firebase fetch/retry against the authoritative value.
        if (lease && (lease.uid !== this.uid || lease.code !== this.code)) return;
        return { uid: this.uid, code: this.code, expiresAt: Date.now() + this.clockOffset + LEASE_MS - 1000 };
      }).then((result) => { if (!result.committed) this.callbacks.onError('This room reservation expired. Please create a new room.'); })
        .catch((error) => this.callbacks.onError(friendlyFirebaseError(error)));
    }, 30_000);
  }

  private emit() {
    if (!this.room || this.stopped) return;
    try {
      const other = this.host ? this.room.guest : this.room.host;
      const view: RoomView = {
        code: this.code, player: this.host ? 1 : 2, state: replayRoom(this.room),
        ready: Boolean(this.room.guest), opponentOnline: this.room.presence?.[other] === true, connected: this.connected,
      };
      this.callbacks.onRoom(view);
    } catch (error) { this.callbacks.onError(friendlyFirebaseError(error)); }
  }

  async move(action: Action) {
    if (!this.room || !this.connected || !this.room.guest) throw new Error('Wait for both players to connect.');
    const room = this.room;
    const state = replayRoom(room);
    if ((state.turn === 1 ? room.host : room.guest) !== this.uid) throw new Error('It is your opponent’s turn.');
    const next = applyAction(state, action);
    // Atomic multipath update + append-only rules reject competing/stale writes.
    await update(ref(this.db, `rooms/${this.code}`), {
      [`moves/${room.revision}`]: { uid: this.uid, action }, revision: room.revision + 1, turn: next.turn,
    });
  }

  async close() {
    this.stopped = true;
    clearInterval(this.heartbeat);
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
