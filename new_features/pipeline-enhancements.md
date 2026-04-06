# Pipeline Enhancement Roadmap

## Overview

Four synergistic enhancements to the LocalMind AI pipeline system:
1. **Pipeline Templates** — Pre-configured stage combinations for different workflows
2. **New Stages (Research, Security)** — Extended pipeline capabilities
3. **Conditional/Dynamic Pipelines** — Smart branching, loops, and early exits
4. **Pipeline Analytics** — Performance tracking and insights

---

## Current State

### Architecture
- **Orchestrator:** `electron/services/pipeline-orchestrator.ts` (733 lines)
- **State Store:** `electron/services/pipeline-state.ts` (262 lines, SQLite via better-sqlite3)
- **Types:** `electron/services/pipeline-types.ts` (106 lines)
- **Agents:** `electron/services/agents/` (planner, coder, reviewer, validator, executor)
- **Frontend:** `src/components/Pipeline/PipelinePanel.tsx` (529 lines), `src/hooks/usePipeline.ts` (303 lines)
- **Stage Card:** `src/components/Pipeline/StageCard.tsx` (340 lines)

### Current Pipeline Flow
```
Plan → Action → Review → Validate → Execute
```

- Hardcoded sequential execution: Plan runs once, then Action/Review loop in a `while` (max 2 attempts)
- Validate and Execute are called from the Review PASS path, not from the outer loop
- Fixed 5-stage `PipelineRun.stages` object with typed fields
- Retry logic: on Review FAIL, loop back to Action with feedback from review issues
- `isStageEnabled(stage)` method exists but is NOT used inside `run()` — agent stage toggles have no effect
- Stop/analyze/retry via natural language intent detection (`analyzeAndRetry`)
- Auto-refresh dashboard every 5 seconds via polling

### LLM Call Pattern (Critical for New Agents)
All existing agents call Ollama directly from the main process:
```typescript
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';

// Inside agent execute():
const ollama = getSharedOllama();
for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
  if (chunk.message?.content) {
    rawOutput += chunk.message.content;
  }
}
```
**NOT** through `ipcRenderer` (which is renderer-process only).

### Model Router Type
The model type used across agents is `RoutingDecision`, not `ResolvedModel`:
```typescript
export interface RoutingDecision {
  category: TaskCategory;
  resolvedModel: string;
  providerId: string;
  usedFallback: boolean;
  reason?: string;
}
```

### Current IPC Channels
- `pipeline:run`, `pipeline:cancel`, `pipeline:getRun`, `pipeline:getHistory`, `pipeline:deleteRun`, `pipeline:retryFix`, `pipeline:analyzeAndRetry`, `pipeline:getStageOutput`
- Events: `pipeline:complete`, `pipeline:error`, `pipeline:cancelled`, `pipeline:stage_update`, `pipeline:realtime_update`

### Existing SQLite Tables
```sql
-- pipeline_runs
id TEXT PRIMARY KEY,
task_description TEXT NOT NULL,
project_root TEXT,
status TEXT NOT NULL DEFAULT 'running',
created_at INTEGER NOT NULL,
completed_at INTEGER,
retry_count INTEGER NOT NULL DEFAULT 0,
final_verdict TEXT

-- pipeline_stage_results
id INTEGER PRIMARY KEY AUTOINCREMENT,
run_id TEXT NOT NULL,
stage TEXT NOT NULL,
attempt INTEGER NOT NULL,
status TEXT NOT NULL,
model_used TEXT NOT NULL,
duration_ms INTEGER,
output TEXT,
error TEXT,
FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
```

### Type Duplication Notice
`src/hooks/usePipeline.ts` re-declares `TaskPlan`, `FileChange`, `CodeOutput`, `ReviewResult`, `ExecuteResult`, `ValidationResult`, `StageResult`, `PipelineRun`, `PipelineOptions`, `PipelineStage`, and `StageStatus` locally. These duplicate the canonical types in `electron/services/pipeline-types.ts`. When adding new types (templates, research/security results), they must be added in both places or the duplication must be resolved first.

**Recommendation:** Create a shared types file (e.g., `src/types/pipeline.ts`) that both frontend and electron can reference, or establish the electron types as canonical and generate/export them for the renderer.

---

## Phase 1: Pipeline Templates

### Goal
Pre-configured pipeline profiles that define which stages run and in what order. Users select a template before starting a pipeline, or the AI auto-detects based on task complexity.

### Templates

| Template | Stages | Use Case | Icon |
|----------|--------|----------|------|
| **Quick Fix** | Plan → Action → Execute | Fast bug fixes, skips review | ⚡ |
| **Standard** | Plan → Action → Review → Validate → Execute | Default for most tasks | 🔄 |
| **Deep Review** | Research → Plan → Action → Review → Security → Validate → Execute | Thorough review with security audit | 🔍 |
| **Docs Only** | Research → Plan → Action → Review | Documentation tasks, no code execution | 📝 |
| **Refactor** | Research → Action → Review → Validate → Execute | Code restructuring with safety checks | 🔧 |

### File Changes

#### 1. `electron/services/pipeline-types.ts`

Add:
```typescript
export type PipelineTemplate =
  | 'quick-fix'
  | 'standard'
  | 'deep-review'
  | 'docs-only'
  | 'refactor';

export interface PipelineTemplateConfig {
  id: PipelineTemplate;
  name: string;
  description: string;
  stages: PipelineStage[];
  icon: string;
}
```

> **CORRECTION (from original):** Removed `'custom'` from `PipelineTemplate` union. The original spec declared it but never defined a config, graph, or UI for it. If `custom` is needed later, add it when there's a UI for users to compose arbitrary stage sequences.

Update `PipelineStage`:
```typescript
export type PipelineStage = 'plan' | 'action' | 'review' | 'validate' | 'execute' | 'research' | 'security';
```

Update `PipelineRun`:
```typescript
export interface PipelineRun {
  id: string;
  task_description: string;
  project_root?: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  created_at: number;
  completed_at?: number;
  retry_count: number;
  final_verdict?: 'PASS' | 'FAIL';
  current_stage?: PipelineStage;
  template?: PipelineTemplate;
  stage_order: PipelineStage[];
  stages: Record<string, StageResult<any>>;
}
```

> **CORRECTION (from original):** Changed `stages` from a fixed object with optional `research?` / `security?` fields to `Record<string, StageResult<any>>`. The original approach of keeping all 5 base stages plus optional new ones creates "ghost" pending stages for templates that don't use them. With `Record`, only the stages in `stage_order` are present. The `Record` key is the stage name string; type-safe access is through `stage_order` iteration.

Add new result types (used in Phase 2, defined here for completeness):
```typescript
export interface ResearchResult {
  files_examined: string[];
  key_findings: string[];
  relevant_patterns: string[];
  existing_implementation: Array<{
    file: string;
    code: string;
    relevance: string;
  }>;
  summary: string;
}

export interface SecurityResult {
  verdict: 'PASS' | 'FAIL';
  vulnerabilities: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: string;
    description: string;
    file: string;
    line?: number;
    recommendation: string;
  }>;
  dependency_issues: Array<{
    package: string;
    issue: string;
    severity: string;
  }>;
  summary: string;
  score: number;
}
```

#### 2. `electron/services/pipeline-templates.ts` (NEW)

```typescript
import { PipelineTemplateConfig, PipelineTemplate, PipelineStage } from './pipeline-types';

export const PIPELINE_TEMPLATES: PipelineTemplateConfig[] = [
  {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'Fast bug fixes — skips review and validation',
    stages: ['plan', 'action', 'execute'],
    icon: '⚡',
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Full pipeline for most tasks',
    stages: ['plan', 'action', 'review', 'validate', 'execute'],
    icon: '🔄',
  },
  {
    id: 'deep-review',
    name: 'Deep Review',
    description: 'Thorough review with research and security audit',
    stages: ['research', 'plan', 'action', 'review', 'security', 'validate', 'execute'],
    icon: '🔍',
  },
  {
    id: 'docs-only',
    name: 'Docs Only',
    description: 'Documentation tasks — no code execution',
    stages: ['research', 'plan', 'action', 'review'],
    icon: '📝',
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Code restructuring with safety checks',
    stages: ['research', 'action', 'review', 'validate', 'execute'],
    icon: '🔧',
  },
];

export function getTemplateById(id: PipelineTemplate): PipelineTemplateConfig | undefined {
  return PIPELINE_TEMPLATES.find(t => t.id === id);
}

export function getDefaultTemplate(): PipelineTemplateConfig {
  return PIPELINE_TEMPLATES.find(t => t.id === 'standard')!;
}
```

