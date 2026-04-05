# Technical Specification

## Architecture Overview

LocalMind AI is built with Electron + React, combining a desktop UI with a Node.js backend for AI operations.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Renderer Process                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Sidebar   │  │  Chat View  │  │ Task Pipeline│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │Code Generator│  │Refactor     │  │Design Docs  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐           │
│  │ComparePanel │  │UsageDashboard│  │CommandPalette │           │
│  └─────────────┘  └─────────────┘  └───────────────┘           │
│                         │                                        │
│                    IPC Bridge                                     │
└─────────────────────────┼────────────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────────────┐
│                    Main Process                                   │
│  ┌───────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Provider    │  │ VectorDB    │  │ Pipeline    │           │
│  │   Registry    │  │ Service     │  │ Orchestrator│           │
│  └───────────────┘  └─────────────┘  └─────────────┘           │
│  ┌───────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │ Usage Tracker │  │ Model Router│  │ SQLite DB   │           │
│  │               │  │ Service     │  │ (All tables)│           │
│  └───────────────┘  └─────────────┘  └─────────────┘           │
│  ┌───────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │  Long-Term   │  │ File System │  │Ollama Embed │           │
│  │  Memory       │  │ Operations  │  │  Service    │           │
│  └───────────────┘  └─────────────┘  └─────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
localmind-ai/
├── electron/
│   ├── main.ts                  # Electron main process entry
│   ├── preload.ts               # Context bridge for IPC
│   ├── services/
│   │   ├── ollama.ts            # Ollama API wrapper (legacy, embeddings)
│   │   ├── embeddings.ts        # Ollama embeddings service
│   │   ├── shared-ollama.ts     # Shared Ollama embeddings singleton
│   │   ├── vector-db.ts         # LanceDB vector store
│   │   ├── pipeline-orchestrator.ts  # Agent pipeline
│   │   ├── pipeline-state.ts         # Pipeline state (SQLite)
│   │   ├── pipeline-types.ts         # Pipeline TypeScript interfaces
│   │   ├── model-router.ts      # Task-based model routing
│   │   ├── routing-config.ts    # Model routing configuration
│   │   ├── memory.ts            # Agent memory (short-term)
│   │   ├── long-term-memory.ts  # Persistent memory, profile, personality
│   │   ├── usage-tracker.ts     # Token counting & cost tracking
│   │   ├── agent-manager.ts     # Custom agent management
│   │   ├── agent-store.ts       # Agent persistence
│   │   ├── agent-types.ts       # Agent interfaces and presets
│   │   ├── providers/           # Multi-provider abstraction
│   │   │   ├── provider-types.ts      # ProviderConfig, ChatProvider, presets
│   │   │   ├── ollama-provider.ts     # Ollama adapter
│   │   │   ├── openai-provider.ts     # OpenAI-compatible adapter
│   │   │   ├── anthropic-provider.ts  # Anthropic adapter
│   │   │   ├── provider-config.ts     # Provider config store (JSON + encryption)
│   │   │   ├── provider-registry.ts   # Provider lifecycle & routing
│   │   │   └── index.ts              # Barrel export
│   │   └── agents/              # AI agent implementations
│   │       ├── planner-agent.ts
│   │       ├── coder-agent.ts
│   │       ├── reviewer-agent.ts
│   │       ├── validator-agent.ts
│   │       └── executor-agent.ts
│   └── utils/
│       ├── file-operations.ts
│       └── path-utils.ts
├── src/
│   ├── App.tsx                  # Root component
│   ├── main.tsx                 # React entry
│   ├── index.css                # Global styles and design tokens
│   ├── header-logo.png          # App logo
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatView.tsx           # Dashboard + Chat
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── CodeGenPanel.tsx
│   │   │   ├── CodeGenModal.tsx
│   │   │   ├── RefactorPanel.tsx
│   │   │   ├── RefactorModal.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DesignDocPanel.tsx
│   │   │   ├── DesignDocModal.tsx
│   │   │   ├── PromptEnhancerPanel.tsx
│   │   │   ├── TaskPlannerPanel.tsx
│   │   │   ├── TaskPlannerModal.tsx
│   │   │   └── Chat.css
│   │   ├── Compare/
│   │   │   ├── ComparePanel.tsx        # Side-by-side comparison overlay
│   │   │   ├── CompareModelPicker.tsx  # Model selection for comparison
│   │   │   ├── CompareResponseCard.tsx # Individual response card with rating
│   │   │   └── Compare.css
│   │   ├── Usage/
│   │   │   ├── UsageDashboard.tsx      # Usage & cost dashboard
│   │   │   └── Usage.css
│   │   ├── CommandPalette/
│   │   │   ├── CommandPalette.tsx      # Ctrl+K searchable command palette
│   │   │   └── CommandPalette.css
│   │   ├── Pipeline/
│   │   │   ├── PipelinePanel.tsx
│   │   │   ├── StageCard.tsx
│   │   │   ├── PipelineHistory.tsx
│   │   │   └── Pipeline.css
│   │   ├── FilePanel/
│   │   │   ├── FilePanel.tsx           # Multi-file editor with line numbers
│   │   │   ├── FileTree.tsx
│   │   │   └── FilePanel.css
│   │   ├── Terminal/
│   │   │   └── TerminalPanel.tsx
│   │   ├── Settings/
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── RoutingSettingsPanel.tsx
│   │   │   ├── ProviderSettingsPanel.tsx  # Provider management UI
│   │   │   ├── ProfileSettingsPanel.tsx   # Profile, personality, memories UI
│   │   │   └── Settings.css
│   │   ├── Sidebar/
│   │   │   └── Sidebar.tsx
│   │   ├── Agent/
│   │   │   ├── AgentPanel.tsx
│   │   │   ├── AgentEditorModal.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── ToolPicker.tsx          # 21 available tools
│   │   │   └── KnowledgeUploader.tsx
│   │   └── common/
│   │       └── CodeBlock.tsx
│   ├── hooks/
│   │   ├── usePipeline.ts
│   │   ├── useModelRouter.ts
│   │   ├── useCompare.ts              # Multi-model comparison hook
│   │   ├── useToast.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── store/
│   │   ├── ConversationContext.tsx
│   │   ├── SettingsContext.tsx
│   │   ├── WorkspaceContext.tsx
│   │   └── AgentContext.tsx
│   ├── services/
│   │   ├── ollama.ts
│   │   ├── agent.ts
│   │   ├── command-router.ts          # Jarvis NL command router
│   │   ├── database.ts
│   │   └── fileReader.ts
│   ├── types/
│   │   └── chat.ts
│   └── utils/
│       └── helpers.ts
├── public/
│   ├── icon.ico                 # Windows app icon
│   └── favicon.svg              # Browser favicon
├── release/
│   ├── LocalMind AI Setup 3.0.0.exe  # Windows installer
│   └── win-unpacked/            # Portable version
└── docs/
    ├── PRODUCT_DOC.md
    ├── TECHNICAL_SPEC.md
    ├── DEVELOPER_GUIDE.md
    └── API_REFERENCE.md
