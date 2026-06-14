import { useEffect, useState } from 'react';
import dbService from '@repo/database';

export function useMenuSync() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Sincronización local en el mismo origen (pestañas del mismo puerto)
    const unsub = dbService.onSync(() => {
      setTick((t) => t + 1);
    });

    // Polling cada 2 segundos para sincronizar cambios cruzados entre puertos (3001, 3002, 3003)
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return {
    tick,
    db: dbService,
  };
}
