# Developer Guide

## Setup Development Environment

### Prerequisites
- Node.js 18+
- npm or yarn
- At least one AI provider: Ollama (local, free) or a cloud provider API key (OpenAI, Anthropic, Groq, etc.)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd localmind-ai

# Install dependencies
npm install

# Start development server
npm run dev
```

### Development Mode

The app runs with Vite's hot module replacement:
- Frontend at `http://localhost:5173`
- Electron window opens automatically

### Building

```bash
# Build Electron main process
npm run build:electron

# Package for Windows
npm run dist:win
```

## Project Structure

### Frontend (src/)

**Components** (`src/components/`)
- `Chat/` - Chat interface and panels (ChatView, ChatInput, MessageBubble, CodeGenPanel, RefactorPanel, DesignDocPanel, PromptEnhancerPanel, TaskPlannerPanel, modals)
- `Compare/` - Multi-model comparison (ComparePanel, CompareModelPicker, CompareResponseCard)
- `Usage/` - Usage & cost dashboard (UsageDashboard)
- `CommandPalette/` - Global command palette (CommandPalette)
- `Pipeline/` - Pipeline dashboard
- `FilePanel/` - Monaco-powered file editor with direct save, dirty confirmation, pipeline auto-refresh, session persistence
- `Terminal/` - Terminal emulator
- `Settings/` - Settings modal, routing, provider management (ProviderSettingsPanel), profile & memory (ProfileSettingsPanel)
- `Sidebar/` - Navigation sidebar with window controls
- `Agent/` - Custom agent management (AgentPanel, AgentCard, AgentEditorModal, AgentGenerateBar, ToolPicker, KnowledgeUploader)
- `common/` - Shared components

**Hooks** (`src/hooks/`)
- `usePipeline.ts` - Pipeline state and operations
- `useModelRouter.ts` - Model routing with provider awareness
- `useCompare.ts` - Multi-model comparison session management
- `useEditorState.ts` - Editor session persistence (open tabs, expanded folders via localStorage)
- `useToast.ts` - Toast notifications
- `useKeyboardShortcuts.ts` - Keyboard bindings

**Services** (`src/services/`)
- `ollama.ts` - Ollama API client (legacy)
- `agent.ts` - Agent service
- `command-router.ts` - Jarvis natural language command router
- `database.ts` - IndexedDB database helper
- `fileReader.ts` - File reading utilities

**Stores** (`src/store/`)
- `ConversationContext.tsx` - Chat state (includes usage per message)
- `SettingsContext.tsx` - App settings (includes provider awareness)
- `WorkspaceContext.tsx` - Workspace state (root path, files index, `refreshFilesIndex()` for pipeline auto-refresh)
- `AgentContext.tsx` - Custom agents state

**Styles** (`src/index.css`)
- Design tokens (colors, spacing, borders)
- Component base styles
- Modal and toast styles

### Backend (electron/)

**Services**
- `ollama.ts` - Ollama API wrapper (legacy, used for embeddings)
- `embeddings.ts` - Ollama embeddings service
- `shared-ollama.ts` - Shared Ollama embeddings singleton
- `vector-db.ts` - LanceDB operations
- `pipeline-orchestrator.ts` - Pipeline execution (graph-based stage traversal)
- `pipeline-state.ts` - SQLite pipeline state + analytics
- `pipeline-types.ts` - Pipeline TypeScript interfaces
- `pipeline-templates.ts` - Pipeline template configs (5 templates)
- `pipeline-graph.ts` - Directed graph engine for conditional/dynamic pipelines
- `model-router.ts` - Task routing (provider-aware)
- `routing-config.ts` - Routing configuration store (v2, with `providerId`)
- `memory.ts` - Agent memory (short-term)
- `long-term-memory.ts` - Persistent memory, user profile, personality engine
- `usage-tracker.ts` - Token counting, cost calculation, usage persistence
- `project-analyzer.ts` - Static codebase analysis (framework, language, file stats, patterns)
- `project-onboarding.ts` - Full onboarding report generation (static + LLM analysis)
- `agent-manager.ts` - Custom agent management
- `agent-store.ts` - Agent persistence
- `agent-types.ts` - Agent TypeScript interfaces and presets

**Providers** (`electron/services/providers/`)
- `provider-types.ts` - ProviderConfig, ChatProvider interface, ProviderModel, presets
- `ollama-provider.ts` - Ollama adapter (implements ChatProvider)
- `openai-provider.ts` - OpenAI-compatible adapter (OpenAI, Groq, OpenRouter, Together, Fireworks, LM Studio)
- `anthropic-provider.ts` - Anthropic adapter
- `provider-config.ts` - Provider config persistence (JSON + `electron.safeStorage` encryption)
- `provider-registry.ts` - Provider lifecycle, connection testing, model listing, chat streaming
- `index.ts` - Barrel export

