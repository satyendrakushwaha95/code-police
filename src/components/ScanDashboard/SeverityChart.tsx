import { useMemo } from 'react';
import type { ScanFinding } from '../../store/ScanContext';

interface SeverityChartProps {
  findings: ScanFinding[];
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

export default function SeverityChart({ findings }: SeverityChartProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of findings) {
      if (f.severity in map) {
        map[f.severity]++;
      }
    }
    return map;
  }, [findings]);

  const maxCount = useMemo(
    () => Math.max(...Object.values(counts), 1),
    [counts],
  );

  if (findings.length === 0) {
    return (
      <div className="severity-chart">
        <div className="severity-chart-empty">No findings to display</div>
      </div>
    );
  }

  return (
    <div className="severity-chart">
      {SEVERITIES.map(severity => {
        const count = counts[severity];
        const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <div key={severity} className="severity-row">
            <span className="severity-label">{severity}</span>
            <div className="severity-bar-track">
              <div
                className={`severity-bar-fill severity-${severity}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="severity-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
