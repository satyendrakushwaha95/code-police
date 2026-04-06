# API Reference

## IPC Channels

### Ollama

#### `ollama:chat`

Send a chat message to Ollama.

**Request:**
```typescript
{
  model: string;
  messages: Message[];
  temperature?: number;
  topP?: number;
  contextLength?: number;
  systemPrompt?: string;
}
```

**Response:**
```typescript
{
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}
```

#### `ollama:listModels`

List available Ollama models.

**Response:**
```typescript
{
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
  }>;
}
```

#### `ollama:checkConnection`

Test Ollama connection.

**Response:**
```typescript
boolean
```

### Provider Management

#### `provider:list`

List all configured providers (API keys are masked).

**Response:**
```typescript
ProviderConfig[]  // apiKey field is masked as "••••" for security
```

#### `provider:add`

Add a new provider configuration.

**Request:**
```typescript
{
  type: 'ollama' | 'openai_compatible' | 'anthropic';
  name: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | null;
  headers?: Record<string, string>;
}
```

**Response:**
```typescript
ProviderConfig
```

#### `provider:update`

Update an existing provider.

**Request:**
```typescript
{
  id: string;
  updates: Partial<Omit<ProviderConfig, 'id' | 'createdAt'>>;
}
```

**Response:**
```typescript
ProviderConfig
```

#### `provider:remove`

Remove a provider.

**Request:**
```typescript
string  // Provider ID
```

**Response:**
```typescript
{ success: boolean }
```

#### `provider:test`

Test connection to a provider.

**Request:**
```typescript
string  // Provider ID
```

**Response:**
```typescript
boolean
```

#### `provider:listModels`

List available models for a specific provider.

**Request:**
```typescript
string  // Provider ID
```

**Response:**
```typescript
ProviderModel[]
```

#### `provider:listAllModels`

List models across all enabled providers.

**Response:**
```typescript
ProviderModel[]
```

#### `provider:getPresets`

Get built-in provider presets.

**Response:**
```typescript
Record<string, Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>>
```

### Chat Streaming

#### `chat:stream`

Start a streaming chat via the Provider Registry.

**Request:**
```typescript
{
  providerId: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    num_ctx?: number;
  };
  conversationId?: string;
  messageId?: string;
}
```

**Response:**
```typescript
{
  streamId: string;
}
```

Streaming chunks are emitted via the `chat:chunk` event (see Event Emitters).

#### `chat:abort`

Abort an active chat stream.

**Request:**
```typescript
string  // streamId
```

#### `chat:complete`

Non-streaming chat completion. Used internally by tool features (code gen, refactor, design docs, prompt enhancer) and records usage automatically.

**Request:**
```typescript
{
  providerId: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    num_ctx?: number;
  };
  conversationId?: string;
  messageId?: string;
}
```

**Response:**
```typescript
{
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  durationMs: number;
}
```

### Compare

#### `compare:stream`

Start a multi-model comparison. Sends the same prompt to 2–4 models simultaneously.

**Request:**
```typescript
{
  comparisonId: string;
  models: Array<{ providerId: string; model: string }>;
  messages: Array<{ role: string; content: string }>;
  options?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
}
```

Streaming chunks are emitted per-model via `compare:chunk` events (see Event Emitters).

#### `compare:abort`

Abort an active comparison.

**Request:**
```typescript
string  // comparisonId
```

### Usage Tracking

#### `usage:getSummary`

Get aggregated usage summary.

**Request:**
```typescript
{
  fromTimestamp?: number;  // Unix ms, defaults to 0 (all time)
  toTimestamp?: number;    // Unix ms, defaults to now
}
```

**Response:**
```typescript
UsageSummary
```

#### `usage:getByModel`

Get usage broken down by provider and model.

**Request:**
```typescript
{
  fromTimestamp?: number;
  toTimestamp?: number;
}
```

**Response:**
```typescript
UsageByModel[]
```

#### `usage:getByDay`

Get daily usage aggregates.

