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
│  ┌───────────────┐  ┌─────────────┐                            │
│  │  Project      │  │ Command     │                            │
│  │  Onboarding   │  │ Router (FE) │                            │
│  └───────────────┘  └─────────────┘                            │
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
│   │   ├── pipeline-orchestrator.ts  # Agent pipeline (graph-based execution)
│   │   ├── pipeline-state.ts         # Pipeline state + analytics (SQLite)
│   │   ├── pipeline-types.ts         # Pipeline TypeScript interfaces
│   │   ├── pipeline-templates.ts     # Pipeline template configs (5 templates)
│   │   ├── pipeline-graph.ts         # Directed graph engine for conditional pipelines
│   │   ├── model-router.ts      # Task-based model routing
│   │   ├── routing-config.ts    # Model routing configuration
│   │   ├── memory.ts            # Agent memory (short-term)
│   │   ├── long-term-memory.ts  # Persistent memory, profile, personality
│   │   ├── usage-tracker.ts     # Token counting & cost tracking
│   │   ├── project-analyzer.ts  # Static codebase analysis (no LLM)
│   │   ├── project-onboarding.ts # Full onboarding report (static + LLM)
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
│   │       ├── executor-agent.ts
│   │       ├── research-agent.ts     # Codebase research (static + LLM)
│   │       └── security-agent.ts     # Security audit (regex + npm audit + LLM)
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
│   │   │   ├── Sidebar.tsx
│   │   │   └── Sidebar.css
│   │   ├── Agent/
│   │   │   ├── AgentPanel.tsx
│   │   │   ├── AgentEditorModal.tsx     # Full-screen builder modal
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentGenerateBar.tsx     # AI agent generator bar
│   │   │   ├── ToolPicker.tsx           # 21+ tools, grouped by category
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

Manages the autonomous agent pipeline execution with graph-based stage traversal.

**Pipeline Templates:**

| Template | Stages | Use Case |
|----------|--------|----------|
| Standard | Plan → Action → Review → Validate → Execute | Default |
| Quick Fix | Plan → Action → Execute | Fast bug fixes |
| Deep Review | Research → Plan → Action → Review → Security → Validate → Execute | Thorough review |
| Docs Only | Research → Plan → Action → Review | Documentation tasks |
| Refactor | Research → Action → Review → Validate → Execute | Code restructuring |

**Pipeline Stages (7 total):**
1. **Research** - Static project analysis + LLM codebase research
2. **Plan** - Analyzes task, creates execution plan
3. **Action** - Generates/modifies code based on plan
4. **Review** - Reviews code quality, finds issues
5. **Security** - Vulnerability scanning (regex patterns, npm audit, LLM review), produces 0-100 score
6. **Validate** - Runs tests and validation
7. **Execute** - Applies changes to filesystem

**Graph-Based Execution:**
- Each template is compiled into a `PipelineGraph` with `StageNode` entries
- The orchestrator walks the graph via a `while (currentStage)` loop
- Each `StageNode` defines: `onFail` behavior (stop/retry/skip/replan), `maxRetries`, `condition`, `resolveNext`
- Per-stage retry counters (`retryCountByStage`) ensure stage budgets are independent
- `MAX_REPLANS = 2` circuit breaker prevents infinite replan loops
- Agent-level stage toggles (`isStageEnabled()`) can skip stages regardless of template

**Task Type Detection:**
- Planner intelligently detects task type
- Documentation-only tasks (PRD, README) only generate docs, not code
- Optional `smartSkip` — auto-skips validate/execute for detected doc-only tasks

**Retry Logic:**
- Max 2 auto-attempts per stage before the graph transitions based on `onFail` policy
- When review returns FAIL verdict, the graph routes back to action (counter incremented per loop)
- User can manually retry with additional suggestions
- Stop pipeline with custom instructions supported

**State Management:**
- PipelineStateStore: Persists pipeline state + analytics to SQLite
- Template and stage_order stored per run
- Active run tracking with project_root
- Analytics recorded after every pipeline completion (pass, fail, cancel, timeout)

**Pipeline Analytics:**
- Per-run recording: duration, stage counts, bottleneck stage, token/cost from usage tracker
- Aggregate queries: summary (success rate, avg duration), by-template, by-stage (bottlenecks), by-model
- Time-range filtering support

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

### 9. Project Onboarding

Two-phase project analysis engine.

