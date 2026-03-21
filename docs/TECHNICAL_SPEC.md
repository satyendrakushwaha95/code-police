# Technical Specification

## Architecture Overview

LocalMind AI is built with Electron + React, combining a desktop UI with a Node.js backend for AI operations.

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Sidebar   │  │  Chat View  │  │ Task Pipeline│   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │Code Generator│  │Refactor     │  │Design Docs  │   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│                         │                               │
│                    IPC Bridge                            │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                    Main Process                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ Ollama API   │  │ VectorDB    │  │ Pipeline    │ │
│  │ Service      │  │ Service     │  │ Orchestrator│ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ File System │  │ Model Router│  │ SQLite DB   │ │
│  │ Operations   │  │ Service     │  │ (Pipeline)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────┘
```

## Directory Structure

```
localmind-ai/
├── electron/
│   ├── main.ts              # Electron main process entry
│   ├── preload.ts           # Context bridge for IPC
│   ├── services/
│   │   ├── ollama.ts       # Ollama API wrapper
│   │   ├── vector-db.ts    # LanceDB vector store
│   │   ├── pipeline-orchestrator.ts  # Agent pipeline
│   │   ├── pipeline-state.ts         # Pipeline state (SQLite)
│   │   ├── pipeline-types.ts         # TypeScript interfaces
│   │   ├── model-router.ts  # Task-based model routing
│   │   ├── routing-config.ts # Model routing configuration
│   │   ├── memory.ts        # Agent memory
│   │   ├── agent-manager.ts  # Custom agent management
│   │   ├── agent-store.ts    # Agent persistence
│   │   ├── agent-types.ts    # Agent interfaces and presets
│   │   └── agents/         # AI agent implementations
│   │       ├── planner-agent.ts
│   │       ├── coder-agent.ts
│   │       ├── reviewer-agent.ts
│   │       ├── validator-agent.ts
│   │       └── executor-agent.ts
│   └── utils/
│       ├── file-operations.ts
│       └── path-utils.ts
├── src/
│   ├── App.tsx             # Root component
│   ├── main.tsx           # React entry
│   ├── index.css          # Global styles and design tokens
│   ├── header-logo.png    # App logo
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatView.tsx      # Dashboard + Chat
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── CodeGenPanel.tsx
│   │   │   ├── RefactorPanel.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DesignDocPanel.tsx
│   │   │   └── PromptEnhancerPanel.tsx
│   │   ├── Pipeline/
│   │   │   ├── PipelinePanel.tsx
│   │   │   ├── StageCard.tsx
│   │   │   └── Pipeline.css
│   │   ├── FilePanel/
│   │   │   ├── FilePanel.tsx     # Multi-file editor with line numbers
│   │   │   ├── FileTree.tsx
│   │   │   └── FilePanel.css
│   │   ├── Terminal/
│   │   │   └── TerminalPanel.tsx
│   │   ├── Settings/
│   │   │   ├── SettingsModal.tsx
│   │   │   └── RoutingSettingsPanel.tsx
│   │   ├── Sidebar/
│   │   │   └── Sidebar.tsx
│   │   ├── Agent/
│   │   │   ├── AgentPanel.tsx
│   │   │   ├── AgentEditorModal.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── ToolPicker.tsx    # 21 available tools
│   │   │   └── KnowledgeUploader.tsx
│   │   └── common/
│   │       └── CodeBlock.tsx
│   ├── hooks/
│   │   ├── usePipeline.ts
│   │   ├── useModelRouter.ts
│   │   ├── useToast.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── store/
│   │   ├── ConversationContext.tsx
│   │   ├── SettingsContext.tsx
│   │   ├── WorkspaceContext.tsx
│   │   └── AgentContext.tsx
│   ├── services/
│   │   ├── ollama.ts
│   │   ├── database.ts
│   │   └── fileReader.ts
│   ├── types/
│   │   └── chat.ts
│   └── utils/
│       └── helpers.ts
├── public/
│   ├── icon.ico           # Windows app icon
│   └── favicon.svg        # Browser favicon
├── release/
│   ├── LocalMind AI Setup 3.0.0.exe  # Windows installer
│   └── win-unpacked/      # Portable version
└── docs/
    ├── PRODUCT_DOC.md
    ├── TECHNICAL_SPEC.md
    ├── DEVELOPER_GUIDE.md
    └── API_REFERENCE.md
