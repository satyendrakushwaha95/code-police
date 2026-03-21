import { useState, useEffect } from 'react';
import './Chat.css';

interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp: number;
}

interface ToolPanelProps {
  onInsertResult?: (result: string) => void;
}

export default function ToolPanel({}: ToolPanelProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState<ToolResult[]>([]);
  const [activeTab, setActiveTab] = useState<'execute' | 'history'>('execute');

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    try {
      const toolList = await (window as any).ipcRenderer.invoke('tools:list');
      setTools(toolList);
    } catch (err) {
      console.error('Failed to load tools:', err);
    }
  };

  const executeTool = async () => {
    if (!selectedTool) return;

    setIsExecuting(true);
    try {
      const parsedParams: Record<string, unknown> = {};
      for (const key of Object.keys(params)) {
        const value = params[key];
        try {
          parsedParams[key] = JSON.parse(value);
        } catch {
          parsedParams[key] = value;
        }
      }

      const result = await (window as any).ipcRenderer.invoke('tools:execute', selectedTool.name, parsedParams);
      setResults(prev => [result, ...prev]);
    } catch (err: any) {
      setResults(prev => [{
        success: false,
        error: err.message,
        toolName: selectedTool?.name || '',
        parameters: {},
        timestamp: Date.now()
      }, ...prev]);
    } finally {
      setIsExecuting(false);
    }
  };

  const renderParamInput = (paramName: string, paramDef: { type: string; description: string }, isRequired: boolean) => (
    <div key={paramName} className="param-input">
      <label>
        {paramName}
        {isRequired && <span className="required">*</span>}
      </label>
      <input
        type="text"
        value={params[paramName] || ''}
        onChange={(e) => setParams(prev => ({ ...prev, [paramName]: e.target.value }))}
        placeholder={paramDef.description}
      />
      <span className="param-hint">{paramDef.description}</span>
    </div>
  );

  return (
    <div className="tool-panel">
      <div className="tool-panel-header">
        <h3>🛠️ Tool Execution</h3>
      </div>

      <div className="tool-tabs">
        <button 
          className={`tool-tab ${activeTab === 'execute' ? 'active' : ''}`}
          onClick={() => setActiveTab('execute')}
        >
          Execute
        </button>
        <button 
          className={`tool-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History ({results.length})
        </button>
      </div>

      {activeTab === 'execute' && (
        <div className="tool-execute">
          <div className="tool-selector">
            <label>Select Tool</label>
            <select
              value={selectedTool?.name || ''}
              onChange={(e) => {
                const tool = tools.find(t => t.name === e.target.value);
                setSelectedTool(tool || null);
                setParams({});
              }}
            >
              <option value="">-- Select a tool --</option>
              {tools.map(tool => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTool && (
            <div className="tool-params">
              <p className="tool-description">{selectedTool.description}</p>
              {Object.entries(selectedTool.parameters.properties).map(([key, def]) =>
                renderParamInput(key, def as { type: string; description: string }, selectedTool.parameters.required.includes(key))
              )}
            </div>
          )}

          <button
            className="btn btn-primary execute-btn"
            onClick={executeTool}
            disabled={!selectedTool || isExecuting}
          >
            {isExecuting ? 'Executing...' : '▶ Execute'}
          </button>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="tool-history">
          {results.length === 0 ? (
            <p className="no-results">No tool executions yet</p>
          ) : (
            results.map((result, idx) => (
              <div key={idx} className={`tool-result ${result.success ? 'success' : 'error'}`}>
                <div className="result-header">
                  <span className="result-tool">{result.toolName}</span>
                  <span className={`result-status ${result.success ? 'success' : 'error'}`}>
                    {result.success ? '✓ Success' : '✗ Failed'}
                  </span>
                </div>
                {result.output && (
                  <pre className="result-output">{result.output}</pre>
                )}
                {result.error && (
                  <pre className="result-error">{result.error}</pre>
                )}
                <div className="result-actions">
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const event = new CustomEvent('localmind:insertCode', { 
                        detail: { code: result.output || result.error || '', filename: `${result.toolName}_result.txt` } 
                      });
                      document.dispatchEvent(event);
                    }}
                  >
                    Use as Context
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
