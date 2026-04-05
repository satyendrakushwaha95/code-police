# LocalMind AI - Product Documentation

## Overview

LocalMind AI is a desktop AI engineering workspace that combines conversational AI, autonomous agent capabilities, and code automation tools in a unified interface.

## System Requirements

### Pre-Bundled (No Setup Required)

| Component | Description |
|-----------|-------------|
| SQLite | Pipeline state storage (via better-sqlite3) |
| LanceDB | Vector database for semantic search |
| React + UI | All frontend libraries |
| Monaco Editor | Code editor with syntax highlighting |
| Highlight.js | Code highlighting |
| Mermaid | Diagram rendering |
| Marked | Markdown rendering |

### External Requirements

**At least one AI provider is required.** The simplest option is Ollama (local, free):

- **Ollama (Local)** — Download from [https://ollama.ai](https://ollama.ai). Must be running on `http://localhost:11434` (default).
- **Cloud Providers** — Alternatively (or additionally), configure any supported cloud provider in **Settings → Providers**: OpenAI, Anthropic, Groq, OpenRouter, Together AI, Fireworks AI, or LM Studio.

```bash
# If using Ollama, pull the required models
ollama pull llama3.2
ollama pull nomic-embed-text
```

You can use multiple providers simultaneously — the Model Router and per-feature model selection work across all configured providers.

## Core Features

### 1. Dashboard & Chat Interface

**Dashboard (Home Screen):**
The dashboard provides quick access to all features with a developer-first design:
- **Logo** - Click to return to dashboard from any chat
- **Search Input** - Primary interaction; type prompt and press Enter or click send to start a new chat
- **Quick Actions Grid** - 6 action tiles (New Chat, Generate Code, Refactor, Pipeline, Open Project, Agents)
- **Mesh Background** - Subtle geometric pattern for visual depth

**Chat Interface:**
- Auto-expanding textarea (up to 200px)
- Mode toggle buttons (Chat / Send to Agent)
- Agent selection dropdown (appears when Send to Agent is clicked)
- Model indicator with connection status dot
- Collapsible chat window
- File attachment support
- Conversation management (create, rename, delete)

**Context Visibility:**
- Minimal badge in chat header showing token usage (e.g., "45K / 131K")
- Click the badge to expand detailed context info with progress bar
- Color-coded: green (<60%), yellow (60-80%), red (>80%)

**Chat Input Layout:**
- **Top row:** Textarea with send button inside
- **Bottom row:** Attachment button | Model badge (with status) | Compare button | Chat | Send to Agent buttons
- **Slash command autocomplete:** Type `/` to see a dropdown of available slash commands with descriptions
- **Agent dropdown:** Shows when Send to Agent is active, displays all available agents

**Send to Agent Mode:**
- Click "Send to Agent" to switch to agentic mode
- Agent dropdown appears with all custom agents
- Select an agent or use the default
- Type your task and send
- Pipeline executes through all stages automatically

### 2. Agentic Tasks (Pipeline)

Instead of a separate window, the pipeline is now integrated into the chat experience:

**How it works:**
1. Click "Send to Agent" button in chat input
2. Select an agent from the dropdown (or use default)
3. Type your task and send
4. The AI autonomously runs through the pipeline stages:
   - **Plan** - Analyzes task and creates execution plan
   - **Action** - Generates or modifies code (renamed from "Code")
   - **Review** - Reviews code quality and issues
   - **Validate** - Runs tests and validation
   - **Execute** - Applies changes to files

**Smart Task Detection:**
- Planner automatically detects task type
- Documentation-only tasks (PRD, README, specs) only generate documents
- Code tasks generate implementation files
- Avoids unnecessary code generation for documentation requests

**Stop Pipeline:**
- Click "Stop" button on running pipelines
- Enter instructions for what to do next (continue, restart, cancel)
- AI analyzes intent and executes appropriate action
- Previous error is included in retry feedback

**Retry Logic:**
- Max 2 auto-attempts before manual review
- Manual retry with suggestions from review
- User can provide additional feedback during retry
- Project root stored with pipeline data for security checks

**Pipeline Dashboard:**
- Access via "Task Pipeline" button in sidebar
- Single view (no tabs) - all pipelines in one list
- Auto-refresh every 5 seconds
- Manual refresh button available
- Real-time status updates
- Visual progress bar with pill-shaped stage indicators

### 3. Task Pipeline Dashboard

Monitor all pipeline tasks in a unified view:

**Features:**
- Auto-refresh every 5 seconds
- Running pipelines appear at the top
- Expandable pipeline items
- Real-time execution summary with timer
- Visual progress bar showing completion
- Pill-shaped stage indicators connected with lines

**Pipeline Stage Display:**
Each stage (Plan, Action, Review, Validate, Execute) is displayed as a pill badge:
- **Pending**: Numbered circle (1, 2, 3...)
- **Running**: Spinning indicator with pulsing border
- **Complete**: Green checkmark (✓)
- **Failed**: Red X (✗)

**Progress Bar:**
- Visual progress bar above stage pills
- Blue-to-green gradient fill
- Shows completion based on completed stages

Each task shows:
- Status badge (running, complete, failed, cancelled)
- Task description
- Pill-shaped progress indicator with stage labels
- Duration timer
- Expandable details with stage cards

**Stop Pipeline:**
- Click "Stop" on running pipelines
- Enter instructions for what to do next
- AI analyzes and continues/restarts as appropriate

**When pipeline fails:**
- Suggestions from review are displayed
- Textarea for manual feedback
- Retry button to re-run with suggestions

### 4. Code Generator

Intent-based code generation tool.

**Generation Types:**
- Function - Single function or method
- API - REST API endpoints
- Service - Business logic services
- SQL - Database queries
- Model - Data models
- Script - Automation scripts
- Module - Code modules

**Features:**
- Preview plan before generation
- Strict/Flexible determinism modes
- Generated outputs: Code, Tests, Explanation, Setup
- One-click insert to file panel
- Syntax highlighting with line numbers

### 5. Code Refactor

Intent-based code transformation tool.

**Categories:**
- Code Quality (reformat, comments, naming, simplify)
- Performance (optimize, cache, lazy load, parallelize)
- Security (sanitize, validate, hash, encrypt)
- Architecture (extract method, move, rename, interface)
- Testing (mock, stub, coverage, assertion)
- Documentation (docstring, comments, README)

**Diff Viewer:**
- Three tabs: Changes, Original, Modified
- Line-by-line highlighting (green for added, red for removed)
- Line numbers column
- Copy to clipboard functionality
- Stats badges (+X added, -Y removed)

### 6. Design Documents

Generate project documentation with Mermaid diagrams.

**Document Types:**
- PRD (Product Requirements Document)
- HLD (High-Level Design)
- LLD (Low-Level Design)

**Features:**
- Mermaid diagram support (flowcharts, sequence, ER diagrams)
- Edit and regenerate capability
- Copy to clipboard

### 7. Prompt Enhancer

Improve prompts using customizable personas.

**Features:**
- Predefined personas (Coder, Reviewer, Architect, etc.)
- Custom persona creation
- Insert enhanced prompts to chat

### 8. File Explorer

Browse and edit project files with a professional code editor experience.

**Features:**
- Directory tree navigation
- File content viewer with line numbers
- Multi-file tabs (open multiple files simultaneously)
- Edit mode with monospace font styling
- Add files as context to chat
- Semantic code search (with indexing)
- Resizable panel

### 9. Terminal

Built-in command execution.

**Features:**
- Command input with history
- Output display
- Working directory indicator

### 10. Settings

**General Tab:**
- Ollama endpoint configuration
- Model selection (Chat & Embedding)
- Temperature, Top P, Context Length parameters
- System prompt customization
- Theme (Dark/Light)

**Model Router Tab:**
- Configure which models to use for different task categories
- Categories: Code Generation, Code Refactor, Documentation, Planning, Review, Chat General
- Per-category model assignment
- Enable/disable routing per category

**Providers Tab:**
- Add, edit, delete AI providers (Ollama, OpenAI, Anthropic, Groq, OpenRouter, Together AI, Fireworks AI, LM Studio)
- Test connection to verify API key and endpoint
- Enable/disable providers
- API keys encrypted via `electron.safeStorage`
- 8 built-in provider presets for quick setup

**Profile & Memory Tab:**
- **Profile** — Set name, role, timezone, expertise areas, preferred languages
- **Personality** — Choose from 5 modes (Professional, Casual, Concise, Mentor, Creative) plus custom traits
- **Memories** — View, edit, and delete stored memories; import/export as JSON

**Default Model Router Configuration:**

The Model Router comes pre-configured with optimized models:

| Category | Default Model | Description |
|----------|--------------|-------------|
| Code Generation | `qwen3-coder:480b-cloud` | Code specialist |
| Code Refactor | `qwen3-coder:480b-cloud` | Code specialist |
| Documentation | `minimax-m2.5:cloud` | General purpose |
| Planning | `deepseek-v3.1:671b-cloud` | DeepSeek reasoning |
| Review | `deepseek-v3.1:671b-cloud` | DeepSeek reasoning |
| Chat General | `minimax-m2.5:cloud` | General purpose |

**Alternative Free Models (replace cloud models):**

*General Chat:*
- `llama3.2` (2-3GB) - Meta's latest, fast
- `llama3.1` (4.7-47GB) - More capable
- `qwen2.5` (0.5-72GB) - Multilingual
- `mistral` (4.1GB) - Strong general
- `phi3` (2.2-7.6GB) - Microsoft compact
- `gemma2` (2-9.2GB) - Google efficient

*Code Specialized:*
- `codellama` (3.8-34GB) - Meta's code model
- `deepseek-coder-v2` (16-236GB) - Top coding
- `codegemma` (2.5-7GB) - Google code
- `starcoder2` (3-15GB) - BigCode
- `qwen2.5-coder` (0.5-32GB) - Qwen code

*Embeddings (Required):*
- `nomic-embed-text` (274MB) - Default
- `mxbai-embed-large` (334MB) - Higher quality
- `all-minilm` (45MB) - Smallest

**Quick Setup (for alternative models):**
```bash
ollama pull llama3.2          # General chat
ollama pull qwen2.5-coder:7b # Code generation
ollama pull codellama:7b      # Code refactoring
ollama pull nomic-embed-text  # Embeddings (required)
```

### 11. Multi-Provider Support

LocalMind AI supports multiple AI providers beyond Ollama, enabling access to cloud models from OpenAI, Anthropic, Groq, and more.

**Supported Providers:**

| Provider | Type | Endpoint |
|----------|------|----------|
| Ollama (Local) | `ollama` | `http://localhost:11434` |
| OpenAI | `openai_compatible` | `https://api.openai.com/v1` |
| Anthropic | `anthropic` | `https://api.anthropic.com` |
| Groq | `openai_compatible` | `https://api.groq.com/openai/v1` |
| OpenRouter | `openai_compatible` | `https://openrouter.ai/api/v1` |
| Together AI | `openai_compatible` | `https://api.together.xyz/v1` |
| Fireworks AI | `openai_compatible` | `https://api.fireworks.ai/inference/v1` |
| LM Studio (Local) | `openai_compatible` | `http://localhost:1234/v1` |

**Features:**
- Provider abstraction layer with adapters for Ollama, OpenAI-compatible, and Anthropic APIs
- Provider Registry manages lifecycle, connection testing, and model listing across all providers
- Chat streaming goes through IPC (`chat:stream` + `chat:chunk` events) instead of direct HTTP
- Non-streaming `chat:complete` handler for tool features (code gen, refactor, etc.)
- API keys encrypted at rest via `electron.safeStorage`
- Configure providers in **Settings → Providers**

### 12. Multi-Model Comparison

Compare responses from multiple models side-by-side to find the best answer.

**Features:**
- Send the same prompt to 2–4 models simultaneously
- Compare overlay panel with streaming responses displayed in columns
- Rate responses (thumbs up/down) and select the best one
- "Use This" button to adopt a selected response into the active conversation
- Works across any combination of providers

**UI Components:**
- `ComparePanel` — Overlay displaying the comparison grid
- `CompareModelPicker` — Model selection interface for choosing comparison targets
- `CompareResponseCard` — Individual response card with rating controls

### 13. Token & Cost Tracking

Automatic usage tracking for every AI call across the entire application.

**What's Tracked:**
- All chat messages (streaming and non-streaming)
- Pipeline stages (plan, action, review, validate)
- Code generation, refactoring, design docs, prompt enhancer
- Agent service calls

**Pricing:**
- Built-in pricing for 19+ models: OpenAI (GPT-4o, GPT-4o-mini, o1, o3-mini), Anthropic (Claude Sonnet, Haiku, Opus), Groq (Llama, Mixtral), DeepSeek
- Local Ollama models tracked as "Free" (cost = $0)
- Custom pricing support — override or add pricing for any model

**Per-Message Badge:**
- Assistant messages display a token/cost badge showing: token count, cost (USD), duration, model name

**Usage Dashboard:**
- Access via **Sidebar → Usage & Costs**
- Summary cards: total tokens, total cost, request count
- Daily bar chart: visualize usage over time
- Per-model breakdown table: tokens, cost, and request count by model
- Time range filters: Today, 7 Days, 30 Days, All Time

### 14. Natural Language Command Router (Jarvis)

Type naturally in the chat input and commands execute directly — no buttons required.

**How It Works:**
- User input is intercepted before reaching the LLM
- Intent detection matches against slash commands and natural language patterns
- Matched commands execute immediately and display results inline in chat
- Unmatched input passes through to the LLM as normal chat

**Slash Commands (20+):**

| Command | Description |
|---------|-------------|
| `/run <command>` | Execute a terminal command |
| `$ <command>` | Execute a terminal command (shorthand) |
| `/git status` | Show git status |
| `/git log` | Show recent commits |
| `/git diff` | Show changes |
| `/git commit <msg>` | Commit all changes |
| `/search <term>` | Search codebase |
| `/ls [path]` | List directory contents |
| `/read <file>` | Read a file |
| `/gen` | Open code generator |
| `/refactor` | Open refactor panel |
| `/doc` | Open design doc generator |
| `/pipeline` | Open task pipeline |
| `/compare` | Compare models |
| `/settings` | Open settings |
| `/usage` | View usage & costs |
| `/agents` | Manage agents |
| `/remember <fact>` | Store a memory |
| `/recall` | Show all memories |
| `/new` | New chat |

**Natural Language Examples:**
- `run npm test` → executes `npm test`
- `what changed?` → runs `git status`
- `search useState` → searches codebase for "useState"
- `commit with message "fix login bug"` → commits with that message
- `open settings` → opens the settings panel
- `show usage` → opens the usage dashboard

**Slash Command Autocomplete:**
- Type `/` in the chat input to see a dropdown of available commands with descriptions
- Keyboard-navigable list

### 15. Long-Term Memory System

Persistent memory that survives across sessions, allowing the AI to remember facts about you, your preferences, and your projects.

**Memory Categories:**

| Category | Description |
|----------|-------------|
| `core` | Fundamental facts about the user (name, role, tech stack) |
| `preference` | Likes/dislikes, coding style preferences |
| `decision` | Architectural or technical decisions made |
| `pattern` | Recurring patterns or conventions observed |
| `project` | Project-specific facts (framework, structure, APIs) |
| `correction` | Mistakes the AI made that should be avoided |
| `general` | Other important facts |

**Recall Scoring:**
- Composite score: 50% semantic similarity + 20% recency decay + 30% importance
- Memories are ranked by relevance when recalled

**Memory Decay:**
- Exponential half-life of 90 days
- Importance boost on each access (+0.05, capped at 10.0)
- Memories below 0.1 importance are auto-deleted
- `core` category memories are exempt from decay

**Memory Consolidation:**
- Old, low-importance memories can be merged into consolidated summaries

**Auto-Extraction:**
- After each chat exchange, the LLM extracts important facts in the background
- Extracted facts are stored automatically with appropriate categories and importance levels

**Commands:**
- `/remember <fact>` — Store a fact manually
- `/recall` — View all stored memories
- Memories are automatically injected into chat context via `memory:buildContext`

**Import/Export:**
- Export all memories and profile as JSON
- Import from a previously exported JSON file

### 16. User Profile & Personality Engine

Customize how the AI communicates and what it knows about you.

**User Profile:**
- Name, role, timezone
- Expertise areas (e.g., "React", "Kubernetes", "Machine Learning")
- Preferred programming languages

**Personality Modes:**

| Mode | Description |
|------|-------------|
| Professional | Precise, thorough, technically accurate. Direct. |
| Casual | Friendly, conversational, relaxed. Uses analogies. |
| Concise | Ultra-short answers. Bullet points. Code-first. |
| Mentor | Patient, educational. Explains the "why". Guiding questions. |
| Creative | Inventive, unconventional. Multiple alternatives. |

**Custom Traits:**
- Overlay additional traits on top of the selected personality mode
- Free-text field for fine-tuning behavior

**Integration:**
- Profile and personality are automatically injected into every chat system prompt
- Configured in **Settings → Profile & Memory**

### 17. Command Palette & Global Hotkey

Quick access to any action from anywhere in the app.

**Command Palette (`Ctrl+K`):**
- Searchable overlay listing all available actions
- Actions include: Code Gen, Refactor, Pipeline, Settings, Usage, Compare, and more
- Search across conversations by title
- Keyboard-navigable (arrow keys + Enter to select)

**Global Hotkey (`Ctrl+Space`):**
- System-wide hotkey — summons the app even when minimized or in the background
- Triggers the `jarvis:summon` IPC event

## Custom Agents

LocalMind AI allows you to create specialized AI agents with custom system prompts, tools, constraints, and pipeline configurations.

### Agent Presets

Start quickly with pre-configured agent templates:

| Preset | Use Case | Icon |
|--------|----------|------|
| General Assistant | Balanced assistant for general tasks | 🤖 |
| Web Developer | React, Vue, Angular, modern CSS | 🌐 |
| Backend Developer | APIs, microservices, server apps | ⚙️ |
| Code Reviewer | Code quality, security, best practices | 🔍 |
| Security Auditor | Vulnerability detection, OWASP checks | 🔒 |
| DevOps Engineer | Docker, Kubernetes, CI/CD pipelines | 🚀 |
| Data Engineer | ETL processes, data pipelines | 📊 |
| Technical Writer | Documentation, README files | 📝 |

### Creating a Custom Agent

1. Open the Agent Panel from the sidebar
2. Click "Create Agent"
3. Choose a preset or start from scratch
4. Configure:
   - **System Prompt**: Define agent behavior and expertise
   - **Default Model**: AI model used by default
   - **Tools**: Enable/disable available tools
   - **Constraints**: File patterns, languages, approval settings
   - **Pipeline Stages**: Enable/disable pipeline stages

### Agent Features

**System Prompt:**
- Define agent personality and expertise
- Include domain-specific knowledge
- Set response guidelines and priorities

**Tool Configuration:**
- Enable/disable individual tools (21 tools available)
- Configure tool parameters

**Available Tools:**
| Category | Tools |
|----------|-------|
| File System | read_file, write_file, append_file, delete_file, list_directory, create_directory, execute_command, file_exists, get_file_info |
| Search & Code | grep_search, find_files, get_file_diff |
| Git Operations | git_status, git_log, git_commit |
| Web & API | http_request, fetch_url |
| Development | run_tests, lint_code, format_code |
| Utilities | get_timestamp, calculate, read_env |

**Security Constraints:**
- Allowed file patterns (glob syntax)
- Blocked file patterns
- Maximum file size limits
- Programming language restrictions
- Require approval before execution

**Knowledge Base:**
- Upload files for agent context
- Reference domain-specific documentation
- Files are embedded for semantic search

### Using Custom Agents

1. Select "Send to Agent" mode in chat
2. Choose your custom agent from the dropdown
3. Type your task
4. Agent processes through configured pipeline stages

### Pipeline Integration

Custom agents integrate with the task pipeline:

- **Plan**: Analyzes requirements using agent's system prompt
- **Action**: Generates code with agent's constraints
- **Review**: Checks code quality
- **Validate**: Tests correctness
- **Execute**: Applies changes (with approval if required)

## User Interface

### Modern Design System
- **Dark Mode:** Claude-style deep charcoal (#1a1a1a to #2d2d2d) with soft linen text (#f5f5f5)
- **Light Mode:** Warm theme (#f9f8f6)
- **Accent Color:** Claude orange (#E67D22) for dark, Terracotta (#c96442) for light
- **Base Font Size:** 14px for compact, readable interface
- **Buttons:** All icon buttons have gray borders for visibility
- **Mesh Background:** Subtle geometric pattern on dashboard for visual depth

### Window Controls
- Mac-style buttons (red, yellow, green) in sidebar header
- Visible in both expanded and collapsed sidebar

### Sidebar
- **New Chat / Agentic Task** - Create new conversation
- **Code Generator** - Open code generation panel
- **Code Refactor** - Open refactoring panel
- **Design Documents** - Open design doc generator
- **Prompt Enhancer** - Open prompt enhancer
- **Task Pipeline** - Open pipeline dashboard
- **Usage & Costs** - Open usage dashboard with token/cost tracking
- **Settings** - Open settings modal

### Chat Window
- **Close button (X)** - Collapses chat window
- Clicking a conversation in sidebar reopens chat
- Side panels expand when chat is closed

### Keyboard Shortcuts

- `Ctrl+N` - New chat
- `Ctrl+K` - Open command palette
- `Ctrl+Space` - Global hotkey (summon app from anywhere, even when minimized)
- `Ctrl+Shift+F` - Toggle file panel
- `Ctrl+Shift+T` - Toggle terminal
- `Ctrl+,` - Open settings
- `Ctrl+/` - Show shortcuts
- `Ctrl+L` - Focus chat input

## Architecture

### Frontend (React)
- Component-based UI with React 19
- State management via Context API
- IPC communication with main process

### Backend (Electron)
- Main process handles:
  - AI provider management (Ollama, OpenAI, Anthropic, etc.)
  - Chat streaming via IPC
  - File system operations
  - Vector database (LanceDB)
  - Pipeline orchestration
  - Model routing
  - Usage tracking
  - Long-term memory
  - User profile & personality

### Services
- **ProviderRegistry** - Multi-provider lifecycle, connection testing, model listing, chat streaming
- **OllamaService** - Ollama-specific API interactions (legacy, embeddings)
- **VectorDBService** - Semantic search
- **PipelineOrchestrator** - Agent pipeline execution
- **ModelRouter** - Task-based model selection with provider awareness
- **UsageTracker** - Token counting, cost calculation, usage persistence
- **LongTermMemory** - Persistent memory, recall scoring, decay, profile management
- **CommandRouter** - Natural language intent detection and slash command execution