```
localmind-ai/
├── electron/
│   ├── main.ts              # Electron main process entry
│   ├── preload.ts           # Context bridge for IPC
│   ├── services/
│   │   ├── ollama.ts       # Ollama API wrapper
│   │   ├── vector-db.ts    # LanceDB vector store
│   │   ├── pipeline-orchestrator.ts  # Agent pipeline
│   │   ├── pipeline-state.ts         # Pipeline state (SQLite)
│   │   ├── pipeline-types.ts         # TypeScript interfaces
│   │   ├── model-router.ts  # Task-based model routing
│   │   ├── routing-config.ts # Model routing configuration
│   │   ├── memory.ts        # Agent memory
│   │   └── agents/         # AI agent implementations
│   │       ├── planner-agent.ts
│   │       ├── coder-agent.ts
│   │       ├── reviewer-agent.ts
│   │       └── validator-agent.ts
│   └── utils/
│       ├── file-operations.ts
│       └── path-utils.ts
├── src/
│   ├── App.tsx             # Root component
│   ├── main.tsx           # React entry
│   ├── index.css          # Global styles and design tokens
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatView.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── CodeGenPanel.tsx
│   │   │   ├── RefactorPanel.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DesignDocPanel.tsx
│   │   │   └── PromptEnhancerPanel.tsx
│   │   ├── Pipeline/
│   │   │   ├── PipelinePanel.tsx
│   │   │   ├── StageCard.tsx
│   │   │   ├── PipelineHistory.tsx
│   │   │   └── Pipeline.css
│   │   ├── FilePanel/
│   │   │   ├── FilePanel.tsx
│   │   │   ├── FileTree.tsx
│   │   │   └── CodeEditor.tsx
│   │   ├── Terminal/
│   │   │   └── TerminalPanel.tsx
│   │   ├── Settings/
│   │   │   ├── SettingsModal.tsx
│   │   │   └── RoutingSettingsPanel.tsx
│   │   ├── Sidebar/
│   │   │   └── Sidebar.tsx
│   │   └── common/
│   │       └── CodeBlock.tsx
│   ├── hooks/
│   │   ├── usePipeline.ts
│   │   ├── useModelRouter.ts
│   │   ├── useToast.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── store/
│   │   ├── ConversationContext.tsx
│   │   ├── SettingsContext.tsx
│   │   └── WorkspaceContext.tsx
│   ├── services/
│   │   └── ollama.ts
│   ├── types/
│   │   └── chat.ts
│   └── utils/
│       └── helpers.ts
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

Wrapper around Ollama REST API.

**Features:**
- Chat completions
- Model listing
- Embeddings generation
- Connection testing

## IPC Channels

### Chat
- `ollama:chat` - Send chat message
- `ollama:listModels` - List available models

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
- `routing-config.json` - Model routing configuration
- `pipeline-state.db` - SQLite database for pipeline state
- `lancedb/` - Vector database directory

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
- Messages per conversation
- Streaming state

**SettingsContext:**
- Ollama endpoint
- Selected models
- Generation parameters
- Theme preference

**WorkspaceContext:**
- Root path
- Files index
- Indexing state

## Window Configuration

**BrowserWindow Options:**
- `titleBarStyle: 'hidden'` - Custom title bar
- `trafficLightPosition: { x: -100, y: -100 }` - Hide native traffic lights
- Custom Mac-style buttons in sidebar header
