import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { TaskPlan, CodeOutput, ReviewResult, StreamCallback } from '../pipeline-types';

export interface ValidationResult {
  passed: boolean;
  gaps: {
    type: 'missing' | 'incomplete' | 'regressed' | 'incorrect';
    description: string;
    related_to?: string;
  }[];
  coverage_score: number;
  summary: string;
}

function isDocumentationTask(taskPlan: TaskPlan, codeOutput: CodeOutput): boolean {
  const docExtensions = ['.md', '.txt', '.rst', '.adoc', '.tex', '.doc', '.docx', '.pdf'];
  const isDocTask = taskPlan.task_description.toLowerCase().includes('prd') ||
    taskPlan.task_description.toLowerCase().includes('documentation') ||
    taskPlan.task_description.toLowerCase().includes('readme') ||
    taskPlan.task_description.toLowerCase().includes('spec') ||
    taskPlan.task_description.toLowerCase().includes('guide') ||
    taskPlan.task_description.toLowerCase().includes('document');
  
  const allFilesAreDocs = codeOutput.file_changes.every(f => 
    docExtensions.some(ext => f.file_path.toLowerCase().endsWith(ext))
  );
  
  return isDocTask || allFilesAreDocs;
}

export class ValidatorAgent {
  async execute(
    taskPlan: TaskPlan,
    codeOutput: CodeOutput,
    reviewResult: ReviewResult,
    modelDecision: RoutingDecision,
    onChunk?: StreamCallback
  ): Promise<ValidationResult> {
    const isDocTask = isDocumentationTask(taskPlan, codeOutput);
    
    const codeChangesSummary = codeOutput.file_changes
      .map(f => `- ${f.operation}: ${f.file_path} - ${f.explanation}`)
      .join('\n');

    const reviewIssuesSummary = reviewResult.issues
      .map(i => `- [${i.severity}] ${i.description}`)
      .join('\n');

    let systemPrompt: string;
    let userPrompt: string;

    if (isDocTask) {
      systemPrompt = `You are a documentation validation expert. Your job is to verify that the documentation matches the original task requirements.

You must respond with ONLY valid JSON matching this exact schema:
{
  "passed": boolean,
  "gaps": [
    {
      "type": "missing|incomplete|regressed|incorrect",
      "description": "string describing the gap",
      "related_to": "optional - what acceptance criteria or subtask this relates to"
    }
  ],
  "coverage_score": number (0-100),
  "summary": "string - overall validation summary"
}

IMPORTANT:
- For documentation tasks, check if the requested document was created
- Review info-level issues (like placeholder dates) should NOT cause failure
- Only critical gaps that prevent the document from being useful should cause failure
- coverage_score should reflect document completeness`;

      userPrompt = `## Original Task
${taskPlan.task_description}

### Subtasks (${taskPlan.subtasks.length})
${taskPlan.subtasks.map(st => `- ${st.description}`).join('\n')}

### Acceptance Criteria (${taskPlan.acceptance_criteria.length})
${taskPlan.acceptance_criteria.map(c => `- ${c}`).join('\n')}

---

## Documents Created
${codeChangesSummary || '(No documents found)'}

---

## Review Feedback
${reviewIssuesSummary || '(No review issues)'}

---

## Validation Task
For documentation tasks:
1. Check if the requested document was created
2. Only FAIL for critical issues (missing sections, incorrect information)
3. INFO-level issues (placeholder dates, minor inconsistencies) should NOT cause failure
4. If the document exists and covers the requested topic, it should PASS with high coverage

Return your validation result.`;
    } else {
      systemPrompt = `You are a validation expert. Your job is to verify that the final implementation matches the original task plan and acceptance criteria.

You must respond with ONLY valid JSON matching this exact schema:
{
  "passed": boolean,
  "gaps": [
    {
      "type": "missing|incomplete|regressed|incorrect",
      "description": "string describing the gap",
      "related_to": "optional - what acceptance criteria or subtask this relates to"
    }
  ],
  "coverage_score": number (0-100),
  "summary": "string - overall validation summary"
}

IMPORTANT:
- Be thorough in checking ALL acceptance criteria
- Compare each subtask against the actual code output
- Check for any regressions from the original plan
- coverage_score should reflect what percentage of planned work is correctly implemented`;

      userPrompt = `## Original Task Plan

### Description
${taskPlan.task_description}

### Approach
${taskPlan.approach_notes}

### Subtasks (${taskPlan.subtasks.length})
${taskPlan.subtasks.map(st => `- ${st.description}`).join('\n')}

### Acceptance Criteria (${taskPlan.acceptance_criteria.length})
${taskPlan.acceptance_criteria.map(c => `- ${c}`).join('\n')}

### Required Files
${taskPlan.required_files.join('\n')}

---

## Code Changes Made
${codeChangesSummary}

---

## Review Feedback
${reviewIssuesSummary || '(No review issues - passed)'}

---

## Your Task
Validate that:
1. All acceptance criteria are met
2. All required files were created/modified
3. All subtasks are completed
4. No regressions were introduced
5. The review issues (if any) were properly addressed

Return your validation result.`;
    }

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      let fullContent = '';
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
          onChunk?.(chunk.message.content, fullContent);
        }
      }

      // Extract JSON from markdown code blocks if present
      let jsonStr = fullContent.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      return {
        passed: parsed.passed ?? false,
        gaps: parsed.gaps ?? [],
        coverage_score: parsed.coverage_score ?? 0,
        summary: parsed.summary ?? 'Validation complete'
      };
    } catch (err) {
      console.error('[ValidatorAgent] Error:', err);
      return {
        passed: false,
        gaps: [{ type: 'incomplete' as const, description: `Validation failed: ${String(err)}` }],
        coverage_score: 0,
        summary: 'Validation failed due to error'
      };
    }
  }
}

let instance: ValidatorAgent | null = null;

export function getValidatorAgent(): ValidatorAgent {
  if (!instance) {
    instance = new ValidatorAgent();
  }
  return instance;
}
