import { useState, useMemo, useRef, useCallback } from 'react';
import type { TrendDataPoint } from '../../store/ScanContext';

interface TrendChartProps {
  data: TrendDataPoint[];
}

const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 36, left: 44 };
const GRID_LINES = [25, 50, 75, 100];
const DOT_RADIUS = 5;
const HOVER_RADIUS = 7;

function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TrendChart({ data }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.timestamp - b.timestamp),
    [data],
  );

  const chartWidth = useMemo(() => {
    const minWidth = 400;
    const perPoint = 80;
    return Math.max(minWidth, sorted.length * perPoint + PADDING.left + PADDING.right);
  }, [sorted.length]);

  const innerW = chartWidth - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const points = useMemo(() => {
    if (sorted.length === 0) return [];
    if (sorted.length === 1) {
      return [{
        x: PADDING.left + innerW / 2,
        y: PADDING.top + innerH - (sorted[0].healthScore / 100) * innerH,
        d: sorted[0],
      }];
    }
    return sorted.map((d, i) => ({
      x: PADDING.left + (i / (sorted.length - 1)) * innerW,
      y: PADDING.top + innerH - (d.healthScore / 100) * innerH,
      d,
    }));
  }, [sorted, innerW, innerH]);

  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const bottom = PADDING.top + innerH;
    return (
      `M${points[0].x},${bottom} ` +
      points.map(p => `L${p.x},${p.y}`).join(' ') +
      ` L${points[points.length - 1].x},${bottom} Z`
    );
  }, [points, innerH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const scaleX = chartWidth / rect.width;
      const scaledX = mouseX * scaleX;

      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - scaledX);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      setHoveredIndex(closest);
      setTooltipPos({ x: points[closest].x, y: points[closest].y });
    },
    [points, chartWidth],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setTooltipPos(null);
  }, []);

  if (data.length < 2) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: CHART_HEIGHT,
          color: 'var(--text-tertiary)',
          fontSize: 13,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Not enough data for trend visualization (need at least 2 scans)
      </div>
    );
  }

  const hoveredPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
      width="100%"
      height={CHART_HEIGHT}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', overflow: 'visible', fontFamily: 'var(--font-sans)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Grid lines */}
      {GRID_LINES.map(val => {
        const y = PADDING.top + innerH - (val / 100) * innerH;
        return (
          <g key={val}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={PADDING.left + innerW}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="4 3"
            />
            <text
              x={PADDING.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-tertiary)"
              fontFamily="var(--font-mono)"
            >
              {val}
            </text>
          </g>
        );
      })}

      {/* Y-axis baseline */}
      <line
        x1={PADDING.left}
        y1={PADDING.top + innerH}
        x2={PADDING.left + innerW}
        y2={PADDING.top + innerH}
        stroke="var(--border)"
      />
      <text
        x={PADDING.left - 8}
        y={PADDING.top + innerH + 4}
        textAnchor="end"
        fontSize="10"
        fill="var(--text-tertiary)"
        fontFamily="var(--font-mono)"
      >
        0
      </text>

      {/* Area fill */}
      <path d={areaPath} fill="var(--accent)" opacity="0.1" />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={hoveredIndex === i ? HOVER_RADIUS : DOT_RADIUS}
          fill={hoveredIndex === i ? 'var(--accent)' : 'var(--bg-secondary)'}
          stroke="var(--accent)"
          strokeWidth="2"
          style={{ transition: 'r 0.15s, fill 0.15s' }}
        />
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={PADDING.top + innerH + 20}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-tertiary)"
          fontFamily="var(--font-mono)"
        >
          {formatShortDate(p.d.timestamp)}
        </text>
      ))}

      {/* Tooltip */}
      {hoveredPoint && tooltipPos && (
        <g>
          {/* Vertical guide line */}
          <line
            x1={tooltipPos.x}
            y1={PADDING.top}
            x2={tooltipPos.x}
            y2={PADDING.top + innerH}
            stroke="var(--accent)"
            strokeDasharray="3 2"
            opacity="0.4"
          />
          {/* Tooltip background */}
          <rect
            x={tooltipPos.x - 60}
            y={tooltipPos.y - 48}
            width={120}
            height={36}
            rx={6}
            fill="var(--bg-tertiary)"
            stroke="var(--border)"
          />
          {/* Tooltip text */}
          <text
            x={tooltipPos.x}
            y={tooltipPos.y - 34}
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="var(--text-primary)"
          >
            Score: {hoveredPoint.d.healthScore}
          </text>
          <text
            x={tooltipPos.x}
            y={tooltipPos.y - 19}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-tertiary)"
            fontFamily="var(--font-mono)"
          >
            {formatShortDate(hoveredPoint.d.timestamp)} · {hoveredPoint.d.totalFindings} findings
          </text>
        </g>
      )}
    </svg>
  );
}