```

## Key Services

### 1. Pipeline Orchestrator

Manages the autonomous agent pipeline execution.

**Pipeline Stages:**
1. **Plan** - Analyzes task, creates execution plan
2. **Action** - Generates/modifies code based on plan (renamed from "Code")
3. **Review** - Reviews code quality, finds issues
4. **Validate** - Runs tests and validation
5. **Execute** - Applies changes to filesystem

**Task Type Detection:**
- Planner intelligently detects task type
- Documentation-only tasks (PRD, README) only generate docs, not code
- Code tasks generate implementation files
- Avoids generating implementation for documentation requests

**Retry Logic:**
- Max 2 auto-attempts before manual review required
- When review fails, issues are passed back to Action stage
- After 2 failures, pipeline status changes to 'failed'
- User can manually retry with additional suggestions
- Stop pipeline with custom instructions supported

**Stop Pipeline Feature:**
- User can stop running pipelines at any time
- After stopping, user enters instructions
- AI analyzes intent (continue/restart/cancel)
- Executes appropriate action

**State Management:**
- PipelineStateStore: Persists pipeline state to SQLite
- Active run tracking with project_root stored
- History with retry capability

### 2. Vector DB Service

Semantic search using LanceDB.

**Features:**
- Embed documents using Ollama
- Similarity search
- Persistent storage in user data directory

### 3. Model Router

Routes tasks to appropriate AI models based on task type.

**Default Configuration:**
```json
{
  "defaultModel": "qwen3-coder:30b",
  "routes": {
    "code_generation": { "model": "qwen3-coder:480b-cloud", "enabled": true },
    "code_refactor": { "model": "qwen3-coder:480b-cloud", "enabled": true },
    "planning": { "model": "deepseek-v3.1:671b-cloud", "enabled": true },
    "review": { "model": "deepseek-v3.1:671b-cloud", "enabled": true },
    "documentation": { "model": "minimax-m2.5:cloud", "enabled": true },
    "chat_general": { "model": "minimax-m2.5:cloud", "enabled": true }
  }
}
```

### 4. Ollama Service

Wrapper around Ollama REST API (retained for embeddings and legacy compatibility).

**Features:**
- Chat completions (legacy — new chat goes through Provider Registry)
- Model listing
- Embeddings generation
- Connection testing

### 5. Provider Registry

Manages multiple AI provider backends through a unified interface.

**Architecture:**
- `ProviderConfig` defines each provider: id, type, name, endpoint, API key, enabled status
- Three provider adapters: `OllamaProvider`, `OpenAIProvider`, `AnthropicProvider`
- `ProviderConfigStore` persists config to `providers-config.json` with API keys encrypted via `electron.safeStorage`
- `ProviderRegistry` instantiates providers from config, handles add/update/remove lifecycle

**Provider Types:**
- `ollama` — Ollama native API (streaming via `/api/chat`)
- `openai_compatible` — OpenAI Chat Completions API (works with OpenAI, Groq, OpenRouter, Together AI, Fireworks, LM Studio)
- `anthropic` — Anthropic Messages API

**Key Methods:**
- `chatStream(providerId, model, messages, options, signal)` → `AsyncGenerator<ChatStreamChunk>`
- `listModels(providerId)` / `listAllModels()` → `ProviderModel[]`
- `checkConnection(providerId)` → `boolean`
- `addProvider()` / `updateProvider()` / `removeProvider()`

**8 Built-in Presets:** Ollama, OpenAI, Anthropic, Groq, OpenRouter, Together AI, Fireworks AI, LM Studio

### 6. Usage Tracker

Tracks token usage and cost for every AI call in the application.

**Features:**
- Records per-message: prompt tokens, completion tokens, total tokens, cost (USD), duration, model, provider
- Built-in pricing table for 19+ models (OpenAI, Anthropic, Groq, DeepSeek)
- Local Ollama models = $0 (no pricing entry found → free)
- Custom pricing support: override or add pricing for any provider/model pair
- Time-range queries: summary, by-model, by-day, by-message, recent

**Tables:** `token_usage`, `custom_pricing`

**Cost Calculation:** `(promptTokens / 1M) × inputPricePerMToken + (completionTokens / 1M) × outputPricePerMToken`

### 7. Long-Term Memory

Persistent cross-session memory with semantic recall and decay.

**Features:**
- 7 memory categories: core, preference, decision, pattern, project, correction, general
- Composite recall scoring: 50% semantic similarity (via embeddings) + 20% recency decay + 30% importance
- Exponential decay with 90-day half-life; importance boost on access; auto-delete below 0.1 threshold
- `core` memories exempt from decay
- Memory consolidation: merge old low-importance memories
- Auto-extraction: LLM extracts facts from conversation in background
- Import/export as JSON

**User Profile & Personality:**
- User profile fields: name, role, timezone, expertise areas, preferred languages
- 5 personality modes with full system prompt templates: Professional, Casual, Concise, Mentor, Creative
- Custom traits overlay
- Profile + personality injected into every chat system prompt via `buildPersonalityPrompt()`

**Tables:** `long_term_memory`, `user_profile`

### 8. Command Router

Jarvis-style natural language command router that intercepts user input before it reaches the LLM.

**Flow:**
1. User types in chat input
2. `detectIntent()` matches input against 20+ slash command patterns and natural language regexes
3. If matched: executes command via IPC and returns result inline in chat
4. If no match: passes through to LLM as normal chat

**Intent Categories:**
- Terminal execution (run, exec, shell, `$` shorthand)
- Git operations (status, log, diff, commit)
- Code search (search, grep, find)
- File operations (read, list directory)
- Memory (remember, recall)
- UI panel openers (codegen, refactor, settings, usage, compare, etc.)

**Slash Command Autocomplete:** `getSlashCommandHints()` returns hints for dropdown

## IPC Channels

### Chat
- `ollama:chat` - Send chat message (legacy, direct Ollama)
- `ollama:listModels` - List available Ollama models
- `chat:stream` - Start streaming chat via Provider Registry (returns streamId)
- `chat:chunk` - Event: streaming chunk from `chat:stream`
- `chat:error` - Event: streaming error
- `chat:abort` - Abort an active chat stream
- `chat:complete` - Non-streaming chat completion (used by code gen, refactor, etc.)

### Provider Management
- `provider:list` - List all configured providers (masked API keys)
- `provider:add` - Add a new provider
- `provider:update` - Update provider config
- `provider:remove` - Remove a provider
- `provider:test` - Test provider connection
- `provider:listModels` - List models for a specific provider
- `provider:listAllModels` - List models across all enabled providers
- `provider:getPresets` - Get built-in provider presets

### Compare
- `compare:stream` - Start multi-model comparison (sends prompt to 2-4 models)
- `compare:chunk` - Event: streaming chunk for a specific model in a comparison
- `compare:error` - Event: error for a specific model in a comparison
- `compare:abort` - Abort an active comparison

### Usage Tracking
- `usage:getSummary` - Get usage summary (total tokens, cost, request count) with optional time range
- `usage:getByModel` - Get usage broken down by model with optional time range
- `usage:getByDay` - Get daily usage for N days
- `usage:getByMessage` - Get usage record for a specific message
- `usage:getRecent` - Get recent usage records
- `usage:getPricing` - Get built-in + custom pricing tables
- `usage:setCustomPricing` - Set custom pricing for a provider/model pair

### Memory
- `memory:add` - Add a memory fact
- `memory:recall` - Semantic recall with composite scoring
- `memory:getAll` - Get all stored memories
- `memory:getByCategory` - Get memories filtered by category
- `memory:delete` - Delete a memory by ID
- `memory:update` - Update a memory's content, category, or importance
- `memory:getCount` - Get total memory count
- `memory:buildContext` - Build memory context block for injection into prompts
- `memory:applyDecay` - Apply decay to all non-core memories
- `memory:export` - Export all memories and profile as JSON
- `memory:import` - Import memories and profile from JSON
- `memory:getExtractionPrompt` - Get the LLM prompt for auto-extracting facts from conversation

### Profile
- `profile:get` - Get user profile
- `profile:update` - Update user profile fields
- `profile:getPersonalityModes` - Get available personality modes with descriptions
- `profile:getPersonalityPrompt` - Build the full personality system prompt

### Pipeline
- `pipeline:run` - Start pipeline execution (includes projectRoot and runId)
- `pipeline:cancel` - Cancel running pipeline
- `pipeline:getRun` - Get specific pipeline run
- `pipeline:getHistory` - Get pipeline history
- `pipeline:deleteRun` - Delete pipeline run
- `pipeline:retryFix` - Retry failed stage with suggestions
- `pipeline:analyzeAndRetry` - Analyze user instructions and retry/stop pipeline

### Agent Management
- `agent:list` - Get all custom agents
- `agent:get` - Get specific agent by ID
- `agent:create` - Create new agent
- `agent:update` - Update existing agent
- `agent:delete` - Delete agent
- `agent:clone` - Clone an agent
- `agent:export` - Export agent as JSON
- `agent:import` - Import agent from JSON
- `agent:getPresets` - Get available agent presets

### Window Control
- `window:minimize` - Minimize window
- `window:maximize` - Maximize/restore window
- `window:close` - Close window

### Routing
- `routing:getConfig` - Get routing configuration
- `routing:updateConfig` - Update routing configuration

### Files
- `fs:readFile` - Read file contents
- `fs:writeFile` - Write file contents
- `fs:listDirectory` - List directory contents
- `tools:execute` - Execute tool (write_file, read_file, etc.)

## Data Storage

**User Data Location:** `%APPDATA%/localmind-ai/`

**Files:**
- `settings.json` - User preferences
- `routing-config.json` - Model routing configuration (v2, includes `providerId` per route)
- `providers-config.json` - Provider configurations (API keys encrypted via `electron.safeStorage`)
- `localmind.db` - SQLite database (shared by multiple services)
- `lancedb/` - Vector database directory

**SQLite Tables (`localmind.db`):**

| Table | Service | Description |
|-------|---------|-------------|
| `pipeline_runs` | Pipeline State | Pipeline execution history and stage results |
| `token_usage` | Usage Tracker | Per-message token counts, costs, durations |
| `custom_pricing` | Usage Tracker | User-defined per-model pricing overrides |
| `long_term_memory` | Long-Term Memory | Persistent memory facts with embeddings and importance |
| `user_profile` | Long-Term Memory | Key-value store for user profile and personality settings |

## UI Components

### Design System (index.css)

**Design Tokens:**
- Background colors (dark: #1a1a1a to #2d2d2d Claude-style, light: #f9f8f6)
- Text colors (dark: #f5f5f5 soft linen, light: #1a1a1a)
- Accent color (dark: #E67D22 Claude orange, light: #c96442 terracotta)
- Border colors (transparent whites/blacks)
- Border radius (sm: 8px, md: 12px, lg: 16px)
- Shadows (sm, md, lg, glow)
- Base font size: 14px
- Mesh background variables (--bg-mesh-line, --bg-mesh-accent)

**Component Styles:**
- `.btn` - Base button with variants (primary, secondary, ghost, danger, success)
- `.btn-icon` - Icon button with gray border
- `.status-badge` - Status indicators with colored backgrounds
- `.model-badge` - Model indicator with connection status

### Chat Components

**ChatView** - Main chat interface with dashboard, header, messages area, input
- Dashboard with search input and quick actions grid
- Mesh background SVG pattern
- Context visibility badge (click to expand)
- Home button to return to dashboard

**ChatInput** - Two-row input layout:
- Top row: Textarea (auto-expand) + Send button
- Bottom row: Attachment | Model badge | Chat | Send to Agent

**DiffViewer** - Three-tab diff viewer:
- Changes: Unified diff with line highlighting
- Original: Full original code
- Modified: Full modified code

### Pipeline Components

**PipelinePanel** - Single-view pipeline dashboard
- Auto-refresh every 5 seconds
- Manual refresh button
- Expandable pipeline items

**StageCard** - Pipeline stage display
- Status indicator with animations
- Expandable output
- Code changes viewer

### Sidebar

**Window Controls** - Mac-style buttons (red/yellow/green)
- Always visible in both expanded and collapsed sidebar
- Positioned at top-left

## State Management

**ConversationContext:**
- Conversations list
- Active conversation
- Messages per conversation (includes `usage?: MessageUsage` per message)
- Streaming state
- Compare session state

**SettingsContext:**
- Ollama endpoint
- Selected models (with provider awareness)
- Generation parameters
- Theme preference
- Active provider ID

**WorkspaceContext:**
- Root path
- Files index
- Indexing state

**AgentContext:**
- Custom agents list
- Active agent selection

## Window Configuration

**BrowserWindow Options:**
- `titleBarStyle: 'hidden'` - Custom title bar
- `trafficLightPosition: { x: -100, y: -100 }` - Hide native traffic lights
- Custom Mac-style buttons in sidebar header