**Request:**
```typescript
{
  days?: number;  // defaults to 30
}
```

**Response:**
```typescript
UsageByDay[]
```

#### `usage:getByMessage`

Get usage for a specific message.

**Request:**
```typescript
string  // messageId
```

**Response:**
```typescript
UsageRecord | undefined
```

#### `usage:getRecent`

Get recent usage records.

**Request:**
```typescript
{
  limit?: number;  // defaults to 50
}
```

**Response:**
```typescript
UsageRecord[]
```

#### `usage:getPricing`

Get all pricing data (built-in + custom).

**Response:**
```typescript
{
  builtin: ModelPricing[];
  custom: ModelPricing[];
}
```

#### `usage:setCustomPricing`

Set custom pricing for a provider/model pair.

**Request:**
```typescript
{
  providerId: string;
  model: string;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
}
```

### Memory

#### `memory:add`

Add a new memory fact.

**Request:**
```typescript
{
  category: MemoryCategory;  // 'core' | 'preference' | 'decision' | 'pattern' | 'project' | 'correction' | 'general'
  content: string;
  source: string;             // 'user', 'auto-extraction', 'import', etc.
  confidence: number;         // 0.0 – 1.0
  importance?: number;        // defaults to 1.0 (core defaults to 5.0)
}
```

**Response:**
```typescript
MemoryFact
```

#### `memory:recall`

Semantic recall with composite scoring.

**Request:**
```typescript
{
  query: string;
  limit?: number;  // defaults to 5
}
```

**Response:**
```typescript
MemoryFact[]  // sorted by composite score (similarity + recency + importance)
```

#### `memory:getAll`

Get all stored memories ordered by importance then recency.

**Response:**
```typescript
MemoryFact[]
```

#### `memory:getByCategory`

Get memories filtered by category.

**Request:**
```typescript
string  // category
```

**Response:**
```typescript
MemoryFact[]
```

#### `memory:delete`

Delete a memory by ID.

**Request:**
```typescript
number  // memory ID
```

#### `memory:update`

Update a memory's content, category, or importance.

**Request:**
```typescript
{
  id: number;
  updates: {
    content?: string;
    category?: string;
    importance?: number;
  };
}
```

#### `memory:getCount`

Get total number of stored memories.

**Response:**
```typescript
number
```

#### `memory:buildContext`

Build a formatted memory context block for injection into chat prompts.

**Request:**
```typescript
{
  query: string;
  limit?: number;
}
```

**Response:**
```typescript
string  // Formatted block: "[MEMORY — What I know about you...] ... [END MEMORY]"
```

#### `memory:applyDecay`

Apply exponential decay to all non-core memories. Deletes memories that fall below the importance threshold.

**Response:**
```typescript
{
  decayed: number;   // memories with reduced importance
  deleted: number;   // memories removed
}
```

#### `memory:export`

Export all memories and user profile as JSON.

**Response:**
```typescript
string  // JSON string with { version, profile, memories }
```

#### `memory:import`

Import memories and profile from JSON.

**Request:**
```typescript
string  // JSON string
```

**Response:**
```typescript
{
  memoriesImported: number;
}
```

#### `memory:getExtractionPrompt`

Get the LLM prompt template for auto-extracting facts from a conversation.

**Request:**
```typescript
string  // conversation text
```

**Response:**
```typescript
string  // prompt for the LLM
```

### Profile

#### `profile:get`

Get user profile.

**Response:**
```typescript
UserProfile
```

#### `profile:update`

Update user profile fields.

**Request:**
```typescript
Partial<UserProfile>
```

#### `profile:getPersonalityModes`

Get available personality modes with labels and descriptions.

**Response:**
```typescript
Array<{
  id: PersonalityMode;
  label: string;
  description: string;
}>
```

#### `profile:getPersonalityPrompt`

Build the full personality system prompt from current profile and personality mode.

**Response:**
```typescript
string
```

### Project Onboarding

#### `project:onboard`