#### 3. `electron/services/pipeline-state.ts`

Add columns to `pipeline_runs` table (migration in `init()`):
```typescript
try {
  this.db.exec(`ALTER TABLE pipeline_runs ADD COLUMN template TEXT`);
} catch (e) { /* Column already exists */ }

try {
  this.db.exec(`ALTER TABLE pipeline_runs ADD COLUMN stage_order TEXT`);
} catch (e) { /* Column already exists */ }
```

Update `createRun()`:
```typescript
async createRun(
  taskDescription: string,
  idOverride?: string,
  projectRoot?: string,
  template?: PipelineTemplate
): Promise<PipelineRun> {
  const id = idOverride || `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = Date.now();
  const templateConfig = template
    ? getTemplateById(template) || getDefaultTemplate()
    : getDefaultTemplate();
  const stageOrder = templateConfig.stages;

  const stmt = this.db.prepare(`
    INSERT INTO pipeline_runs (id, task_description, project_root, status, created_at, retry_count, template, stage_order)
    VALUES (?, ?, ?, 'running', ?, 0, ?, ?)
  `);
  stmt.run(id, taskDescription, projectRoot || null, createdAt, template || 'standard', JSON.stringify(stageOrder));

  const stages: Record<string, StageResult<any>> = {};
  for (const stage of stageOrder) {
    stages[stage] = { status: 'pending', model_used: '' };
  }

  return {
    id,
    task_description: taskDescription,
    project_root: projectRoot,
    status: 'running',
    created_at: createdAt,
    retry_count: 0,
    template: template || 'standard',
    stage_order: stageOrder,
    stages,
  };
}
```

> **CORRECTION (from original):** Only stages in `stage_order` are created. The original spec created all 5 base stages as `pending` regardless of template, producing ghost stages that never execute. If a Quick Fix template only has `plan`, `action`, `execute`, those are the only keys in `stages`.

Update `getRun()` and `getRunHistory()` — parse `stage_order` from JSON and use it to build the stages object:
```typescript
// In getRun() and getRunHistory():
const stageOrder: PipelineStage[] = run.stage_order
  ? JSON.parse(run.stage_order)
  : ['plan', 'action', 'review', 'validate', 'execute']; // backward compat for pre-template runs

const stages: Record<string, StageResult<any>> = {};
for (const stage of stageOrder) {
  stages[stage] = this.buildStageResult(stageResults, stage as PipelineStage);
}
```

Update `buildStageResult()` — accept `string` as stage parameter since new stages are dynamic:
```typescript
private buildStageResult(results: any[], stage: string): StageResult<any> {
  const stageResults = results.filter(r => r.stage === stage);
  if (stageResults.length === 0) {
    return { status: 'pending', model_used: '' };
  }
  // ... rest unchanged
}
```

#### 4. `electron/services/pipeline-orchestrator.ts`

Update `run()` method signature:
```typescript
async run(
  taskDescription: string,
  options: PipelineOptions,
  projectRoot?: string,
  runIdOverride?: string,
  template?: PipelineTemplate
): Promise<{ runId: string }>
```

Replace hardcoded stage sequence with iteration over `run.stage_order`:
```typescript
const run = await this.stateStore.createRun(taskDescription, runIdOverride, root, template);
const stageOrder = run.stage_order;
const runId = run.id;

for (const stage of stageOrder) {
  if (this.isCancelled(runId)) return this.handleCancellation(runId);
  if (Date.now() > deadline) return this.handleTimeout(runId, `${stage} stage timed out`);

  if (!this.isStageEnabled(stage)) {
    await this.markStageSkipped(runId, stage, 'Disabled by agent config');
    continue;
  }

  switch (stage) {
    case 'plan': /* existing plan logic */ break;
    case 'action': /* existing action logic (includes retry with review) */ break;
    case 'review': /* existing review logic */ break;
    case 'validate': /* existing validation logic */ break;
    case 'execute': /* existing execute logic */ break;
    case 'research': /* Phase 2 — no-op until implemented */ break;
    case 'security': /* Phase 2 — no-op until implemented */ break;
  }
}
```

> **CORRECTION (from original):** Now actually uses `isStageEnabled()` (which exists at line 69 but was never called in `run()`). Also adds `markStageSkipped()` helper.

Add `markStageSkipped()` helper:
```typescript
private async markStageSkipped(runId: string, stage: PipelineStage, reason: string): Promise<void> {
  await this.saveStageResult(runId, stage, 1, {
    status: 'skipped',
    model_used: '',
    error: reason,
  });
  this.emitStageUpdate(runId, stage, 'skipped');
}
```

**Note on action/review retry refactoring:** The current action/review retry `while` loop (lines 155–296) must be preserved as a sub-loop within the `case 'action'` / `case 'review'` handling. The simplest approach: when the stage iterator hits `'action'`, run the existing `while (attempt <= maxAutoAttempts)` block that covers both action and review. Then skip the `'review'` stage in the iterator since it was already handled inside the action loop. Mark this with a flag:

```typescript
let reviewHandledByActionLoop = false;

case 'action': {
  // Existing while loop that runs action + review
  reviewHandledByActionLoop = true;
  // ... existing logic from lines 155–296
  break;
}

case 'review': {
  if (reviewHandledByActionLoop) {
    // Already handled inside the action stage's retry loop
    break;
  }
  // Standalone review (future use)
  break;
}
```

#### 5. IPC Handlers (`electron/main.ts`)

Add:
```typescript
import { PIPELINE_TEMPLATES } from './services/pipeline-templates';

ipcMain.handle('pipeline:getTemplates', async () => {
  return PIPELINE_TEMPLATES;
});
```

Update `pipeline:run` handler to accept `template`:
```typescript
ipcMain.handle('pipeline:run', async (_, { task, options, projectRoot, runId, agentId, template }) => {
  orchestrator.setActiveAgent(agentId);
  if (projectRoot) orchestrator.setProjectRoot(projectRoot);
  return orchestrator.run(task, options, projectRoot, runId, template);
});
```

#### 6. `electron/preload.ts`

> **CORRECTION (from original):** The original spec omitted `preload.ts` entirely. New IPC channels must be exposed through `contextBridge` for the renderer to access them.

Add to the existing `contextBridge.exposeInMainWorld` call:
```typescript
// In the ipcRenderer expose section, ensure these channels are whitelisted:
'pipeline:getTemplates',
// (Phase 4 channels added later)
```

#### 7. `src/hooks/usePipeline.ts`

Add `PipelineTemplate` type (or import from shared types):
```typescript
export type PipelineTemplate =
  | 'quick-fix'
  | 'standard'
  | 'deep-review'
  | 'docs-only'
  | 'refactor';
```

Update local `PipelineRun` interface:
```typescript
export interface PipelineRun {
  id: string;
  task_description: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  created_at: number;
  completed_at?: number;
  retry_count: number;
  final_verdict?: 'PASS' | 'FAIL';
  template?: PipelineTemplate;
  stage_order?: PipelineStage[];
  stages: Record<string, StageResult<any>>;
}
```

Update `run()` method:
```typescript
const run = useCallback(async (
  task: string,
  options: PipelineOptions,
  projectRoot?: string,
  agentId?: string,
  template?: PipelineTemplate
) => {
  setIsRunning(true);
  const tempRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const templateStages = template
    ? await ipcRenderer.invoke('pipeline:getTemplates').then(
        (ts: any[]) => ts.find((t: any) => t.id === template)?.stages
      )
    : ['plan', 'action', 'review', 'validate', 'execute'];

  const stages: Record<string, StageResult<any>> = {};
  for (const stage of (templateStages || ['plan', 'action', 'review', 'validate', 'execute'])) {
    stages[stage] = { status: 'pending', model_used: '' };
  }

  const newRun: PipelineRun = {
    id: tempRunId,
    task_description: task,
    status: 'running',
    created_at: Date.now(),
    retry_count: 0,
    template,
    stage_order: templateStages,
    stages,
  };

  setActiveRun(newRun);
  currentRunId.current = tempRunId;
  startPolling(tempRunId);

  try {
    await ipcRenderer.invoke('pipeline:run', {
      task, options, projectRoot, runId: tempRunId, agentId, template,
    });
    return { runId: tempRunId };
  } catch (err) {
    setIsRunning(false);
    stopPolling();
    throw err;
  }
}, [startPolling, stopPolling]);
```

Add template fetcher:
```typescript
const getTemplates = useCallback(async () => {
  return ipcRenderer.invoke('pipeline:getTemplates');
}, []);
```

Update `UsePipelineReturn` and return object to include `getTemplates`.

#### 8. `src/components/Pipeline/PipelinePanel.tsx`

**Template Selector:** Add a selector shown before/when pipeline starts:
```tsx
const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate>('standard');
const [templates, setTemplates] = useState<PipelineTemplateConfig[]>([]);

