'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ToastContainer } from './Toast';

type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Entry {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}
interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/** Mount once near the root of a section; `useToast()` then works anywhere below it. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Entry[]>([]);
  const remove = useCallback((id: string) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Errors stay longer: they usually need reading twice.
    setItems((xs) => [...xs.slice(-3), { id, message, type, duration: type === 'error' ? 8000 : 4000 }]);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <ToastContainer toasts={items} onRemove={remove} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  // Outside a provider, fail soft: do nothing rather than crash the page.
  return v ?? { toast: () => undefined };
}
