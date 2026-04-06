import { useCallback } from 'react';
import type { AgentToolConfig } from '../../store/AgentContext';

interface ToolPickerProps {
  selectedTools: AgentToolConfig[];
  onChange: (tools: AgentToolConfig[]) => void;
}

interface ToolDef {
  toolId: string;
  name: string;
  description: string;
  danger?: boolean;
}

const TOOL_GROUPS: Array<{ label: string; icon: string; tools: ToolDef[] }> = [
  {
    label: 'File System',
    icon: '📁',
    tools: [
      { toolId: 'read_file', name: 'Read File', description: 'Read contents from a file' },
      { toolId: 'write_file', name: 'Write File', description: 'Create or overwrite a file' },
      { toolId: 'append_file', name: 'Append File', description: 'Append content to a file' },
      { toolId: 'delete_file', name: 'Delete File', description: 'Delete a file', danger: true },
      { toolId: 'list_directory', name: 'List Directory', description: 'List files in a directory' },
      { toolId: 'create_directory', name: 'Create Directory', description: 'Create a new directory' },
      { toolId: 'file_exists', name: 'File Exists', description: 'Check if a file exists' },
      { toolId: 'get_file_info', name: 'File Info', description: 'Get file metadata' },
      { toolId: 'execute_command', name: 'Shell Command', description: 'Run shell commands', danger: true },
    ],
  },
  {
    label: 'Search & Code',
    icon: '🔍',
    tools: [
      { toolId: 'grep_search', name: 'Grep Search', description: 'Search code by pattern' },
      { toolId: 'find_files', name: 'Find Files', description: 'Find files by name' },
      { toolId: 'get_file_diff', name: 'Git Diff', description: 'Get file changes' },
    ],
  },
  {
    label: 'Git',
    icon: '📦',
    tools: [
      { toolId: 'git_status', name: 'Git Status', description: 'Repository status' },
      { toolId: 'git_log', name: 'Git Log', description: 'Commit history' },
      { toolId: 'git_commit', name: 'Git Commit', description: 'Create commits' },
    ],
  },
  {
    label: 'Web & API',
    icon: '🌐',
    tools: [
      { toolId: 'http_request', name: 'HTTP Request', description: 'Make HTTP requests' },
      { toolId: 'fetch_url', name: 'Fetch URL', description: 'Fetch web content' },
    ],
  },
  {
    label: 'Development',
    icon: '🛠',
    tools: [
      { toolId: 'run_tests', name: 'Run Tests', description: 'Execute test suites' },
      { toolId: 'lint_code', name: 'Lint Code', description: 'Run linters' },
      { toolId: 'format_code', name: 'Format Code', description: 'Format code' },
    ],
  },
  {
    label: 'Utilities',
    icon: '⚡',
    tools: [
      { toolId: 'get_timestamp', name: 'Timestamp', description: 'Get current time' },
      { toolId: 'calculate', name: 'Calculate', description: 'Math calculations' },
      { toolId: 'read_env', name: 'Env Vars', description: 'Read environment variables' },
    ],
  },
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

  const toggleGroup = useCallback((tools: ToolDef[], selectAll: boolean) => {
    let updated = [...selectedTools];
    for (const tool of tools) {
      const existing = updated.find(t => t.toolId === tool.toolId);
      if (existing) {
        updated = updated.map(t => t.toolId === tool.toolId ? { ...t, enabled: selectAll } : t);
      } else if (selectAll) {
        updated.push({ toolId: tool.toolId, enabled: true });
      }
    }
    onChange(updated);
  }, [selectedTools, onChange]);

  const totalSelected = selectedTools.filter(t => t.enabled).length;
  const totalTools = TOOL_GROUPS.reduce((sum, g) => sum + g.tools.length, 0);

  return (
    <div className="tool-picker-grouped">
      <div className="tool-picker-summary">
        {totalSelected} / {totalTools} tools enabled
      </div>
      {TOOL_GROUPS.map(group => {
        const groupSelected = group.tools.filter(t => isToolSelected(t.toolId)).length;
        const allSelected = groupSelected === group.tools.length;
        return (
          <div key={group.label} className="tool-group">
            <div className="tool-group-header">
              <span className="tool-group-label">
                <span className="tool-group-icon">{group.icon}</span>
                {group.label}
                <span className="tool-group-count">{groupSelected}/{group.tools.length}</span>
              </span>
              <button
                className="tool-group-toggle"
                onClick={() => toggleGroup(group.tools, !allSelected)}
              >
                {allSelected ? 'Clear' : 'All'}
              </button>
            </div>
            <div className="tool-group-items">
              {group.tools.map(tool => (
                <label
                  key={tool.toolId}
                  className={`tool-item ${isToolSelected(tool.toolId) ? 'selected' : ''} ${tool.danger ? 'danger' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isToolSelected(tool.toolId)}
                    onChange={() => toggleTool(tool.toolId)}
                  />
                  <div className="tool-info">
                    <span className="tool-name">
                      {tool.name}
                      {tool.danger && <span className="tool-danger-badge">⚠</span>}
                    </span>
                    <span className="tool-description">{tool.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
