# Developer Guide

## Setup Development Environment

### Prerequisites
- Node.js 18+
- npm or yarn
- Ollama installed and running

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
- `Chat/` - Chat interface and panels
- `Pipeline/` - Pipeline dashboard
- `FilePanel/` - File explorer
- `Terminal/` - Terminal emulator
- `Settings/` - Settings and routing
- `Sidebar/` - Navigation sidebar with window controls
- `Agent/` - Custom agent management (AgentPanel, AgentCard, AgentEditorModal, ToolPicker, KnowledgeUploader, AgentTestConsole)
- `common/` - Shared components

**Hooks** (`src/hooks/`)
- `usePipeline.ts` - Pipeline state and operations
- `useModelRouter.ts` - Model routing
- `useToast.ts` - Toast notifications
- `useKeyboardShortcuts.ts` - Keyboard bindings

**Stores** (`src/store/`)
- `ConversationContext.tsx` - Chat state
- `SettingsContext.tsx` - App settings
- `WorkspaceContext.tsx` - Workspace state
- `AgentContext.tsx` - Custom agents state

**Styles** (`src/index.css`)
- Design tokens (colors, spacing, borders)
- Component base styles
- Modal and toast styles

### Backend (electron/)

**Services**
- `ollama.ts` - Ollama API wrapper
- `vector-db.ts` - LanceDB operations
- `pipeline-orchestrator.ts` - Pipeline execution
- `pipeline-state.ts` - SQLite pipeline state
- `pipeline-types.ts` - Pipeline TypeScript interfaces
- `model-router.ts` - Task routing
- `routing-config.ts` - Routing configuration store
- `memory.ts` - Agent memory
- `agent-manager.ts` - Custom agent management
- `agent-store.ts` - Agent persistence
- `agent-types.ts` - Agent TypeScript interfaces and presets

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
