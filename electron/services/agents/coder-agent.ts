import path from 'node:path';
import { OllamaEmbeddingsService, OllamaChatMessage } from '../embeddings';
import { RoutingDecision } from '../model-router';
import { TaskPlan, CodeOutput, FileChange } from '../pipeline-types';

const ollama = new OllamaEmbeddingsService();

export class SecurityError extends Error {
  constructor(message: string, public filePath?: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export interface AgentCoderConfig {
  systemPrompt?: string;
  constraints?: {
    allowedFilePatterns?: string[];
    blockedFilePatterns?: string[];
    allowedLanguages?: string[];
  };
  enabledTools?: Array<{ toolId: string; enabled: boolean }>;
}

export class CoderAgent {
  private projectRoot: string = '';

  setProjectRoot(root: string) {
    this.projectRoot = root;
  }

  async execute(
    plan: TaskPlan,
    fileContents: Map<string, string>,
    reviewIssues: Array<{ description: string; file?: string; severity?: string }>,
    modelDecision: RoutingDecision,
    agentConfig?: AgentCoderConfig
  ): Promise<CodeOutput> {
    const fileContentSection = Array.from(fileContents.entries())
      .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');

    const correctionSection = reviewIssues.length > 0
      ? `\n\n## CRITICAL: Previous Review Failed - You MUST fix these issues:

${reviewIssues.map((issue, i) => `${i + 1}. [${issue.severity?.toUpperCase() || 'ERROR'}] ${issue.description}${issue.file ? ` (File: ${issue.file})` : ''}`).join('\n')}

Your new code MUST address each issue above. Review your changes carefully before outputting.`
      : '';

    const basePrompt = agentConfig?.systemPrompt
      ? `${agentConfig.systemPrompt}\n\nYou are also a code generation expert.`
      : 'You are a code generation expert. Your job is to implement the given task plan.';

    const languageSection = agentConfig?.constraints?.allowedLanguages && agentConfig.constraints.allowedLanguages.length > 0
      ? `\n\nIMPORTANT: Prefer these languages: ${agentConfig.constraints.allowedLanguages.join(', ')}`
      : '';

    const systemPrompt = `${basePrompt}${languageSection}

You must respond with ONLY valid JSON matching this exact schema:
{
  "file_changes": [
    {
      "file_path": "string - relative path from project root",
      "operation": "create|modify|delete",
      "content": "string - full file content (for create/modify)",
      "explanation": "string - brief explanation of what changed"
    }
  ],
  "summary": "string - brief summary of all changes"
}

IMPORTANT: 
- All file_path values must be relative paths from the project root
- For "modify" operations, include the full file content
- Respond with ONLY JSON, no explanations outside the JSON structure`;

    const userPrompt = `## Task Plan

### Description
${plan.task_description}

### Approach
${plan.approach_notes}

### Subtasks
${plan.subtasks.map(st => `- ${st.description}`).join('\n')}

### Acceptance Criteria
${plan.acceptance_criteria.map(c => `- ${c}`).join('\n')}

### Current File Contents
${fileContentSection || '(No existing files - all operations will be create)'}

${correctionSection}

Generate the code changes to complete this task.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let rawOutput = '';
    try {
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
        }
      }

      const codeOutput = this.parseResponse(rawOutput);
      this.validateSecurity(codeOutput.file_changes, agentConfig);
      return codeOutput;
    } catch (err) {
      if (err instanceof SecurityError) throw err;
      throw new Error(`Coder failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  private parseResponse(rawOutput: string): CodeOutput {
    // Try multiple parsing strategies
    let parsed: any = null;
    
    // Strategy 1: Try to find JSON block in markdown code fence
    const codeBlockMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }
    
    // Strategy 2: Find the first { and match balanced braces
    if (!parsed) {
      const startIndex = rawOutput.indexOf('{');
      if (startIndex !== -1) {
        let braceCount = 0;
        let endIndex = -1;
        let inString = false;
        let escapeNext = false;
        
        for (let i = startIndex; i < rawOutput.length; i++) {
          const char = rawOutput[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }
        
        if (endIndex !== -1) {
          try {
            parsed = JSON.parse(rawOutput.substring(startIndex, endIndex + 1));
          } catch {}
        }
      }
    }
    
    // Strategy 3: Regex fallback (original)
    if (!parsed) {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {}
      }
    }

    if (!parsed) {
      throw new Error('No valid JSON found in response');
    }

    if (!Array.isArray(parsed.file_changes)) {
      throw new Error('Missing file_changes array');
    }

    return {
      file_changes: parsed.file_changes,
      summary: parsed.summary || ''
    };
  }

  private validateSecurity(fileChanges: FileChange[], agentConfig?: AgentCoderConfig): void {
    if (!this.projectRoot) {
      console.warn('[CoderAgent] No project root set, skipping security check');
      return;
    }

    const resolvedRoot = path.resolve(this.projectRoot);
    const constraints = agentConfig?.constraints;

    for (const change of fileChanges) {
      const resolvedPath = path.resolve(this.projectRoot, change.file_path);

      if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
        throw new SecurityError(
          `File path escapes project root: ${change.file_path}`,
          change.file_path
        );
      }

      if (constraints?.blockedFilePatterns && constraints.blockedFilePatterns.length > 0) {
        for (const pattern of constraints.blockedFilePatterns) {
          if (this.matchPattern(change.file_path, pattern)) {
            throw new SecurityError(
              `File path matches blocked pattern "${pattern}": ${change.file_path}`,
              change.file_path
            );
          }
        }
      }

      if (constraints?.allowedFilePatterns && constraints.allowedFilePatterns.length > 0) {
        // Skip allowed check if wildcard is present
        if (constraints.allowedFilePatterns.includes('*') || constraints.allowedFilePatterns.includes('**/*')) {
          continue;
        }

        let matchesAllowed = false;
        for (const pattern of constraints.allowedFilePatterns) {
          if (this.matchPattern(change.file_path, pattern)) {
            matchesAllowed = true;
            break;
          }
        }
        if (!matchesAllowed) {
          throw new SecurityError(
            `File path does not match allowed patterns: ${change.file_path}`,
            change.file_path
          );
        }
      }
    }
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // ** matches any path including subdirectories
    // * matches any characters except /
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '{{SINGLE_STAR}}')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
      .replace(/\{\{SINGLE_STAR\}\}/g, '[^/]*');
    
    // Check multiple matching strategies:
    // 1. Exact match of the pattern
    const exactMatch = new RegExp(`^${regex}$`).test(filePath);
    // 2. Pattern matches somewhere in the path (for ** patterns)
    const containsMatch = new RegExp(regex).test(filePath);
    // 3. Pattern without trailing * matches prefix
    const prefixMatch = new RegExp(`^${regex.replace(/\\\.\*$/, '')}`).test(filePath);
    
    return exactMatch || containsMatch || prefixMatch;
  }
}

let instance: CoderAgent | null = null;

export function getCoderAgent(): CoderAgent {
  if (!instance) {
    instance = new CoderAgent();
  }
  return instance;
}