**Agents** (`electron/services/agents/`)
- `planner-agent.ts` - Task planning with smart task detection
- `coder-agent.ts` - Code generation with security constraints
- `reviewer-agent.ts` - Code review
- `validator-agent.ts` - Validation with doc task support
- `executor-agent.ts` - File execution
- `research-agent.ts` - Codebase research (static analysis + LLM)
- `security-agent.ts` - Security audit (regex patterns + npm audit + LLM review)

## Creating Components

### Component Template

```tsx
import { useState } from 'react';
import './ComponentName.css';

interface ComponentNameProps {
  title: string;
  onClose: () => void;
}

export default function ComponentName({ title, onClose }: ComponentNameProps) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg>...</svg>
          {title}
        </div>
        <button className="btn-icon" onClick={onClose}>
          <svg>...</svg>
        </button>
      </div>
      <div className="side-panel-content">
        {/* Content */}
      </div>
    </div>
  );
}
```

### Styling

Use CSS variables for consistent theming:

```css
.component-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-tertiary);
}

/* Buttons should have borders */
.btn-icon {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.btn-icon:hover {
  border-color: var(--border-light);
}

/* Sidebar icons use terracotta color */
.sidebar-tool-btn svg {
  color: #c96442;
}
```

## Adding IPC Channels

### Main Process (electron/main.ts)

```typescript
ipcMain.handle('channel:name', async (_, payload: PayloadType) => {
  // Handle the request
  const result = await doSomething(payload);
  return result;
});

// For events (not request-response)
ipcMain.on('channel:event', (_, data) => {
  // Handle event
});
```

### Preload (electron/preload.ts)

IPC channels need to be exposed in the preload script:

```typescript
contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, listener),
  off: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.off(channel, listener),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
});
```

### Renderer Process

```typescript
const ipcRenderer = (window as any).ipcRenderer;

// Request-response
const result = await ipcRenderer.invoke('channel:name', payload);

// Event listeners
useEffect(() => {
  const handler = (_event: any, data: any) => {
    // Handle event
  };
  ipcRenderer.on('channel:event', handler);
  return () => ipcRenderer.off('channel:event', handler);
}, []);
```

## State Management

### Adding to ConversationContext

```typescript
// In ConversationContext.tsx

// Add action type
type Action =
  | { type: 'ADD_MESSAGE'; payload: { conversationId: string; message: Message } }
  // Add new action type here
  | { type: 'YOUR_ACTION'; payload: YourPayload };

// Add reducer case
case 'YOUR_ACTION':
  return {
    ...state,
    // Update state
  };
```

## Pipeline Integration

### Pipeline Architecture

The pipeline system has 4 layers:

1. **Templates** (`pipeline-templates.ts`) — 5 pre-configured stage sequences
2. **Graph Engine** (`pipeline-graph.ts`) — Compiles templates into directed graphs with per-node retry/skip/stop policies
3. **Orchestrator** (`pipeline-orchestrator.ts`) — Graph walker that dispatches to individual stage runners
4. **Agents** (`agents/*.ts`) — 7 stage implementations (planner, coder, reviewer, validator, executor, research, security)

### Pipeline Stages (7 total)

| Stage | Agent File | Purpose |
|-------|-----------|---------|
| `research` | `research-agent.ts` | Static analysis via `analyzeProject()` + LLM research |
| `plan` | `planner-agent.ts` | Task analysis and planning |
| `action` | `coder-agent.ts` | Code generation/modification |
| `review` | `reviewer-agent.ts` | Code review |
| `security` | `security-agent.ts` | Vulnerability scanning + npm audit + LLM review |
| `validate` | `validator-agent.ts` | Validation/testing |
| `execute` | `executor-agent.ts` | File system execution |

### Pipeline Templates

| Template | Stages |
|----------|--------|
| `standard` | plan → action → review → validate → execute |
| `quick-fix` | plan → action → execute |
| `deep-review` | research → plan → action → review → security → validate → execute |
| `docs-only` | research → plan → action → review |
| `refactor` | research → action → review → validate → execute |

### Adding a New Pipeline Stage

