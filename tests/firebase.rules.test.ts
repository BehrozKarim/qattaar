import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { RULESET } from '../src/game/engine';
import { VARIANTS } from '../src/game/variants';
import { ROOM_PROTOCOL } from '../src/multiplayer/room';

let environment: RulesTestEnvironment;
const code = 'ABCDEFGH';
const lease = (uid = 'host', roomCode = code) => ({ uid, code: roomCode, expiresAt: Date.now() + 110_000 });
const room = () => ({ ruleset: RULESET, host: 'host', guest: '', slot: '0', createdAt: Date.now(), expiresAt: Date.now() + 7_000_000, revision: 0, turn: 1, protocol: ROOM_PROTOCOL, round: 0, hostName: 'Host Player', guestName: '', moveSeconds: 0, turnStartedAt: 0, turnDelayMs: 0, finished: 0, timeout: 0, startedAt: 0 });
const db = (uid: string) => environment.authenticatedContext(uid).database();

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-qattaar', database: { host: '127.0.0.1', port: 9000, rules: readFileSync('firebase/database.rules.json', 'utf8') } }); });
beforeEach(async () => { await environment.clearDatabase(); });
afterAll(async () => { await environment?.cleanup(); });

const joinOnly = (uid = 'guest') => update(ref(db(uid), `rooms/${code}`), { guest: uid, guestName: uid });
async function makePlayable(uid = 'guest') {
  await environment.withSecurityRulesDisabled(async (context) => {
    await update(ref(context.database(), `rooms/${code}`), { startedAt: Date.now() - 4000, turnStartedAt: Date.now(), turnDelayMs: 0, ready: { host: true, [uid]: true } });
  });
}
async function joinRoom(uid = 'guest') { await joinOnly(uid); await makePlayable(uid); }

async function seedRoom() {
  await set(ref(db('host'), 'capacity/0'), lease());
  await set(ref(db('host'), `rooms/${code}`), room());
}

describe('room reservations', () => {
  it('rejects unauthenticated access and listing rooms', async () => {
    await assertFails(get(ref(environment.unauthenticatedContext().database(), 'rooms/ABCDEFGH')));
    await assertFails(get(ref(db('host'), 'rooms')));
  });
  it('enforces exactly 40 possible slots', async () => {
    await Promise.all(Array.from({ length: 40 }, (_, i) => assertSucceeds(set(ref(db('host'), `capacity/${i}`), lease()))));
    await assertFails(set(ref(db('host'), 'capacity/40'), lease()));
    await assertFails(set(ref(db('host'), 'capacity/00'), lease()));
  });
  it('does not reveal or overwrite another player’s unexpired reservation', async () => {
    await seedRoom();
    await assertFails(get(ref(db('stranger'), 'capacity/0')));
    await assertFails(set(ref(db('stranger'), 'capacity/0'), lease('stranger')));
    await assertFails(remove(ref(db('stranger'), 'capacity/0')));
  });
  it('requires a matching reservation to create a room', async () => {
    await assertFails(set(ref(db('host'), `rooms/${code}`), room()));
    await seedRoom();
    await assertFails(set(ref(db('host'), 'rooms/ABCDJKLM'), room()));
  });
  it('requires the current ruleset on room creation', async () => {
    await set(ref(db('host'), 'capacity/0'), lease());
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...room(), ruleset: 'morris-flying' }));
    const { ruleset: omitted, ...legacyRoom } = room();
    expect(omitted).toBe(RULESET);
    await assertFails(set(ref(db('host'), `rooms/${code}`), legacyRoom));
  });
  it('allows creating and playing a Classic room', async () => {
    await set(ref(db('host'), 'capacity/0'), lease());
    await assertSucceeds(set(ref(db('host'), `rooms/${code}`), { ...room(), ruleset: VARIANTS.classic.ruleset }));
    await joinRoom();
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, finished: 0, turnStartedAt: serverTimestamp() }));
  });
  it('allows reclaiming expired reservations and deleting the abandoned room', async () => {
    await seedRoom();
    await environment.withSecurityRulesDisabled(async (context) => { await update(ref(context.database(), 'capacity/0'), { expiresAt: Date.now() - 1 }); });
    await assertSucceeds(get(ref(db('newhost'), 'capacity/0')));
    await assertSucceeds(set(ref(db('newhost'), 'capacity/0'), lease('newhost', 'ABCDJKLM')));
    await assertSucceeds(remove(ref(db('newhost'), `rooms/${code}`)));
  });
});

