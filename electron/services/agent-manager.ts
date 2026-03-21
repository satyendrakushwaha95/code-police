import { BrowserWindow } from 'electron';
import { getAgentStore, AgentStore } from './agent-store';
import {
  AgentConfig,
  CreateAgentInput,
  UpdateAgentInput,
} from './agent-types';

const DEFAULT_AGENTS: CreateAgentInput[] = [
  {
    name: 'Code Assistant',
    description: 'General-purpose code generation and editing assistant',
    icon: '💻',
    tags: ['code', 'general'],
    systemPrompt: `You are a skilled code assistant specializing in writing clean, efficient, and maintainable code.

Your expertise includes:
- Multiple programming languages (TypeScript, JavaScript, Python, Rust, Go, etc.)
- Best practices and design patterns
- Code review and refactoring
- Debugging and problem-solving

Guidelines:
1. Always write code that is readable and well-documented
2. Follow the existing code style and conventions
3. Consider edge cases and error handling
4. Provide explanations when helpful
5. Ask clarifying questions when requirements are unclear`,
    defaultModel: 'qwen3-coder:30b',
  },
  {
    name: 'Review Expert',
    description: 'Specialized in code review and quality assurance',
    icon: '🔍',
    tags: ['review', 'quality'],
    systemPrompt: `You are a code review expert focused on improving code quality, catching bugs, and ensuring best practices.

Your expertise includes:
- Identifying potential bugs and security issues
- Suggesting performance optimizations
- Enforcing coding standards
- Evaluating code maintainability
- Checking test coverage

Guidelines:
1. Be thorough but constructive in your feedback
2. Prioritize issues by severity (error > warning > suggestion)
3. Explain why something is an issue
4. Provide concrete examples and suggestions
5. Balance perfectionism with pragmatism`,
    defaultModel: 'deepseek-v3.1:671b',
  },
  {
    name: 'Documentation Writer',
    description: 'Expert in writing clear and comprehensive documentation',
    icon: '📝',
    tags: ['docs', 'writing'],
    systemPrompt: `You are a technical documentation specialist who creates clear, concise, and useful documentation.

Your expertise includes:
- README files and project documentation
- API documentation
- Code comments and docstrings
- User guides and tutorials
- Architecture decision records

Guidelines:
1. Write for your audience - adjust technical depth accordingly
2. Use clear structure with headings and sections
3. Include code examples where helpful
4. Keep documentation up-to-date
5. Focus on clarity over completeness`,
    defaultModel: 'minimax-m2.5',
  },
];

export class AgentManager {
  private store: AgentStore;
  private initialized: boolean = false;

  constructor() {
    this.store = getAgentStore();
  }

  initialize(): void {
    if (this.initialized) return;

    const agents = this.store.getAll();
    if (agents.length === 0) {
      console.log('[AgentManager] First run - creating default agents');
      this.createDefaultAgents();
    }

    this.initialized = true;
  }

  private createDefaultAgents(): void {
    for (const agent of DEFAULT_AGENTS) {
      try {
        this.store.create(agent);
        console.log(`[AgentManager] Created default agent: ${agent.name}`);
      } catch (err) {
        console.error(`[AgentManager] Failed to create default agent ${agent.name}:`, err);
      }
    }
  }

  getAll(): AgentConfig[] {
    return this.store.getAll();
  }

  getById(id: string): AgentConfig | undefined {
    return this.store.getById(id);
  }

  create(input: CreateAgentInput): AgentConfig {
    const agent = this.store.create(input);
    this.broadcastUpdate('created', agent);
    return agent;
  }

  update(id: string, input: UpdateAgentInput): AgentConfig | undefined {
    const agent = this.store.update(id, input);
    if (agent) {
      this.broadcastUpdate('updated', agent);
    }
    return agent;
  }

  delete(id: string): boolean {
    const agent = this.store.getById(id);
    if (!agent) return false;

    this.store.delete(id);
    this.broadcastUpdate('deleted', agent);
    return true;
  }

  clone(id: string, newName: string): AgentConfig | undefined {
    const agent = this.store.clone(id, newName);
    if (agent) {
      this.broadcastUpdate('created', agent);
    }
    return agent;
  }

  export(id: string): string | undefined {
    try {
      return this.store.exportAgent(id);
    } catch {
      return undefined;
    }
  }

  import(json: string): AgentConfig {
    const agent = this.store.importAgent(json);
    this.broadcastUpdate('created', agent);
    return agent;
  }

  setActive(id: string | null): void {
    if (id) {
      this.store.setActive(id);
      const agent = this.store.getById(id);
      this.broadcastUpdate('active', agent);
    } else {
      this.broadcastUpdate('active', undefined);
    }
  }

  getActive(): AgentConfig | undefined {
    return this.store.getActive();
  }

  private broadcastUpdate(type: string, agent?: AgentConfig): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('agent:updated', { type, agent });
      }
    }
  }

  getSystemPrompt(agentId: string): string | undefined {
    const agent = this.store.getById(agentId);
    return agent?.systemPrompt;
  }

  getConstraints(agentId: string): AgentConfig['constraints'] | undefined {
    const agent = this.store.getById(agentId);
    return agent?.constraints;
  }

  getEnabledTools(agentId: string): AgentConfig['enabledTools'] {
    const agent = this.store.getById(agentId);
    return agent?.enabledTools || [];
  }

  validateFileAccess(agentId: string, filePath: string): boolean {
    const constraints = this.getConstraints(agentId);
    if (!constraints) return true;

    for (const pattern of constraints.blockedFilePatterns) {
      if (this.matchPattern(filePath, pattern)) {
        return false;
      }
    }

    // Skip allowed check if wildcard is present or list is empty
    if (constraints.allowedFilePatterns.length > 0 &&
        !constraints.allowedFilePatterns.includes('*') &&
        !constraints.allowedFilePatterns.includes('**/*')) {
      let allowed = false;
      for (const pattern of constraints.allowedFilePatterns) {
        if (this.matchPattern(filePath, pattern)) {
          allowed = true;
          break;
        }
      }
      if (!allowed) return false;
    }

    return true;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    if (normalizedPattern.includes('**')) {
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      return new RegExp(`^${regexPattern}$`).test(normalizedPath);
    }

    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(normalizedPath);
    }

    return normalizedPath === normalizedPattern;
  }
}

let instance: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!instance) {
    instance = new AgentManager();
  }
  return instance;
}