1. Add the stage name to `PipelineStage` union in `pipeline-types.ts`
2. Create agent implementation in `agents/` (follow the `getSharedOllama()` pattern — NOT `ipcRenderer`)
3. Add `run<Stage>Stage()` method to the orchestrator
4. Add `case` in `executeSingleStage()` switch
5. Add `case` in `updateContext()` switch
6. Add the stage to relevant template(s) in `pipeline-templates.ts`
7. Add `StageNode` entries in the relevant graph(s) in `pipeline-graph.ts`
8. Add `STAGE_LABELS` entry and render method in `StageCard.tsx`

### Adding a New Pipeline Template

1. Add the template ID to `PipelineTemplate` union in `pipeline-types.ts`
2. Add the template config to `PIPELINE_TEMPLATES` array in `pipeline-templates.ts`
3. Add a `case` in `buildPipelineGraph()` in `pipeline-graph.ts`
4. Add an `<option>` to the template selector in `ChatInput.tsx`

### Pipeline State & Analytics

Pipeline data is stored in SQLite via `pipeline-state.ts`:
- `pipeline_runs` — Run metadata with template, stage_order (JSON), status
- `pipeline_stage_results` — Per-stage results with status, model, duration, output
- `pipeline_analytics` — Per-run aggregate metrics (duration, tokens, cost, bottleneck)
- `pipeline_stage_analytics` — Per-stage analytics for bottleneck analysis

Analytics are recorded after every pipeline completion via `recordAnalytics()`, which pulls token/cost data from the `token_usage` table.

### Listening to Pipeline Events

```typescript
useEffect(() => {
  const ipcRenderer = (window as any).ipcRenderer;
  
  const handleComplete = (_event: any, data: { runId: string; verdict: string }) => {
    console.log('Pipeline completed:', data);
  };
  
  ipcRenderer.on('pipeline:complete', handleComplete);
  
  return () => {
    ipcRenderer.off('pipeline:complete', handleComplete);
  };
}, []);
```

## Working with Providers

### Adding a New Provider Adapter

To add support for a new AI API:

1. **Define the adapter** — Create a new file in `electron/services/providers/`, e.g. `my-provider.ts`
2. **Implement the `ChatProvider` interface:**

```typescript
import { ChatProvider, ProviderConfig, ProviderModel, ChatMessage, ChatOptions, ChatStreamChunk } from './provider-types';

export class MyProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType = 'openai_compatible'; // or define a new type
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  async checkConnection(): Promise<boolean> {
    // Test that the endpoint is reachable and the API key is valid
  }

  async listModels(): Promise<ProviderModel[]> {
    // Fetch available models from the provider
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
    signal?: AbortSignal
  ): AsyncGenerator<ChatStreamChunk> {
    // Stream tokens from the provider, yielding ChatStreamChunk objects
  }
}
```

3. **Register the adapter** — Update `createProvider()` in `provider-registry.ts`:

```typescript
case 'my_provider':
  return new MyProvider(config);
```

4. **Add a preset** — Add an entry to `PROVIDER_PRESETS` in `provider-types.ts`:

```typescript
my_provider: {
  type: 'my_provider',
  name: 'My Provider',
  enabled: false,
  endpoint: 'https://api.my-provider.com/v1',
  apiKey: null,
},
```

5. **Update `ProviderType`** — Add `'my_provider'` to the `ProviderType` union in `provider-types.ts`

### Provider Architecture

```
User selects model → Model Router resolves (providerId, model)
  → ProviderRegistry.chatStream(providerId, model, messages)
    → Provider adapter (OllamaProvider / OpenAIProvider / AnthropicProvider)
      → HTTP streaming to provider API
        → Yields ChatStreamChunk
          → IPC emits chat:chunk events to renderer
```

## Command Router

### Adding a New Command

The command router lives in `src/services/command-router.ts`.

1. **Add a new intent** — Add to the `CommandIntent` type:

```typescript
export type CommandIntent = ... | 'my_command';
```

2. **Add patterns** — Add an entry to `INTENT_PATTERNS`:

```typescript
{ intent: 'my_command', patterns: [
  /^\/mycommand\s+(.+)/i,           // Slash command
  /^do something with\s+(.+)/i,     // Natural language
]},
```

3. **Handle execution** — Add a `case` in the `routeCommand()` switch:

```typescript
case 'my_command': {
  result = await ipcRenderer.invoke('some:ipc-channel', { param: command });
  displayMessage = `**My Command:** ${result.output}`;
  break;
}
```

4. **Add slash command hint** — Add to `getSlashCommandHints()`:

```typescript
{ command: '/mycommand <arg>', description: 'Description of what it does' },
```

### UI Panel Openers

To make a command open a UI panel instead of executing backend logic, add it to the `uiIntents` map in `routeCommand()`:

```typescript
const uiIntents: Record<string, string> = {
  ...
  open_my_panel: 'my_panel',
};
```

