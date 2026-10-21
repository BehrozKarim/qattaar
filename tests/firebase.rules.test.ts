import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, runTransaction, set, update } from 'firebase/database';
import { RULESET } from '../src/game/engine';
import { VARIANTS } from '../src/game/variants';

let environment: RulesTestEnvironment;
const code = 'ABCDEFGH';
const lease = (uid = 'host', roomCode = code) => ({ uid, code: roomCode, expiresAt: Date.now() + 110_000 });
const room = () => ({ ruleset: RULESET, host: 'host', guest: '', slot: '0', createdAt: Date.now(), expiresAt: Date.now() + 7_000_000, revision: 0, turn: 1 });
const db = (uid: string) => environment.authenticatedContext(uid).database();

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-qattaar', database: { host: '127.0.0.1', port: 9000, rules: readFileSync('firebase/database.rules.json', 'utf8') } }); });
beforeEach(async () => { await environment.clearDatabase(); });
afterAll(async () => { await environment?.cleanup(); });

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
    await set(ref(db('guest'), `rooms/${code}/guest`), 'guest');
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2 }));
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
    await assertSucceeds(runTransaction(ref(db('guest'), `rooms/${code}/guest`), () => 'guest'));
    await assertFails(set(ref(db('third'), `rooms/${code}/guest`), 'third'));
  });
  it('atomically accepts one winner of competing guest joins', async () => {
    const results = await Promise.allSettled(['guestA', 'guestB'].map((uid) => set(ref(db(uid), `rooms/${code}/guest`), uid)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
  it('rejects moves before a guest joins, out-of-turn moves, and outsiders', async () => {
    const move = { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2 };
    await assertFails(update(ref(db('host'), `rooms/${code}`), move));
    await set(ref(db('guest'), `rooms/${code}/guest`), 'guest');
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { ...move, 'moves/0': { uid: 'guest', action: { type: 'place', to: 0 } } }));
    await assertFails(update(ref(db('outsider'), `rooms/${code}`), move));
    await assertSucceeds(update(ref(db('host'), `rooms/${code}`), move));
    await assertFails(update(ref(db('host'), `rooms/${code}`), move));
  });
  it('rejects tampering with old moves, metadata, and unknown fields', async () => {
    await set(ref(db('guest'), `rooms/${code}/guest`), 'guest');
    await update(ref(db('host'), `rooms/${code}`), { 'moves/0': { uid: 'host', action: { type: 'place', to: 0 } }, revision: 1, turn: 2 });
    await assertFails(set(ref(db('guest'), `rooms/${code}/host`), 'guest'));
    await assertFails(set(ref(db('host'), `rooms/${code}/ruleset`), 'morris-flying'));
    await assertFails(set(ref(db('host'), `rooms/${code}/ruleset`), VARIANTS.classic.ruleset));
    await assertFails(remove(ref(db('host'), `rooms/${code}/ruleset`)));
    await assertFails(set(ref(db('host'), `rooms/${code}/unexpected`), true));
    await assertFails(remove(ref(db('guest'), `rooms/${code}/moves/0`)));
    await assertFails(update(ref(db('guest'), `rooms/${code}`), { 'moves/0/action/to': 10, 'moves/1': { uid: 'guest', action: { type: 'place', to: 3 } }, revision: 2, turn: 1 }));
  });
  it('requires the move and revision to change together', async () => {
    await set(ref(db('guest'), `rooms/${code}/guest`), 'guest');
    await assertFails(set(ref(db('host'), `rooms/${code}/revision`), 1));
    await assertFails(set(ref(db('host'), `rooms/${code}/moves/0`), { uid: 'host', action: { type: 'place', to: 0 } }));
  });
  it('allows only members to write their own presence', async () => {
    await assertSucceeds(set(ref(db('host'), `rooms/${code}/presence/host`), true));
    await assertFails(set(ref(db('outsider'), `rooms/${code}/presence/outsider`), true));
    await assertFails(set(ref(db('host'), `rooms/${code}/presence/guest`), false));
  });
});
