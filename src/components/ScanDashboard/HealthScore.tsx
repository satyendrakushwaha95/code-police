import { useMemo } from 'react';

interface HealthScoreProps {
  score: number;
  previousScore?: number;
}

const RADIUS = 50;
const STROKE = 8;
const SIZE = (RADIUS + STROKE) * 2;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HealthScore({ score, previousScore }: HealthScoreProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE * (1 - clampedScore / 100);

  const scoreColor = useMemo(() => {
    if (clampedScore >= 80) return 'var(--success)';
    if (clampedScore >= 50) return 'var(--warning)';
    return 'var(--error)';
  }, [clampedScore]);

  const delta = previousScore != null ? clampedScore - previousScore : null;

  return (
    <div className="health-score">
      <div className="health-score-ring">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label={`Health score: ${clampedScore}`}>
          <circle
            className="health-score-track"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
          />
          <circle
            className="health-score-fill"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            style={{
              stroke: scoreColor,
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: offset,
            }}
          />
        </svg>
        <div className="health-score-value">
          <span className="health-score-number" style={{ color: scoreColor }}>
            {clampedScore}
          </span>
          <span className="health-score-label">/ 100</span>
        </div>
      </div>

      {delta != null && delta !== 0 && (
        <div
          className={`health-score-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral'}`}
        >
          {delta > 0 ? '▲' : '▼'} {delta > 0 ? '+' : ''}{delta}
        </div>
      )}
    </div>
  );
}
