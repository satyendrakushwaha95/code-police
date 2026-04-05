import { useState, useCallback, useRef, useEffect } from 'react';

const ipcRenderer = (window as any).ipcRenderer;

export interface CompareModelEntry {
  providerId: string;
  providerName: string;
  model: string;
}

export interface CompareResponse {
  providerId: string;
  model: string;
  content: string;
  done: boolean;
  durationMs: number;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  error?: string;
  rating?: -1 | 0 | 1;
  selected?: boolean;
}

export interface CompareSession {
  id: string;
  prompt: string;
  models: CompareModelEntry[];
  responses: Map<string, CompareResponse>;
  startedAt: number;
  isActive: boolean;
}

function responseKey(providerId: string, model: string): string {
  return `${providerId}::${model}`;
}

export function useCompare() {
  const [session, setSession] = useState<CompareSession | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const startComparison = useCallback((
    prompt: string,
    models: CompareModelEntry[],
    systemPrompt?: string,
    options?: { temperature?: number; top_p?: number; max_tokens?: number }
  ) => {
    cleanupRef.current?.();

    const comparisonId = `cmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const initialResponses = new Map<string, CompareResponse>();
    for (const m of models) {
      initialResponses.set(responseKey(m.providerId, m.model), {
        providerId: m.providerId,
        model: m.model,
        content: '',
        done: false,
        durationMs: 0,
      });
    }

    const newSession: CompareSession = {
      id: comparisonId,
      prompt,
      models,
      responses: initialResponses,
      startedAt: Date.now(),
      isActive: true,
    };
    setSession(newSession);

    const handleChunk = (_event: any, data: {
      comparisonId: string;
      providerId: string;
      model: string;
      content: string;
      done: boolean;
      usage?: any;
      durationMs: number;
    }) => {
      if (data.comparisonId !== comparisonId) return;
      const key = responseKey(data.providerId, data.model);

      setSession(prev => {
        if (!prev || prev.id !== comparisonId) return prev;
        const updated = new Map(prev.responses);
        const existing = updated.get(key);
        if (!existing) return prev;
        updated.set(key, {
          ...existing,
          content: existing.content + data.content,
          done: data.done,
          durationMs: data.durationMs,
          usage: data.usage || existing.usage,
        });
        const allDone = Array.from(updated.values()).every(r => r.done || r.error);
        return { ...prev, responses: updated, isActive: !allDone };
      });
    };

    const handleError = (_event: any, data: {
      comparisonId: string;
      providerId: string;
      model: string;
      error: string;
    }) => {
      if (data.comparisonId !== comparisonId) return;
      const key = responseKey(data.providerId, data.model);

      setSession(prev => {
        if (!prev || prev.id !== comparisonId) return prev;
        const updated = new Map(prev.responses);
        const existing = updated.get(key);
        if (!existing) return prev;
        updated.set(key, { ...existing, done: true, error: data.error });
        const allDone = Array.from(updated.values()).every(r => r.done || r.error);
        return { ...prev, responses: updated, isActive: !allDone };
      });
    };

    ipcRenderer.on('compare:chunk', handleChunk);
    ipcRenderer.on('compare:error', handleError);

    cleanupRef.current = () => {
      ipcRenderer.off('compare:chunk', handleChunk);
      ipcRenderer.off('compare:error', handleError);
    };

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    ipcRenderer.invoke('compare:stream', {
      comparisonId,
      models: models.map(m => ({ providerId: m.providerId, model: m.model })),
      messages,
      options,
    }).catch((err: any) => {
      console.error('[useCompare] Failed to start comparison:', err);
    });
  }, []);

  const abortComparison = useCallback(() => {
    if (!session) return;
    ipcRenderer.send('compare:abort', session.id);
    setSession(prev => prev ? { ...prev, isActive: false } : null);
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, [session]);

  const selectResponse = useCallback((providerId: string, model: string) => {
    setSession(prev => {
      if (!prev) return null;
      const updated = new Map(prev.responses);
      for (const [key, resp] of updated) {
        updated.set(key, { ...resp, selected: key === responseKey(providerId, model) });
      }
      return { ...prev, responses: updated };
    });
  }, []);

  const rateResponse = useCallback((providerId: string, model: string, rating: -1 | 0 | 1) => {
    setSession(prev => {
      if (!prev) return null;
      const key = responseKey(providerId, model);
      const updated = new Map(prev.responses);
      const existing = updated.get(key);
      if (!existing) return prev;
      updated.set(key, { ...existing, rating });
      return { ...prev, responses: updated };
    });
  }, []);

  const closeSession = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setSession(null);
  }, []);

  const getSelectedResponse = useCallback((): CompareResponse | null => {
    if (!session) return null;
    for (const resp of session.responses.values()) {
      if (resp.selected) return resp;
    }
    return null;
  }, [session]);

  return {
    session,
    startComparison,
    abortComparison,
    selectResponse,
    rateResponse,
    closeSession,
    getSelectedResponse,
  };
}
