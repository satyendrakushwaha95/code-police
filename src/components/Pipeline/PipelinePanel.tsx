import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { usePipeline } from '../../hooks/usePipeline';
import { useToast } from '../../hooks/useToast';
import StageCard from './StageCard';
import './Pipeline.css';

interface PipelinePanelProps {
  onClose: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  plan: 'Plan', action: 'Action', review: 'Review',
  validate: 'Validate', execute: 'Execute',
  research: 'Research', security: 'Security',
  decompose: 'Decompose',
};

function ExecutionSummary({ run }: { run: any }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (run.status !== 'running' && run.status !== 'awaiting_approval') {
      setElapsed((run.completed_at || Date.now()) - run.created_at);
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - run.created_at);
    }, 1000);

    return () => clearInterval(interval);
  }, [run.created_at, run.status, run.completed_at]);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const stageOrder: string[] = run.stage_order || ['plan', 'action', 'review', 'validate', 'execute'];

  const getCurrentStage = () => {
    for (const stage of stageOrder) {
      if (run.stages?.[stage]?.status === 'running') {
        return stage;
      }
    }
    return null;
  };

  const currentStage = getCurrentStage();

  const getStageStatus = (stage: string) => {
    return run.stages?.[stage]?.status || 'pending';
  };

  const stageStatuses = stageOrder.map(s => ({ stage: s, status: getStageStatus(s) }));
  const completedCount = stageStatuses.filter(s => s.status === 'complete').length;
  const skippedCount = stageStatuses.filter(s => s.status === 'skipped').length;
  const hasRunning = stageStatuses.some(s => s.status === 'running');
  const totalStages = stageOrder.length;
  let progressPercent = Math.round(((completedCount + skippedCount) / totalStages) * 100);
  if (hasRunning && completedCount + skippedCount < totalStages) {
    progressPercent = Math.round(((completedCount + skippedCount) / totalStages) * 100) + 10;
  }
  if (completedCount + skippedCount === totalStages) {
    progressPercent = 100;
  }
  if (run.status === 'complete' || run.status === 'failed') {
    progressPercent = 100;
  }

  return (
    <div className="execution-summary">
      <div className="summary-row">
        <span className="elapsed-label">Elapsed:</span>
        <span className="elapsed-time">{formatTime(elapsed)}</span>
        {run.template && (
          <span className="template-badge">{run.template}</span>
        )}
        {currentStage && (
          <span className="current-stage-badge">
            <span className="spinner-mini">⟳</span>
            {STAGE_LABELS[currentStage] || currentStage}
          </span>
        )}
      </div>
      <div className="execution-progress-bar">
        <div className="execution-progress-track">
          <div
            className="execution-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="execution-stage-pills">
          {stageOrder.map((stage, idx) => {
            const status = getStageStatus(stage);
            const isComplete = status === 'complete';
            const isRunning = status === 'running';
            const isFailed = status === 'failed';
            const isSkipped = status === 'skipped';

            return (
              <React.Fragment key={stage}>
                <div className={`execution-stage-pill ${status}`}>
                  <div className="execution-pill-content">
                    {isRunning ? (
                      <span className="execution-pill-spinner">⟳</span>
                    ) : isComplete ? (
                      <span className="execution-pill-check">✓</span>
                    ) : isFailed ? (
                      <span className="execution-pill-fail">✗</span>
                    ) : isSkipped ? (
                      <span className="execution-pill-skip">⊘</span>
                    ) : (
                      <span className="execution-pill-num">{idx + 1}</span>
                    )}
                    <span className="execution-pill-label">{STAGE_LABELS[stage] || stage}</span>
                  </div>
                </div>
                {idx < stageOrder.length - 1 && (
                  <div className={`execution-pill-connector ${isComplete || isSkipped ? 'filled' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnalyticsDashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [byTemplate, setByTemplate] = useState<any[]>([]);
  const [byStage, setByStage] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  const ipcRenderer = (window as any).ipcRenderer;

  useEffect(() => {
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 365;
    const from = Date.now() - (days * 24 * 60 * 60 * 1000);

    Promise.all([
      ipcRenderer.invoke('pipeline:analytics:getSummary', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByTemplate', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByStage', { fromTimestamp: from }),
      ipcRenderer.invoke('pipeline:analytics:getByModel', { fromTimestamp: from }),
    ]).then(([s, t, st, m]) => {
      setSummary(s);
      setByTemplate(t);
      setByStage(st);
      setByModel(m);
    });
  }, [timeRange]);

  if (!summary) return <div className="analytics-loading">Loading analytics...</div>;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  if (summary.totalRuns === 0) {
    return (
      <div className="analytics-empty">
        <div className="empty-icon">📊</div>
        <p>No analytics data yet</p>
        <p className="empty-hint">Run some pipelines to see performance insights</p>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="analytics-filters">
        {(['7d', '30d', 'all'] as const).map(range => (
          <button
            key={range}
            className={`time-filter ${timeRange === range ? 'active' : ''}`}
            onClick={() => setTimeRange(range)}
          >
            {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All Time'}
          </button>
        ))}
      </div>

      <div className="analytics-summary-cards">
        <div className="summary-card">
          <div className="card-value">{summary.successRate}%</div>
          <div className="card-label">Success Rate</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{formatDuration(summary.avgDurationMs)}</div>
          <div className="card-label">Avg Duration</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{summary.totalRuns}</div>
          <div className="card-label">Total Runs</div>
        </div>
        <div className="summary-card">
          <div className="card-value">{summary.avgRetries}</div>
          <div className="card-label">Avg Retries</div>
        </div>
      </div>

      {byTemplate.length > 0 && (
        <div className="analytics-section">
          <h3>Template Performance</h3>
          <table className="analytics-table">
            <thead>
              <tr><th>Template</th><th>Success</th><th>Avg Time</th><th>Count</th></tr>
            </thead>
            <tbody>
              {byTemplate.map((t: any) => (
                <tr key={t.template}>
                  <td>{t.template}</td>
                  <td>{Math.round((t.passed / t.count) * 100)}%</td>
                  <td>{formatDuration(t.avg_duration_ms)}</td>
                  <td>{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {byStage.length > 0 && (
        <div className="analytics-section">
          <h3>Stage Bottlenecks</h3>
          {byStage.map((s: any) => {
            const maxDuration = Math.max(...byStage.map((x: any) => x.avg_duration_ms || 0));
            const percentage = maxDuration > 0 ? ((s.avg_duration_ms || 0) / maxDuration) * 100 : 0;
            return (
              <div key={s.stage} className="bottleneck-bar">
                <div className="bottleneck-label">{STAGE_LABELS[s.stage] || s.stage}</div>
                <div className="bottleneck-track">
                  <div className="bottleneck-fill" style={{ width: `${percentage}%` }} />
                </div>
                <div className="bottleneck-value">{formatDuration(s.avg_duration_ms || 0)}</div>
                <div className="bottleneck-fail-rate">{s.failures}/{s.executions} failed</div>
              </div>
            );
          })}
        </div>
      )}

      {byModel.length > 0 && (
        <div className="analytics-section">
          <h3>Model Performance</h3>
          <table className="analytics-table">
            <thead>
              <tr><th>Model</th><th>Success</th><th>Avg Time</th><th>Runs</th></tr>
            </thead>
            <tbody>
              {byModel.map((m: any) => (
                <tr key={m.model}>
                  <td className="model-cell">{m.model}</td>
                  <td>{Math.round((m.successes / m.executions) * 100)}%</td>
                  <td>{formatDuration(m.avg_duration_ms || 0)}</td>
                  <td>{m.executions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PipelinePanel({ onClose }: PipelinePanelProps) {
  const [panelWidth, setPanelWidth] = useState(600);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState<Record<string, string>>({});
  const [stopModalData, setStopModalData] = useState<{ runId: string } | null>(null);
  const [stopPrompt, setStopPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'runs' | 'analytics'>('runs');
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const { cancel, activeRun, history, deleteRun, retryFix, analyzeAndRetry, refreshHistory, getChildRuns } = usePipeline();
  const [childRunsCache, setChildRunsCache] = useState<Record<string, any[]>>({});

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshHistory();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshHistory]);

  useEffect(() => {
    if (history.length > 0 && history[0].status === 'running') {
      setExpandedItems(prev => new Set([...prev, history[0].id]));
    }
  }, [history]);

  const toggleExpand = async (runId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
    if (!childRunsCache[runId]) {
      try {
        const children = await getChildRuns(runId);
        if (children.length > 0) {
          setChildRunsCache(prev => ({ ...prev, [runId]: children }));
        }
      } catch { /* no children */ }
    }
  };

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';

    const panelElement = panelRef.current;
    if (!panelElement) return;

    const panelRect = panelElement.getBoundingClientRect();
    const startWidth = panelRect.width;
    const startX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = startX - moveEvent.clientX;
      const newWidth = startWidth + deltaX;
      setPanelWidth(Math.min(Math.max(newWidth, 400), 900));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);
  const { showToast } = useToast();

  const allPipelines = useMemo(() => {
    const pipelines: any[] = [];

    if (activeRun) {
      pipelines.push(activeRun);
    }

    history.forEach(run => {
      if (!activeRun || run.id !== activeRun.id) {
        pipelines.push(run);
      }
    });

    return pipelines;
  }, [history, activeRun]);

  const handleCancel = async (runId?: string) => {
    await cancel(runId);
    if (runId) {
      setStopModalData({ runId });
      setStopPrompt('');
    } else {
      showToast('Pipeline cancelled', 'info');
    }
  };

  const handleStopAndApply = async (run: any) => {
    await cancel(run.id);
    showToast('Pipeline stopped. Applying generated files...', 'info');
    const { applied, failed } = await applyFileChanges(run);
    if (failed > 0) {
      showToast(`Applied ${applied} file(s), ${failed} failed`, 'error');
    } else if (applied > 0) {
      showToast(`Applied ${applied} file(s) successfully`, 'success');
    } else {
      showToast('No files generated yet to apply', 'info');
    }
  };

  const handleStopWithPrompt = async () => {
    if (!stopModalData || !stopPrompt.trim()) return;

    const runId = stopModalData.runId;
    setStopModalData(null);
    setStopPrompt('');

    try {
      const result = await analyzeAndRetry(runId, stopPrompt);

      switch (result.action) {
        case 'restart_required':
          showToast('Pipeline cleared. Start a new pipeline from chat.', 'info');
          break;
        case 'replan_required':
          showToast('Starting from planning stage. Create a new pipeline from chat with the same task.', 'info');
          break;
        case 'retry_with_feedback':
          showToast(`Retrying from ${result.stage || 'action'} with your feedback...`, 'info');
          break;
        case 'cancelled':
          if (result.reason) {
            showToast(`Pipeline cancelled: ${result.reason}`, 'info');
          } else {
            showToast('Pipeline cancelled.', 'info');
          }
          break;
        default:
          showToast(`Action: ${result.action}`, 'info');
      }
    } catch (err) {
      showToast(`Analysis failed: ${err}`, 'error');
    }
  };

  const applyFileChanges = async (run: any) => {
    const codeOutput = run?.stages?.action?.output;
    if (!codeOutput?.file_changes?.length) return { applied: 0, failed: 0 };

    const projectRoot = run.project_root || '';
    let applied = 0;
    let failed = 0;

    for (const change of codeOutput.file_changes) {
      try {
        await (window as any).ipcRenderer.invoke('tools:execute', 'write_file', {
          path: change.file_path,
          content: change.content,
          project_root: projectRoot,
        });
        applied++;
      } catch (err) {
        failed++;
        console.error(`Failed to apply ${change.file_path}:`, err);
      }
    }
    return { applied, failed };
  };

  const handleApplyChanges = async (run: any) => {
    const { applied, failed } = await applyFileChanges(run);
    if (failed > 0) {
      showToast(`Applied ${applied} file(s), ${failed} failed`, 'error');
    } else if (applied > 0) {
      showToast(`Applied ${applied} file(s) successfully`, 'success');
    } else {
      showToast('No files to apply', 'info');
    }
  };

  const handleDelete = async (runId: string) => {
    await deleteRun(runId);
    showToast('Pipeline deleted', 'info');
  };

  const handleRetryWithSuggestions = async (run: any) => {
    const reviewOutput = run.stages?.review?.output;
    const suggestions = reviewOutput?.suggestions || [];
    const userInput = manualInput[run.id] || '';

    const actionError = run.stages?.action?.error;

    const allSuggestions = [...suggestions];
    if (actionError) {
      allSuggestions.push(`Previous error that needs to be fixed: ${actionError}`);
    }
    if (userInput.trim()) {
      allSuggestions.push(`User feedback: ${userInput.trim()}`);
    }

    if (allSuggestions.length === 0) {
      showToast('No suggestions or manual input provided', 'info');
      return;
    }

    setRetryingRunId(run.id);
    try {
      await retryFix(run.id, allSuggestions);
      showToast('Retrying with suggestions...', 'info');
      setManualInput(prev => ({ ...prev, [run.id]: '' }));
    } catch (err) {
      showToast(`Retry failed: ${err}`, 'error');
    } finally {
      setRetryingRunId(null);
    }
  };

  const renderPipelineItem = (run: any) => {
    const isActive = run.status === 'running' || run.status === 'awaiting_approval';
    const isExpanded = expandedItems.has(run.id);
    const isFailed = run.status === 'failed' || run.final_verdict === 'FAIL';
    const stageOrder: string[] = run.stage_order || ['plan', 'action', 'review', 'validate', 'execute'];

    const getStageProgress = () => {
      const completed = stageOrder.filter(s =>
        run.stages?.[s]?.status === 'complete' || run.stages?.[s]?.status === 'skipped'
      ).length;
      const total = stageOrder.filter(s =>
        run.stages?.[s]?.status !== 'pending'
      ).length;
      return { completed, total };
    };

    const progress = getStageProgress();

    return (
      <div key={run.id} className={`pipeline-item ${isExpanded ? 'expanded' : ''} ${isActive ? 'active-item' : ''} ${isFailed ? 'failed-item' : ''}`}>
        <div
          className="pipeline-item-header accordion-trigger"
          onClick={() => toggleExpand(run.id)}
        >
          <div className="pipeline-item-info">
            <span className={`status-badge ${run.status}`}>
              {run.status === 'awaiting_approval' ? 'awaiting approval' : run.status}
            </span>
            {run.status === 'awaiting_approval' && (
              <span className="approval-chat-hint">check chat to approve</span>
            )}
            {run.template && run.template !== 'standard' && (
              <span className="template-pill">{run.template}</span>
            )}
            <span className="pipeline-task">{run.task_description.slice(0, 60)}{run.task_description.length > 60 ? '...' : ''}</span>
          </div>
          <div className="pipeline-item-meta">
            {run.agent_id && (
              <span className="pipeline-agent-badge" title={`Agent: ${run.agent_id}`}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
            )}
            <span className="pipeline-id">{run.id.slice(0, 8)}</span>
            <span className="pipeline-progress">{progress.completed}/{progress.total}</span>
            {isFailed && (
              <button
                className="btn btn-primary btn-xs"
                onClick={(e) => { e.stopPropagation(); handleRetryWithSuggestions(run); }}
                disabled={retryingRunId === run.id}
              >
                {retryingRunId === run.id ? 'Retrying...' : 'Retry'}
              </button>
            )}
            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="pipeline-item-content">
            <ExecutionSummary run={run} />

            <div className="pipeline-item-stages">
              {stageOrder.map((stage: string) => {
                const stageResult = run.stages?.[stage];
                if (!stageResult || (stageResult.status === 'pending' && !isActive)) return null;
                return <StageCard key={stage} stage={stage} result={stageResult} attempt={stage === 'action' || stage === 'review' ? run.retry_count + 1 : undefined} runId={run.id} />;
              })}
            </div>

            <div className="pipeline-item-footer">
              {run.stages?.action?.output?.file_changes?.length > 0 && (run.status === 'complete' || run.status === 'failed') && (
                <button
                  className={`btn ${run.final_verdict === 'PASS' ? 'btn-success' : 'btn-primary'} btn-sm`}
                  onClick={(e) => { e.stopPropagation(); handleApplyChanges(run); }}
                >
                  {run.final_verdict === 'PASS' ? 'Apply Changes' : 'Force Apply Changes'}
                </button>
              )}

              {(run.status === 'complete' || run.status === 'failed') && run.final_verdict && (
                <div className={`final-verdict ${run.final_verdict?.toLowerCase()}`}>
                  Final Verdict: {run.final_verdict}
                </div>
              )}
            </div>

            {childRunsCache[run.id] && childRunsCache[run.id].length > 0 && (
              <div className="child-runs-section">
                <h4 className="child-runs-title">Subtask Runs ({childRunsCache[run.id].length})</h4>
                {childRunsCache[run.id].map((child: any) => (
                  <div key={child.id} className="child-run-row">
                    <span className={`status-dot ${child.status}`} />
                    <span className="child-run-desc">{child.task_description.slice(0, 60)}{child.task_description.length > 60 ? '...' : ''}</span>
                    {child.agent_id && <span className="child-run-agent">{child.agent_id.slice(0, 12)}</span>}
                    {child.template && <span className="child-run-template">{child.template}</span>}
                    <span className={`status-badge ${child.status}`}>{child.final_verdict || child.status}</span>
                  </div>
                ))}
              </div>
            )}

            {(run.status === 'failed' || run.final_verdict === 'FAIL') && (
              <div className="retry-section">
                {run.stages?.review?.output?.suggestions?.length > 0 && (
                  <div className="retry-suggestions">
                    <h4>Suggestions from Review:</h4>
                    <ul>
                      {run.stages.review.output.suggestions.map((s: string, idx: number) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="retry-manual-input">
                  <h4>Add Your Feedback:</h4>
                  <textarea
                    className="retry-textarea"
                    placeholder="Enter additional instructions or feedback for retry..."
                    value={manualInput[run.id] || ''}
                    onChange={(e) => setManualInput(prev => ({ ...prev, [run.id]: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                    rows={3}
                  />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleRetryWithSuggestions(run); }}
                  disabled={retryingRunId === run.id}
                >
                  {retryingRunId === run.id ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            )}

            <div className="pipeline-item-actions">
              {isActive && (
                <>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleCancel(run.id); }}
                  >
                    Stop
                  </button>
                  {run.stages?.action?.output?.file_changes?.length > 0 && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => { e.stopPropagation(); handleStopAndApply(run); }}
                    >
                      Stop &amp; Apply
                    </button>
                  )}
                </>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => { e.stopPropagation(); handleDelete(run.id); }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {stopModalData && (
        <div className="modal-overlay">
          <div className="modal-content stop-prompt-modal">
            <h3>Pipeline Stopped</h3>
            <p>What would you like to do next?</p>
            <textarea
              className="stop-prompt-input"
              value={stopPrompt}
              onChange={(e) => setStopPrompt(e.target.value)}
              placeholder="e.g., 'continue from where it left off', 'restart from the beginning', 'abort and cancel', 'retry the action stage'"
              rows={4}
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setStopModalData(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleStopWithPrompt}
                disabled={!stopPrompt.trim()}
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pipeline-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="pipeline-resize-handle" onMouseDown={startResize} />
      <div className="panel-header">
        <h2>
          Pipeline Dashboard
          <span className="pipeline-help-tip" data-tip="The Pipeline executes tasks through configurable stages. Select a template to customize the stage sequence.">?</span>
        </h2>
        <div className="pipeline-tabs">
          <button
            className={`tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
            onClick={() => setActiveTab('runs')}
          >
            Runs
          </button>
          <button
            className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </div>
        <span className="pipeline-count">{allPipelines.length} total</span>
        <button className="btn-icon refresh-btn" onClick={() => refreshHistory()} title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        <button className="btn-icon" onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'analytics' ? (
          <AnalyticsDashboard />
        ) : allPipelines.length === 0 ? (
          <div className="empty-queue">
            <div className="empty-icon">📋</div>
            <p>No pipelines</p>
            <p className="empty-hint">Start a pipeline from Chat using "Send to Agent"</p>
          </div>
        ) : (
          allPipelines.map(run => renderPipelineItem(run))
        )}
      </div>
    </div>
    </>
  );
}
