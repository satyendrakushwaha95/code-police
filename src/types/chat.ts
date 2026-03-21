export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  content: string;
  size: number;
  truncated?: boolean;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: FileAttachment[];
  isPipeline?: boolean;
  pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled';
  pipelineRunId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  attachments: FileAttachment[];
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatOptions {
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
}

export interface OllamaChatChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}