describe('membership and moves', () => {
  beforeEach(seedRoom);
  it('allows exactly one guest, excluding the host', async () => {
    await assertFails(set(ref(db('host'), `rooms/${code}/guest`), 'host'));
    await assertSucceeds(joinRoom());
    await assertFails(set(ref(db('third'), `rooms/${code}/guest`), 'third'));
  });
  it('atomically accepts one winner of competing guest joins', async () => {
    const results = await Promise.allSettled(['guestA', 'guestB'].map((uid) => joinRoom(uid)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('rejects moves before a guest joins, out-of-turn moves, and outsiders', async () => {
    const move = { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, finished: 0, turnStartedAt: serverTimestamp() };
    await assertFails(update(ref(db('host'), `rooms/${code}`), move));
    await joinRoom();
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { ...move, 'moves/0': { uid: 'guest', action: { type: 'place', to: 0 } } }));
    await assertFails(update(ref(db('outsider'), `rooms/${code}`), move));
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), move));
    await assertFails(update(ref(db('host'), `rooms/${code}`), move));
  });
  it('rejects tampering with old moves, metadata, and unknown fields', async () => {
    await joinRoom();
    await update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, finished: 0, turnStartedAt: serverTimestamp() });
    await assertFails(set(ref(db('guest'), `rooms/${code}/host`), 'guest'));
    await assertFails(set(ref(db('host'), `rooms/${code}/ruleset`), 'morris-flying'));
    await assertFails(set(ref(db('host'), `rooms/${code}/ruleset`), VARIANTS.classic.ruleset));
    await assertFails(remove(ref(db('host'), `rooms/${code}/ruleset`)));
    await assertFails(set(ref(db('host'), `rooms/${code}/unexpected`), true));
    await assertFails(remove(ref(db('guest'), `rooms/${code}/moves/0`)));
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { 'moves/0/action/to': 10, 'moves/1': { uid: 'guest', action: { type: 'place', to: 3 } }, revision: 2, turn: 1, finished: 0, turnStartedAt: serverTimestamp() }));
  });
  it('requires the move and revision to change together', async () => {
    await joinRoom();
    await assertFails(set(ref(db('host'), `rooms/${code}/revision`), 1));
    await assertFails(set(ref(db('host'), `rooms/${code}/moves/0`), { uid: 'host', action: { type: 'place', to: 0 } }));
  });
  it('allows only members to write their own presence', async () => {
    await assertSucceeds(set(ref(db('host'), `rooms/${code}/presence/host`), true));
    await assertFails(set(ref(db('outsider'), `rooms/${code}/presence/outsider`), true));
    await assertFails(set(ref(db('host'), `rooms/${code}/presence/guest`), false));
  });
  it('lets an existing legacy room finish without upgrading its protocol mid-game', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `rooms/${code}`), { ruleset: RULESET, host: 'host', guest: '', slot: '0', createdAt: Date.now(), expiresAt: Date.now() + 7000000, revision: 0, turn: 1 });
    });
    await assertSucceeds(set(ref(db('guest'), `rooms/${code}/guest`), 'guest'));
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2 }));
    await assertFails(set(ref(db('host'), `rooms/${code}/protocol`), ROOM_PROTOCOL));
  });
});

