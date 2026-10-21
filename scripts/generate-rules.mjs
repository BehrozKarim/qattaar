import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const ruleset = JSON.parse(readFileSync(new URL('../src/game/ruleset.json', import.meta.url), 'utf8')).id;

// Generate repeated policy expressions once; commit the deployable JSON artifact.
const room = "root.child('rooms').child($code)";
const member = `auth != null && (auth.uid === ${room}.child('host').val() || auth.uid === ${room}.child('guest').val())`;
const lease = `root.child('capacity').child(${room}.child('slot').val())`;
const actor = `${member} && ${room}.child('ruleset').val() === '${ruleset}' && ${room}.child('guest').val() !== '' && auth.uid === (${room}.child('turn').val() === 1 ? ${room}.child('host').val() : ${room}.child('guest').val()) && ${lease}.child('code').val() === $code && ${lease}.child('expiresAt').val() > now && ${room}.child('expiresAt').val() > now`;
const integerPoint = { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 24 && newData.val() % 1 === 0' };
const rules = {
  rules: {
    '.read': false, '.write': false,
    capacity: {
      '$slot': {
        '.read': "auth != null && (!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now)",
        '.write': "auth != null && $slot.matches(/^([0-9]|[12][0-9]|3[0-9])$/) && (!data.exists() || data.child('uid').val() === auth.uid || data.child('expiresAt').val() <= now)",
        '.validate': "newData.hasChildren(['uid','code','expiresAt']) && newData.child('uid').val() === auth.uid && newData.child('expiresAt').isNumber() && newData.child('expiresAt').val() > now && newData.child('expiresAt').val() <= now + 120000 && (!data.exists() || data.child('expiresAt').val() <= now || newData.child('code').val() === data.child('code').val())",
        uid: { '.validate': 'newData.isString()' },
        code: { '.validate': 'newData.isString() && newData.val().matches(/^[A-HJ-NP-Z2-9]{8}$/)' },
        expiresAt: { '.validate': 'newData.isNumber()' },
        '$other': { '.validate': false },
      },
    },
    rooms: {
      '$code': {
        '.read': 'auth != null',
        '.write': "auth != null && ((!data.exists() && newData.exists() && newData.child('host').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('uid').val() === auth.uid && root.child('capacity').child(newData.child('slot').val()).child('code').val() === $code && root.child('capacity').child(newData.child('slot').val()).child('expiresAt').val() > now) || (data.exists() && !newData.exists() && (data.child('host').val() === auth.uid || root.child('capacity').child(data.child('slot').val()).child('code').val() !== $code || data.child('expiresAt').val() <= now)))",
        '.validate': "newData.hasChildren(['ruleset','host','guest','slot','createdAt','expiresAt','revision','turn']) && ((!data.exists() && newData.child('revision').val() === 0 && newData.child('turn').val() === 1 && newData.child('guest').val() === '' && !newData.child('moves').exists() && !newData.child('presence').exists()) || (data.exists() && ((newData.child('revision').val() === data.child('revision').val() && newData.child('turn').val() === data.child('turn').val() && !newData.child('moves').child(data.child('revision').val()+'').exists()) || (newData.child('revision').val() === data.child('revision').val()+1 && newData.child('moves').child(data.child('revision').val()+'').exists()))))",
        ruleset: { '.validate': `newData.val() === '${ruleset}' && (!data.exists() || newData.val() === data.val())` },
        host: { '.validate': "newData.isString() && ((!data.exists() && newData.val() === auth.uid) || newData.val() === data.val())" },
        slot: { '.validate': 'newData.isString() && newData.val().matches(/^([0-9]|[12][0-9]|3[0-9])$/) && (!data.exists() || newData.val() === data.val())' },
        createdAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 10000 && newData.val() >= now - 60000) || newData.val() === data.val())' },
        expiresAt: { '.validate': 'newData.isNumber() && ((!data.exists() && newData.val() <= now + 7200000 && newData.val() > now) || newData.val() === data.val())' },
        guest: {
          '.write': `auth != null && data.val() === '' && newData.val() === auth.uid && ${room}.child('host').val() !== auth.uid && ${lease}.child('code').val() === $code && ${lease}.child('expiresAt').val() > now && ${room}.child('expiresAt').val() > now`,
          '.validate': "newData.isString() && (!data.exists() || data.val() === '' || newData.val() === data.val())",
        },
        revision: { '.write': actor, '.validate': 'newData.isNumber() && newData.val() % 1 === 0 && newData.val() <= 2000 && (!data.exists() || newData.val() === data.val()+1)' },
        turn: { '.write': actor, '.validate': 'newData.val() === 1 || newData.val() === 2' },
        moves: {
          '$index': {
            '.write': `${actor} && !data.exists() && newData.exists() && $index === ${room}.child('revision').val()+''`,
            '.validate': "newData.hasChildren(['uid','action']) && newData.child('uid').val() === auth.uid",
            uid: { '.validate': 'newData.val() === auth.uid' },
            action: {
              '.validate': "(newData.child('type').val() === 'place' && newData.hasChildren(['to']) && !newData.child('from').exists() && !newData.child('at').exists()) || (newData.child('type').val() === 'move' && newData.hasChildren(['from','to']) && !newData.child('at').exists()) || (newData.child('type').val() === 'capture' && newData.hasChildren(['at']) && !newData.child('to').exists() && !newData.child('from').exists())",
              type: { '.validate': "newData.val() === 'place' || newData.val() === 'move' || newData.val() === 'capture'" },
              from: integerPoint, to: integerPoint, at: integerPoint, '$other': { '.validate': false },
            },
            '$other': { '.validate': false },
          },
        },
        presence: {
          '$uid': { '.write': `${member} && auth.uid === $uid`, '.validate': 'newData.isBoolean()' },
        },
        '$other': { '.validate': false },
      },
    },
  },
};
mkdirSync('firebase', { recursive: true });
writeFileSync('firebase/database.rules.json', `${JSON.stringify(rules, null, 2)}\n`);