useEffect(() => {
  ipcRenderer.invoke('pipeline:getTemplates').then(setTemplates);
}, []);

// In render — template selector tiles:
<div className="template-selector">
  {templates.map(t => (
    <button
      key={t.id}
      className={`template-tile ${selectedTemplate === t.id ? 'selected' : ''}`}
      onClick={() => setSelectedTemplate(t.id)}
    >
      <span className="template-icon">{t.icon}</span>
      <span className="template-name">{t.name}</span>
      <span className="template-desc">{t.description}</span>
    </button>
  ))}
</div>
```

**Dynamic Stage Pills in `ExecutionSummary`:**
```tsx
const stageOrder = run.stage_order || ['plan', 'action', 'review', 'validate', 'execute'];
const stageLabels: Record<string, string> = {
  plan: 'Plan', action: 'Action', review: 'Review',
  validate: 'Validate', execute: 'Execute',
  research: 'Research', security: 'Security',
};

// Replace hardcoded stageNames array with stageOrder
// Replace stageLabels[idx] with stageLabels[stage]
```

**Dynamic Stage Cards in `renderPipelineItem`:**
```tsx
<div className="pipeline-item-stages">
  {(run.stage_order || ['plan', 'action', 'review', 'validate', 'execute']).map((stage: string) => {
    const stageResult = run.stages?.[stage];
    if (!stageResult || (stageResult.status === 'pending' && !isActive)) return null;
    return <StageCard key={stage} stage={stage} result={stageResult} />;
  })}
</div>
```

#### 9. `src/components/Pipeline/StageCard.tsx`

Update the `stage` prop type and `STAGE_LABELS`:
```typescript
interface StageCardProps {
  stage: string;  // Was: 'plan' | 'action' | 'review' | 'validate' | 'execute'
  result?: StageResult<any>;
  attempt?: number;
}

const STAGE_LABELS: Record<string, string> = {
  plan: 'Plan',
  action: 'Action',
  review: 'Review',
  validate: 'Validate',
  execute: 'Execute',
  research: 'Research',
  security: 'Security',
};
```

Add `getStatusIcon` handling for `'skipped'`:
```typescript
if (status === 'skipped') {
  return <span className="status-icon skipped">⊘</span>;
}
```

---

## Phase 2: New Stages (Research, Security)

### Goal
Add two new pipeline stages: Research (before Plan) and Security Audit (after Review).

### File Changes

#### 1. `electron/services/pipeline-types.ts`

`PipelineStage` and result types already added in Phase 1. No additional type changes needed.

#### 2. `electron/services/agents/research-agent.ts` (NEW)

> **CORRECTION (from original):** The original spec used `ipcRenderer.invoke('chat:complete')` to call the LLM. This is wrong — these are main-process files. All existing agents (planner, coder, reviewer, validator, executor) use `getSharedOllama()` from `../shared-ollama` and call `ollama.chat()` directly. The corrected version follows the same pattern.
>
> **CORRECTION (from original):** The original spec used a `ResolvedModel` type that doesn't exist. The actual type is `RoutingDecision` from `../model-router`.
>
> **CORRECTION (from original):** `analyzeProject()` is `async` (returns `Promise<ProjectAnalysis>`). The original spec called it synchronously.

```typescript
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
    // Phase 1: Static analysis (no LLM)
    const analysis = await analyzeProject(projectRoot);

    // Phase 2: Read key files for context
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

    // Phase 3: LLM analysis for task-specific research
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
```

#### 3. `electron/services/agents/security-agent.ts` (NEW)

> **CORRECTION (from original):** Same LLM call fix — uses `getSharedOllama()` and `RoutingDecision`.

```typescript
import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { CodeOutput, TaskPlan, SecurityResult } from '../pipeline-types';
import * as fs from 'fs';
import * as path from 'path';

