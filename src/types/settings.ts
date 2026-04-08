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
  model: 'llama3:latest',
  embeddingModel: 'nomic-embed-text:latest',
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  theme: 'dark',
  systemPrompt: 'You are a security-focused AI assistant for Code Police. Help developers understand vulnerabilities, explain security concepts, and suggest fixes.',
};