Then handle the `uiAction` in `ChatInput.tsx` or `ChatView.tsx`.

## Memory System

### How Memory Recall Works

1. User sends a message (or `/recall` is triggered)
2. `memory:recall` IPC is invoked with the query text
3. `LongTermMemory.recall()` computes:
   - Embedding of query text via Ollama nomic-embed-text
   - For each stored memory (with embedding): cosine similarity
   - For each memory: recency score via exponential decay (90-day half-life)
   - For each memory: normalized importance (capped at 10.0)
   - **Composite score** = (similarity × 0.5) + (recency × 0.2) + (importance × 0.3)
4. Results above 0.15 threshold are returned, sorted by score
5. Accessed memories get importance boosted by +0.05

### How Auto-Extraction Works

After each chat exchange:
1. `memory:getExtractionPrompt` is called with recent conversation text
2. The prompt instructs the LLM to return a JSON array of extracted facts
3. Each fact has: category, content, importance (1–5)
4. Facts are stored via `memory:add` with source = `'auto-extraction'`

### Memory Categories

| Category | When to Use |
|----------|-------------|
| `core` | User's name, role, tech stack — exempt from decay |
| `preference` | Coding style, tool preferences |
| `decision` | Architectural choices, technology decisions |
| `pattern` | Recurring patterns, conventions |
| `project` | Framework, structure, APIs specific to a project |
| `correction` | Mistakes to avoid in future |
| `general` | Everything else |

## Project Onboarding

### Architecture

The onboarding system has two layers:

1. **`project-analyzer.ts`** — Pure static analysis, no LLM, instant results
2. **`project-onboarding.ts`** — Orchestrates static analysis + LLM analysis, emits progress events

### How Onboarding Works

1. User triggers via `/onboard`, natural language ("analyze this codebase"), or dashboard tile
2. `ChatView` calls `ipcRenderer.invoke('project:onboard', { rootPath })` with the workspace root
3. `project-analyzer.ts` runs `analyzeProject(rootPath)`:
   - Recursively scans files (max depth 6, ignores node_modules, .git, dist, etc.)
   - Detects framework from `package.json` dependencies (30+ frameworks recognized)
   - Detects primary language from file extension counts
   - Discovers config files, entry points, API routes, test files
   - Reads first ~2KB of key files (entry points, API routes, configs, schemas) for LLM context
   - Returns `ProjectAnalysis` object
4. `project-onboarding.ts` runs `runOnboarding(rootPath)`:
   - Emits `onboarding:progress` events (stage + message) to all renderer windows
   - Builds an LLM prompt with project facts, file samples, and directory tree
   - Streams LLM response via Model Router (`documentation` route) + Provider Registry
   - Parses delimited sections from LLM response (`---ARCHITECTURE_OVERVIEW---`, `---MERMAID_DIAGRAM---`, `---KEY_FILES_MAP---`)
   - Returns `OnboardingReport`
5. `formatOnboardingReport()` converts the report to markdown for display

### Adding Framework Detection

To detect a new framework, update `detectFramework()` in `project-analyzer.ts`:

```typescript
if (deps['my-framework']) return `MyFramework ${deps['my-framework'].replace('^', '')}`;
```

### Adding Pattern Detection

To detect a new codebase pattern, add to the `detectedPatterns` array in `analyzeProject()`:

```typescript
if (allFiles.some(f => f.includes('my-pattern'))) detectedPatterns.push('My pattern detected');
```

### Listening to Onboarding Progress

```typescript
useEffect(() => {
  const ipcRenderer = (window as any).ipcRenderer;

  const handleProgress = (_event: any, data: { stage: string; message: string }) => {
    console.log(`[Onboarding] ${data.stage}: ${data.message}`);
  };

  ipcRenderer.on('onboarding:progress', handleProgress);
  return () => ipcRenderer.off('onboarding:progress', handleProgress);
}, []);
```

## Agent Builder Customization

### AI Agent Generator

The `AgentGenerateBar` component (`src/components/Agent/AgentGenerateBar.tsx`) lets users describe an agent in natural language. The component:

1. Sends the description to the LLM with a structured prompt that lists all available tools
2. Expects a JSON response matching the `GeneratedAgentConfig` interface
3. Validates tool IDs against the known `AVAILABLE_TOOL_IDS` list
4. Passes the generated config to the editor modal via `onGenerated` callback

To extend the generator prompt (e.g., add new tools), update both `AVAILABLE_TOOL_IDS` and the tool descriptions in `GENERATE_PROMPT` within `AgentGenerateBar.tsx`.

