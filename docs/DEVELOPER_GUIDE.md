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
- `FilePanel/` - File explorer
- `Terminal/` - Terminal emulator
- `Settings/` - Settings modal, routing, provider management (ProviderSettingsPanel), profile & memory (ProfileSettingsPanel)
- `Sidebar/` - Navigation sidebar with window controls
- `Agent/` - Custom agent management (AgentPanel, AgentCard, AgentEditorModal, ToolPicker, KnowledgeUploader)
- `common/` - Shared components

**Hooks** (`src/hooks/`)
- `usePipeline.ts` - Pipeline state and operations
- `useModelRouter.ts` - Model routing with provider awareness
- `useCompare.ts` - Multi-model comparison session management
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
- `WorkspaceContext.tsx` - Workspace state
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
- `pipeline-orchestrator.ts` - Pipeline execution
- `pipeline-state.ts` - SQLite pipeline state
- `pipeline-types.ts` - Pipeline TypeScript interfaces
- `model-router.ts` - Task routing (provider-aware)
- `routing-config.ts` - Routing configuration store (v2, with `providerId`)
- `memory.ts` - Agent memory (short-term)
- `long-term-memory.ts` - Persistent memory, user profile, personality engine
- `usage-tracker.ts` - Token counting, cost calculation, usage persistence
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

### Pipeline Stages

Current stages:
1. `plan` - Task analysis and planning
2. `action` - Code generation/modification (renamed from "code")
3. `review` - Code review
4. `validate` - Validation/testing
5. `execute` - File system execution

### Adding Pipeline Stage

1. Update `PipelineStage` type in `pipeline-types.ts`
2. Add agent implementation in `agents/`
3. Update orchestrator to include new stage
4. Add UI display in `StageCard.tsx`
5. Update `StageCard` STAGE_LABELS object

### Pipeline State

Pipeline data is stored in SQLite via `pipeline-state.ts`:
- Pipeline runs with task description and project root
- Stage results with status, model used, duration, output
- Retry logic limited to 2 auto-attempts

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
