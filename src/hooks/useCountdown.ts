import { useEffect, useState } from 'react';

/** Refresh locally until a server-scheduled start; no database polling. */
export function useCountdown(startsAt: number | null, serverOffset: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startsAt === null) return;
    const interval = setInterval(() => {
      const time = Date.now(); setNow(time);
      if (time + serverOffset >= startsAt) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [startsAt, serverOffset]);
  return startsAt === null ? 0 : Math.min(3, Math.max(0, Math.ceil((startsAt - now - serverOffset) / 1000)));
}
