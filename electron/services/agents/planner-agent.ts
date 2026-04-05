import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { getModelRouter, RoutingDecision } from '../model-router';
import { TaskPlan } from '../pipeline-types';
import type { AgentConfig } from '../agent-types';

export class PlannerError extends Error {
  constructor(message: string, public rawOutput?: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

export interface PlannerOptions {
  agent?: AgentConfig;
  knowledgeFiles?: Array<{ name: string; content: string }>;
}

export class PlannerAgent {
  async execute(
    taskDescription: string,
    context: Array<{ content: string; relativeFilePath: string }>,
    modelDecision: RoutingDecision,
    options?: PlannerOptions
  ): Promise<TaskPlan> {
    const contextSection = context.length > 0
      ? `\n\n## Relevant Codebase Context\n\n${context.map(c => `### ${c.relativeFilePath}\n\`\`\`\n${c.content}\n\`\`\``).join('\n\n')}`
      : '\n\n## Relevant Codebase Context\n\n(No indexed files found - proceeding without context)';

    const agent = options?.agent;
    const knowledgeSection = options?.knowledgeFiles && options.knowledgeFiles.length > 0
      ? `\n\n## Agent Knowledge Base\n\nThe following files provide domain-specific knowledge:\n${options.knowledgeFiles.map(f => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
      : '';

    const basePrompt = agent?.systemPrompt 
      ? agent.systemPrompt
      : `You are a task planning assistant. Your job is to break down user requests into a structured execution plan.`;

    const systemPrompt = `${basePrompt}

## Task Analysis Guidelines

Analyze the user's request carefully:

1. If the user asks for DOCUMENTATION only (PRD, README, docs, specifications, etc.):
   - Create a plan that ONLY generates the requested documentation
   - The "files" array should ONLY contain the documentation file(s) requested
   - Do NOT plan implementation files (no .java, .py, .ts files, etc.)
   - Subtasks should focus on gathering requirements and writing the document

2. If the user asks for CODE/GENERATION:
   - Create a plan for code generation with appropriate implementation files
   - Include files for the requested functionality

3. If the user asks for REVIEW:
   - Create a plan for code review only
   - Do NOT plan code changes

## IMPORTANT: Only plan files that are EXPLICITLY requested by the user. Do not add implementation files for documentation tasks.

You must respond with ONLY valid JSON matching this exact schema:
{
  "task_description": "string - original task description",
  "subtasks": [
    {
      "id": "string - unique subtask identifier",
      "description": "string - what this subtask does (keep it focused on what was requested)",
      "files": ["string - ONLY include files that are explicitly requested or needed for the task. For documentation tasks, only include doc files. For code tasks, only include code files."]
    }
  ],
  "acceptance_criteria": ["string - criteria that must be met for this task to be complete"],
  "required_files": ["string - ONLY files that are actually needed for the requested task"],
  "approach_notes": "string - explanation of how you'll approach this task (focus on what was asked, nothing extra)",
  "estimated_complexity": "low|medium|high"
}

IMPORTANT: 
- Only plan files that were EXPLICITLY requested
- For PRD/documentation tasks: only plan .md files for the document
- Do NOT add implementation files (java, py, ts, etc.) unless the user asks for them
- Respond with ONLY JSON, no explanations, no markdown formatting.`;

    const userPrompt = `${contextSection}${knowledgeSection}

## Task

${taskDescription}

Carefully analyze this task:
- If the user wants documentation (PRD, README, SPEC, GUIDE, etc.), ONLY plan for documentation files
- If the user wants code/implementation, plan for code files
- Do NOT add extra files beyond what was requested

Create a focused plan that addresses exactly what was asked.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let rawOutput = '';
    try {
      const model = agent?.defaultModel || modelDecision.resolvedModel;
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(model, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
        }
      }

      return this.parseResponse(rawOutput);
    } catch (err) {
      throw new PlannerError(
        `Planner failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        rawOutput
      );
    }
  }

  private parseResponse(rawOutput: string): TaskPlan {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new PlannerError('No valid JSON found in response', rawOutput);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.task_description || !Array.isArray(parsed.subtasks)) {
        throw new PlannerError('Missing required fields in TaskPlan', rawOutput);
      }

      return {
        task_description: parsed.task_description,
        subtasks: parsed.subtasks,
        acceptance_criteria: parsed.acceptance_criteria || [],
        required_files: parsed.required_files || [],
        approach_notes: parsed.approach_notes || '',
        estimated_complexity: parsed.estimated_complexity || 'medium'
      };
    } catch (err) {
      if (err instanceof PlannerError) throw err;
      throw new PlannerError(`Failed to parse TaskPlan: ${err}`, rawOutput);
    }
  }
}

let instance: PlannerAgent | null = null;

export function getPlannerAgent(): PlannerAgent {
  if (!instance) {
    instance = new PlannerAgent();
  }
  return instance;
}
