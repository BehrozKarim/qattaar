import { useEffect, useState } from 'react';
import { validName } from '../multiplayer/room';

const KEY = 'qattaar.player-name.v1';
const adjectives = ['Calm', 'Clever', 'Swift', 'Brave', 'Nimble', 'Quiet', 'Merry', 'Keen'];
const animals = ['Falcon', 'Ibex', 'Fox', 'Dolphin', 'Otter', 'Wolf', 'Owl', 'Gazelle'];
export function randomPlayerName() {
  const [a, b, n] = crypto.getRandomValues(new Uint8Array(3));
  return `${adjectives[a % adjectives.length]} ${animals[b % animals.length]} ${n % 100}`;
}
function restoreName() {
  try { const saved = localStorage.getItem(KEY); if (validName(saved)) return saved; } catch { /* A nickname still works without storage. */ }
  return randomPlayerName();
}
export function usePlayerName() {
  const [name, setName] = useState(restoreName);
  useEffect(() => { if (validName(name)) { try { localStorage.setItem(KEY, name.trim()); } catch { /* Optional persistence. */ } } }, [name]);
  return { name, setName, randomize: () => setName(randomPlayerName()) };
}
