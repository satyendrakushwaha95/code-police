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
  isActive?: boolean;
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
  knowledgeBase?: Partial<KnowledgeBaseConfig>;
  pipelineStages?: Partial<AgentPipelineConfig>;
  author?: string;
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  tags?: string[];
}
