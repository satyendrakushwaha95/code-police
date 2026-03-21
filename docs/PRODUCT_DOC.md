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

**Only Ollama is required** - Download from [https://ollama.ai](https://ollama.ai)

```bash
# After installing Ollama, pull the required models
ollama pull llama3.2
ollama pull nomic-embed-text
```

Ollama must be running on `http://localhost:11434` (default).

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
- **Bottom row:** Attachment button | Model badge (with status) | Chat | Send to Agent buttons
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
- **Settings** - Open settings modal

### Chat Window
- **Close button (X)** - Collapses chat window
- Clicking a conversation in sidebar reopens chat
- Side panels expand when chat is closed

### Keyboard Shortcuts

- `Ctrl+N` - New chat
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
  - Ollama API calls
  - File system operations
  - Vector database (LanceDB)
  - Pipeline orchestration
  - Model routing

### Services
- **OllamaService** - AI model interactions
- **VectorDBService** - Semantic search
- **PipelineOrchestrator** - Agent pipeline execution
- **ModelRouter** - Task-based model selection
