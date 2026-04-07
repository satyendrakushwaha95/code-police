import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { DecompositionResult, ResearchResult, PipelineTemplate, StreamCallback } from '../pipeline-types';

export interface AvailableAgent {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export class DecomposerAgent {
  async execute(
    taskDescription: string,
    researchResult: ResearchResult | undefined,
    modelDecision: RoutingDecision,
    availableAgents?: AvailableAgent[],
    onChunk?: StreamCallback
  ): Promise<DecompositionResult> {
    const researchContext = researchResult
      ? `\n\n## Codebase Context\n${researchResult.summary}\nKey findings:\n${researchResult.key_findings.map(f => `- ${f}`).join('\n')}`
      : '';

    const agentSection = availableAgents && availableAgents.length > 0
      ? `\n\n## Available Specialist Agents\n${availableAgents.map(a => `- "${a.id}": ${a.name} — ${a.description} [${a.tags.join(', ')}]`).join('\n')}\n\nFor each subtask, optionally assign an agent by ID if one fits. If no agent fits, leave agentId empty.`
      : '';

    const agentSchema = availableAgents && availableAgents.length > 0
      ? `,
      "agentId": "agent_xxx or empty",
      "agentReason": "Why this agent was chosen"`
      : '';

    const systemPrompt = `You are a task decomposition expert. Break down complex software tasks into smaller, independent subtasks that can be executed separately.

Each subtask should be:
1. Self-contained — can be implemented independently
2. Focused — addresses one specific concern
3. Ordered — dependencies between subtasks are explicit

For each subtask, recommend a pipeline template:
- "standard" — most tasks (plan → action → review → validate → execute)
- "quick-fix" — simple changes (plan → action → execute)
- "deep-review" — security-sensitive (research → plan → action → review → security → validate → execute)
- "docs-only" — documentation (research → plan → action → review)
- "refactor" — restructuring (research → action → review → validate → execute)
${agentSection}

You must respond with ONLY valid JSON matching this schema:
{
  "subtasks": [
    {
      "id": "sub_1",
      "description": "Clear description of what this subtask does",
      "template": "standard",
      "estimated_complexity": "low|medium|high",
      "dependencies": []${agentSchema}
    }
  ],
  "strategy": "Brief explanation of how the subtasks relate and should be executed"
}

Rules:
- Maximum 6 subtasks
- If the task is simple enough for a single pipeline, return exactly 1 subtask
- Dependencies reference other subtask IDs (e.g., ["sub_1"] means this subtask depends on sub_1)
- Respond with ONLY JSON`;

    const userPrompt = `## Task\n${taskDescription}${researchContext}\n\nDecompose this task into independent subtasks.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let rawOutput = '';
    try {
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
          onChunk?.(chunk.message.content, rawOutput);
        }
      }
      return this.parseResponse(rawOutput);
    } catch (err) {
      return {
        subtasks: [{
          id: 'sub_1',
          description: taskDescription,
          template: 'standard' as PipelineTemplate,
          estimated_complexity: 'medium',
          dependencies: [],
        }],
        strategy: `Decomposition failed (${err}), running as single task.`,
      };
    }
  }

  private validAgentIds: Set<string> = new Set();

  setValidAgentIds(ids: string[]): void {
    this.validAgentIds = new Set(ids);
  }

  private parseResponse(rawOutput: string): DecompositionResult {
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.subtasks && Array.isArray(parsed.subtasks)) {
          return {
            subtasks: parsed.subtasks.slice(0, 6).map((s: any, i: number) => ({
              id: s.id || `sub_${i + 1}`,
              description: s.description || '',
              template: (['standard', 'quick-fix', 'deep-review', 'docs-only', 'refactor', 'complex'].includes(s.template) ? s.template : 'standard') as PipelineTemplate,
              estimated_complexity: s.estimated_complexity || 'medium',
              dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
              agentId: s.agentId && this.validAgentIds.has(s.agentId) ? s.agentId : undefined,
              agentReason: s.agentId && this.validAgentIds.has(s.agentId) ? (s.agentReason || '') : undefined,
            })),
            strategy: parsed.strategy || '',
          };
        }
      }
    } catch { /* fall through */ }

    return {
      subtasks: [{ id: 'sub_1', description: rawOutput.slice(0, 200), template: 'standard', estimated_complexity: 'medium', dependencies: [] }],
      strategy: 'Could not parse decomposition, running as single task.',
    };
  }
}

let instance: DecomposerAgent | null = null;
export function getDecomposerAgent(): DecomposerAgent {
  if (!instance) instance = new DecomposerAgent();
  return instance;
}
