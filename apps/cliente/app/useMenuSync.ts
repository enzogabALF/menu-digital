import { useEffect, useState } from 'react';
import dbService from '@repo/database';

export function useMenuSync() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = dbService.onSync(() => {
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  return {
    tick,
    db: dbService,
  };
}