Analyze a project directory and generate a full onboarding report. Phase 1 runs static analysis (instant, no LLM). Phase 2 sends results to the LLM for architecture overview, Mermaid diagram, and key files map.

**Request:**
```typescript
{
  rootPath: string;  // Absolute path to the project root
}
```

**Response:**
```typescript
{
  report: OnboardingReport;
  formatted: string;  // Pre-formatted markdown report ready for display
}
```

Progress updates are emitted via the `onboarding:progress` event during analysis (see Event Emitters).

### Pipeline

#### `pipeline:getTemplates`

Get available pipeline templates.

**Response:**
```typescript
PipelineTemplateConfig[]
```

#### `pipeline:run`

Start a pipeline execution.

**Request:**
```typescript
{
  task: string;
  options: {
    maxRetries: number;
    timeoutMs: number;
    autoExecute: boolean;
    smartSkip?: boolean;   // Auto-skip stages for doc-only tasks
  };
  projectRoot?: string;
  runId?: string;
  agentId?: string;
  template?: PipelineTemplate;  // 'standard' | 'quick-fix' | 'deep-review' | 'docs-only' | 'refactor'
}
```

**Response:**
```typescript
{
  runId: string;
}
```

#### `pipeline:cancel`

Cancel running pipeline.

**Response:**
```typescript
{
  success: boolean;
}
```

#### `pipeline:getRun`

Get specific pipeline run.

**Request:**
```typescript
{
  runId: string;
}
```

**Response:**
```typescript
PipelineRun
```

#### `pipeline:getHistory`

Get pipeline execution history.

**Response:**
```typescript
PipelineRun[]
```

#### `pipeline:deleteRun`

Delete a pipeline run from history.

**Request:**
```typescript
{
  runId: string;
}
```

#### `pipeline:retryFix`

Retry failed stage with suggestions.

**Request:**
```typescript
{
  runId: string;
  suggestions: string[];
}
```

**Response:**
```typescript
{
  runId: string;
}
```

#### `pipeline:getStageOutput`

Get output from a specific stage.

**Request:**
```typescript
{
  runId: string;
  stage: string;  // Any stage name: 'plan', 'action', 'review', 'validate', 'execute', 'research', 'security'
}
```

**Response:**
```typescript
StageResult<any>
```

#### `pipeline:analytics:getSummary`

Get pipeline analytics summary.

**Request:**
```typescript
{
  fromTimestamp?: number;
  toTimestamp?: number;
}
```

**Response:**
```typescript
{
  totalRuns: number;
  successRate: number;       // 0-100
  avgDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  avgRetries: number;
}
```

#### `pipeline:analytics:getByTemplate`

Get analytics broken down by pipeline template.

**Request:**
```typescript
{
  fromTimestamp?: number;
  toTimestamp?: number;
}
```

**Response:**
```typescript
Array<{
  template: string;
  count: number;
  passed: number;
  avg_duration_ms: number;
  avg_cost_usd: number;
}>
```

#### `pipeline:analytics:getByStage`

Get stage bottleneck analytics.

**Request:**
```typescript
{
  fromTimestamp?: number;
  toTimestamp?: number;
}
```

**Response:**
```typescript
Array<{
  stage: string;
  executions: number;
  avg_duration_ms: number;
  failures: number;
  avg_cost_usd: number;
}>
```

#### `pipeline:analytics:getByModel`

Get model performance analytics.

**Request:**
```typescript
{
  fromTimestamp?: number;
  toTimestamp?: number;
}
```

**Response:**
```typescript
Array<{
  model: string;
  executions: number;
  successes: number;
  avg_duration_ms: number;
  avg_cost_usd: number;
}>
```

### Window Control

#### `window:minimize`

Minimize the application window.

#### `window:maximize`

Toggle maximize/restore for the application window.

#### `window:close`

Close the application window.

### Routing

#### `routing:getConfig`

Get model routing configuration.

**Response:**
```typescript
{
  version: number;
  defaultModel: string;
  routes: Record<TaskCategory, RouteConfig>;
}
```

