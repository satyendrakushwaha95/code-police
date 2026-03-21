import { useCallback } from 'react';
import type { AgentToolConfig } from '../../store/AgentContext';

interface ToolPickerProps {
  selectedTools: AgentToolConfig[];
  onChange: (tools: AgentToolConfig[]) => void;
}

const AVAILABLE_TOOLS = [
  // File System
  { toolId: 'read_file', name: 'Read File', description: 'Read contents from a file' },
  { toolId: 'write_file', name: 'Write File', description: 'Create or overwrite a file' },
  { toolId: 'append_file', name: 'Append File', description: 'Append content to an existing file' },
  { toolId: 'delete_file', name: 'Delete File', description: 'Delete a file' },
  { toolId: 'list_directory', name: 'List Directory', description: 'List files in a directory' },
  { toolId: 'create_directory', name: 'Create Directory', description: 'Create a new directory' },
  { toolId: 'execute_command', name: 'Execute Command', description: 'Run shell commands' },
  { toolId: 'file_exists', name: 'File Exists', description: 'Check if a file exists' },
  { toolId: 'get_file_info', name: 'Get File Info', description: 'Get file metadata' },
  // Search & Code Analysis
  { toolId: 'grep_search', name: 'Grep Search', description: 'Search code by pattern/regex' },
  { toolId: 'find_files', name: 'Find Files', description: 'Find files by name pattern' },
  { toolId: 'get_file_diff', name: 'Get File Diff', description: 'Get git diff of file changes' },
  // Git Operations
  { toolId: 'git_status', name: 'Git Status', description: 'Get repository status' },
  { toolId: 'git_log', name: 'Git Log', description: 'View commit history' },
  { toolId: 'git_commit', name: 'Git Commit', description: 'Create commits' },
  // Web & API
  { toolId: 'http_request', name: 'HTTP Request', description: 'Make HTTP requests' },
  { toolId: 'fetch_url', name: 'Fetch URL', description: 'Fetch web content' },
  // Development
  { toolId: 'run_tests', name: 'Run Tests', description: 'Execute test suites' },
  { toolId: 'lint_code', name: 'Lint Code', description: 'Run linters' },
  { toolId: 'format_code', name: 'Format Code', description: 'Format code' },
  // Utilities
  { toolId: 'get_timestamp', name: 'Get Timestamp', description: 'Get current time/date' },
  { toolId: 'calculate', name: 'Calculate', description: 'Perform calculations' },
  { toolId: 'read_env', name: 'Read Environment', description: 'Read environment variables' },
];

export default function ToolPicker({ selectedTools, onChange }: ToolPickerProps) {
  const isToolSelected = useCallback((toolId: string) => {
    return selectedTools.some(t => t.toolId === toolId && t.enabled);
  }, [selectedTools]);

  const toggleTool = useCallback((toolId: string) => {
    const existing = selectedTools.find(t => t.toolId === toolId);
    if (existing) {
      onChange(selectedTools.map(t =>
        t.toolId === toolId ? { ...t, enabled: !t.enabled } : t
      ));
    } else {
      onChange([...selectedTools, { toolId, enabled: true }]);
    }
  }, [selectedTools, onChange]);

  return (
    <div className="tool-picker">
      {AVAILABLE_TOOLS.map(tool => (
        <label
          key={tool.toolId}
          className={`tool-item ${isToolSelected(tool.toolId) ? 'selected' : ''}`}
        >
          <input
            type="checkbox"
            checked={isToolSelected(tool.toolId)}
            onChange={() => toggleTool(tool.toolId)}
          />
          <div className="tool-info">
            <span className="tool-name">{tool.name}</span>
            <span className="tool-description">{tool.description}</span>
          </div>
        </label>
      ))}
    </div>
  );
}
