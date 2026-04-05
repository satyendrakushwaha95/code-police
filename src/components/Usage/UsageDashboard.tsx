import { useState, useEffect, useCallback } from 'react';
import './Usage.css';

const ipcRenderer = (window as any).ipcRenderer;

interface UsageSummary {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

interface UsageByModel {
  providerId: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  requestCount: number;
}

interface UsageByDay {
  date: string;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

type TimeRange = 'today' | '7d' | '30d' | 'all';

function getTimeRange(range: TimeRange): { from?: number; to?: number } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  switch (range) {
    case 'today': {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      return { from: startOfDay.getTime(), to: now };
    }
    case '7d': return { from: now - 7 * dayMs, to: now };
    case '30d': return { from: now - 30 * dayMs, to: now };
    case 'all': return {};
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

interface UsageDashboardProps {
  onClose: () => void;
}

export default function UsageDashboard({ onClose }: UsageDashboardProps) {
  const [range, setRange] = useState<TimeRange>('30d');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byModel, setByModel] = useState<UsageByModel[]>([]);
  const [byDay, setByDay] = useState<UsageByDay[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const timeRange = getTimeRange(range);
      const [summaryData, modelData, dayData] = await Promise.all([
        ipcRenderer.invoke('usage:getSummary', timeRange),
        ipcRenderer.invoke('usage:getByModel', timeRange),
        ipcRenderer.invoke('usage:getByDay', { days: range === 'today' ? 1 : range === '7d' ? 7 : 30 }),
      ]);
      setSummary(summaryData);
      setByModel(modelData);
      setByDay(dayData);
    } catch (err) {
      console.error('Failed to load usage data:', err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxDayTokens = byDay.length > 0 ? Math.max(...byDay.map(d => d.totalTokens), 1) : 1;

  return (
    <div className="side-panel usage-dashboard">
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12V7H5a2 2 0 010-4h14v4"/>
            <path d="M3 5v14a2 2 0 002 2h16v-5"/>
            <path d="M18 12a2 2 0 000 4h4v-4z"/>
          </svg>
          Usage & Costs
        </div>
        <div className="side-panel-actions">
          <button className="btn-icon" onClick={loadData} title="Refresh">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="usage-time-selector">
        {(['today', '7d', '30d', 'all'] as TimeRange[]).map(r => (
          <button
            key={r}
            className={`usage-time-btn ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : 'All Time'}
          </button>
        ))}
      </div>

      <div className="side-panel-content">
        {loading && <div className="usage-loading">Loading usage data...</div>}

        {!loading && summary && (
          <>
            <div className="usage-summary-grid">
              <div className="usage-stat-card">
                <div className="usage-stat-value">{formatCost(summary.totalCostUsd)}</div>
                <div className="usage-stat-label">Total Cost</div>
              </div>
              <div className="usage-stat-card">
                <div className="usage-stat-value">{formatTokens(summary.totalTokens)}</div>
                <div className="usage-stat-label">Total Tokens</div>
              </div>
              <div className="usage-stat-card">
                <div className="usage-stat-value">{summary.requestCount}</div>
                <div className="usage-stat-label">Requests</div>
              </div>
              <div className="usage-stat-card">
                <div className="usage-stat-value">{formatTokens(summary.totalPromptTokens)}</div>
                <div className="usage-stat-label">Input Tokens</div>
              </div>
              <div className="usage-stat-card">
                <div className="usage-stat-value">{formatTokens(summary.totalCompletionTokens)}</div>
                <div className="usage-stat-label">Output Tokens</div>
              </div>
              <div className="usage-stat-card">
                <div className="usage-stat-value">
                  {summary.requestCount > 0 ? formatTokens(Math.round(summary.totalTokens / summary.requestCount)) : '0'}
                </div>
                <div className="usage-stat-label">Avg Tokens/Req</div>
              </div>
            </div>

            {byDay.length > 0 && (
              <div className="usage-section">
                <h4 className="usage-section-title">Daily Usage</h4>
                <div className="usage-chart">
                  {byDay.map(day => (
                    <div key={day.date} className="usage-chart-bar-group" title={`${day.date}: ${formatTokens(day.totalTokens)} tokens, ${formatCost(day.costUsd)}`}>
                      <div className="usage-chart-bar-container">
                        <div
                          className="usage-chart-bar"
                          style={{ height: `${Math.max((day.totalTokens / maxDayTokens) * 100, 2)}%` }}
                        />
                      </div>
                      <span className="usage-chart-label">{day.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {byModel.length > 0 && (
              <div className="usage-section">
                <h4 className="usage-section-title">Usage by Model</h4>
                <div className="usage-model-table">
                  <div className="usage-model-header">
                    <span className="col-model">Model</span>
                    <span className="col-tokens">Tokens</span>
                    <span className="col-cost">Cost</span>
                    <span className="col-reqs">Reqs</span>
                  </div>
                  {byModel.map(m => (
                    <div key={`${m.providerId}:${m.model}`} className="usage-model-row">
                      <span className="col-model" title={m.model}>
                        <span className="model-name-truncated">{m.model}</span>
                      </span>
                      <span className="col-tokens">{formatTokens(m.totalTokens)}</span>
                      <span className="col-cost">{formatCost(m.costUsd)}</span>
                      <span className="col-reqs">{m.requestCount}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.requestCount === 0 && (
              <div className="usage-empty">
                <p>No usage data yet for this time period.</p>
                <p className="usage-empty-hint">Token usage is tracked automatically when you chat with any provider.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
