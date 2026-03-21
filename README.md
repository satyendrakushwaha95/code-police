# LocalMind AI

A desktop AI engineering workspace that combines conversational AI, autonomous agent capabilities, and code automation tools. Runs locally using Ollama for AI interactions and LanceDB for semantic search.

## Features

- **Chat Interface** - Conversational AI using local Ollama models with auto-expanding input
- **Custom Agents** - Create specialized AI agents with custom prompts, tools, and constraints
- **Agent Presets** - Start quickly with pre-built templates (Web Developer, Code Reviewer, Security Auditor, etc.)
- **Agentic Tasks** - Send tasks to autonomous agent pipeline (Plan → Action → Review → Validate → Execute)
- **Smart Task Detection** - Planner automatically detects task type (docs vs code) and generates appropriately
- **Pipeline Dashboard** - Real-time monitoring with visual progress bar and pill-shaped stage indicators
- **Stop & Retry** - Stop running pipelines and provide custom instructions for continuation
- **Code Generator** - Intent-based code generation with preview plan and structured output
- **Code Refactor** - Intent-based transformation with modern diff viewer (19 operations across 6 categories)
- **Design Automation** - Generate PRD, HLD, LLD documents with Mermaid diagrams
- **Prompt Enhancer** - Customizable personas for better prompts
- **File Explorer** - Browse and edit project files
- **Terminal** - Built-in command execution
- **Model Router** - Configure which AI models to use for different task types

## Tech Stack

- Electron v32.3.3
- React 19 + Vite 7
- TypeScript
- Ollama (llama3.2, nomic-embed-text)
- LanceDB (vector search)
- SQLite (persistence)
- Mermaid.js (diagrams)

## What's Bundled vs External

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

**Everything runs out of the box after installation.**

### External Requirements

**Only ONE external dependency is required: Ollama**

- Download: [https://ollama.ai](https://ollama.ai)
- Must be running on `http://localhost:11434` (default)
- No database setup, no configuration files, no additional services

## Requirements

- Windows 10/11 (64-bit)
- 8 GB RAM (16 GB recommended)
- **Ollama installed and running**

## Quick Start

### 1. Install Ollama

```bash
# Download from https://ollama.ai
# After installation, Ollama runs automatically on http://localhost:11434
```

### 2. Pull Models

```bash
# Minimum required
ollama pull nomic-embed-text # Embeddings (required)
ollama minimax-m2.5:cloud   # General chat
ollama pull qwen3-coder:480b-cloud  # Code generation
ollama pull qwen3-coder:480b-cloud      # Code refactoring
ollama pull deepseek-v3.1:671b-cloud # Planning & Review
```

### Default Model Router Configuration

The Model Router comes pre-configured with optimized models for each task type:

| Category | Default Model | Description |
|----------|--------------|-------------|
| Code Generation | `qwen3-coder:480b-cloud` | Code specialist |
| Code Refactor | `qwen3-coder:480b-cloud` | Code specialist |
| Documentation | `minimax-m2.5:cloud` | General purpose |
| Planning | `deepseek-v3.1:671b-cloud` | DeepSeek reasoning |
| Review | `deepseek-v3.1:671b-cloud` | DeepSeek reasoning |
| Chat (General) | `minimax-m2.5:cloud` | General purpose |

### 3. Install LocalMind AI

Run `release/LocalMind AI Setup 3.0.0.exe` (Or from Portable `LocalMind AI.exe`) and follow the installer.

### 4. Launch

Open LocalMind AI. It will automatically connect to Ollama if running.

## Recommended Downloadabe Models for Model Router

The Model Router allows configuring different models for different task types. Here are recommended free models available on Ollama:

### General Chat
| Model | Size | Description |
|-------|------|-------------|
| `llama3.2` | 2-3GB | Fast, efficient general chat |
| `llama3.1` | 4.7-47GB | More capable, larger context |
| `qwen2.5` | 0.5-72GB | Excellent multilingual support |
| `mistral` | 4.1GB | Strong general purpose |
| `phi3` | 2.2-7.6GB | Microsoft's compact model |
| `gemma2` | 2-9.2GB | Google's efficient model |

### Code Generation
| Model | Size | Description |
|-------|------|-------------|
| `codellama` | 3.8-34GB | Meta's code specialist |
| `deepseek-coder-v2` | 16-236GB | Top coding performance |
| `codegemma` | 2.5-7GB | Google's code model |
| `starcoder2` | 3-15GB | BigCode's code model |
| `qwen2.5-coder` | 0.5-32GB | Qwen's code specialist |

### Code Review / Planning
| Model | Size | Description |
|-------|------|-------------|
| `llama3.1` | 8B+ | Strong reasoning |
| `qwen2.5` | 7B+ | Good analysis |
| `mistral` | 7B | Reliable reviewer |
| `command-r` | 35GB | Cohere's RAG model |

### Embeddings (Required)
| Model | Size | Description |
|-------|------|-------------|
| `nomic-embed-text` | 274MB | Default, fast |
| `mxbai-embed-large` | 334MB | Higher quality |
| `all-minilm` | 45MB | Smallest option |

## UI Features

### Modern Design
- Dark mode with pure gray tones
- Light mode with warm Claude-style theme
- Mac-style window controls (red, yellow, green buttons)
- Terracotta accent color (#c96442)

### Chat Interface
- Auto-expanding textarea input
- Mode toggle buttons (Chat / Send to Agent)
- Agent selection dropdown with custom agents
- Model indicator with connection status
- Collapsible chat panel

### Pipeline Dashboard
- Real-time status updates via polling
- Auto-refresh every 5 seconds
- Visual progress bar with completion percentage
- Pill-shaped stage indicators (Plan, Action, Review, Validate, Execute)
- Status icons: spinning for running, checkmark for complete, X for failed
- Stop button to halt running pipelines with custom instructions
- Retry functionality with manual suggestions
- Max 2 auto-attempts before manual review
- Project root stored with pipeline data

### Custom Agents
- Create specialized AI agents with custom behavior
- Pre-built agent presets for common use cases:
  - 🤖 General Assistant
  - 🌐 Web Developer
  - ⚙️ Backend Developer
  - 🔍 Code Reviewer
  - 🔒 Security Auditor
  - 🚀 DevOps Engineer
  - 📊 Data Engineer
  - 📝 Technical Writer
- Configure system prompts, default models, tools
- Set security constraints (file patterns, languages)
- Upload knowledge base files for domain context

### Diff Viewer
- Three-tab view (Changes, Original, Modified)
- Side-by-side code comparison
- Copy to clipboard functionality
- Line-by-line highlighting

## Documentation

- [Product Documentation](docs/PRODUCT_DOC.md) - Features overview
- [Technical Specification](docs/TECHNICAL_SPEC.md) - Architecture
- [Developer Guide](docs/DEVELOPER_GUIDE.md) - Extension guide
- [API Reference](docs/API_REFERENCE.md) - IPC channels

## Project Structure

```
├── electron/           # Electron main process
│   ├── main.ts
│   ├── preload.ts
│   └── services/      # Backend services
│       ├── agents/    # AI agents (planner, coder, reviewer, validator)
│       └── agent-*.ts # Agent management
├── src/               # React frontend
│   ├── components/    # UI components
│   │   ├── Agent/    # Custom agent management UI
│   │   ├── Chat/     # Chat interface and panels
│   │   ├── Pipeline/ # Pipeline dashboard
│   │   └── ...
│   ├── hooks/         # React hooks
│   ├── store/         # State management (AgentContext, etc.)
│   └── ...
├── docs/              # Documentation
├── release/            # Built executables
└── package.json
```

## License

MIT