**RouteConfig:**
```typescript
{
  model: string;
  providerId: string;
  enabled: boolean;
  fallbackToDefault: boolean;
}
```

**TaskCategory:**
```typescript
| 'chat_general'
| 'code_generation'
| 'code_refactor'
| 'documentation'
| 'planning'
| 'review'
```

**RoutingConfig:**
```typescript
{
  version: number;
  defaultModel: string;
  defaultProviderId: string;
  routes: Record<TaskCategory, RouteConfig>;
}
```

#### `routing:updateConfig`

Update routing configuration.

**Request:**
```typescript
Partial<RoutingConfig>
```

**Response:**
```typescript
{
  success: boolean;
}
```

### Files

#### `fs:readFile`

Read file contents.

**Request:**
```typescript
string  // File path
```

**Response:**
```typescript
string  // File content
```

#### `tools:execute`

Execute a registered tool.

**Request:**
```typescript
{
  toolName: string;
  params: Record<string, any>;
}
```

**Available Tools (21 total):**

*File System:*
- `read_file` - Read file content
- `write_file` - Write content to file (creates or overwrites)
- `append_file` - Append content to an existing file
- `delete_file` - Delete a file
- `list_directory` - List directory contents
- `create_directory` - Create directory
- `execute_command` - Execute shell command (with safety checks)
- `file_exists` - Check if file or directory exists
- `get_file_info` - Get file information (size, modified date, etc.)

*Search & Code Analysis:*
- `grep_search` - Search code by pattern/regex
- `find_files` - Find files by name pattern
- `get_file_diff` - Get git diff of file changes

*Git Operations:*
- `git_status` - Get repository status
- `git_log` - View commit history
- `git_commit` - Create commits

*Web & API:*
- `http_request` - Make HTTP requests (GET, POST, PUT, DELETE)
- `fetch_url` - Fetch web content

*Development:*
- `run_tests` - Execute test suites
- `lint_code` - Run linters
- `format_code` - Format code

*Utilities:*
- `get_timestamp` - Get current time/date (iso, unix, readable)
- `calculate` - Perform calculations
- `read_env` - Read environment variables

### Dialog

#### `dialog:confirmAction`

Show confirmation dialog.

**Request:**
```typescript
{
  title: string;
  message: string;
  detail?: string;
}
```

**Response:**
```typescript
boolean
```

#### `dialog:openDirectory`

Open native directory picker.

**Response:**
```typescript
string | null  // Selected path or null if cancelled
```

### Workspace

#### `fs:indexRepository`

Index repository files for semantic search.

**Request:**
```typescript
{
  model: string;
  filesIndex: Array<{
    name: string;
    path: string;
    absolutePath: string;
  }>;
}
```

#### `fs:searchRepository`

Search indexed repository.

**Request:**
```typescript
{
  model: string;
  query: string;
  limit?: number;
}
```

**Response:**
```typescript
Array<{
  filePath: string;
  content: string;
  score: number;
}>
```

## Event Emitters

### pipeline:complete

Emitted when pipeline completes.

```typescript
{
  runId: string;
  verdict: 'PASS' | 'FAIL';
  finalOutput: CodeOutput;
}
```

### pipeline:error

Emitted on pipeline error.

```typescript
{
  runId: string;
  error: string;
}
```

### pipeline:cancelled

Emitted when pipeline is cancelled.

```typescript
{
  runId: string;
}
```

### pipeline:stage_update

Emitted when a pipeline stage updates.

```typescript
{
  runId: string;
  stage: PipelineStage;
  status: StageStatus;
  output?: any;
}
```

### chat:chunk

Emitted during `chat:stream` with each token chunk.

