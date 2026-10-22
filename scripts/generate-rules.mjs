import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const ids = JSON.parse(readFileSync(new URL('../src/game/ruleset.json', import.meta.url), 'utf8'));
const supported = (path) => `(${[ids.id, ids.classicId].map((id) => `${path}.val() === '${id}'`).join(' || ')})`;
const room = "root.child('rooms').child($code)";
const modern = (path) => `(${path}.child('protocol').val() === 2 || ${path}.child('protocol').val() === 3 || ${path}.child('protocol').val() === 4)`;
const started = `(${room}.child('protocol').val() < 3 || (${room}.child('startedAt').val() > 0 && now >= ${room}.child('startedAt').val()+3000))`;
const member = `auth != null && (auth.uid === ${room}.child('host').val() || auth.uid === ${room}.child('guest').val())`;
const lease = `root.child('capacity').child(${room}.child('slot').val())`;
const live = `${lease}.child('code').val() === $code && ${lease}.child('expiresAt').val() > now && ${room}.child('expiresAt').val() > now`;
const originalDeadline = `${room}.child('turnStartedAt').val() + ${room}.child('moveSeconds').val()*1000 + ${room}.child('turnDelayMs').val()`;
const v4 = `${room}.child('protocol').val() === 4`;
const r = `${room}.child('recovery')`;
const ended = `(${r}.child('endedAt').isNumber() ? ${r}.child('endedAt').val() : 0)`;
const clamp = (value, limit) => `((${value}) < (${limit}) ? (${value}) : (${limit}))`;
const duration = (end) => `(${r}.exists() ? (${r}.child('extendedBy').val() !== '' ? (${end})-${r}.child('since').val() : ${clamp(`(${end})-${r}.child('since').val()`, '90000')}) : 0)`;
const awayTimeFor = (uid) => {
  const a = `${room}.child('awayAt').child(${uid})`;
  const b = `${room}.child('backgroundAt').child(${uid})`;
  return `(${b}.val() === null ? ${a}.val() : (${a}.val() === null || ${b}.val() < ${a}.val() ? ${b}.val() : ${a}.val()))`;
};
const awayTime = (seat) => awayTimeFor(`${room}.child('${seat}').val()`);
const away = (seat) => `(${room}.child('presence').child(${room}.child('${seat}').val()).val() === false && (${awayTime(seat)}) > ${ended})`;
const firstAway = `(${away('host')} && ${away('guest')} ? ${clamp(awayTime('host'), awayTime('guest'))} : (${away('host')} ? ${awayTime('host')} : ${awayTime('guest')}))`;
// Presence timestamps are cleared before starting and on every return.
const syntheticSince = firstAway;
const recorded = `(${r}.exists() && ${r}.child('endedAt').val() === 0)`;
const hasAbsence = `(${away('host')} || ${away('guest')})`;
const active = `(${recorded} || ${hasAbsence})`;
const since = `(${recorded} ? ${r}.child('since').val() : ${syntheticSince})`;
const completed = duration(ended);
const basePaused = `${room}.child('clockPausedMs').val()`;
const accumulated = `(${basePaused} + (${recorded} ? 0 : ${completed}))`;
const extended = `(${recorded} && ${r}.child('extendedBy').val() !== '')`;
const pausedTotal = `(${recorded} ? ${basePaused}+${duration('now')} : ${basePaused}+${completed}+(${hasAbsence} ? ${clamp(`now-(${syntheticSince})`, '90000')} : 0))`;
const paused = `(${v4} && ${room}.child('startedAt').val() > 0 && ${active} && (${extended} || now < (${since})+90000))`;
const deadline = `(${originalDeadline} + (${v4} ? ${pausedTotal}-${room}.child('turnPausedBaseMs').val() : 0))`;
const timed = `${modern(room)} && ${started} && ${room}.child('moveSeconds').val() > 0 && ${room}.child('guest').val() !== ''`;
const fieldWriter = `${member} && ${live}`;
const selfPlayer = `(auth.uid === ${room}.child('host').val() ? 1 : 2)`;
const otherUid = `(auth.uid === ${room}.child('host').val() ? ${room}.child('guest').val() : ${room}.child('host').val())`;
const forfeit = `${member} && ${live} && ${v4} && ${started} && ${room}.child('finished').val() === 0`;
const resign = `${forfeit} && newData.child('resigned').val() === ${selfPlayer} && newData.child('abandoned').val() === 0 && newData.child('timeout').val() === 0 && newData.child('finished').val() === (${selfPlayer} === 1 ? 2 : 1)`;
const abandon = `${forfeit} && !${paused} && ${room}.child('presence').child(${otherUid}).val() === false && (${awayTimeFor(otherUid)}) > 0 && now >= (${awayTimeFor(otherUid)})+90000 && newData.child('abandoned').val() === (${selfPlayer} === 1 ? 2 : 1) && newData.child('resigned').val() === 0 && newData.child('timeout').val() === 0 && newData.child('finished').val() === ${selfPlayer}`;
const actor = `!${paused} && ${member} && ${supported(`${room}.child('ruleset')`)} && ${room}.child('guest').val() !== '' && ${started} && auth.uid === (${room}.child('turn').val() === 1 ? ${room}.child('host').val() : ${room}.child('guest').val()) && ${live} && (!${modern(room)} || (${room}.child('finished').val() === 0 && (${room}.child('moveSeconds').val() === 0 || now < ${deadline})))`;
const timeout = `!${paused} && ${member} && ${live} && ${timed} && ${room}.child('finished').val() === 0 && now >= ${deadline}`;
const join = `auth != null && ${room}.child('guest').val() === '' && ${room}.child('host').val() !== auth.uid && ${live}`;
const bothReady = (path) => `${path}.child('ready').child(${path}.child('host').val()).val() === true && ${path}.child('ready').child(${path}.child('guest').val()).val() === true`;
const scheduled = "newData.child('startedAt').val() === now && newData.child('turnStartedAt').val() === now && newData.child('turnDelayMs').val() === 3000";
const reset = `(data.child('protocol').val() !== 4 || (data.child('presence').child(data.child('host').val()).val() === true && data.child('presence').child(data.child('guest').val()).val() === true)) && ${member} && ${live} && ${modern('data')} && data.child('finished').val() > 0 && data.child('rematch').child(data.child('host').val()).val() === true && data.child('rematch').child(data.child('guest').val()).val() === true && newData.child('round').val() === data.child('round').val()+1 && newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('finished').val() === 0 && newData.child('timeout').val() === 0 && !newData.child('moves').exists() && !newData.child('rematch').exists() && ((data.child('protocol').val() === 2 && newData.child('turnStartedAt').val() === now && newData.child('turnDelayMs').val() === 0) || (data.child('protocol').val() >= 3 && ${scheduled} && ${bothReady('newData')}))`;
const start = `${member} && ${live} && data.child('protocol').val() >= 3 && data.child('startedAt').val() === 0 && data.child('guest').val() !== '' && ${bothReady('data')} && ${bothReady('newData')} && data.child('presence').child(data.child('host').val()).val() === true && data.child('presence').child(data.child('guest').val()).val() === true && newData.child('round').val() === data.child('round').val() && newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('finished').val() === 0 && newData.child('timeout').val() === 0 && !newData.child('moves').exists() && !newData.child('rematch').exists() && ${scheduled}`;
const oldRevision = "data.child('revision').val()";
const sameRevision = `newData.child('revision').val() === ${oldRevision} && newData.child('turn').val() === data.child('turn').val() && !newData.child('moves').child(${oldRevision}+'').exists()`;
const nextRevision = `newData.child('revision').val() === ${oldRevision}+1 && newData.child('moves').child(${oldRevision}+'').exists()`;
const initial = "newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('guest').val() === '' && !newData.child('moves').exists() && !newData.child('presence').exists()";
const newInitial = `${initial} && newData.child('protocol').val() === 4 && newData.child('startedAt').val() === 0 && !newData.child('ready').exists() && newData.child('round').val() === 0 && newData.child('guestName').val() === '' && newData.child('finished').val() === 0 && newData.child('timeout').val() === 0 && newData.child('turnStartedAt').val() === 0 && newData.child('turnDelayMs').val() === 0 && !newData.child('rematch').exists()`;
const settle = `${timeout} && newData.child('timeout').val() === data.child('turn').val() && newData.child('finished').val() === (data.child('turn').val() === 1 ? 2 : 1) && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val() && newData.child('turnDelayMs').val() === data.child('turnDelayMs').val()`;
const stable = `newData.child('turnDelayMs').val() === data.child('turnDelayMs').val() && newData.child('finished').val() === data.child('finished').val() && newData.child('timeout').val() === data.child('timeout').val() && ((data.child('guest').val() === '' && newData.child('guest').val() === auth.uid && newData.child('turnStartedAt').val() === (data.child('protocol').val() === 2 ? now : 0)) || (newData.child('guest').val() === data.child('guest').val() && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val()))`;
const move = `${actor} && ${nextRevision} && newData.child('timeout').val() === 0 && ((newData.child('turn').val() === data.child('turn').val() && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val() && newData.child('turnDelayMs').val() === data.child('turnDelayMs').val()) || (newData.child('turn').val() !== data.child('turn').val() && newData.child('turnStartedAt').val() === now && newData.child('turnDelayMs').val() === (newData.child('moves').child(data.child('revision').val()+'').child('action').child('type').val() === 'capture' ? 1800 : 0)))`;
const unchangedClock = "newData.child('turnStartedAt').val() === data.child('turnStartedAt').val() && newData.child('turnDelayMs').val() === data.child('turnDelayMs').val()";
const currentUpdate = `${sameRevision} && newData.child('startedAt').val() === data.child('startedAt').val() && newData.child('round').val() === data.child('round').val() && ((${stable}) || (${settle}) || (${unchangedClock} && ((${resign}) || (${abandon})))) || (newData.child('startedAt').val() === data.child('startedAt').val() && newData.child('round').val() === data.child('round').val() && (${move}))`;
const required = "newData.hasChildren(['ruleset','host','guest','slot','createdAt','expiresAt','revision','turn'])";
const newRequired = "newData.hasChildren(['protocol','round','hostName','guestName','moveSeconds','turnStartedAt','turnDelayMs','finished','timeout']) && (newData.child('protocol').val() < 3 || newData.child('startedAt').isNumber()) && ((newData.child('guest').val() === '' && newData.child('guestName').val() === '') || (newData.child('guest').val() !== '' && newData.child('guestName').isString() && newData.child('guestName').val().length > 0))";
const validateRoom = `${required} && ((!data.exists() && ${newRequired} && ${newInitial}) || (data.exists() && ((!data.child('protocol').exists() && !newData.child('protocol').exists() && ((${sameRevision}) || (${nextRevision}))) || (${modern('data')} && ${newRequired} && ((${currentUpdate}) || (${reset}) || (${start}))))))`;
const same = (key) => `newData.child('${key}').val() === data.child('${key}').val()`;
const sameRecovery = ['since','endedAt','extendedBy'].map((key) => `newData.child('recovery').child('${key}').val() === data.child('recovery').child('${key}').val()`).join(' && ');
const recoveryChanged = `newData.child('recovery').child('since').val() === ${since} && newData.child('clockPausedMs').val() === ${accumulated} && ${active} && ((newData.child('recovery').child('extendedBy').val() === (${recorded} ? ${r}.child('extendedBy').val() : '') && ((newData.child('recovery').child('endedAt').val() === 0 && (newData.child('presence').child(newData.child('host').val()).val() === false || newData.child('presence').child(newData.child('guest').val()).val() === false)) || (newData.child('recovery').child('endedAt').val() === now && ((newData.child('presence').child(newData.child('host').val()).val() === true && newData.child('presence').child(newData.child('guest').val()).val() === true) || ${r}.child('extendedBy').val() === auth.uid)))) || (newData.child('recovery').child('extendedBy').val() === auth.uid && newData.child('recovery').child('endedAt').val() === 0 && !${extended} && now < (${since})+90000 && ${room}.child('presence').child(${otherUid}).val() === false))`;
const noGameChanges = ['ruleset','host','guest','slot','createdAt','expiresAt','protocol','round','hostName','guestName','moveSeconds','turnStartedAt','turnDelayMs','finished','timeout','startedAt','revision','turn','resigned','abandoned','turnPausedBaseMs'].map(same).concat(['ready','rematch'].flatMap((key) => ['host','guest'].map((seat) => `newData.child('${key}').child(data.child('${seat}').val()).val() === data.child('${key}').child(data.child('${seat}').val()).val()`))).join(' && ');
const otherPresence = `newData.child('presence').child(${otherUid}).val() === data.child('presence').child(${otherUid}).val() && newData.child('awayAt').child(${otherUid}).val() === data.child('awayAt').child(${otherUid}).val() && newData.child('backgroundAt').child(${otherUid}).val() === data.child('backgroundAt').child(${otherUid}).val()`;
const sync = `${member} && ${live} && ${v4} && ${noGameChanges} && ${otherPresence} && newData.child('presence').child(auth.uid).val() === true && ((${sameRecovery} && ${same('clockPausedMs')}) || (${recoveryChanged}))`;
const clean = "newData.child('clockPausedMs').val() === 0 && newData.child('turnPausedBaseMs').val() === 0 && newData.child('resigned').val() === 0 && newData.child('abandoned').val() === 0 && !newData.child('recovery').exists() && !newData.child('awayAt').exists() && !newData.child('backgroundAt').exists()";
const accounting = `newData.child('protocol').val() !== 4 || ((!data.exists() && ${clean}) || (data.exists() && ((${reset} && ${clean}) || (newData.child('round').val() === data.child('round').val() && ((${sameRecovery} && ${same('clockPausedMs')}) || (${sync})) && ((newData.child('turn').val() === data.child('turn').val() && ${same('turnPausedBaseMs')}) || (newData.child('turn').val() !== data.child('turn').val() && newData.child('turnPausedBaseMs').val() === ${pausedTotal})) && ((${same('resigned')} && ${same('abandoned')}) || (${resign}) || (${abandon}))))))`;
const nameRule = "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20 && newData.val().matches(/.*[^ ].*/)";
const point = { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 24 && newData.val() % 1 === 0' };

const rules = { rules: {
  '.read': false, '.write': false,
  capacity: { '$slot': {
    '.read': "auth != null && (!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now || root.child('rooms').child(data.child('code').val()).child('guest').val() === auth.uid)",
    '.write': "auth != null && $slot.matches(/^([0-9]|[12][0-9]|3[0-9])$/) && ((!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now) || (newData.exists() && root.child('rooms').child(data.child('code').val()).child('guest').val() === auth.uid && root.child('rooms').child(data.child('code').val()).child('expiresAt').val() > now && newData.child('uid').val() === data.child('uid').val() && newData.child('code').val() === data.child('code').val()))",
    '.validate': "newData.hasChildren(['uid','code','expiresAt']) && (newData.child('uid').val() === auth.uid || (newData.child('uid').val() === data.child('uid').val() && root.child('rooms').child(data.child('code').val()).child('guest').val() === auth.uid)) && newData.child('expiresAt').isNumber() && newData.child('expiresAt').val() > now && newData.child('expiresAt').val() <= now + 300000 && (!data.exists() || data.child('expiresAt').val() <= now || newData.child('code').val() === data.child('code').val())",
    uid: { '.validate': 'newData.isString()' },
    code: { '.validate': 'newData.isString() && newData.val().matches(/^[A-HJ-NP-Z2-9]{8}$/)' },
    expiresAt: { '.validate': 'newData.isNumber()' }, '$other': { '.validate': false },
  } },
  rooms: { '$code': {
    '.read': 'auth != null',
    '.write': `auth != null && ((!data.exists() && newData.exists() && newData.child('host').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('uid').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('code').val() === $code && root.child('capacity').child(newData.child('slot').val()).child('expiresAt').val() > now) || (data.exists() && !newData.exists() && (data.child('host').val() === auth.uid || root.child('capacity').child(data.child('slot').val()).child('code').val() !== $code || data.child('expiresAt').val() <= now)) || (data.exists() && newData.exists() && ((${reset}) || (${start}))))`,
    '.validate': `(${validateRoom}) && (${accounting})`,
    ruleset: { '.validate': `${supported('newData')} && (!data.exists() || newData.val() === data.val())` },
    host: { '.validate': "newData.isString() && ((!data.exists() && newData.val() === auth.uid) || newData.val() === data.val())" },
    slot: { '.validate': "newData.isString() && newData.val().matches(/^([0-9]|[12][0-9]|3[0-9])$/) && (!data.exists() || newData.val() === data.val())" },
    createdAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 10000 && newData.val() >= now - 60000) || newData.val() === data.val())' },
    expiresAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 7200000 && newData.val() > now) || newData.val() === data.val())' },
    protocol: { '.validate': '(newData.val() === 2 || newData.val() === 3 || newData.val() === 4) && (!data.exists() || newData.val() === data.val())' },
    startedAt: { '.validate': "newData.isNumber() && newData.val() >= 0 && newData.parent().child('protocol').val() >= 3" },
    ready: { '$uid': { '.write': `${member} && ${live} && ${room}.child('protocol').val() >= 3 && ${room}.child('startedAt').val() === 0 && auth.uid === $uid && newData.val() === true`, '.validate': "newData.val() === true && ($uid === newData.parent().parent().child('host').val() || $uid === newData.parent().parent().child('guest').val())" } },
    round: { '.write': fieldWriter, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0 && (!data.exists() || newData.val() === data.val() || newData.val() === data.val()+1)' },
    hostName: { '.validate': `${nameRule} && (!data.exists() || newData.val() === data.val())` },
    guestName: { '.write': join, '.validate': `newData.isString() && ((newData.val() === '' && newData.parent().child('guest').val() === '') || (${nameRule} && newData.parent().child('guest').val() !== '' && (data.parent().child('guest').val() === '' || newData.val() === data.val())))` },
    moveSeconds: { '.validate': '(newData.val() === 0 || newData.val() === 30 || newData.val() === 60 || newData.val() === 120) && (!data.exists() || newData.val() === data.val())' },
    turnDelayMs: { '.write': fieldWriter, '.validate': "newData.val() === 0 || newData.val() === 1800 || (newData.val() === 3000 && newData.parent().child('protocol').val() >= 3)" },
    turnStartedAt: { '.write': `(${fieldWriter}) || (${join})`, '.validate': 'newData.isNumber() && newData.val() >= 0' },
    finished: { '.write': fieldWriter, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2 || newData.val() === 3' },
    timeout: { '.write': fieldWriter, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2' },
    guest: { '.write': `${join} && newData.val() === auth.uid`, '.validate': "newData.isString() && (!data.exists() || data.val() === '' || newData.val() === data.val())" },
    revision: { '.write': fieldWriter, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0 && newData.val() <= 2000' },
    turn: { '.write': fieldWriter, '.validate': 'newData.val() === 1 || newData.val() === 2' },
    moves: { '$index': {
      '.write': `${fieldWriter} && !data.exists() && newData.exists() && $index === ${room}.child('revision').val()+''`,
      '.validate': "newData.hasChildren(['uid','action']) && newData.child('uid').val() === auth.uid && ((!data.exists() && $index === data.parent().parent().child('revision').val()+'') || (data.exists() && newData.child('uid').val() === data.child('uid').val() && newData.child('action').child('type').val() === data.child('action').child('type').val() && newData.child('action').child('from').val() === data.child('action').child('from').val() && newData.child('action').child('to').val() === data.child('action').child('to').val() && newData.child('action').child('at').val() === data.child('action').child('at').val()))",
      uid: { '.validate': 'newData.val() === auth.uid' },
      action: {
        '.validate': "(newData.child('type').val() === 'place' && newData.hasChildren(['to']) && !newData.child('from').exists() && !newData.child('at').exists()) || (newData.child('type').val() === 'move' && newData.hasChildren(['from','to']) && !newData.child('at').exists()) || (newData.child('type').val() === 'capture' && newData.hasChildren(['at']) && !newData.child('to').exists() && !newData.child('from').exists())",
        type: { '.validate': "newData.val() === 'place' || newData.val() === 'move' || newData.val() === 'capture'" },
        from: point, to: point, at: point, '$other': { '.validate': false },
      }, '$other': { '.validate': false },
    } },
    rematch: { '$uid': { '.write': `${member} && ${live} && auth.uid === $uid && ${modern(room)} && ${room}.child('finished').val() > 0 && newData.val() === true`, '.validate': 'newData.val() === true' } },
    clockPausedMs: { '.write': fieldWriter, '.validate': 'newData.isNumber() && newData.val() >= 0' },
    turnPausedBaseMs: { '.write': fieldWriter, '.validate': 'newData.isNumber() && newData.val() >= 0' },
    resigned: { '.write': fieldWriter, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2' },
    abandoned: { '.write': fieldWriter, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2' },
    awayAt: { '$uid': { '.write': `${member} && auth.uid === $uid && ${v4} && (newData.val() === now || (!newData.exists() && newData.parent().parent().child('presence').child($uid).val() === true))`, '.validate': 'newData.isNumber() && newData.val() === now' } },
    backgroundAt: { '$uid': { '.write': `${member} && auth.uid === $uid && ${v4} && (newData.val() === now || (!newData.exists() && newData.parent().parent().child('presence').child($uid).val() === true))`, '.validate': 'newData.isNumber() && newData.val() === now' } },
    recovery: {
      '.write': fieldWriter,
      '.validate': "newData.hasChildren(['since','endedAt','extendedBy'])",
      since: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= now + 3000' },
      endedAt: { '.validate': "newData.isNumber() && (newData.val() === 0 || (newData.val() >= newData.parent().child('since').val() && newData.val() <= now))" },
      extendedBy: { '.validate': "newData.isString() && (newData.val() === '' || newData.val() === newData.parent().parent().child('host').val() || newData.val() === newData.parent().parent().child('guest').val())" },
      '$other': { '.validate': false },
    },
    presence: { '$uid': { '.write': `${member} && auth.uid === $uid`, '.validate': "newData.isBoolean() && ($uid === newData.parent().parent().child('host').val() || $uid === newData.parent().parent().child('guest').val())" } },
    '$other': { '.validate': false },
  } },
} };
mkdirSync('firebase', { recursive: true });
writeFileSync('firebase/database.rules.json', `${JSON.stringify(rules, null, 2)}\n`);
