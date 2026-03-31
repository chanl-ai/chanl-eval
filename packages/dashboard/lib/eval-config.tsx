'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { EvalClient } from '@chanl/eval-sdk';

const STORAGE_BASE = 'chanl-eval-base-url';
const STORAGE_KEY = 'chanl-eval-api-key';
const STORAGE_ADAPTER = 'chanl-eval-adapter-type';
const STORAGE_AGENT_KEY = 'chanl-eval-agent-api-key';

function envServer(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_SERVER || 'http://localhost:18005';
}

function envApiKey(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_API_KEY || '';
}

function envAgentApiKey(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_AGENT_API_KEY || '';
}

export type AdapterType = 'openai' | 'anthropic';

interface EvalConfigContextValue {
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  adapterType: AdapterType;
  setAdapterType: (v: AdapterType) => void;
  agentApiKey: string;
  setAgentApiKey: (v: string) => void;
  client: EvalClient;
  hydrated: boolean;
}

const EvalConfigContext = createContext<EvalConfigContextValue | null>(null);

export function EvalConfigProvider({ children }: { children: React.ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(() => envServer());
  const [apiKey, setApiKeyState] = useState(() => envApiKey());
  const [adapterType, setAdapterTypeState] = useState<AdapterType>('openai');
  const [agentApiKey, setAgentApiKeyState] = useState(() => envAgentApiKey());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const b = localStorage.getItem(STORAGE_BASE);
      const k = localStorage.getItem(STORAGE_KEY);
      const a = localStorage.getItem(STORAGE_ADAPTER) as AdapterType | null;
      const ak = localStorage.getItem(STORAGE_AGENT_KEY);
      // Non-empty localStorage wins; empty string previously meant "cleared" and
      // would wipe NEXT_PUBLIC_* — fall back to env in that case.
      if (b !== null && b !== '') setBaseUrlState(b);
      if (k !== null && k !== '') setApiKeyState(k);
      else if (k === '' && envApiKey()) setApiKeyState(envApiKey());
      if (a === 'openai' || a === 'anthropic') setAdapterTypeState(a);
      if (ak !== null && ak !== '') setAgentApiKeyState(ak);
      else if (ak === '' && envAgentApiKey()) setAgentApiKeyState(envAgentApiKey());
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setBaseUrl = useCallback((v: string) => {
    setBaseUrlState(v);
    try {
      localStorage.setItem(STORAGE_BASE, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setApiKey = useCallback((v: string) => {
    setApiKeyState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setAdapterType = useCallback((v: AdapterType) => {
    setAdapterTypeState(v);
    try {
      localStorage.setItem(STORAGE_ADAPTER, v);
    } catch {
      /* ignore */
    }
  }, []);

  const setAgentApiKey = useCallback((v: string) => {
    setAgentApiKeyState(v);
    try {
      localStorage.setItem(STORAGE_AGENT_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  const client = useMemo(
    () =>
      new EvalClient({
        baseUrl,
        apiKey,
      }),
    [baseUrl, apiKey],
  );

  const value = useMemo(
    () => ({
      baseUrl,
      setBaseUrl,
      apiKey,
      setApiKey,
      adapterType,
      setAdapterType,
      agentApiKey,
      setAgentApiKey,
      client,
      hydrated,
    }),
    [
      baseUrl,
      setBaseUrl,
      apiKey,
      setApiKey,
      adapterType,
      setAdapterType,
      agentApiKey,
      setAgentApiKey,
      client,
      hydrated,
    ],
  );

  return (
    <EvalConfigContext.Provider value={value}>{children}</EvalConfigContext.Provider>
  );
}

export function useEvalConfig() {
  const ctx = useContext(EvalConfigContext);
  if (!ctx) {
    throw new Error('useEvalConfig must be used within EvalConfigProvider');
  }
  return ctx;
}
