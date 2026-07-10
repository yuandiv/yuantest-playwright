import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { LLMStatus } from '../types';
import * as api from '../services/api';

interface LLMStatusContextValue {
  status: LLMStatus | null;
  refresh: () => Promise<void>;
}

const LLMStatusContext = createContext<LLMStatusContextValue>({
  status: null,
  refresh: async () => {},
});

export function LLMStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LLMStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getLLMStatus();
      if (s) setStatus(s);
    } catch {
      // 静默处理
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <LLMStatusContext.Provider value={{ status, refresh }}>
      {children}
    </LLMStatusContext.Provider>
  );
}

export function useLLMStatus(): LLMStatusContextValue {
  return useContext(LLMStatusContext);
}
