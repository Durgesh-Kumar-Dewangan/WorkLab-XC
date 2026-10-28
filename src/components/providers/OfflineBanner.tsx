'use client';

import { useEffect, useState } from 'react';

/** Tells people when they lose their connection, and that unsaved work in forms is kept until it returns. */
export function OfflineBanner() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const set = () => setOff(!navigator.onLine);
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => {
      window.removeEventListener('online', set);
      window.removeEventListener('offline', set);
    };
  }, []);
  return off ? (
    <div className="offline-bar" role="status">
      You are offline. Changes will not save until your connection returns.
    </div>
  ) : null;
}