const SECRET_PATTERNS = [
  { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/i, type: 'hardcoded_api_key' },
  { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{4,})['"]/i, type: 'hardcoded_password' },
  { regex: /(?:secret|secret_key)\s*[:=]\s*['"]([a-zA-Z0-9]{16,})['"]/i, type: 'hardcoded_secret' },
  { regex: /(?:token|access_token)\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/i, type: 'hardcoded_token' },
  { regex: /(?:private[_-]?key)\s*[:=]\s*['"]([^'"]{20,})['"]/i, type: 'hardcoded_private_key' },
];

const INJECTION_PATTERNS = [
  { regex: /exec\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/, type: 'command_injection', severity: 'critical' as const },
  { regex: /eval\s*\(/, type: 'eval_usage', severity: 'high' as const },
  { regex: /new\s+Function\s*\(/, type: 'function_constructor', severity: 'high' as const },
  { regex: /innerHTML\s*=/, type: 'xss_innerhtml', severity: 'medium' as const },
  { regex: /document\.write\s*\(/, type: 'xss_document_write', severity: 'medium' as const },
];

const SQL_INJECTION_PATTERNS = [
  { regex: /(?:query|execute)\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/, type: 'sql_injection', severity: 'critical' as const },
  { regex: /`SELECT\s+.*\$\{.*\}/, type: 'sql_injection_template', severity: 'critical' as const },
];

export class SecurityAgent {
  async execute(
    codeOutput: CodeOutput,
    taskPlan: TaskPlan,
    projectRoot: string,
    modelDecision: RoutingDecision
  ): Promise<SecurityResult> {
    const vulnerabilities: SecurityResult['vulnerabilities'] = [];
    const dependencyIssues: SecurityResult['dependency_issues'] = [];

    // 1. Static pattern scanning on generated code
    for (const change of codeOutput.file_changes) {
      if (!change.content) continue;

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: 'high',
            type: pattern.type,
            description: `Potential ${pattern.type} found in ${change.file_path}`,
            file: change.file_path,
            recommendation: 'Use environment variables or a secret manager instead of hardcoding sensitive values.',
          });
        }
      }

      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: pattern.severity,
            type: pattern.type,
            description: `Potential ${pattern.type} in ${change.file_path}`,
            file: change.file_path,
            recommendation: this.getRecommendation(pattern.type),
          });
        }
      }

      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: pattern.severity,
            type: pattern.type,
            description: `Potential ${pattern.type} in ${change.file_path}`,
            file: change.file_path,
            recommendation: 'Use parameterized queries or an ORM instead of string interpolation.',
          });
        }
      }
    }

    // 2. Dependency vulnerability check via npm audit (if available)
    const npmAuditResult = await this.runNpmAudit(projectRoot);
    dependencyIssues.push(...npmAuditResult);

    // 3. LLM-powered security review
    const llmVulnerabilities = await this.runLLMSecurityReview(codeOutput, taskPlan, modelDecision);
    vulnerabilities.push(...llmVulnerabilities);

    // Calculate security score
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length;
    const lowCount = vulnerabilities.filter(v => v.severity === 'low').length;

    const score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 15) - (mediumCount * 8) - (lowCount * 3));
    const verdict = (criticalCount > 0 || highCount > 2) ? 'FAIL' : 'PASS';

    return {
      verdict,
      vulnerabilities,
      dependency_issues: dependencyIssues,
      summary: this.buildSummary(vulnerabilities, dependencyIssues, score),
      score,
    };
  }

  private async runNpmAudit(projectRoot: string): Promise<SecurityResult['dependency_issues']> {
    const issues: SecurityResult['dependency_issues'] = [];
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) return issues;

    try {
      const { execSync } = await import('child_process');
      const auditOutput = execSync('npm audit --json 2>/dev/null', {
        cwd: projectRoot,
        timeout: 30000,
        encoding: 'utf-8',
      });
      const audit = JSON.parse(auditOutput);

      if (audit.vulnerabilities) {
        for (const [pkg, info] of Object.entries(audit.vulnerabilities) as any[]) {
          issues.push({
            package: pkg,
            issue: `${info.severity} severity: ${info.title || info.via?.[0]?.title || 'known vulnerability'}`,
            severity: info.severity || 'medium',
          });
        }
      }
    } catch {
      // npm audit not available or failed — not critical
    }

    return issues.slice(0, 20);
  }

  private async runLLMSecurityReview(
    codeOutput: CodeOutput,
    taskPlan: TaskPlan,
    modelDecision: RoutingDecision
  ): Promise<SecurityResult['vulnerabilities']> {
    const prompt = this.buildSecurityPrompt(codeOutput, taskPlan);

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: 'You are a security auditor. Review the code changes for security vulnerabilities including OWASP Top 10, injection attacks, authentication bypasses, data exposure, and insecure configurations.' },
      { role: 'user', content: prompt },
    ];

    let rawOutput = '';
    try {
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
        }
      }
    } catch {
      return [];
    }

    try {
      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch { /* fall through */ }

    return [];
  }

  private buildSecurityPrompt(codeOutput: CodeOutput, taskPlan: TaskPlan): string {
    const code = codeOutput.file_changes.map(c =>
      `## ${c.file_path} (${c.operation})\n\`\`\`\n${c.content}\n\`\`\``
    ).join('\n');

    return `Review these code changes for security vulnerabilities:

Task: ${taskPlan.task_description}

${code}

Return findings as a JSON array:
[
  {
    "severity": "critical|high|medium|low",
    "type": "vulnerability type",
    "description": "description",
    "file": "file_path",
    "line": 10,
    "recommendation": "how to fix"
  }
]

If no vulnerabilities found, return an empty array [].`;
  }

  private getRecommendation(type: string): string {
    const recommendations: Record<string, string> = {
      'command_injection': 'Use child_process.execFile() with an argument array instead of exec() with string interpolation.',
      'eval_usage': 'Avoid eval(). Use JSON.parse() for JSON, or a proper parser for other formats.',
      'function_constructor': 'Avoid Function constructor. Use a safer alternative.',
      'xss_innerhtml': 'Use textContent or a sanitization library like DOMPurify instead of innerHTML.',
      'xss_document_write': 'Avoid document.write(). Use DOM manipulation methods instead.',
    };
    return recommendations[type] || 'Review and fix this security issue.';
  }

  private buildSummary(
    vulnerabilities: SecurityResult['vulnerabilities'],
    dependencyIssues: SecurityResult['dependency_issues'],
    score: number
  ): string {
    const parts: string[] = [];

    if (vulnerabilities.length === 0 && dependencyIssues.length === 0) {
      return `Security audit passed with a score of ${score}/100. No vulnerabilities detected.`;
    }

    if (vulnerabilities.length > 0) {
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const v of vulnerabilities) bySeverity[v.severity]++;
      parts.push(`Found ${vulnerabilities.length} vulnerability(ies): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low.`);
    }

    if (dependencyIssues.length > 0) {
      parts.push(`${dependencyIssues.length} dependency issue(s) detected.`);
    }

    parts.push(`Security score: ${score}/100.`);
    return parts.join(' ');
  }
}

let instance: SecurityAgent | null = null;
export function getSecurityAgent(): SecurityAgent {
  if (!instance) instance = new SecurityAgent();
  return instance;
}
```

> **CORRECTION (from original):** Replaced the hardcoded `isVulnerableVersion()` with `runNpmAudit()` that shells out to `npm audit --json`. The static regex patterns remain as a fast pre-check that doesn't require npm, but the primary dependency audit is now real. Falls back gracefully if npm is unavailable.

#### 4. `electron/services/pipeline-orchestrator.ts`

Add agent instances:
```typescript
import { getResearchAgent } from './agents/research-agent';
import { getSecurityAgent } from './agents/security-agent';

export class PipelineOrchestrator {
  // ... existing agents ...
  private researchAgent = getResearchAgent();
  private securityAgent = getSecurityAgent();
```

Add stage handlers in the main loop's switch:
```typescript
case 'research': {
  const researchResult = await this.runResearch(runId, taskDescription, root, effectiveOptions);
  if (researchResult) {
    context.researchResult = researchResult;
  }
  break;
}

case 'security': {
  if (!context.codeOutput || !context.taskPlan) {
    await this.markStageSkipped(runId, 'security', 'No code output available');
    break;
  }
  const securityResult = await this.runSecurity(runId, context.taskPlan, context.codeOutput, root, effectiveOptions);
  if (securityResult) {
    context.securityResult = securityResult;
    const criticalCount = securityResult.vulnerabilities.filter(v => v.severity === 'critical').length;
    if (criticalCount > 0) {
      await this.stateStore.finalizeRun(runId, 'FAIL');
      this.emitComplete(runId, 'FAIL', context.codeOutput);
      return { runId };
    }
  }
  break;
}
```

Add `runResearch()` and `runSecurity()` methods following the exact same emit/save pattern as existing `runValidation()`:

```typescript
private async runResearch(
  runId: string,
  taskDescription: string,
  projectRoot: string,
  options: PipelineOptions
): Promise<ResearchResult | null> {
  this.emitStageUpdate(runId, 'research', 'running');
  this.emitRealTimeUpdate(runId, 'research', 'sending', this.createActivityLog('Starting codebase research...'));

  const researchModel = await this.router.resolve('planning');
  const startTime = Date.now();

  try {
    this.emitRealTimeUpdate(runId, 'research', 'processing', this.createActivityLog('Analyzing project structure...'));
    const result = await this.researchAgent.execute(taskDescription, projectRoot, researchModel);

    await this.saveStageResult(runId, 'research', 1, {
      status: 'complete',
      model_used: researchModel.resolvedModel,
      duration_ms: Date.now() - startTime,
      output: result,
    });
    this.recordStageUsage(runId, 'research', researchModel.resolvedModel, Date.now() - startTime);
    this.emitStageUpdate(runId, 'research', 'complete', result);
    this.emitRealTimeUpdate(runId, 'research', 'complete', this.createActivityLog(
      `Research found ${result.key_findings.length} findings across ${result.files_examined.length} files`,
      'success'
    ));

    return result;
  } catch (err) {
    const errorMsg = String(err);
    await this.saveStageResult(runId, 'research', 1, {
      status: 'failed',
      model_used: researchModel.resolvedModel,
      duration_ms: Date.now() - startTime,
      error: errorMsg,
    });
    this.emitStageUpdate(runId, 'research', 'failed', { error: errorMsg });
    this.emitRealTimeUpdate(runId, 'research', 'failed', this.createActivityLog(`Research failed: ${errorMsg}`, 'error'));
    return null;
  }
}

private async runSecurity(
  runId: string,
  taskPlan: TaskPlan,
  codeOutput: CodeOutput,
  projectRoot: string,
  options: PipelineOptions
): Promise<SecurityResult | null> {
  this.emitStageUpdate(runId, 'security', 'running');
  this.emitRealTimeUpdate(runId, 'security', 'sending', this.createActivityLog('Starting security audit...'));

  const securityModel = await this.router.resolve('review');
  const startTime = Date.now();

  try {
    this.emitRealTimeUpdate(runId, 'security', 'processing', this.createActivityLog('Scanning for vulnerabilities...'));
    const result = await this.securityAgent.execute(codeOutput, taskPlan, projectRoot, securityModel);

    await this.saveStageResult(runId, 'security', 1, {
      status: 'complete',
      model_used: securityModel.resolvedModel,
      duration_ms: Date.now() - startTime,
      output: result,
    });
    this.recordStageUsage(runId, 'security', securityModel.resolvedModel, Date.now() - startTime);
    this.emitStageUpdate(runId, 'security', 'complete', result);
    this.emitRealTimeUpdate(runId, 'security', 'complete', this.createActivityLog(
      `Security audit: ${result.verdict} (score: ${result.score}/100, ${result.vulnerabilities.length} issues)`,
      result.verdict === 'PASS' ? 'success' : 'error'
    ));

    return result;
  } catch (err) {
    const errorMsg = String(err);
    await this.saveStageResult(runId, 'security', 1, {
      status: 'failed',
      model_used: securityModel.resolvedModel,
      duration_ms: Date.now() - startTime,
      error: errorMsg,
    });
    this.emitStageUpdate(runId, 'security', 'failed', { error: errorMsg });
    this.emitRealTimeUpdate(runId, 'security', 'failed', this.createActivityLog(`Security audit failed: ${errorMsg}`, 'error'));
    return null;
  }
}
```

#### 5. `src/components/Pipeline/StageCard.tsx`

Add rendering for research and security stages:

**Research stage:**
```tsx
const renderResearchResults = () => {
  if (!output || stage !== 'research') return null;
  const researchResult = output as ResearchResult;

  return (
    <div className="research-results">
      <div className="research-summary">{researchResult.summary}</div>
      {researchResult.key_findings.length > 0 && (
        <div className="findings-section">
          <h4>Key Findings</h4>
          <ul className="findings-list">
            {researchResult.key_findings.map((f, idx) => (
              <li key={idx}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {researchResult.files_examined.length > 0 && (
        <div className="files-examined">
          <h4>Files Examined ({researchResult.files_examined.length})</h4>
          <ul>{researchResult.files_examined.map((f, idx) => <li key={idx}>{f}</li>)}</ul>
        </div>
      )}
    </div>
  );
};
```

**Security stage:**
```tsx
const renderSecurityResults = () => {
  if (!output || stage !== 'security') return null;
  const securityResult = output as SecurityResult;

  const scoreColor = securityResult.score > 80 ? 'green' : securityResult.score > 50 ? 'yellow' : 'red';

  return (
    <div className="security-results">
      <div className={`security-score-badge ${scoreColor}`}>
        <span className="score-value">{securityResult.score}</span>
        <span className="score-label">/100</span>
      </div>
      <div className="security-summary">{securityResult.summary}</div>
      {securityResult.vulnerabilities.length > 0 && (
        <div className="vulnerability-section">
          <h4>Vulnerabilities ({securityResult.vulnerabilities.length})</h4>
          <table className="vulnerability-table">
            <thead><tr><th>Severity</th><th>Type</th><th>File</th><th>Description</th></tr></thead>
            <tbody>
              {securityResult.vulnerabilities.map((v, idx) => (
                <tr key={idx} className={`severity-${v.severity}`}>
                  <td><span className={`severity-badge ${v.severity}`}>{v.severity}</span></td>
                  <td>{v.type}</td>
                  <td>{v.file}</td>
                  <td>{v.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {securityResult.dependency_issues.length > 0 && (
        <div className="dependency-issues">
          <h4>Dependency Issues ({securityResult.dependency_issues.length})</h4>
          <ul>{securityResult.dependency_issues.map((d, idx) => (
            <li key={idx}><strong>{d.package}</strong>: {d.issue}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
};
```

Add to the render output section:
```tsx
{renderResearchResults()}
{renderSecurityResults()}
```

Add security verdict badge:
```tsx
const renderSecurityBadge = () => {
  if (!output || stage !== 'security') return null;
  const securityResult = output as SecurityResult;
  return (
    <div className={`verdict-badge ${securityResult.verdict.toLowerCase()}`}>
      {securityResult.verdict} ({securityResult.score}/100)
    </div>
  );
};
```

#### 6. CSS (`Pipeline.css`, `StageCard.css`)

Add styles for:
- `.security-score-badge` — Circular score indicator with color variants (`.green`, `.yellow`, `.red`)
- `.vulnerability-table` — Table with severity-colored rows
- `.severity-badge` — Inline severity indicators (`.critical` red, `.high` orange, `.medium` yellow, `.low` blue)
- `.research-results` — Summary and findings layout
- `.findings-list` — Bullet list with subtle left border
- `.template-selector` — CSS grid of template tiles
- `.template-tile` — Selected/unselected states with border highlight
- `.stage-card.skipped` — Muted/dimmed appearance
- `.status-icon.skipped` — Greyed out skip icon

---

## Phase 3: Conditional/Dynamic Pipelines

### Goal
Replace the fixed linear pipeline with a smart graph that branches, loops, and exits early based on runtime conditions.

### Ownership Clarification

> **CORRECTION (from original):** The original spec had two overlapping systems — `stage_order` (Phase 1) and the pipeline graph (Phase 3). This corrected version clarifies ownership:
>
> - **`stage_order`** (from Phase 1): Persisted in SQLite. Used by the UI for rendering stage pills and cards. Represents the *intended* stage sequence at pipeline creation time.
> - **Pipeline graph** (Phase 3): Drives *execution*. The graph walker determines the actual next stage at runtime, which may differ from `stage_order` (e.g., skipping stages, looping back). The graph is derived from the template at run start and is not persisted.
> - When the graph causes a non-linear transition (skip, loop, early exit), the UI is notified via stage updates and the run's `stages` record reflects actual outcomes.

### Stage Graph Definition

#### `electron/services/pipeline-graph.ts` (NEW)

```typescript
import { PipelineStage, PipelineTemplate, TaskPlan, CodeOutput, ReviewResult, SecurityResult, ValidationResult, ResearchResult } from './pipeline-types';

export interface PipelineContext {
  taskDescription: string;
  taskPlan?: TaskPlan;
  codeOutput?: CodeOutput;
  reviewResult?: ReviewResult;
  securityResult?: SecurityResult;
  validationResult?: ValidationResult;
  researchResult?: ResearchResult;
  retryCountByStage: Record<string, number>;
  replanCount: number;
  template: PipelineTemplate;
}

export interface StageNode {
  id: PipelineStage;
  condition?: (context: PipelineContext) => boolean;
  onFail: 'stop' | 'retry' | 'skip' | 'replan';
  maxRetries?: number;
  resolveNext: (context: PipelineContext, result: any) => PipelineStage | null;
}

export interface PipelineGraph {
  entry: PipelineStage;
  nodes: Map<PipelineStage, StageNode>;
}

export const MAX_REPLANS = 2;
```

> **CORRECTION (from original):** Changed `retryCount: number` (single shared counter) to `retryCountByStage: Record<string, number>` (per-stage counters). The original shared counter meant that if the action stage used 2 retries, the review stage would inherit `retryCount = 2` and immediately exhaust its budget. Per-stage counters are independent.
>
> **CORRECTION (from original):** Added `replanCount: number` with a `MAX_REPLANS` constant. The original `onFail: 'replan'` could infinite-loop if the plan always succeeds but downstream always fails. This adds a circuit breaker.

```typescript
export function buildPipelineGraph(template: PipelineTemplate): PipelineGraph {
  const nodes = new Map<PipelineStage, StageNode>();

  switch (template) {
    case 'quick-fix':
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'execute',
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'plan', nodes };

    case 'deep-review':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'plan',
      });
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'security';
          const stageRetries = ctx.retryCountByStage['review'] || 0;
          if (stageRetries < 2) return 'action';
          return null;
        },
      });
      nodes.set('security', {
        id: 'security',
        onFail: 'stop',
        resolveNext: (ctx) => {
          const criticalCount = ctx.securityResult?.vulnerabilities.filter(v => v.severity === 'critical').length || 0;
          if (criticalCount > 0) return null;
          return 'validate';
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    case 'docs-only':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'plan',
      });
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 1,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    case 'refactor':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          const stageRetries = ctx.retryCountByStage['review'] || 0;
          if (stageRetries < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    default: // 'standard'
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          const stageRetries = ctx.retryCountByStage['review'] || 0;
          if (stageRetries < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'plan', nodes };
  }
}
```

#### Orchestrator Graph Walker

Replace the main `run()` method's stage loop with the graph walker:

```typescript
import { buildPipelineGraph, PipelineContext, MAX_REPLANS } from './pipeline-graph';

async run(
  taskDescription: string,
  options: PipelineOptions,
  projectRoot?: string,
  runIdOverride?: string,
  template?: PipelineTemplate
): Promise<{ runId: string }> {
  const effectiveOptions = this.getEffectiveOptions(options);
  const root = projectRoot || this.projectRoot;
  const effectiveTemplate = template || 'standard';
  const run = await this.stateStore.createRun(taskDescription, runIdOverride, root, effectiveTemplate);
  const deadline = Date.now() + effectiveOptions.timeoutMs;
  const runId = run.id;

  if (root) {
    this.coderAgent.setProjectRoot(root);
  }

  const graph = buildPipelineGraph(effectiveTemplate);
  const context: PipelineContext = {
    taskDescription,
    retryCountByStage: {},
    replanCount: 0,
    template: effectiveTemplate,
  };

  let currentStage: PipelineStage | null = graph.entry;

  try {
    while (currentStage) {
      if (this.isCancelled(runId)) return this.handleCancellation(runId);
      if (Date.now() > deadline) return this.handleTimeout(runId, `${currentStage} stage timed out`);

      const node = graph.nodes.get(currentStage);
      if (!node) {
        console.error(`[Pipeline] Unknown stage: ${currentStage}`);
        break;
      }

      // Check agent-level stage toggle
      if (!this.isStageEnabled(currentStage)) {
        await this.markStageSkipped(runId, currentStage, 'Disabled by agent config');
        currentStage = node.resolveNext(context, null);
        continue;
      }

      // Evaluate condition
      if (node.condition && !node.condition(context)) {
        await this.markStageSkipped(runId, currentStage, 'Condition not met');
        currentStage = node.resolveNext(context, null);
        continue;
      }

      // Execute stage
      const result = await this.executeSingleStage(runId, currentStage, context, effectiveOptions, root);

      if (!result) {
        // Stage execution failed
        const stageRetries = context.retryCountByStage[currentStage] || 0;

        if (node.onFail === 'retry' && stageRetries < (node.maxRetries || 2)) {
          context.retryCountByStage[currentStage] = stageRetries + 1;
          await this.stateStore.incrementRetryCount(runId);
          continue;
        }
        if (node.onFail === 'replan' && context.replanCount < MAX_REPLANS) {
          context.replanCount++;
          currentStage = 'plan';
          continue;
        }
        if (node.onFail === 'skip') {
          await this.markStageSkipped(runId, currentStage, 'Stage failed, skipping');
          currentStage = node.resolveNext(context, null);
          continue;
        }
        // onFail === 'stop' (or exhausted retries/replans)
        await this.stateStore.finalizeRun(runId, 'FAIL');
        this.emitComplete(runId, 'FAIL', context.codeOutput || undefined);
        return { runId };
      }

      // Update context with result
      this.updateContext(context, currentStage, result);

      // Resolve next stage
      currentStage = node.resolveNext(context, result);
    }

    await this.stateStore.finalizeRun(runId, 'PASS');
    this.emitComplete(runId, 'PASS', context.codeOutput || undefined);
    return { runId };

  } catch (err) {
    console.error('[PipelineOrchestrator] Unhandled error:', err);
    await this.stateStore.updateRunStatus(runId, 'failed');
    this.emitError(runId, String(err));
    return { runId };
  } finally {
    this.cancellationFlags.delete(runId);
  }
}

private async executeSingleStage(
  runId: string,
  stage: PipelineStage,
  context: PipelineContext,
  options: PipelineOptions,
  root: string
): Promise<any> {
  switch (stage) {
    case 'research':
      return this.runResearch(runId, context.taskDescription, root, options);
    case 'plan':
      return this.runPlanStage(runId, context, options);
    case 'action':
      return this.runActionStage(runId, context, options);
    case 'review':
      return this.runReviewStage(runId, context, options);
    case 'security':
      return this.runSecurity(runId, context.taskPlan!, context.codeOutput!, root, options);
    case 'validate':
      return this.runValidation(runId, context.taskPlan!, context.codeOutput!, context.reviewResult!);
    case 'execute':
      return this.executeStage(runId, context.codeOutput!, root);
    default:
      return null;
  }
}

private updateContext(context: PipelineContext, stage: PipelineStage, result: any): void {
  switch (stage) {
    case 'research':
      context.researchResult = result;
      break;
    case 'plan':
      context.taskPlan = result;
      break;
    case 'action':
      context.codeOutput = result;
      break;
    case 'review':
      context.reviewResult = result;
      break;
    case 'security':
      context.securityResult = result;
      break;
    case 'validate':
      context.validationResult = result;
      break;
  }
}
```

> **CORRECTION (from original):** Per-stage retry via `context.retryCountByStage[currentStage]`. Replan guard via `context.replanCount < MAX_REPLANS`.

#### Smart Task Detection Enhancement (Opt-In)

> **CORRECTION (from original):** The original spec auto-skipped review for "low complexity" tasks. A one-line change can introduce a critical bug regardless of complexity. This is now gated behind an opt-in pipeline option.

Add to `PipelineOptions`:
```typescript
export interface PipelineOptions {
  maxRetries: number;
  timeoutMs: number;
  autoExecute: boolean;
  smartSkip?: boolean;  // Opt-in: auto-skip stages based on task analysis
}
```

Only apply when `options.smartSkip === true`:
```typescript
// In updateContext, after plan:
if (stage === 'plan' && result && options.smartSkip) {
  const isDocTask = result.subtasks.every((s: any) =>
    s.description.toLowerCase().includes('document') ||
    s.description.toLowerCase().includes('readme') ||
    s.description.toLowerCase().includes('spec')
  );
  if (isDocTask) {
    await this.markStageSkipped(runId, 'validate', 'Documentation task (smart skip)');
    await this.markStageSkipped(runId, 'execute', 'Documentation task (smart skip)');
  }
}
```

#### UI: Skipped Stages & Branch Indicators

In `PipelinePanel.tsx`, render skipped stages:
```tsx
{(run.stage_order || ['plan', 'action', 'review', 'validate', 'execute']).map((stage: string) => {
  const stageResult = run.stages?.[stage];
  if (stageResult?.status === 'skipped') {
    return (
      <div key={stage} className="stage-card skipped">
        <div className="stage-header">
          <span className="stage-icon">⊘</span>
          <span className="stage-label">{STAGE_LABELS[stage] || stage}</span>
          <span className="skipped-reason" title={stageResult.error || 'Skipped'}>
            Skipped
          </span>
        </div>
      </div>
    );
  }
  return <StageCard key={stage} stage={stage} result={stageResult} />;
})}
```

---

## Phase 4: Pipeline Analytics

### Goal
Track and visualize pipeline performance: success rates, bottlenecks, costs, model performance.

### Approach

> **CORRECTION (from original):** The original spec created a separate `PipelineAnalytics` class with its own `better-sqlite3` connection to `localmind.db`. This risks `SQLITE_BUSY` errors since SQLite allows only one writer at a time. The corrected version integrates analytics into the existing `PipelineStateStore` class, sharing its DB connection.

### SQLite Schema

Add to `pipeline-state.ts` `init()`:

```sql
CREATE TABLE IF NOT EXISTS pipeline_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  template TEXT,
  total_duration_ms INTEGER,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  stages_completed INTEGER DEFAULT 0,
  stages_skipped INTEGER DEFAULT 0,
  stages_failed INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  final_verdict TEXT,
  bottleneck_stage TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_stage_analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  duration_ms INTEGER,
  tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  model TEXT,
  status TEXT,
  attempt INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_analytics_created ON pipeline_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage_analytics_run ON pipeline_stage_analytics(run_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage_analytics_stage ON pipeline_stage_analytics(stage);
```

### Analytics Methods (added to `PipelineStateStore`)

> **CORRECTION (from original):** Analytics methods are added directly to `PipelineStateStore` rather than a separate class, sharing the existing DB connection.

```typescript
// Add these methods to the PipelineStateStore class:

getAnalyticsSummary(fromTimestamp?: number, toTimestamp?: number) {
  const from = fromTimestamp || 0;
  const to = toTimestamp || Date.now();

  const row = this.db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(CASE WHEN final_verdict = 'PASS' THEN 1 ELSE 0 END) as passed_runs,
      AVG(total_duration_ms) as avg_duration_ms,
      SUM(total_tokens) as total_tokens,
      SUM(total_cost_usd) as total_cost_usd,
      AVG(retry_count) as avg_retries
    FROM pipeline_analytics
    WHERE created_at BETWEEN ? AND ?
  `).get(from, to) as any;

  return {
    totalRuns: row.total_runs || 0,
    successRate: row.total_runs > 0 ? Math.round((row.passed_runs / row.total_runs) * 100) : 0,
    avgDurationMs: Math.round(row.avg_duration_ms || 0),
    totalTokens: row.total_tokens || 0,
    totalCostUsd: Math.round((row.total_cost_usd || 0) * 100) / 100,
    avgRetries: Math.round((row.avg_retries || 0) * 10) / 10,
  };
}

getAnalyticsByTemplate(fromTimestamp?: number, toTimestamp?: number) {
  const from = fromTimestamp || 0;
  const to = toTimestamp || Date.now();

  return this.db.prepare(`
    SELECT
      template,
      COUNT(*) as count,
      SUM(CASE WHEN final_verdict = 'PASS' THEN 1 ELSE 0 END) as passed,
      AVG(total_duration_ms) as avg_duration_ms,
      AVG(total_cost_usd) as avg_cost_usd
    FROM pipeline_analytics
    WHERE created_at BETWEEN ? AND ? AND template IS NOT NULL
    GROUP BY template
    ORDER BY count DESC
  `).all(from, to) as any[];
}

getBottleneckStages(fromTimestamp?: number, toTimestamp?: number) {
  const from = fromTimestamp || 0;
  const to = toTimestamp || Date.now();

  return this.db.prepare(`
    SELECT
      stage,
      COUNT(*) as executions,
      AVG(duration_ms) as avg_duration_ms,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures,
      AVG(cost_usd) as avg_cost_usd
    FROM pipeline_stage_analytics
    WHERE created_at BETWEEN ? AND ?
    GROUP BY stage
    ORDER BY avg_duration_ms DESC
  `).all(from, to) as any[];
}

getModelPerformance(fromTimestamp?: number, toTimestamp?: number) {
  const from = fromTimestamp || 0;
  const to = toTimestamp || Date.now();

  return this.db.prepare(`
    SELECT
      model,
      COUNT(*) as executions,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as successes,
      AVG(duration_ms) as avg_duration_ms,
      AVG(cost_usd) as avg_cost_usd
    FROM pipeline_stage_analytics
    WHERE created_at BETWEEN ? AND ? AND model IS NOT NULL AND model != 'local-execution'
    GROUP BY model
    ORDER BY executions DESC
  `).all(from, to) as any[];
}

recordAnalytics(runId: string, template?: string): void {
  const run = this.db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!run) return;

  const stages = this.db.prepare(`
    SELECT * FROM pipeline_stage_results WHERE run_id = ? ORDER BY attempt
  `).all(runId) as any[];

  const totalDuration = stages.reduce((sum: number, s: any) => sum + (s.duration_ms || 0), 0);
  const completedStages = stages.filter((s: any) => s.status === 'complete').length;
  const skippedStages = stages.filter((s: any) => s.status === 'skipped').length;
  const failedStages = stages.filter((s: any) => s.status === 'failed').length;

  // Compute total tokens from usage tracker data
  let totalTokens = 0;
  let totalCost = 0;
  try {
    const usageTracker = getUsageTracker();
    const usage = usageTracker.getByConversation(`pipeline:${runId}`);
    if (usage) {
      totalTokens = usage.reduce((sum: number, u: any) => sum + (u.totalTokens || 0), 0);
      totalCost = usage.reduce((sum: number, u: any) => sum + (u.cost || 0), 0);
    }
  } catch { /* usage tracking may not have data */ }

  const longestStage = stages.reduce((max: any, s: any) =>
    (s.duration_ms || 0) > (max?.duration_ms || 0) ? s : max
  , stages[0] || { stage: 'unknown', duration_ms: 0 });

  this.db.prepare(`
    INSERT INTO pipeline_analytics
      (run_id, template, total_duration_ms, total_tokens, total_cost_usd, stages_completed, stages_skipped, stages_failed, retry_count, final_verdict, bottleneck_stage, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId, template || null, totalDuration, totalTokens, totalCost,
    completedStages, skippedStages, failedStages,
    run.retry_count, run.final_verdict, longestStage?.stage, run.created_at
  );

  for (const stage of stages) {
    this.db.prepare(`
      INSERT INTO pipeline_stage_analytics
        (run_id, stage, duration_ms, tokens, cost_usd, model, status, attempt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, stage.stage, stage.duration_ms, 0, 0, stage.model_used, stage.status, stage.attempt, run.created_at);
  }
}
```

> **CORRECTION (from original):** `recordAnalytics()` now pulls token/cost data from the usage tracker (`getUsageTracker().getByConversation()`), which is already populated by the orchestrator's `recordStageUsage()` calls. The original spec left `total_tokens` and `total_cost_usd` always at 0.

### Call `recordAnalytics` from the orchestrator

In `pipeline-orchestrator.ts`, after `finalizeRun()`:
```typescript
await this.stateStore.finalizeRun(runId, verdict);
this.stateStore.recordAnalytics(runId, effectiveTemplate);
```

### IPC Handlers

Add to `electron/main.ts`:

```typescript
ipcMain.handle('pipeline:analytics:getSummary', async (_, { fromTimestamp, toTimestamp }) => {
  return getPipelineStateStore().getAnalyticsSummary(fromTimestamp, toTimestamp);
});

ipcMain.handle('pipeline:analytics:getByTemplate', async (_, { fromTimestamp, toTimestamp }) => {
  return getPipelineStateStore().getAnalyticsByTemplate(fromTimestamp, toTimestamp);
});

ipcMain.handle('pipeline:analytics:getByStage', async (_, { fromTimestamp, toTimestamp }) => {
  return getPipelineStateStore().getBottleneckStages(fromTimestamp, toTimestamp);
});

ipcMain.handle('pipeline:analytics:getByModel', async (_, { fromTimestamp, toTimestamp }) => {
  return getPipelineStateStore().getModelPerformance(fromTimestamp, toTimestamp);
});
```

### `electron/preload.ts`

Add to whitelisted channels:
```typescript
'pipeline:analytics:getSummary',
'pipeline:analytics:getByTemplate',
'pipeline:analytics:getByStage',
'pipeline:analytics:getByModel',
```

### Analytics Tab UI

Add to `PipelinePanel.tsx`:

```tsx
const [activeTab, setActiveTab] = useState<'runs' | 'analytics'>('runs');

// Tab switcher in panel header:
<div className="pipeline-tabs">
  <button
    className={`tab ${activeTab === 'runs' ? 'active' : ''}`}
    onClick={() => setActiveTab('runs')}
  >
    Runs
  </button>
  <button
    className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
    onClick={() => setActiveTab('analytics')}
  >
    Analytics
  </button>
</div>

// Conditional content:
{activeTab === 'analytics' && <AnalyticsDashboard />}
```

`AnalyticsDashboard` component (inline or separate file):

```tsx
function AnalyticsDashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [byTemplate, setByTemplate] = useState<any[]>([]);
  const [byStage, setByStage] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  const ipcRenderer = (window as any).ipcRenderer;

  useEffect(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 365;
    const from = Date.now() - (days * 24 * 60 * 60 * 1000);

    Promise.all([
      ipcRenderer.invoke('pipeline:analytics:getSummary', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByTemplate', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByStage', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByModel', { fromTimestamp: from }),
    ]).then(([s, t, st, m]) => {
      setSummary(s);
      setByTemplate(t);
      setByStage(st);
      setByModel(m);
    });
  }, [timeRange]);

  if (!summary) return <div className="analytics-loading">Loading analytics...</div>;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="analytics-dashboard">
      <div className="analytics-filters">
        {(['7d', '30d', 'all'] as const).map(range => (
          <button
            key={range}
            className={`time-filter ${timeRange === range ? 'active' : ''}`}
            onClick={() => setTimeRange(range)}
          >
            {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All Time'}
          </button>
        ))}
      </div>

      <div className="analytics-summary-cards">
        <div className="summary-card">
          <div className="card-value">{summary.successRate}%</div>
          <div className="card-label">Success Rate</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{formatDuration(summary.avgDurationMs)}</div>
          <div className="card-label">Avg Duration</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{summary.totalRuns}</div>
          <div className="card-label">Total Runs</div>
        </div>
        <div className="summary-card">
          <div className="card-value">${summary.totalCostUsd}</div>
          <div className="card-label">Total Cost</div>
        </div>
      </div>

      {byTemplate.length > 0 && (
        <div className="analytics-section">
          <h3>Template Performance</h3>
          <table className="analytics-table">
            <thead>
              <tr><th>Template</th><th>Success</th><th>Avg Time</th><th>Avg Cost</th><th>Count</th></tr>
            </thead>
            <tbody>
              {byTemplate.map(t => (
                <tr key={t.template}>
                  <td>{t.template}</td>
                  <td>{Math.round((t.passed / t.count) * 100)}%</td>
                  <td>{formatDuration(t.avg_duration_ms)}</td>
                  <td>${Math.round(t.avg_cost_usd * 100) / 100}</td>
                  <td>{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {byStage.length > 0 && (
        <div className="analytics-section">
          <h3>Stage Bottlenecks</h3>
          {byStage.map(s => {
            const maxDuration = Math.max(...byStage.map(x => x.avg_duration_ms));
            const percentage = maxDuration > 0 ? (s.avg_duration_ms / maxDuration) * 100 : 0;
            return (
              <div key={s.stage} className="bottleneck-bar">
                <div className="bottleneck-label">{s.stage}</div>
                <div className="bottleneck-track">
                  <div className="bottleneck-fill" style={{ width: `${percentage}%` }} />
                </div>
                <div className="bottleneck-value">{formatDuration(s.avg_duration_ms)}</div>
                <div className="bottleneck-fail-rate">
                  {s.failures}/{s.executions} failed
                </div>
              </div>
            );
          })}
        </div>
      )}

      {byModel.length > 0 && (
        <div className="analytics-section">
          <h3>Model Performance</h3>
          <table className="analytics-table">
            <thead>
              <tr><th>Model</th><th>Success Rate</th><th>Avg Time</th><th>Avg Cost</th><th>Executions</th></tr>
            </thead>
            <tbody>
              {byModel.map(m => (
                <tr key={m.model}>
                  <td className="model-cell">{m.model}</td>
                  <td>{Math.round((m.successes / m.executions) * 100)}%</td>
                  <td>{formatDuration(m.avg_duration_ms)}</td>
                  <td>${Math.round(m.avg_cost_usd * 100) / 100}</td>
                  <td>{m.executions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

### Per-Run Analytics Bar

In the expanded pipeline item footer, add:
```tsx
<div className="run-analytics-bar">
  <span className="run-stat">
    ⏱ {formatDuration(totalDuration)}
  </span>
  <span className="run-stat">
    🔄 {run.retry_count} retries
  </span>
  {skippedCount > 0 && (
    <span className="run-stat skipped">
      ⊘ {skippedCount} skipped
    </span>
  )}
</div>
```

---

## Implementation Order & Dependencies

```
Phase 1: Pipeline Templates (Foundation)
├── 1.1 Types + Template Registry (pipeline-types.ts, pipeline-templates.ts)
├── 1.2 State Store migration (pipeline-state.ts — add columns, update createRun/getRun)
├── 1.3 Orchestrator template support (pipeline-orchestrator.ts — accept template, iterate stage_order)
├── 1.4 IPC + preload (main.ts, preload.ts — add pipeline:getTemplates)
├── 1.5 Hook updates (usePipeline.ts — template param, type updates)
├── 1.6 UI template selector (PipelinePanel.tsx)
└── 1.7 Dynamic stage rendering (PipelinePanel.tsx, StageCard.tsx — use stage_order)

Phase 2: New Stages (Research, Security)
├── 2.1 Agent implementations (agents/research-agent.ts, agents/security-agent.ts)
├── 2.2 Orchestrator integration (pipeline-orchestrator.ts — runResearch, runSecurity, switch cases)
├── 2.3 StageCard rendering (StageCard.tsx — research findings, security score + vulnerability table)
└── 2.4 CSS (StageCard.css, Pipeline.css — new stage styles)

Phase 3: Conditional/Dynamic Pipelines (Graph Engine)
├── 3.1 Stage Graph definition (pipeline-graph.ts — graph builder per template)
├── 3.2 Orchestrator graph walker (pipeline-orchestrator.ts — replace stage loop with graph traversal)
├── 3.3 Smart task detection opt-in (PipelineOptions.smartSkip)
└── 3.4 UI: skipped stages, branch indicators (PipelinePanel.tsx, StageCard.tsx)

Phase 4: Pipeline Analytics (Observability)
├── 4.1 SQLite tables (pipeline-state.ts — pipeline_analytics, pipeline_stage_analytics)
├── 4.2 Analytics methods (pipeline-state.ts — query + recording methods)
├── 4.3 Orchestrator hook (pipeline-orchestrator.ts — call recordAnalytics after finalize)
├── 4.4 IPC handlers + preload (main.ts, preload.ts — analytics endpoints)
└── 4.5 Analytics tab UI (PipelinePanel.tsx — AnalyticsDashboard component)
```

### Key Dependencies
- Phase 2 depends on Phase 1 (new stages need to be in stage_order and PipelineStage union)
- Phase 3 depends on Phase 1 (graph uses template to build stage graph)
- Phase 3 depends on Phase 2 (graph includes research/security nodes)
- Phase 4 is independent but benefits from template info (Phase 1)

### Scope
- **New files:** 4 (pipeline-templates.ts, research-agent.ts, security-agent.ts, pipeline-graph.ts)
- **Modified files:** ~10 (pipeline-types.ts, pipeline-state.ts, pipeline-orchestrator.ts, main.ts, preload.ts, usePipeline.ts, PipelinePanel.tsx, StageCard.tsx, StageCard.css, Pipeline.css)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite migration breaks existing runs | High | Backward compat: default `stage_order` to 5-stage sequence when column is NULL |
| Graph walker introduces bugs in retry logic | High | Per-stage retry counters; keep Phase 1 linear loop as initial implementation, migrate to graph in Phase 3 |
| Security agent false positives | Medium | LLM review is secondary to regex; allow user to dismiss findings; PASS/FAIL threshold requires critical or 3+ high |
| Research stage adds latency | Medium | Only in deep-review/refactor/docs-only templates; `onFail: 'skip'` so failures don't block |
| Analytics table grows large | Low | Add cleanup: `DELETE FROM pipeline_analytics WHERE created_at < ?` for runs >90 days |
| Shared DB connection contention | Low | Analytics writes are synchronous and short; `recordAnalytics` is called once per run completion |
| Replan infinite loop | Medium | `MAX_REPLANS = 2` circuit breaker; `replanCount` tracked in context |
| npm audit timeout in security agent | Low | 30s timeout on `execSync`; graceful fallback if npm unavailable |

---

## Corrections Summary (vs. Original Spec)

| # | Issue | Original | Corrected |
|---|-------|----------|-----------|
| 1 | LLM calls in agents | Used `ipcRenderer.invoke('chat:complete')` | Uses `getSharedOllama().chat()` (main process pattern) |
| 2 | Model type | Used non-existent `ResolvedModel` | Uses `RoutingDecision` from `model-router.ts` |
| 3 | Shared retry counter | Single `retryCount` across all stages | `retryCountByStage: Record<string, number>` per-stage |
| 4 | Ghost stages | All 5 base stages created as `pending` regardless of template | Only stages in `stage_order` are created |
| 5 | `custom` template | Declared in union but never defined | Removed from union |
| 6 | Analytics DB connection | Separate `PipelineAnalytics` class with own DB connection | Integrated into `PipelineStateStore` |
| 7 | Token/cost tracking | Schema columns defined but never populated | `recordAnalytics()` pulls from usage tracker |
| 8 | `analyzeProject` call | Called synchronously | Correctly `await`ed (function is async) |
| 9 | Replan infinite loop | No guard on `onFail: 'replan'` | `MAX_REPLANS = 2` circuit breaker |
| 10 | Smart skip | Auto-enabled, silently skips review | Opt-in via `PipelineOptions.smartSkip` |
| 11 | `preload.ts` | Not mentioned | Explicit updates for new IPC channels |
| 12 | `pipeline_stage_results` | Referenced but seemed undefined | Confirmed exists in current schema |
| 13 | `isStageEnabled()` | Not used in `run()` | Now integrated into stage loop |
| 14 | Line counts | Off by 1 (732, 261, 105) | Corrected to actual (733, 262, 106) |
| 15 | npm audit | Hardcoded 4-package vulnerability list | Shells out to `npm audit --json` with fallback |
| 16 | StageCard types | Not updated for new stages | `stage` prop widened to `string`, labels map expanded |
| 17 | Graph vs stage_order | Overlapping ownership | Clarified: graph drives execution, stage_order drives UI |

---

## Testing Strategy

### Unit Tests
- `pipeline-templates.ts` — Template validation, stage ordering, `getTemplateById` edge cases
- `pipeline-graph.ts` — Graph construction for each template, condition evaluation, next-stage resolution, retry counter isolation, replan circuit breaker
- `research-agent.ts` — Prompt building, response parsing, graceful LLM failure
- `security-agent.ts` — Regex pattern matching, `npm audit` parsing, LLM prompt building, score calculation
- `pipeline-state.ts` — Analytics queries, `recordAnalytics` data integrity, migration backward compat

### Integration Tests
- Full pipeline run with each template (verify correct stages execute)
- Retry logic with graph walker (verify per-stage counters)
- Stage skipping with conditions and agent config
- Analytics recording after pipeline completion
- Backward compatibility: runs created before Phase 1 still load correctly

### Manual Testing
- Run each template against a real project
- Verify security agent catches known vulnerability patterns (eval, innerHTML, hardcoded keys)
- Verify research agent finds relevant files and produces useful findings
- Check analytics dashboard accuracy against manual run counts
- Test stop/analyze/retry with new stages
- Template selector UX: selection persists, correct stages shown in pills
