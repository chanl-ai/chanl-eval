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
const STORAGE_AGENT_MODEL = 'chanl-eval-agent-model';
const STORAGE_AGENT_BASE_URL = 'chanl-eval-agent-base-url';
const STORAGE_SIM_MODEL = 'chanl-eval-sim-model';

// Credentials are stored server-side. These browser keys are purged on load so no secret is left
// behind by older builds.
const LEGACY_SECRET_KEYS = ['chanl-eval-agent-api-key', 'chanl-eval-sim-api-key'];

function envServer(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_SERVER || 'http://localhost:18005/api/v1';
}

function envApiKey(): string {
  return process.env.NEXT_PUBLIC_CHANL_EVAL_API_KEY || '';
}

export type AdapterType = 'openai' | 'anthropic' | 'http';

interface EvalConfigContextValue {
  // Server
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  // Agent Under Test.
  // No API key here by design — provider credentials live on the server (PUT /settings) because the
  // engine, not the browser, makes the LLM calls.
  adapterType: AdapterType;
  setAdapterType: (v: AdapterType) => void;
  agentModel: string;
  setAgentModel: (v: string) => void;
  agentBaseUrl: string;
  setAgentBaseUrl: (v: string) => void;
  // Simulation LLM (persona + judge)
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
  const [agentModel, setAgentModelState] = useState('gpt-4o-mini');
  const [agentBaseUrl, setAgentBaseUrlState] = useState('');
  // Simulation LLM
  const [simModel, setSimModelState] = useState('gpt-4o-mini');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const b = localStorage.getItem(STORAGE_BASE);
      const k = localStorage.getItem(STORAGE_KEY);
      const a = localStorage.getItem(STORAGE_ADAPTER) as AdapterType | null;
      if (b !== null && b !== '') setBaseUrlState(b);
      if (k !== null && k !== '') setApiKeyState(k);
      else if (k === '' && envApiKey()) setApiKeyState(envApiKey());
      if (a === 'openai' || a === 'anthropic' || a === 'http') setAdapterTypeState(a);
      const am = localStorage.getItem(STORAGE_AGENT_MODEL);
      if (am !== null && am !== '') setAgentModelState(am);
      const abu = localStorage.getItem(STORAGE_AGENT_BASE_URL);
      if (abu !== null) setAgentBaseUrlState(abu);
      // Simulation
      const sm = localStorage.getItem(STORAGE_SIM_MODEL);
      if (sm !== null && sm !== '') setSimModelState(sm);
      // Drop credentials left behind by older builds.
      for (const legacy of LEGACY_SECRET_KEYS) localStorage.removeItem(legacy);
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
  const setAgentModel = useCallback(makeSetter(setAgentModelState, STORAGE_AGENT_MODEL), []);
  const setAgentBaseUrl = useCallback(makeSetter(setAgentBaseUrlState, STORAGE_AGENT_BASE_URL), []);
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
      agentModel, setAgentModel,
      agentBaseUrl, setAgentBaseUrl,
      simModel, setSimModel,
      client, hydrated,
    }),
    [
      baseUrl, setBaseUrl, apiKey, setApiKey,
      adapterType, setAdapterType,
      agentModel, setAgentModel,
      agentBaseUrl, setAgentBaseUrl,
      simModel, setSimModel,
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
