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

const DEFAULT_BASE =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CHANL_EVAL_SERVER
    ? process.env.NEXT_PUBLIC_CHANL_EVAL_SERVER
    : 'http://localhost:18005';

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
  const [baseUrl, setBaseUrlState] = useState(DEFAULT_BASE);
  const [apiKey, setApiKeyState] = useState('');
  const [adapterType, setAdapterTypeState] = useState<AdapterType>('openai');
  const [agentApiKey, setAgentApiKeyState] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const b = localStorage.getItem(STORAGE_BASE);
      const k = localStorage.getItem(STORAGE_KEY);
      const a = localStorage.getItem(STORAGE_ADAPTER) as AdapterType | null;
      const ak = localStorage.getItem(STORAGE_AGENT_KEY);
      if (b) setBaseUrlState(b);
      if (k !== null) setApiKeyState(k);
      if (a === 'openai' || a === 'anthropic') setAdapterTypeState(a);
      if (ak !== null) setAgentApiKeyState(ak);
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