```typescript
{
  streamId: string;
  content: string;
  done: boolean;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### chat:error

Emitted when `chat:stream` encounters an error.

```typescript
{
  streamId: string;
  error: string;
}
```

### compare:chunk

Emitted per-model during `compare:stream` with each token chunk.

```typescript
{
  comparisonId: string;
  providerId: string;
  model: string;
  content: string;
  done: boolean;
  durationMs: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### compare:error

Emitted when a model in a comparison encounters an error.

```typescript
{
  comparisonId: string;
  providerId: string;
  model: string;
  error: string;
}
```

### jarvis:summon

Emitted when the global hotkey (`Ctrl+Space`) is pressed. Brings the app to the foreground and focuses the chat input.

```typescript
void
```

### onboarding:progress

Emitted during `project:onboard` execution to report analysis progress. Sent to all renderer windows.

```typescript
{
  stage: string;    // 'analyzing' | 'generating' | 'complete'
  message: string;  // Human-readable progress message
}
```

## Types

### Message

```typescript
interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: FileAttachment[];
  isPipeline?: boolean;
  pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled';
  pipelineRunId?: string;
  usage?: MessageUsage;
  suggestions?: string[];  // Follow-up suggestion chips (generated after each AI response)
}
```

### MessageUsage

```typescript
interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  model?: string;
  providerId?: string;
}
```

### PipelineStage

```typescript
type PipelineStage = 'plan' | 'action' | 'review' | 'validate' | 'execute' | 'research' | 'security';
```

### PipelineTemplate

```typescript
type PipelineTemplate = 'quick-fix' | 'standard' | 'deep-review' | 'docs-only' | 'refactor';
```

### PipelineTemplateConfig

```typescript
interface PipelineTemplateConfig {
  id: PipelineTemplate;
  name: string;
  description: string;
  stages: PipelineStage[];
  icon: string;
}
```

### StageStatus

```typescript
type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
```

### PipelineRun

```typescript
interface PipelineRun {
  id: string;
  task_description: string;
  project_root?: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  template?: PipelineTemplate;
  stage_order: PipelineStage[];
  stages: Record<string, StageResult<any>>;  // Only stages in stage_order are present
  final_verdict?: 'PASS' | 'FAIL';
  created_at: number;
  completed_at?: number;
  retry_count: number;
}
```

### StageResult

```typescript
interface StageResult<T> {
  status: StageStatus;
  model_used: string;
  duration_ms?: number;
  output?: T;
  error?: string;
}
```

### CodeOutput

```typescript
interface CodeOutput {
  file_changes: Array<{
    file_path: string;
    operation: 'create' | 'modify' | 'delete';
    content?: string;
    explanation?: string;
  }>;
  summary?: string;
}
```

### ReviewResult

```typescript
interface ReviewResult {
  verdict: 'PASS' | 'FAIL';
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    description: string;
    file?: string;
  }>;
  suggestions: string[];
  confidence_score: number;
}
```

### ValidationResult

```typescript
interface ValidationResult {
  passed: boolean;
  coverage_score: number;
  summary: string;
  gaps?: Array<{
    type: 'missing' | 'incomplete' | 'regressed' | 'incorrect';
    description: string;
    related_to?: string;
  }>;
}
```

### ExecuteResult

```typescript
interface ExecuteResult {
  executed_files: string[];
  failed_files: string[];
  command_results: Array<{
    command: string;
    output: string;
    success: boolean;
  }>;
  summary: string;
}
```

### ResearchResult

```typescript
interface ResearchResult {
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
```

### SecurityResult

```typescript
interface SecurityResult {
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
  score: number;  // 0-100 security score
}
```

### TaskPlan

```typescript
interface TaskPlan {
  task_description: string;
  subtasks: Array<{
    id: string;
    description: string;
    files: string[];
  }>;
  acceptance_criteria: string[];
  required_files: string[];
  approach_notes: string;
  estimated_complexity: 'low' | 'medium' | 'high';
}
```

### FileAttachment

```typescript
interface FileAttachment {
  id: string;
  name: string;
  type: string;
  content: string;
  size: number;
  truncated?: boolean;
```

---

## Agent Management

### Agent Configuration

Custom agents allow you to create specialized AI assistants with specific system prompts, tools, constraints, and pipeline configurations.

#### AgentConfig

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags: string[];
  systemPrompt: string;
  defaultModel: string;
  enabledTools: AgentToolConfig[];
  constraints: AgentConstraints;
  knowledgeBase: KnowledgeBaseConfig;
  pipelineStages: AgentPipelineConfig;
  conversationStarters?: string[];  // Up to 5 starter prompts shown in empty conversations
}
```

#### AgentConstraints

```typescript
interface AgentConstraints {
  allowedFilePatterns: string[];   // Glob patterns for allowed files
  blockedFilePatterns: string[];    // Glob patterns for blocked files
  maxFileSize: number;             // Max file size in bytes
  allowedLanguages: string[];      // Programming languages
  requireApproval: boolean;         // Require user approval before executing
  autoExecute: boolean;            // Auto-execute file changes
}
```

#### AgentToolConfig

```typescript
interface AgentToolConfig {
  toolId: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}
