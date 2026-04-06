import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { ResearchResult } from '../pipeline-types';
import { analyzeProject, ProjectAnalysis } from '../project-analyzer';
import * as fs from 'fs';
import * as path from 'path';

export class ResearchAgent {
  async execute(
    taskDescription: string,
    projectRoot: string,
    modelDecision: RoutingDecision
  ): Promise<ResearchResult> {
    const analysis = await analyzeProject(projectRoot);

    const filesExamined: string[] = [];
    const fileSamples: Array<{ file: string; code: string; role: string }> = [];

    for (const entryPoint of analysis.entryPoints.slice(0, 5)) {
      const fullPath = path.join(projectRoot, entryPoint);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 2000);
        filesExamined.push(entryPoint);
        fileSamples.push({ file: entryPoint, code: content, role: 'entry-point' });
      } catch { /* skip unreadable */ }
    }

    for (const configFile of analysis.configFiles.slice(0, 3)) {
      const fullPath = path.join(projectRoot, configFile);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8').slice(0, 1000);
        filesExamined.push(configFile);
        fileSamples.push({ file: configFile, code: content, role: 'config' });
      } catch { /* skip unreadable */ }
    }

    const prompt = this.buildResearchPrompt(taskDescription, analysis, fileSamples);

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: 'You are a codebase research assistant. Analyze the project and find relevant information for the given task.' },
      { role: 'user', content: prompt },
    ];

    let rawOutput = '';
    try {
      const model = modelDecision.resolvedModel;
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(model, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
        }
      }
    } catch (err) {
      return {
        files_examined: filesExamined,
        key_findings: ['Research LLM call failed; proceeding with static analysis only'],
        relevant_patterns: analysis.detectedPatterns,
        existing_implementation: [],
        summary: `Static analysis found ${filesExamined.length} relevant files. LLM analysis failed: ${err}`,
      };
    }

    const findings = this.parseResearchResponse(rawOutput);

    return {
      files_examined: filesExamined,
      key_findings: findings.findings,
      relevant_patterns: findings.patterns,
      existing_implementation: findings.existing,
      summary: findings.summary,
    };
  }

  private buildResearchPrompt(
    task: string,
    analysis: ProjectAnalysis,
    fileSamples: Array<{ file: string; code: string; role: string }>
  ): string {
    return `
Research the codebase for the following task: "${task}"

## Project Overview
- Framework: ${analysis.techStack.framework || 'Unknown'}
- Language: ${analysis.techStack.language}
- Entry Points: ${analysis.entryPoints.join(', ')}
- API Routes: ${analysis.apiRoutes.join(', ')}

## Key Files
${fileSamples.map(f => `### ${f.file} (${f.role})\n\`\`\`\n${f.code}\n\`\`\``).join('\n')}

Return your findings as JSON:
{
  "findings": ["key finding 1", "key finding 2"],
  "patterns": ["pattern 1", "pattern 2"],
  "existing": [{"file": "path", "code": "snippet", "relevance": "why relevant"}],
  "summary": "2-3 sentence summary"
}
`;
  }

  private parseResearchResponse(content: string): {
    findings: string[];
    patterns: string[];
    existing: Array<{ file: string; code: string; relevance: string }>;
    summary: string;
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch { /* fall through */ }

    return {
      findings: ['Research completed'],
      patterns: [],
      existing: [],
      summary: content.slice(0, 500),
    };
  }
}

let instance: ResearchAgent | null = null;
export function getResearchAgent(): ResearchAgent {
  if (!instance) instance = new ResearchAgent();
  return instance;
}
