export interface AppSettings {
  endpoint: string;
  model: string;
  embeddingModel: string;
  temperature: number;
  topP: number;
  contextLength: number;
  theme: 'dark' | 'light';
  systemPrompt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen3-coder:480b-cloud',
  embeddingModel: 'nomic-embed-text:latest', // Lightweight 137MB embedding model
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  theme: 'dark',
  systemPrompt: 'You are a helpful AI assistant. When generating code, always use proper formatting with markdown code blocks.',
};
