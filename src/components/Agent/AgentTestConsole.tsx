import { useState, useCallback, useRef } from 'react';
import type { AgentConfig } from '../../store/AgentContext';
import { useToast } from '../../hooks/useToast';
import './Agent.css';

interface AgentTestConsoleProps {
  agent: AgentConfig;
  onClose: () => void;
}

interface TestResult {
  stage: string;
  status: 'pending' | 'running' | 'success' | 'error';
  output?: string;
  error?: string;
  duration?: number;
}

export default function AgentTestConsole({ agent, onClose }: AgentTestConsoleProps) {
  const { showToast } = useToast();
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const runTest = useCallback(async () => {
    if (!task.trim()) {
      showToast('Please enter a test task', 'error');
      return;
    }

    setIsRunning(true);
    setResults([]);
    
    const stages = [
      { name: 'plan', enabled: agent.pipelineStages?.stages?.plan?.enabled ?? true },
      { name: 'action', enabled: agent.pipelineStages?.stages?.action?.enabled ?? true },
      { name: 'review', enabled: agent.pipelineStages?.stages?.review?.enabled ?? true },
      { name: 'validate', enabled: agent.pipelineStages?.stages?.validate?.enabled ?? true },
      { name: 'execute', enabled: agent.pipelineStages?.stages?.execute?.enabled ?? true },
    ].filter(s => s.enabled);

    const testResults: TestResult[] = stages.map(s => ({
      stage: s.name,
      status: 'pending' as const,
    }));
    setResults(testResults);

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      testResults[i].status = 'running';
      setResults([...testResults]);

      const startTime = Date.now();

      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Stage ${stage.name} timed out after 60s`));
          }, 60000);

          setTimeout(() => {
            clearTimeout(timeout);
            resolve(true);
          }, 1000 + Math.random() * 2000);
        });

        testResults[i].status = 'success';
        testResults[i].output = `[Mock] ${stage.name} completed successfully`;
        testResults[i].duration = Date.now() - startTime;
      } catch (err) {
        testResults[i].status = 'error';
        testResults[i].error = err instanceof Error ? err.message : 'Unknown error';
        testResults[i].duration = Date.now() - startTime;
        break;
      }

      setResults([...testResults]);
    }

    setIsRunning(false);
    showToast('Test completed', 'success');
  }, [task, agent.pipelineStages, showToast]);

  const cancelTest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsRunning(false);
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content agent-test-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="test-header-info">
            <span className="test-agent-icon">{agent.icon}</span>
            <div>
              <h2>Test Agent</h2>
              <p className="test-agent-name">{agent.name}</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="test-input-section">
            <label>Test Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Enter a simple task to test this agent..."
              rows={4}
              disabled={isRunning}
            />
            <div className="test-actions">
              <button
                className="btn btn-primary"
                onClick={runTest}
                disabled={isRunning || !task.trim()}
              >
                {isRunning ? 'Running...' : 'Run Test'}
              </button>
              {isRunning && (
                <button className="btn btn-secondary" onClick={cancelTest}>
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="test-results-section">
            <h3>Results</h3>
            {results.length === 0 ? (
              <p className="no-results">Run a test to see results here</p>
            ) : (
              <div className="results-list">
                {results.map((result, index) => (
                  <div key={result.stage} className={`result-item ${result.status}`}>
                    <div className="result-header">
                      <span className="result-stage">
                        {result.status === 'running' && (
                          <span className="spinner" />
                        )}
                        {result.status === 'success' && '✓'}
                        {result.status === 'error' && '✗'}
                        {result.status === 'pending' && '○'}
                        Stage {index + 1}: {result.stage}
                      </span>
                      {result.duration && (
                        <span className="result-duration">{result.duration}ms</span>
                      )}
                    </div>
                    {result.output && (
                      <pre className="result-output">{result.output}</pre>
                    )}
                    {result.error && (
                      <pre className="result-error">{result.error}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="test-config-section">
            <h3>Agent Configuration</h3>
            <div className="config-grid">
              <div className="config-item">
                <label>Model</label>
                <span>{agent.defaultModel}</span>
              </div>
              <div className="config-item">
                <label>Max Retries</label>
                <span>{agent.pipelineStages?.maxRetries ?? 2}</span>
              </div>
              <div className="config-item">
                <label>Tools Enabled</label>
                <span>{agent.enabledTools.filter(t => t.enabled).length}</span>
              </div>
              <div className="config-item">
                <label>Require Approval</label>
                <span>{agent.constraints?.requireApproval ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
