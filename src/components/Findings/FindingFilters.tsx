import { useCallback, useMemo } from 'react';
import type { FilterState } from './FindingsExplorer';
import { useScanContext } from '../../store/ScanContext';

interface FindingFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'false_positive', label: 'False positive' },
];

export default function FindingFilters({
  filters,
  onChange,
  totalCount,
  filteredCount,
}: FindingFiltersProps) {
  const { state } = useScanContext();

  const categories = useMemo(() => {
    const set = new Set<string>();
    state.findings.forEach(f => {
      if (f.category) set.add(f.category);
    });
    return Array.from(set).sort();
  }, [state.findings]);

  const toggleSeverity = useCallback(
    (sev: string) => {
      const next = filters.severity.includes(sev)
        ? filters.severity.filter(s => s !== sev)
        : [...filters.severity, sev];
      onChange({ ...filters, severity: next });
    },
    [filters, onChange]
  );

  const handleCategoryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      onChange({
        ...filters,
        category: val ? [val] : [],
      });
    },
    [filters, onChange]
  );

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      onChange({
        ...filters,
        status: val ? [val] : [],
      });
    },
    [filters, onChange]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filters, search: e.target.value });
    },
    [filters, onChange]
  );

  return (
    <div className="finding-filters-bar">
      <div className="severity-pills">
        {SEVERITIES.map(sev => (
          <button
            key={sev}
            className={`severity-pill sev-${sev}${filters.severity.includes(sev) ? ' active' : ''}`}
            onClick={() => toggleSeverity(sev)}
            type="button"
          >
            {sev}
          </button>
        ))}
      </div>

      <div className="filter-group">
        <select
          className="filter-select"
          value={filters.category.length === 1 ? filters.category[0] : ''}
          onChange={handleCategoryChange}
        >
          <option value="">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <select
          className="filter-select"
          value={filters.status.length === 1 ? filters.status[0] : ''}
          onChange={handleStatusChange}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        className="filter-search"
        placeholder="Search title, file, CWE…"
        value={filters.search}
        onChange={handleSearchChange}
      />

      <span className="filter-counts">
        {filteredCount === totalCount
          ? `${totalCount} findings`
          : `${filteredCount} of ${totalCount} findings`}
      </span>
    </div>
  );
}
