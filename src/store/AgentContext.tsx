import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface AgentToolConfig {
  toolId: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

export interface AgentConstraints {
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  maxFileSize: number;
  allowedLanguages: string[];
  requireApproval: boolean;
  autoExecute: boolean;
}

export interface KnowledgeBaseConfig {
  enabled: boolean;
  files: KnowledgeFile[];
  urls: string[];
  totalSize: number;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  path: string;
  type: 'text' | 'markdown' | 'code';
  size: number;
  embeddingId?: string;
  addedAt: number;
}

export interface AgentPipelineConfig {
  stages: {
    plan: { enabled: boolean; model?: string };
    action: { enabled: boolean; model?: string };
    review: { enabled: boolean; model?: string };
    validate: { enabled: boolean; model?: string };
    execute: { enabled: boolean; model?: string };
  };
  maxRetries: number;
  timeoutMs: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags: string[];
  systemPrompt: string;
  defaultModel: string;
  enabledTools: AgentToolConfig[];
  constraints: AgentConstraints;
  knowledgeBase: KnowledgeBaseConfig;
  pipelineStages: AgentPipelineConfig;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  icon?: string;
  tags?: string[];
  systemPrompt?: string;
  defaultModel?: string;
  enabledTools?: AgentToolConfig[];
  constraints?: Partial<AgentConstraints>;
  pipelineStages?: Partial<AgentPipelineConfig>;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  tags?: string[];
}

interface AgentState {
  agents: AgentConfig[];
  activeAgent: AgentConfig | null;
  isLoading: boolean;
  error: string | null;
}

interface AgentContextValue {
  state: AgentState;
  loadAgents: () => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<AgentConfig>;
  updateAgent: (id: string, input: UpdateAgentInput) => Promise<AgentConfig | undefined>;
  deleteAgent: (id: string) => Promise<boolean>;
  cloneAgent: (id: string, newName: string) => Promise<AgentConfig | undefined>;
  exportAgent: (id: string) => Promise<string | undefined>;
  importAgent: (json: string) => Promise<AgentConfig>;
  setActiveAgent: (id: string | null) => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

const ipcRenderer = (window as any).ipcRenderer;

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AgentState>({
    agents: [],
    activeAgent: null,
    isLoading: true,
    error: null,
  });

  const loadAgents = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const agents = await ipcRenderer.invoke('agent:list');
      const activeAgent = await ipcRenderer.invoke('agent:getActive');
      setState({
        agents,
        activeAgent: activeAgent || null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('[AgentContext] Failed to load agents:', err);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load agents',
      }));
    }
  }, []);

  const createAgent = useCallback(async (input: CreateAgentInput): Promise<AgentConfig> => {
    const agent = await ipcRenderer.invoke('agent:create', input);
    return agent;
  }, []);

  const updateAgent = useCallback(async (id: string, input: UpdateAgentInput): Promise<AgentConfig | undefined> => {
    const agent = await ipcRenderer.invoke('agent:update', id, input);
    if (agent) {
      setState(prev => ({
        ...prev,
        agents: prev.agents.map(a => a.id === id ? agent : a),
        activeAgent: prev.activeAgent?.id === id ? agent : prev.activeAgent,
      }));
    }
    return agent;
  }, []);

  const deleteAgent = useCallback(async (id: string): Promise<boolean> => {
    const result = await ipcRenderer.invoke('agent:delete', id);
    if (result) {
      setState(prev => ({
        ...prev,
        agents: prev.agents.filter(a => a.id !== id),
        activeAgent: prev.activeAgent?.id === id ? null : prev.activeAgent,
      }));
    }
    return result;
  }, []);

  const cloneAgent = useCallback(async (id: string, newName: string): Promise<AgentConfig | undefined> => {
    const agent = await ipcRenderer.invoke('agent:clone', id, newName);
    return agent;
  }, []);

  const exportAgent = useCallback(async (id: string): Promise<string | undefined> => {
    return await ipcRenderer.invoke('agent:export', id);
  }, []);

  const importAgent = useCallback(async (json: string): Promise<AgentConfig> => {
    const agent = await ipcRenderer.invoke('agent:import', json);
    setState(prev => ({
      ...prev,
      agents: [...prev.agents, agent],
    }));
    return agent;
  }, []);

  const setActiveAgent = useCallback(async (id: string | null): Promise<void> => {
    await ipcRenderer.invoke('agent:setActive', id);
    if (id === null) {
      setState(prev => ({
        ...prev,
        activeAgent: null,
      }));
    } else {
      const agent = state.agents.find(a => a.id === id);
      setState(prev => ({
        ...prev,
        activeAgent: agent || null,
      }));
    }
  }, [state.agents]);

  useEffect(() => {
    loadAgents();

    const handleAgentUpdate = (_event: any, data: { type: string; agent?: AgentConfig }) => {
      const { type, agent } = data;
      
      if (type === 'created' && agent) {
        setState(prev => {
          if (prev.agents.some(a => a.id === agent.id)) {
            return prev;
          }
          return {
            ...prev,
            agents: [...prev.agents, agent],
          };
        });
      } else if (type === 'updated' && agent) {
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a => a.id === agent.id ? agent : a),
          activeAgent: prev.activeAgent?.id === agent.id ? agent : prev.activeAgent,
        }));
      } else if (type === 'deleted' && agent) {
        setState(prev => ({
          ...prev,
          agents: prev.agents.filter(a => a.id !== agent.id),
          activeAgent: prev.activeAgent?.id === agent.id ? null : prev.activeAgent,
        }));
      } else if (type === 'active' && agent) {
        setState(prev => ({
          ...prev,
          activeAgent: agent,
        }));
      }
    };

    ipcRenderer.on('agent:updated', handleAgentUpdate);

    return () => {
      ipcRenderer.off('agent:updated', handleAgentUpdate);
    };
  }, [loadAgents]);

  return (
    <AgentContext.Provider
      value={{
        state,
        loadAgents,
        createAgent,
        updateAgent,
        deleteAgent,
        cloneAgent,
        exportAgent,
        importAgent,
        setActiveAgent,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgents must be used within an AgentProvider');
  }
  return context;
}