async function expireTurn() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await update(ref(context.database(), `rooms/${code}`), { moveSeconds: 30, turnStartedAt: Date.now() - 31000 });
  });
}
async function finishByTimeout() {
  await expireTurn();
  await update(ref(db('guest'), `rooms/${code}`), { finished: 2, timeout: 1 });
}
async function resetPayload() {
  const current = (await get(ref(db('host'), `rooms/${code}`))).val();
  return { ...current, round: current.round + 1, revision: 0, turn: 1, finished: 0, timeout: 0, turnStartedAt: serverTimestamp(), turnDelayMs: 3000, startedAt: serverTimestamp(), moves: null, rematch: null };
}
async function submit(uid: string, to: number, turn: number, capture = false) {
  const current = (await get(ref(db(uid), `rooms/${code}`))).val();
  const action = capture ? { type: 'capture', at: to } : { type: 'place', to };
  return update(ref(db(uid), `rooms/${code}`), { [`moves/${current.revision}`]: { uid, action }, revision: current.revision + 1, turn, round: current.round, finished: 0, turnStartedAt: turn === current.turn ? current.turnStartedAt : serverTimestamp(), turnDelayMs: turn === current.turn ? current.turnDelayMs : capture ? 1800 : 0 });
}

describe('names and clocks', () => {
  beforeEach(seedRoom);
  it('requires a guest name to join atomically', async () => {
    await assertFails(set(ref(db('guest'), `rooms/${code}/guest`), 'guest'));
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { guest: 'guest', turnStartedAt: serverTimestamp() }));
    await assertFails(set(ref(db('guest'), `rooms/${code}/guestName`), 'Imposter'));
    await assertSucceeds(joinRoom());
  });
  it('rejects empty/oversized names and locks profiles and timer settings after joining', async () => {
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { guest: 'guest', guestName: ' ', turnStartedAt: serverTimestamp() }));
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { guest: 'guest', guestName: 'x'.repeat(21), turnStartedAt: serverTimestamp() }));
    await joinRoom();
    await assertFails(set(ref(db('host'), `rooms/${code}/hostName`), 'New name'));
    await assertFails(set(ref(db('guest'), `rooms/${code}/guestName`), 'New name'));
    await assertFails(set(ref(db('host'), `rooms/${code}/moveSeconds`), 30));
  });
  it('rejects early, outsider, and unlimited-game timeout claims', async () => {
    await joinRoom();
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { finished: 2, timeout: 1 }));
    await environment.withSecurityRulesDisabled(async (context) => { await update(ref(context.database(), `rooms/${code}`), { moveSeconds: 30 }); });
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { finished: 2, timeout: 1 }));
    await expireTurn();
    await assertFails(update(ref(db('outsider'), `rooms/${code}`), { finished: 2, timeout: 1 }));
  });
  it('rejects late moves and lets either member settle the correct timeout result', async () => {
    await joinRoom(); await expireTurn();
    await assertFails(submit('host', 0, 2));
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { finished: 1, timeout: 1 }));
    await assertFails(set(ref(db('guest'), `rooms/${code}/finished`), 2));
    await assertSucceeds(update(ref(db('guest'), `rooms/${code}`), { round: 0, finished: 2, timeout: 1 }));
    await assertFails(submit('host', 0, 2));
  });
  it('prevents resetting the clock without a move or inventing a future start', async () => {
    await joinRoom();
    await assertFails(set(ref(db('host'), `rooms/${code}/turnStartedAt`), Date.now() + 60000));
    await assertFails(update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, turnStartedAt: Date.now() + 60000 }));
  });
  it('keeps a mill and capture on one allowance and enforces the presentation delay for the next turn', async () => {
    await joinRoom();
    await environment.withSecurityRulesDisabled(async (context) => { await update(ref(context.database(), `rooms/${code}`), { moveSeconds: 30 }); });
    await submit('host', 0, 2); await submit('guest', 3, 1); await submit('host', 1, 2); await submit('guest', 5, 1);
    const before = (await get(ref(db('host'), `rooms/${code}/turnStartedAt`))).val();
    await submit('host', 2, 1);
    expect((await get(ref(db('host'), `rooms/${code}/turnStartedAt`))).val()).toBe(before);
    await assertFails(set(ref(db('host'), `rooms/${code}/turnStartedAt`), before + 1000));
    await submit('host', 3, 2, true);
    expect((await get(ref(db('host'), `rooms/${code}/turnDelayMs`))).val()).toBe(1800);
    await environment.withSecurityRulesDisabled(async (context) => { await set(ref(context.database(), `rooms/${code}/turnStartedAt`), Date.now() - 30500); });
    await assertFails(update(ref(db('host'), `rooms/${code}`), { finished: 1, timeout: 2 }));
    await environment.withSecurityRulesDisabled(async (context) => { await set(ref(context.database(), `rooms/${code}/turnStartedAt`), Date.now() - 33000); });
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), { finished: 1, timeout: 2 }));
  });
});

