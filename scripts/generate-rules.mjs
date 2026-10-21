import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const ids = JSON.parse(readFileSync(new URL('../src/game/ruleset.json', import.meta.url), 'utf8'));
const supported = (path) => `(${[ids.id, ids.classicId].map((id) => `${path}.val() === '${id}'`).join(' || ')})`;
const room = "root.child('rooms').child($code)";
const member = `auth != null && (auth.uid === ${room}.child('host').val() || auth.uid === ${room}.child('guest').val())`;
const lease = `root.child('capacity').child(${room}.child('slot').val())`;
const live = `${lease}.child('code').val() === $code && ${lease}.child('expiresAt').val() > now && ${room}.child('expiresAt').val() > now`;
const deadline = `${room}.child('turnStartedAt').val() + ${room}.child('moveSeconds').val()*1000 + ${room}.child('turnDelayMs').val()`;
const timed = `${room}.child('protocol').val() === 2 && ${room}.child('moveSeconds').val() > 0 && ${room}.child('guest').val() !== ''`;
const actor = `${member} && ${supported(`${room}.child('ruleset')`)} && ${room}.child('guest').val() !== '' && auth.uid === (${room}.child('turn').val() === 1 ? ${room}.child('host').val() : ${room}.child('guest').val()) && ${live} && (${room}.child('protocol').val() !== 2 || (${room}.child('finished').val() === 0 && (${room}.child('moveSeconds').val() === 0 || now < ${deadline})))`;
const timeout = `${member} && ${live} && ${timed} && ${room}.child('finished').val() === 0 && now >= ${deadline}`;
const join = `auth != null && ${room}.child('guest').val() === '' && ${room}.child('host').val() !== auth.uid && ${live}`;
const reset = `${member} && ${live} && data.child('protocol').val() === 2 && data.child('finished').val() > 0 && data.child('rematch').child(data.child('host').val()).val() === true && data.child('rematch').child(data.child('guest').val()).val() === true && newData.child('round').val() === data.child('round').val()+1 && newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('finished').val() === 0 && newData.child('timeout').val() === 0 && !newData.child('moves').exists() && !newData.child('rematch').exists() && newData.child('turnStartedAt').val() === now && newData.child('turnDelayMs').val() === 0`;
const oldRevision = "data.child('revision').val()";
const sameRevision = `newData.child('revision').val() === ${oldRevision} && newData.child('turn').val() === data.child('turn').val() && !newData.child('moves').child(${oldRevision}+'').exists()`;
const nextRevision = `newData.child('revision').val() === ${oldRevision}+1 && newData.child('moves').child(${oldRevision}+'').exists()`;
const initial = "newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('guest').val() === '' && !newData.child('moves').exists() && !newData.child('presence').exists()";
const newInitial = `${initial} && newData.child('protocol').val() === 2 && newData.child('round').val() === 0 && newData.child('guestName').val() === '' && newData.child('finished').val() === 0 && newData.child('timeout').val() === 0 && newData.child('turnStartedAt').val() === 0 && newData.child('turnDelayMs').val() === 0 && !newData.child('rematch').exists()`;
const settle = `${timeout} && newData.child('timeout').val() === data.child('turn').val() && newData.child('finished').val() === (data.child('turn').val() === 1 ? 2 : 1) && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val() && newData.child('turnDelayMs').val() === data.child('turnDelayMs').val()`;
const stable = `newData.child('turnDelayMs').val() === data.child('turnDelayMs').val() && newData.child('finished').val() === data.child('finished').val() && newData.child('timeout').val() === data.child('timeout').val() && ((data.child('guest').val() === '' && newData.child('guest').val() === auth.uid && newData.child('turnStartedAt').val() === now) || (newData.child('guest').val() === data.child('guest').val() && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val()))`;
const move = `${actor} && ${nextRevision} && newData.child('timeout').val() === 0 && ((newData.child('turn').val() === data.child('turn').val() && newData.child('turnStartedAt').val() === data.child('turnStartedAt').val() && newData.child('turnDelayMs').val() === data.child('turnDelayMs').val()) || (newData.child('turn').val() !== data.child('turn').val() && newData.child('turnStartedAt').val() === now && newData.child('turnDelayMs').val() === (newData.child('moves').child(data.child('revision').val()+'').child('action').child('type').val() === 'capture' ? 1800 : 0)))`;
const currentUpdate = `newData.child('round').val() === data.child('round').val() && ((${sameRevision} && ((${stable}) || (${settle}))) || (${move}))`;
const required = "newData.hasChildren(['ruleset','host','guest','slot','createdAt','expiresAt','revision','turn'])";
const newRequired = "newData.hasChildren(['protocol','round','hostName','guestName','moveSeconds','turnStartedAt','turnDelayMs','finished','timeout']) && ((newData.child('guest').val() === '' && newData.child('guestName').val() === '') || (newData.child('guest').val() !== '' && newData.child('guestName').isString() && newData.child('guestName').val().length > 0))";
const validateRoom = `${required} && ((!data.exists() && ${newRequired} && ${newInitial}) || (data.exists() && ((data.child('protocol').val() !== 2 && !newData.child('protocol').exists() && ((${sameRevision}) || (${nextRevision}))) || (data.child('protocol').val() === 2 && ${newRequired} && ((${currentUpdate}) || (${reset}))))))`;
const nameRule = "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20 && newData.val().matches(/.*[^ ].*/)";
const point = { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 24 && newData.val() % 1 === 0' };

const rules = { rules: {
  '.read': false, '.write': false,
  capacity: { '$slot': {
    '.read': "auth != null && (!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now)",
    '.write': "auth != null && $slot.matches(/^([0-9]|[12][0-9]|3[0-9])$/) && (!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now)",
    '.validate': "newData.hasChildren(['uid','code','expiresAt']) && newData.child('uid').val() === auth.uid && newData.child('expiresAt').isNumber() && newData.child('expiresAt').val() > now && newData.child('expiresAt').val() <= now + 120000 && (!data.exists() || data.child('expiresAt').val() <= now || newData.child('code').val() === data.child('code').val())",
    uid: { '.validate': 'newData.isString()' },
    code: { '.validate': 'newData.isString() && newData.val().matches(/^[A-HJ-NP-Z2-9]{8}$/)' },
    expiresAt: { '.validate': 'newData.isNumber()' }, '$other': { '.validate': false },
  } },
  rooms: { '$code': {
    '.read': 'auth != null',
    '.write': `auth != null && ((!data.exists() && newData.exists() && newData.child('host').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('uid').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('code').val() === $code && root.child('capacity').child(newData.child('slot').val()).child('expiresAt').val() > now) || (data.exists() && !newData.exists() && (data.child('host').val() === auth.uid || root.child('capacity').child(data.child('slot').val()).child('code').val() !== $code || data.child('expiresAt').val() <= now)) || (data.exists() && newData.exists() && (${reset})))`,
    '.validate': validateRoom,
    ruleset: { '.validate': `${supported('newData')} && (!data.exists() || newData.val() === data.val())` },
    host: { '.validate': "newData.isString() && ((!data.exists() && newData.val() === auth.uid) || newData.val() === data.val())" },
    slot: { '.validate': "newData.isString() && newData.val().matches(/^([0-9]|[12][0-9]|3[0-9])$/) && (!data.exists() || newData.val() === data.val())" },
    createdAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 10000 && newData.val() >= now - 60000) || newData.val() === data.val())' },
    expiresAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 7200000 && newData.val() > now) || newData.val() === data.val())' },
    protocol: { '.validate': 'newData.val() === 2 && (!data.exists() || newData.val() === data.val())' },
    round: { '.write': `(${actor}) || (${timeout})`, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0 && (!data.exists() || newData.val() === data.val() || newData.val() === data.val()+1)' },
    hostName: { '.validate': `${nameRule} && (!data.exists() || newData.val() === data.val())` },
    guestName: { '.write': join, '.validate': `newData.isString() && ((newData.val() === '' && newData.parent().child('guest').val() === '') || (${nameRule} && newData.parent().child('guest').val() !== '' && (data.parent().child('guest').val() === '' || newData.val() === data.val())))` },
    moveSeconds: { '.validate': '(newData.val() === 0 || newData.val() === 30 || newData.val() === 60 || newData.val() === 120) && (!data.exists() || newData.val() === data.val())' },
    turnDelayMs: { '.write': actor, '.validate': 'newData.val() === 0 || newData.val() === 1800' },
    turnStartedAt: { '.write': `(${actor}) || (${join})`, '.validate': 'newData.isNumber() && newData.val() >= 0' },
    finished: { '.write': `(${actor}) || (${timeout})`, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2 || newData.val() === 3' },
    timeout: { '.write': timeout, '.validate': 'newData.val() === 0 || newData.val() === 1 || newData.val() === 2' },
    guest: { '.write': `${join} && newData.val() === auth.uid`, '.validate': "newData.isString() && (!data.exists() || data.val() === '' || newData.val() === data.val())" },
    revision: { '.write': actor, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0 && newData.val() <= 2000' },
    turn: { '.write': actor, '.validate': 'newData.val() === 1 || newData.val() === 2' },
    moves: { '$index': {
      '.write': `${actor} && !data.exists() && newData.exists() && $index === ${room}.child('revision').val()+''`,
      '.validate': "newData.hasChildren(['uid','action']) && newData.child('uid').val() === auth.uid",
      uid: { '.validate': 'newData.val() === auth.uid' },
      action: {
        '.validate': "(newData.child('type').val() === 'place' && newData.hasChildren(['to']) && !newData.child('from').exists() && !newData.child('at').exists()) || (newData.child('type').val() === 'move' && newData.hasChildren(['from','to']) && !newData.child('at').exists()) || (newData.child('type').val() === 'capture' && newData.hasChildren(['at']) && !newData.child('to').exists() && !newData.child('from').exists())",
        type: { '.validate': "newData.val() === 'place' || newData.val() === 'move' || newData.val() === 'capture'" },
        from: point, to: point, at: point, '$other': { '.validate': false },
      }, '$other': { '.validate': false },
    } },
    rematch: { '$uid': { '.write': `${member} && ${live} && auth.uid === $uid && ${room}.child('protocol').val() === 2 && ${room}.child('finished').val() > 0 && newData.val() === true`, '.validate': 'newData.val() === true' } },
    presence: { '$uid': { '.write': `${member} && auth.uid === $uid`, '.validate': 'newData.isBoolean()' } },
    '$other': { '.validate': false },
  } },
} };
mkdirSync('firebase', { recursive: true });
writeFileSync('firebase/database.rules.json', `${JSON.stringify(rules, null, 2)}\n`);
