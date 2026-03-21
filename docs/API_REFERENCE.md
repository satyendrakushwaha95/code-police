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

### Pipeline

#### `pipeline:run`

Start a pipeline execution.

**Request:**
```typescript
{
  task: string;
  options: {
    maxRetries: number;  // Note: Auto-retry limited to 2
    timeoutMs: number;
    autoExecute: boolean;
  };
  projectRoot?: string;  // Stored with pipeline for security checks
  runId?: string;        // Optional: Frontend-generated run ID
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
  suggestions: string[];  // Includes user feedback
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
  stage: 'plan' | 'action' | 'review' | 'validate' | 'execute';
}
```

**Response:**
```typescript
StageResult<any>
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

## Types

### Message

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: FileAttachment[];
  isPipeline?: boolean;
  pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled';
  pipelineRunId?: string;
}
```

### PipelineStage

```typescript
type PipelineStage = 'plan' | 'action' | 'review' | 'validate' | 'execute';
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
  project_root?: string;      // Stored for security checks
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  stages: {
    plan: StageResult<TaskPlan>;
    action: StageResult<CodeOutput>;  // Renamed from "code"
    review: StageResult<ReviewResult>;
    validate: StageResult<ValidationResult>;
    execute: StageResult<ExecuteResult>;
  };
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

Each agent can configure which pipeline stages to use:

| Stage | Description |
|-------|-------------|
| Plan | Analyze requirements and create task plan |
| Action | Generate code based on the plan |
| Review | Review generated code for issues |
| Validate | Validate against acceptance criteria |
| Execute | Apply file changes to project |