### Agent Editor Modal Tabs

The `AgentEditorModal` (`src/components/Agent/AgentEditorModal.tsx`) is a full-screen modal with 5 tabs:

| Tab | Contents |
|-----|----------|
| Identity | Name, icon picker, description, tags, conversation starters (up to 5) |
| Prompt | System prompt textarea with live stats (token count, char count, line count) |
| Tools | Grouped tool picker (6 categories) with per-group Select All / Clear |
| Knowledge | File upload for agent context, embedded for semantic search |
| Pipeline | Enable/disable stages, retries, timeout configuration |

### Adding Conversation Starters to an Agent

Starters are stored on `AgentConfig.conversationStarters` (optional `string[]`). They appear as chips in `ChatView` when:
- The active agent has starters defined
- The current conversation has no messages yet

To add starters programmatically:

```typescript
await ipcRenderer.invoke('agent:update', {
  id: agentId,
  updates: {
    conversationStarters: [
      'Review this component for performance issues',
      'Generate unit tests for the auth module',
      'Explain this error message',
    ],
  },
});
```

### Grouped Tool Picker

The `ToolPicker` component (`src/components/Agent/ToolPicker.tsx`) organizes 21+ tools into 6 categories:

| Category | Tools |
|----------|-------|
| File System | read_file, write_file, append_file, delete_file, list_directory, create_directory, file_exists, get_file_info |
| Search | grep_search, find_files, get_file_diff |
| Git | git_status, git_log, git_commit |
| Web | http_request, fetch_url |
| Dev | execute_command, run_tests, lint_code, format_code |
| Utilities | get_timestamp, calculate, read_env |

Dangerous tools (`execute_command`, `delete_file`) display a warning indicator. Each group has Select All / Clear buttons.

## Usage Tracking

### How Usage is Captured

Usage is tracked at two levels:

**Streaming chat (`chat:stream`):**
- When the stream completes (final chunk with `done: true`), usage data from the provider is recorded
- `UsageTracker.record()` is called with provider, model, token counts, and duration
- Cost is calculated automatically from built-in or custom pricing

**Non-streaming tools (`chat:complete`):**
- Code generation, refactoring, design docs, prompt enhancer all use `chat:complete`
- The handler calls the provider, collects the full response, and records usage in one step
- The response includes a `usage` field that the frontend attaches to the message as `MessageUsage`

### Adding Usage Tracking to a New Feature

1. Use `chat:complete` IPC for non-streaming features:

```typescript
const result = await ipcRenderer.invoke('chat:complete', {
  providerId,
  model,
  messages,
  conversationId,
  messageId,
});
// result.usage contains token counts
```

2. The backend handler automatically records usage via `UsageTracker.record()`

3. Attach usage to the message for the per-message badge:

```typescript
const message: Message = {
  ...
  usage: {
    promptTokens: result.usage.prompt_tokens,
    completionTokens: result.usage.completion_tokens,
    totalTokens: result.usage.total_tokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    model,
    providerId,
  },
};
```

### Custom Pricing

To add pricing for a model not in the built-in table:

```typescript
await ipcRenderer.invoke('usage:setCustomPricing', {
  providerId: '*',           // '*' matches any provider
  model: 'my-custom-model',
  inputPricePerMToken: 1.00, // USD per million input tokens
  outputPricePerMToken: 3.00,
});
```

## Testing

```bash
# Run TypeScript type checking
npx tsc --noEmit

# Build check
npm run build
```

## Common Tasks

### Adding a New Sidebar Tool

1. Add button to `Sidebar.tsx`
2. Add state in `App.tsx` (`showNewPanel`)
3. Add panel component to render
4. Update props interface in `SidebarProps`
5. Add `onOpenNewPanel` callback

### Adding Settings Options

1. Add state in `SettingsContext.tsx`
2. Update UI in `SettingsModal.tsx`
3. Persist to localStorage or IPC

### Modifying Chat Input Layout

The chat input is in `ChatInput.tsx` with two-row layout:
- `.input-main-row` - Textarea + send button
- `.input-actions-row` - Attachment, model badge, mode buttons

### Updating Diff Viewer

The `DiffViewer` component supports three tabs:
- Changes tab: Unified diff view
- Original tab: Full original code
- Modified tab: Full modified code

To add new diff modes, update `DiffViewer.tsx` and add a new tab.

### Adding Window Controls

Window controls are in `Sidebar.tsx`:
- Mac-style buttons (red/yellow/green)
- Use IPC to call `window:minimize`, `window:maximize`, `window:close`
- Must be added to both expanded and collapsed sidebar views
