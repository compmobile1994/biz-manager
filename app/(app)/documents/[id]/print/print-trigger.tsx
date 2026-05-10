'use client';

import { useEffect } from 'react';

export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