**Phase 1 — Static Analysis (`project-analyzer.ts`):**
- Recursive file scan with depth limit (6 levels) and ignored directories (node_modules, .git, dist, etc.)
- Framework detection: 30+ frameworks (Next.js, Nuxt, Angular, SvelteKit, Astro, Vue, React + Vite, Express, Fastify, Django, Flask, Go, Rust, Spring, Rails, Laravel, Flutter, etc.)
- Language detection by file extension counts
- Styling detection: Tailwind, MUI, Chakra, Styled Components, Emotion, Bootstrap, SCSS, Less
- Database detection: Prisma, Drizzle, TypeORM, Sequelize, MongoDB, PostgreSQL, MySQL, SQLite, Redis, Supabase, Firebase
- Testing detection: Jest, Vitest, Mocha, Cypress, Playwright, React Testing Library, Supertest
- Entry point detection, API route detection (REST controllers, Next.js API routes, etc.)
- Config file discovery, package.json parsing, directory tree generation
- Pattern detection: middleware, hooks, state management, service layer, CSS modules, CI/CD, etc.
- Key file sampling: reads first ~2KB of entry points, API routes, configs, and schema files for LLM context

**Phase 2 — LLM Analysis (`project-onboarding.ts`):**
- Sends static analysis + file samples to LLM (uses Model Router `documentation` route)
- LLM generates: architecture overview (3–5 sentences), Mermaid diagram (`graph TD`), key files map
- Response is parsed via delimited sections (`---ARCHITECTURE_OVERVIEW---`, `---MERMAID_DIAGRAM---`, `---KEY_FILES_MAP---`)
- Graceful fallback if LLM is unavailable — static analysis still produces a useful report

**Output:** `OnboardingReport` containing tech stack summary, architecture overview, Mermaid diagram, key files map, API surface, health assessment, directory tree, and raw `ProjectAnalysis` data.

**Progress Events:** `onboarding:progress` is emitted to all renderer windows during analysis with `{ stage: string, message: string }`.

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

### Project Onboarding
- `project:onboard` - Analyze a project directory and generate onboarding report (request: `{ rootPath: string }`, response: `{ report: OnboardingReport, formatted: string }`)

### Events
- `jarvis:summon` - Emitted when `Ctrl+Space` global hotkey is pressed; brings app to front and focuses chat input
- `onboarding:progress` - Emitted during project onboarding with `{ stage: string, message: string }`

### Pipeline
- `pipeline:getTemplates` - Get available pipeline templates
- `pipeline:run` - Start pipeline execution (includes projectRoot, runId, and template)
- `pipeline:cancel` - Cancel running pipeline
- `pipeline:getRun` - Get specific pipeline run
- `pipeline:getHistory` - Get pipeline history
- `pipeline:deleteRun` - Delete pipeline run
- `pipeline:getStageOutput` - Get output from a specific stage (accepts any stage name)
- `pipeline:retryFix` - Retry failed stage with suggestions
- `pipeline:analyzeAndRetry` - Analyze user instructions and retry/stop pipeline
- `pipeline:analytics:getSummary` - Get analytics summary (success rate, avg duration, etc.)
- `pipeline:analytics:getByTemplate` - Get analytics broken down by template
- `pipeline:analytics:getByStage` - Get stage bottleneck analytics
- `pipeline:analytics:getByModel` - Get model performance analytics

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
| `pipeline_runs` | Pipeline State | Pipeline execution history (includes template, stage_order) |
| `pipeline_stage_results` | Pipeline State | Per-stage execution results (status, model, duration, output) |
| `pipeline_analytics` | Pipeline Analytics | Per-run aggregate metrics (duration, stages, bottleneck, tokens, cost) |
| `pipeline_stage_analytics` | Pipeline Analytics | Per-stage analytics (duration, model, status per attempt) |
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
- Top row: Textarea (auto-expand) + Send button + Prompt Enhance (✨) button
- Bottom row: Attachment | Model badge (clickable model picker) | Compare | Chat | Send to Agent
- In-chat model picker: dropdown of all provider models grouped by provider, embedding models filtered
- Slash command autocomplete dropdown when `/` is typed
- Smart paste detection (stack traces, JSON, URLs, commands, code)

**DiffViewer** - Three-tab diff viewer:
- Changes: Unified diff with line highlighting
- Original: Full original code
- Modified: Full modified code

### Pipeline Components

**PipelinePanel** - Pipeline dashboard with Runs and Analytics tabs
- Two tabs: Runs (pipeline list) and Analytics (performance dashboard)
- Dynamic stage rendering from `run.stage_order`
- Template badge display
- Auto-refresh every 5 seconds

**StageCard** - Pipeline stage display (supports 7 stage types)
- Status indicator with animations (pending, running, complete, failed, skipped)
- Research results rendering (findings, patterns, files examined)
- Security results rendering (score badge, vulnerability table, dependency issues)
- Code changes viewer, validation results, review issues
- Expandable output

**AnalyticsDashboard** - Pipeline performance insights
- Summary cards (success rate, avg duration, total runs, avg retries)
- Template performance table
- Stage bottleneck bars
- Model performance table
- Time-range filters (7 days, 30 days, all time)

### Sidebar

**Redesigned Layout:**
- Two collapsible sections: "Menu" and "Chats (N)"
- Single scrollable body — no fixed footer
- Click section header to collapse/expand
- Resizable via drag handle (200px–500px)

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