describe('rematches', () => {
  beforeEach(async () => { await seedRoom(); await joinRoom(); });
  it('requires a finished game and only lets players request for themselves', async () => {
    await assertFails(set(ref(db('host'), `rooms/${code}/rematch/host`), true));
    await finishByTimeout();
    await assertFails(set(ref(db('outsider'), `rooms/${code}/rematch/outsider`), true));
    await assertFails(set(ref(db('host'), `rooms/${code}/rematch/guest`), true));
    await assertSucceeds(set(ref(db('host'), `rooms/${code}/rematch/host`), true));
    await assertFails(set(ref(db('host'), `rooms/${code}/rematch/host`), false));
  });
  it('does not let one player reset the match alone', async () => {
    await finishByTimeout();
    await set(ref(db('host'), `rooms/${code}/rematch/host`), true);
    await assertFails(set(ref(db('host'), `rooms/${code}`), await resetPayload()));
  });
  it('starts one fresh round after both agree, preserving membership, names, settings, and lease', async () => {
    await finishByTimeout();
    await set(ref(db('host'), `rooms/${code}/rematch/host`), true);
    await set(ref(db('guest'), `rooms/${code}/rematch/guest`), true);
    const fresh = await resetPayload();
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...fresh, hostName: 'Tampered' }));
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...fresh, moveSeconds: 60 }));
    await assertSucceeds(set(ref(db('guest'), `rooms/${code}`), fresh));
    const stored = (await get(ref(db('host'), `rooms/${code}`))).val();
    expect(stored).toMatchObject({ round: 1, revision: 0, turn: 1, finished: 0, timeout: 0, host: 'host', guest: 'guest', hostName: 'Host Player', guestName: 'guest', moveSeconds: 30, slot: '0' });
    expect(stored.moves).toBeUndefined(); expect(stored.rematch).toBeUndefined();
    expect((await get(ref(db('host'), 'capacity/0'))).val().code).toBe(code);
    await assertFails(update(ref(db('host'), `rooms/${code}`), { round: 0, 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, turnStartedAt: serverTimestamp() }));
    await makePlayable();
    await assertSucceeds(submit('host', 0, 2));
  });
  it('accepts only one of two competing round resets', async () => {
    await finishByTimeout();
    await set(ref(db('host'), `rooms/${code}/rematch/host`), true);
    await set(ref(db('guest'), `rooms/${code}/rematch/guest`), true);
    const fresh = await resetPayload();
    const results = await Promise.allSettled(['host', 'guest'].map((uid) => set(ref(db(uid), `rooms/${code}`), fresh)));
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect((await get(ref(db('host'), `rooms/${code}/round`))).val()).toBe(1);
  });
});

