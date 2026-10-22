import type { StoredRoom } from './room';

export const RECONNECT_GRACE_MS = 90_000;
export interface Recovery { since: number; endedAt: number; extendedBy: string }

/** Backgrounding can precede Firebase detecting the network drop. Keep the first time. */
export function absenceTime(room: StoredRoom, uid: string): number {
  const times = [room.awayAt?.[uid], room.backgroundAt?.[uid]].filter((time): time is number => typeof time === 'number' && time > 0);
  return times.length ? Math.min(...times) : 0;
}

export function recoveryDuration(recovery?: Recovery, now = Date.now()): number {
  if (!recovery) return 0;
  const elapsed = Math.max(0, (recovery.endedAt || now) - recovery.since);
  return recovery.extendedBy ? elapsed : Math.min(RECONNECT_GRACE_MS, elapsed);
}

/** Merge overlapping absences into one clock pause, including when both phones sleep. */
export function recoveryState(room: StoredRoom, now = Date.now()) {
  let recovery = room.recovery;
  let accumulated = room.clockPausedMs ?? 0;
  if (room.protocol !== 4 || !room.startedAt || room.finished) return { recovery: undefined, accumulated, total: accumulated, paused: false, graceUntil: null };
  if (!recovery || recovery.endedAt) {
    const absences = [room.host, room.guest].filter((uid) => uid && room.presence?.[uid] === false && absenceTime(room, uid) > (recovery?.endedAt ?? 0));
    if (absences.length) {
      accumulated += recoveryDuration(recovery, now);
      recovery = { since: Math.max(room.startedAt ?? 0, Math.min(...absences.map((uid) => absenceTime(room, uid)))), endedAt: 0, extendedBy: '' };
    }
  }
  const active = Boolean(recovery && !recovery.endedAt);
  const graceUntil = active ? recovery!.since + RECONNECT_GRACE_MS : null;
  return { recovery, accumulated, total: accumulated + recoveryDuration(recovery, now), paused: Boolean(active && (recovery!.extendedBy || now < recovery!.since + RECONNECT_GRACE_MS)), graceUntil };
}