```

### IPC Channels

#### `agent:list`

Get all custom agents.

**Response:**
```typescript
AgentConfig[]
```

#### `agent:get`

Get a specific agent by ID.

**Request:**
```typescript
string  // Agent ID
```

**Response:**
```typescript
AgentConfig | null
```

#### `agent:create`

Create a new agent.

**Request:**
```typescript
{
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  systemPrompt?: string;
  defaultModel?: string;
  enabledTools?: AgentToolConfig[];
  constraints?: Partial<AgentConstraints>;
  knowledgeBase?: Partial<KnowledgeBaseConfig>;
  pipelineStages?: Partial<AgentPipelineConfig>;
  author?: string;
}
```

**Response:**
```typescript
AgentConfig
```

#### `agent:update`

Update an existing agent.

**Request:**
```typescript
{
  id: string;
  updates: Partial<CreateAgentInput>;
}
```

**Response:**
```typescript
AgentConfig
```

#### `agent:delete`

Delete an agent.

**Request:**
```typescript
string  // Agent ID
```

**Response:**
```typescript
{ success: boolean }
```

#### `agent:clone`

Clone an existing agent with a new name.

**Request:**
```typescript
{
  id: string;      // Source agent ID
  newName: string; // Name for the clone
}
```

**Response:**
```typescript
AgentConfig
```

#### `agent:getPresets`

Get available agent presets/templates.

**Response:**
```typescript
AgentPreset[]
```

### Agent Presets

Pre-configured agent templates for common use cases:

| Preset | Description |
|--------|-------------|
| Web Developer | React, Vue, Angular, CSS frameworks |
| Backend Developer | APIs, microservices, server apps |
| Code Reviewer | Code quality, security, best practices |
| Security Auditor | Vulnerability detection, OWASP |
| DevOps Engineer | Docker, Kubernetes, CI/CD |
| Data Engineer | ETL, data pipelines, analytics |
| Technical Writer | Documentation, README files |

### Agent Pipeline Stages

Each agent can configure which pipeline stages to use. The pipeline template determines the default stages, but agents can override with their `pipelineStages` config:

| Stage | Description |
|-------|-------------|
| Research | Analyze project structure and discover relevant code |
| Plan | Analyze requirements and create task plan |
| Action | Generate code based on the plan |
| Review | Review generated code for issues |
| Security | Scan for vulnerabilities and produce security score |
| Validate | Validate against acceptance criteria |
| Execute | Apply file changes to project |

---

## Provider Types

### ProviderConfig

```typescript
interface ProviderConfig {
  id: string;
  type: 'ollama' | 'openai_compatible' | 'anthropic';
  name: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | null;
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
```

### ProviderModel

```typescript
interface ProviderModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  size?: number;
  contextLength?: number;
}
```

### ChatStreamChunk

```typescript
interface ChatStreamChunk {
  content: string;
  done: boolean;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

---

## Usage Types

### UsageRecord

```typescript
interface UsageRecord {
  id?: number;
  messageId: string;
  conversationId: string;
  providerId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: number;
}
```

### UsageSummary

```typescript
interface UsageSummary {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  requestCount: number;
}
```

### UsageByModel

```typescript
interface UsageByModel {
  providerId: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestCount: number;
}
```

### UsageByDay

```typescript
interface UsageByDay {
  date: string;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}
```

### ModelPricing

```typescript
interface ModelPricing {
  providerId: string;
  model: string;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
}
```

---

## Memory Types

### MemoryFact

```typescript
interface MemoryFact {
  id?: number;
  category: MemoryCategory;
  content: string;
  source: string;
  confidence: number;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}
```

### MemoryCategory

```typescript
type MemoryCategory = 'preference' | 'decision' | 'pattern' | 'project' | 'correction' | 'general' | 'core';
```

---

## Profile Types

### UserProfile

```typescript
interface UserProfile {
  name: string;
  role: string;
  timezone: string;
  expertiseAreas: string[];
  preferredLanguages: string[];
  personalityMode: PersonalityMode;
  customTraits: string;
}
```

### PersonalityMode

```typescript
type PersonalityMode = 'professional' | 'casual' | 'concise' | 'mentor' | 'creative';
```

---

## Command Router Types

### CommandResult

```typescript
interface CommandResult {
  intent: CommandIntent;
  executed: boolean;
  output?: string;
  error?: string;
  uiAction?: string;
  originalInput: string;
  displayMessage: string;
}
```

### CommandIntent

```typescript
type CommandIntent =
  | 'terminal' | 'git_status' | 'git_log' | 'git_commit' | 'git_diff'
  | 'search_code' | 'read_file' | 'list_dir'
  | 'remember' | 'recall' | 'onboard'
  | 'open_codegen' | 'open_refactor' | 'open_designdoc' | 'open_pipeline'
  | 'open_settings' | 'open_files' | 'open_terminal' | 'open_agents'
  | 'open_usage' | 'open_compare'
  | 'new_chat' | 'none';
```

---

## Project Onboarding Types

### TechStackInfo

```typescript
interface TechStackInfo {
  framework: string | null;
  language: string;
  styling: string[];
  database: string[];
  testing: string[];
  buildTool: string | null;
  packageManager: string;
  runtime: string;
  other: string[];
}
```

### FileStats

```typescript
interface FileStats {
  totalFiles: number;
  totalDirs: number;
  byExtension: Record<string, number>;
  largestFiles: Array<{ path: string; lines: number }>;
  totalLines: number;
  sourceFiles: number;
  testFiles: number;
}
```

### ProjectAnalysis

```typescript
interface ProjectAnalysis {
  techStack: TechStackInfo;
  fileStats: FileStats;
  configFiles: string[];
  entryPoints: string[];
  apiRoutes: string[];
  keyFileSamples: Array<{ path: string; content: string; role: string }>;
  directoryTree: string;
  packageInfo: {
    name?: string;
    version?: string;
    description?: string;
    dependencies: number;
    devDependencies: number;
  } | null;
  detectedPatterns: string[];
}
```

### OnboardingReport

```typescript
interface OnboardingReport {
  projectName: string;
  techStackSummary: string;
  architectureOverview: string;
  mermaidDiagram: string;
  keyFilesMap: string;
  apiSurface: string;
  dataSchemaDiagram: string;
  healthAssessment: string;
  directoryTree: string;
  rawAnalysis: ProjectAnalysis;
}
```

---

## Agent Generator Types

### GeneratedAgentConfig

Returned by the AI agent generator when a user describes an agent in natural language.

```typescript
interface GeneratedAgentConfig {
  name: string;
  description: string;
  icon: string;                    // Single emoji
  tags: string[];
  systemPrompt: string;
  enabledTools: string[];          // Tool IDs (validated against available tools)
  allowedLanguages: string[];
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  requireApproval: boolean;
  pipelineStages: Record<string, boolean>;
  conversationStarters: string[];  // 3-5 short actionable prompts
}
```