const readyPlayer = (uid: string) => set(ref(db(uid), `rooms/${code}/ready/${uid}`), true);
async function startPayload() {
  const current = (await get(ref(db('host'), `rooms/${code}`))).val();
  return { ...current, startedAt: serverTimestamp(), turnStartedAt: serverTimestamp(), turnDelayMs: 3000 };
}
async function bothPresent() {
  await set(ref(db('host'), `rooms/${code}/presence/host`), true);
  await set(ref(db('guest'), `rooms/${code}/presence/guest`), true);
}

describe('waiting-room readiness', () => {
  beforeEach(seedRoom);
  it('joins without starting a timed or untimed game', async () => {
    await joinOnly();
    const stored = (await get(ref(db('host'), `rooms/${code}`))).val();
    expect(stored.startedAt).toBe(0); expect(stored.turnStartedAt).toBe(0);
    await assertFails(submit('host', 0, 2));
    await environment.withSecurityRulesDisabled(async (context) => { await set(ref(context.database(), `rooms/${code}/moveSeconds`), 30); });
    await assertFails(update(ref(db('host'), `rooms/${code}`), { finished: 2, timeout: 1 }));
  });
  it('requires each player to consent for themselves', async () => {
    await joinOnly();
    await assertFails(set(ref(db('host'), `rooms/${code}/ready/guest`), true));
    await assertFails(readyPlayer('outsider'));
    await assertSucceeds(readyPlayer('host'));
    await assertFails(set(ref(db('host'), `rooms/${code}`), await startPayload()));
    await assertFails(set(ref(db('host'), `rooms/${code}/ready/host`), false));
  });
  it('requires both players present and starts with a server-stamped countdown', async () => {
    await joinOnly(); await readyPlayer('host'); await readyPlayer('guest');
    await assertFails(set(ref(db('host'), `rooms/${code}`), await startPayload()));
    await bothPresent();
    const payload = await startPayload();
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...payload, startedAt: Date.now() + 60000 }));
    await assertSucceeds(set(ref(db('guest'), `rooms/${code}`), payload));
    const stored = (await get(ref(db('guest'), `rooms/${code}`))).val();
    expect(stored.startedAt).toBe(stored.turnStartedAt); expect(stored.turnDelayMs).toBe(3000);
    await assertFails(submit('host', 0, 2));
    await assertFails(readyPlayer('host'));
    await environment.withSecurityRulesDisabled(async (context) => { await set(ref(context.database(), `rooms/${code}/startedAt`), Date.now() - 4000); });
    await assertSucceeds(submit('host', 0, 2));
    await assertFails(set(ref(db('host'), `rooms/${code}/startedAt`), serverTimestamp()));
  });
  it('accepts just one competing start and cannot restart a live game', async () => {
    await joinOnly(); await bothPresent(); await readyPlayer('host'); await readyPlayer('guest');
    const payload = await startPayload();
    const results = await Promise.allSettled(['host', 'guest'].map((uid) => set(ref(db(uid), `rooms/${code}`), payload)));
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    await assertFails(set(ref(db('host'), `rooms/${code}`), payload));
  });
  it('rejects pre-started rooms and pre-filled readiness on creation', async () => {
    await remove(ref(db('host'), `rooms/${code}`));
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...room(), startedAt: serverTimestamp() }));
    await assertFails(set(ref(db('host'), `rooms/${code}`), { ...room(), ready: { host: true } }));
  });
  it('preserves existing protocol-two joins, moves, and clocks', async () => {
    const { startedAt, ...legacy } = room();
    expect(startedAt).toBe(0);
    await environment.withSecurityRulesDisabled(async (context) => { await set(ref(context.database(), `rooms/${code}`), { ...legacy, protocol: 2 }); });
    await assertSucceeds(update(ref(db('guest'), `rooms/${code}`), { guest: 'guest', guestName: 'Guest', turnStartedAt: serverTimestamp() }));
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2, finished: 0, turnStartedAt: serverTimestamp() }));
    await assertFails(readyPlayer('host'));
  });
});
