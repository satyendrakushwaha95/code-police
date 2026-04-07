import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { TaskPlan, CodeOutput, ReviewResult, StreamCallback } from '../pipeline-types';

export class ReviewerAgent {
  async execute(
    plan: TaskPlan,
    codeOutput: CodeOutput,
    modelDecision: RoutingDecision,
    onChunk?: StreamCallback
  ): Promise<ReviewResult> {
    const fileChangesSection = codeOutput.file_changes
      .map(change => `### ${change.operation}: ${change.file_path}\n${change.content}\n\n*${change.explanation}*`)
      .join('\n\n---\n\n');

    const acceptanceCriteriaList = plan.acceptance_criteria
      .map((c, i) => `${i + 1}. ${c}`)
      .join('\n');

    const systemPrompt = `You are a code review expert. Your job is to evaluate code changes against the task acceptance criteria.

You must respond with ONLY valid JSON matching this exact schema:
{
  "verdict": "PASS|FAIL",
  "issues": [
    {
      "severity": "error|warning|info",
      "description": "string - description of the issue",
      "file": "string - optional file path"
    }
  ],
  "suggestions": ["string - suggestions for improvement"],
  "confidence_score": number - between 0 and 1
}

IMPORTANT REVIEW GUIDELINES:
- Be LENIENT and PRAGMATIC - minor deviations should PASS with warnings
- Only FAIL if the core purpose is NOT achieved or there are critical errors
- Small numeric differences (e.g., 192 words vs 200 words) should be WARNINGS, not errors
- Missing file extensions are minor issues - not failures
- Focus on whether the TASK OBJECTIVE is met, not perfect adherence to details
- "error" = task objective NOT met at all
- "warning" = task objective mostly met with minor issues
- "info" = nice-to-have improvements
- If in doubt, PASS with suggestions for improvement
- confidence_score should be high (0.7+) if the main objective is achieved
- Respond with ONLY JSON`;

    const userPrompt = `## Acceptance Criteria
${acceptanceCriteriaList}

## Code Changes to Review
${fileChangesSection}

## Task Description
${plan.task_description}

Review these changes to verify the CORE OBJECTIVE is achieved. Minor deviations (small word count differences, missing file extensions) should be warnings, not failures. Only fail if the main purpose is not served at all.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
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
        verdict: 'FAIL',
        issues: [{
          severity: 'error',
          description: `Reviewer output was not valid JSON: ${err}`
        }],
        suggestions: [],
        confidence_score: 0
      };
    }
  }

  private parseResponse(rawOutput: string): ReviewResult {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        verdict: 'FAIL',
        issues: [{
          severity: 'error',
          description: 'Reviewer output was not valid JSON'
        }],
        suggestions: [],
        confidence_score: 0
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      const verdict = parsed.verdict === 'PASS' || parsed.verdict === 'FAIL'
        ? parsed.verdict
        : 'FAIL';

      return {
        verdict,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        confidence_score: typeof parsed.confidence_score === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence_score))
          : 0
      };
    } catch {
      return {
        verdict: 'FAIL',
        issues: [{
          severity: 'error',
          description: 'Failed to parse reviewer response'
        }],
        suggestions: [],
        confidence_score: 0
      };
    }
  }
}

let instance: ReviewerAgent | null = null;

export function getReviewerAgent(): ReviewerAgent {
  if (!instance) {
    instance = new ReviewerAgent();
  }
  return instance;
}
