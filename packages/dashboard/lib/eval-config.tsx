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

// localStorage keys
const STORAGE_BASE = 'chanl-eval-base-url';
const STORAGE_KEY = 'chanl-eval-api-key';
const STORAGE_ADAPTER = 'chanl-eval-adapter-type';
const STORAGE_AGENT_KEY = 'chanl-eval-agent-api-key';
const STORAGE_AGENT_MODEL = 'chanl-eval-agent-model';
const STORAGE_AGENT_BASE_URL = 'chanl-eval-agent-base-url';
const STORAGE_SIM_KEY = 'chanl-eval-sim-api-key';
const STORAGE_SIM_MODEL = 'chanl-eval-sim-model';

function envServer(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_SERVER || 'http://localhost:18005/api/v1';
}

function envApiKey(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_API_KEY || '';
}

function envAgentApiKey(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_AGENT_API_KEY || '';
}

export type AdapterType = 'openai' | 'anthropic' | 'http';

interface EvalConfigContextValue {
  // Server
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  // Agent Under Test
  adapterType: AdapterType;
  setAdapterType: (v: AdapterType) => void;
  agentApiKey: string;
  setAgentApiKey: (v: string) => void;
  agentModel: string;
  setAgentModel: (v: string) => void;
  agentBaseUrl: string;
  setAgentBaseUrl: (v: string) => void;
  // Simulation LLM (persona + judge)
  simApiKey: string;
  setSimApiKey: (v: string) => void;
  simModel: string;
  setSimModel: (v: string) => void;
  // SDK client
  client: EvalClient;
  hydrated: boolean;
}

const EvalConfigContext = createContext<EvalConfigContextValue | null>(null);

function makeSetter(
  setState: (v: string) => void,
  storageKey: string,
): (v: string) => void {
  return (v: string) => {
    setState(v);
    try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
  };
}

export function EvalConfigProvider({ children }: { children: React.ReactNode }) {
  // Server
  const [baseUrl, setBaseUrlState] = useState(() => envServer());
  const [apiKey, setApiKeyState] = useState(() => envApiKey());
  // Agent Under Test
  const [adapterType, setAdapterTypeState] = useState<AdapterType>('openai');
  const [agentApiKey, setAgentApiKeyState] = useState(() => envAgentApiKey());
  const [agentModel, setAgentModelState] = useState('gpt-4o-mini');
  const [agentBaseUrl, setAgentBaseUrlState] = useState('');
  // Simulation LLM
  const [simApiKey, setSimApiKeyState] = useState('');
  const [simModel, setSimModelState] = useState('gpt-4o-mini');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const b = localStorage.getItem(STORAGE_BASE);
      const k = localStorage.getItem(STORAGE_KEY);
      const a = localStorage.getItem(STORAGE_ADAPTER) as AdapterType | null;
      const ak = localStorage.getItem(STORAGE_AGENT_KEY);
      if (b !== null && b !== '') setBaseUrlState(b);
      if (k !== null && k !== '') setApiKeyState(k);
      else if (k === '' && envApiKey()) setApiKeyState(envApiKey());
      if (a === 'openai' || a === 'anthropic' || a === 'http') setAdapterTypeState(a);
      if (ak !== null && ak !== '') setAgentApiKeyState(ak);
      else if (ak === '' && envAgentApiKey()) setAgentApiKeyState(envAgentApiKey());
      const am = localStorage.getItem(STORAGE_AGENT_MODEL);
      if (am !== null && am !== '') setAgentModelState(am);
      const abu = localStorage.getItem(STORAGE_AGENT_BASE_URL);
      if (abu !== null) setAgentBaseUrlState(abu);
      // Simulation
      const sk = localStorage.getItem(STORAGE_SIM_KEY);
      if (sk !== null && sk !== '') setSimApiKeyState(sk);
      const sm = localStorage.getItem(STORAGE_SIM_MODEL);
      if (sm !== null && sm !== '') setSimModelState(sm);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Stable setters
  const setBaseUrl = useCallback(makeSetter(setBaseUrlState, STORAGE_BASE), []);
  const setApiKey = useCallback(makeSetter(setApiKeyState, STORAGE_KEY), []);
  const setAdapterType = useCallback((v: AdapterType) => {
    setAdapterTypeState(v);
    try { localStorage.setItem(STORAGE_ADAPTER, v); } catch { /* ignore */ }
  }, []);
  const setAgentApiKey = useCallback(makeSetter(setAgentApiKeyState, STORAGE_AGENT_KEY), []);
  const setAgentModel = useCallback(makeSetter(setAgentModelState, STORAGE_AGENT_MODEL), []);
  const setAgentBaseUrl = useCallback(makeSetter(setAgentBaseUrlState, STORAGE_AGENT_BASE_URL), []);
  const setSimApiKey = useCallback(makeSetter(setSimApiKeyState, STORAGE_SIM_KEY), []);
  const setSimModel = useCallback(makeSetter(setSimModelState, STORAGE_SIM_MODEL), []);

  const client = useMemo(
    () => new EvalClient({ baseUrl, apiKey }),
    [baseUrl, apiKey],
  );

  const value = useMemo(
    () => ({
      baseUrl, setBaseUrl,
      apiKey, setApiKey,
      adapterType, setAdapterType,
      agentApiKey, setAgentApiKey,
      agentModel, setAgentModel,
      agentBaseUrl, setAgentBaseUrl,
      simApiKey, setSimApiKey,
      simModel, setSimModel,
      client, hydrated,
    }),
    [
      baseUrl, setBaseUrl, apiKey, setApiKey,
      adapterType, setAdapterType,
      agentApiKey, setAgentApiKey, agentModel, setAgentModel,
      agentBaseUrl, setAgentBaseUrl,
      simApiKey, setSimApiKey, simModel, setSimModel,
      client, hydrated,
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
