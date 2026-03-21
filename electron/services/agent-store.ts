import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AgentConfig, createDefaultAgentConfig, CreateAgentInput, UpdateAgentInput } from './agent-types';

const AGENTS_FILE = 'agents.json';
const AGENT_CONFIG_VERSION = 1;

interface AgentsStoreData {
  version: number;
  agents: AgentConfig[];
  activeAgentId: string | null;
}

export class AgentStore {
  private storePath: string;
  private data: AgentsStoreData;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.storePath = path.join(userDataPath, AGENTS_FILE);
    this.data = this.load();
  }

  private load(): AgentsStoreData {
    try {
      if (!fs.existsSync(this.storePath)) {
        const defaultData = this.createDefaultStore();
        this.save(defaultData);
        return defaultData;
      }

      const content = fs.readFileSync(this.storePath, 'utf-8');
      const data = JSON.parse(content) as AgentsStoreData;

      if (!this.validateStore(data)) {
        console.warn('[AgentStore] Invalid store format, using defaults');
        return this.createDefaultStore();
      }

      return data;
    } catch (error) {
      console.error('[AgentStore] Error loading store:', error);
      return this.createDefaultStore();
    }
  }

  private save(data: AgentsStoreData): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = this.storePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.storePath);
    } catch (error) {
      console.error('[AgentStore] Error saving store:', error);
      throw error;
    }
  }

  private validateStore(data: unknown): data is AgentsStoreData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (typeof d.version !== 'number') return false;
    if (!Array.isArray(d.agents)) return false;
    return true;
  }

  private createDefaultStore(): AgentsStoreData {
    const defaultAgents: AgentConfig[] = [
      createDefaultAgentConfig({
        id: 'default-coder',
        name: 'Code Assistant',
        description: 'General purpose code generation and modification assistant',
        icon: '💻',
        systemPrompt: `You are an expert code assistant specializing in code generation and modification.

Your responsibilities:
- Write clean, maintainable code following best practices
- Follow the project's coding conventions
- Add appropriate comments and documentation
- Consider performance and security implications

When generating code:
1. First understand the requirements and constraints
2. Plan the approach before writing
3. Write complete, production-ready code
4. Verify the code addresses all requirements`,
        tags: ['code', 'general', 'default'],
      }),
      createDefaultAgentConfig({
        id: 'default-reviewer',
        name: 'Code Reviewer',
        description: 'Expert at reviewing code for bugs, performance issues, and best practices',
        icon: '🔍',
        systemPrompt: `You are an expert code reviewer with deep knowledge of software engineering best practices.

Your responsibilities:
- Identify bugs, security vulnerabilities, and performance issues
- Evaluate code against best practices and coding standards
- Provide constructive feedback with actionable suggestions
- Consider code maintainability and readability

Review criteria:
1. Correctness - Does the code work as intended?
2. Security - Are there any security vulnerabilities?
3. Performance - Are there any performance concerns?
4. Maintainability - Is the code easy to understand and modify?
5. Best practices - Does it follow established patterns?`,
        tags: ['review', 'quality', 'security'],
      }),
      createDefaultAgentConfig({
        id: 'default-planner',
        name: 'Task Planner',
        description: 'Specializes in breaking down complex tasks into manageable steps',
        icon: '📋',
        systemPrompt: `You are an expert task planner specializing in breaking down complex requirements into actionable tasks.

Your responsibilities:
- Analyze complex requirements and understand the goal
- Break down tasks into logical, sequential steps
- Identify dependencies between tasks
- Estimate complexity and potential challenges
- Define clear acceptance criteria

Planning approach:
1. Understand the end goal clearly
2. Identify all necessary components
3. Determine the order of implementation
4. Consider edge cases and error handling
5. Define measurable success criteria`,
        tags: ['planning', 'architecture'],
      }),
    ];

    return {
      version: AGENT_CONFIG_VERSION,
      agents: defaultAgents,
      activeAgentId: 'default-coder',
    };
  }

  getAll(): AgentConfig[] {
    return this.data.agents;
  }

  getById(id: string): AgentConfig | undefined {
    return this.data.agents.find(a => a.id === id);
  }

  getActive(): AgentConfig | undefined {
    if (!this.data.activeAgentId) return undefined;
    return this.getById(this.data.activeAgentId);
  }

  setActive(id: string): void {
    if (!this.getById(id)) {
      throw new Error(`Agent ${id} not found`);
    }
    this.data.activeAgentId = id;
    this.save(this.data);
  }

  create(input: CreateAgentInput): AgentConfig {
    const agent = createDefaultAgentConfig(input);
    this.data.agents.push(agent);
    this.save(this.data);
    return agent;
  }

  update(id: string, updates: UpdateAgentInput): AgentConfig {
    const index = this.data.agents.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error(`Agent ${id} not found`);
    }

    const existing = this.data.agents[index];
    const updated: AgentConfig = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      constraints: updates.constraints
        ? { ...existing.constraints, ...updates.constraints }
        : existing.constraints,
      knowledgeBase: updates.knowledgeBase
        ? { ...existing.knowledgeBase, ...updates.knowledgeBase }
        : existing.knowledgeBase,
      pipelineStages: updates.pipelineStages
        ? { ...existing.pipelineStages, ...updates.pipelineStages }
        : existing.pipelineStages,
    };

    this.data.agents[index] = updated;
    this.save(this.data);
    return updated;
  }

  delete(id: string): void {
    const index = this.data.agents.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error(`Agent ${id} not found`);
    }

    if (id === 'default-coder' || id === 'default-reviewer' || id === 'default-planner') {
      throw new Error(`Cannot delete default agents`);
    }

    this.data.agents.splice(index, 1);

    if (this.data.activeAgentId === id) {
      this.data.activeAgentId = this.data.agents[0]?.id || null;
    }

    this.save(this.data);
  }

  clone(id: string, newName: string): AgentConfig {
    const original = this.getById(id);
    if (!original) {
      throw new Error(`Agent ${id} not found`);
    }

    const cloned: AgentConfig = {
      ...JSON.parse(JSON.stringify(original)),
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: newName,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [...original.tags, 'cloned'],
    };

    this.data.agents.push(cloned);
    this.save(this.data);
    return cloned;
  }

  exportAgent(id: string): string {
    const agent = this.getById(id);
    if (!agent) {
      throw new Error(`Agent ${id} not found`);
    }

    const exportData = {
      ...agent,
      _exportedAt: Date.now(),
      _exportVersion: 1,
    };

    return JSON.stringify(exportData, null, 2);
  }

  importAgent(jsonString: string): AgentConfig {
    try {
      const imported = JSON.parse(jsonString);

      if (imported._exportVersion !== 1) {
        throw new Error('Unsupported export version');
      }

      const { _exportedAt, _exportVersion, ...agentData } = imported;

      const newAgent: AgentConfig = {
        ...createDefaultAgentConfig(agentData),
        id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: `${agentData.name || 'Imported Agent'} (Imported)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [...(agentData.tags || []), 'imported'],
      };

      this.data.agents.push(newAgent);
      this.save(this.data);
      return newAgent;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  validateAgentConfig(config: unknown): config is AgentConfig {
    if (!config || typeof config !== 'object') return false;
    const c = config as Record<string, unknown>;

    if (typeof c.id !== 'string') return false;
    if (typeof c.name !== 'string') return false;
    if (typeof c.systemPrompt !== 'string') return false;
    if (typeof c.defaultModel !== 'string') return false;

    return true;
  }
}

let instance: AgentStore | null = null;

export function getAgentStore(): AgentStore {
  if (!instance) {
    instance = new AgentStore();
  }
  return instance;
}
