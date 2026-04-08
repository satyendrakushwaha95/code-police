import { useState, useCallback } from 'react';

type ExportFormat = 'html' | 'pdf' | 'sarif' | 'json';

interface ExportControlsProps {
  scanId: string;
  onExport?: (msg: string) => void;
}

interface ButtonDef {
  format: ExportFormat | 'markdown';
  label: string;
  icon: JSX.Element;
}

const ipc = (window as any).ipcRenderer;

const BUTTONS: ButtonDef[] = [
  {
    format: 'html',
    label: 'Export HTML',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    format: 'pdf',
    label: 'Export PDF',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    format: 'sarif',
    label: 'Export SARIF',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    format: 'json',
    label: 'Export JSON',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    format: 'markdown',
    label: 'Copy Markdown',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
    ),
  },
];

export default function ExportControls({ scanId, onExport }: ExportControlsProps) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const notify = useCallback(
    (msg: string) => {
      onExport?.(msg);
    },
    [onExport],
  );

  const handleMarkdownCopy = useCallback(async () => {
    if (!scanId || !ipc) return;
    setLoading(prev => ({ ...prev, markdown: true }));
    try {
      const result = await ipc.invoke('scan:generateReport', {
        scanId,
        format: 'markdown',
        includeFixSuggestions: true,
        includeLlmExplanations: true,
      });
      const text = result?.content ?? '';
      await navigator.clipboard.writeText(text);
      notify('Markdown copied to clipboard');
    } catch (err: any) {
      notify(`Failed to copy: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, markdown: false }));
    }
  }, [scanId, notify]);

  const handleFileExport = useCallback(
    async (format: ExportFormat) => {
      if (!scanId || !ipc) return;
      setLoading(prev => ({ ...prev, [format]: true }));
      try {
        const extMap: Record<ExportFormat, string> = {
          html: 'html',
          pdf: 'pdf',
          sarif: 'sarif.json',
          json: 'json',
        };
        const filterMap: Record<ExportFormat, { name: string; extensions: string[] }[]> = {
          html: [{ name: 'HTML Files', extensions: ['html'] }],
          pdf: [{ name: 'PDF Files', extensions: ['pdf'] }],
          sarif: [{ name: 'SARIF Files', extensions: ['sarif.json', 'json'] }],
          json: [{ name: 'JSON Files', extensions: ['json'] }],
        };

        const dialogResult = await ipc.invoke('dialog:showSaveDialog', {
          title: `Export ${format.toUpperCase()} Report`,
          defaultPath: `scan-report-${scanId.slice(0, 8)}.${extMap[format]}`,
          filters: filterMap[format],
        });

        if (dialogResult?.canceled || !dialogResult?.filePath) {
          setLoading(prev => ({ ...prev, [format]: false }));
          return;
        }

        await ipc.invoke('scan:generateReport', {
          scanId,
          format,
          includeFixSuggestions: true,
          includeLlmExplanations: true,
          outputPath: dialogResult.filePath,
        });

        notify(`${format.toUpperCase()} report saved`);
      } catch (err: any) {
        notify(`Export failed: ${err.message}`);
      } finally {
        setLoading(prev => ({ ...prev, [format]: false }));
      }
    },
    [scanId, notify],
  );

  const handleClick = useCallback(
    (btn: ButtonDef) => {
      if (btn.format === 'markdown') {
        handleMarkdownCopy();
      } else {
        handleFileExport(btn.format);
      }
    },
    [handleMarkdownCopy, handleFileExport],
  );

  const disabled = !scanId;

  return (
    <>
      {BUTTONS.map(btn => {
        const isLoading = loading[btn.format] ?? false;
        return (
          <button
            key={btn.format}
            disabled={disabled || isLoading}
            onClick={() => handleClick(btn)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              color: isLoading ? 'var(--text-tertiary)' : 'var(--text-secondary)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              if (!disabled && !isLoading) {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-light)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLButtonElement).style.color = isLoading
                ? 'var(--text-tertiary)'
                : 'var(--text-secondary)';
            }}
          >
            {isLoading ? (
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'export-spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
              />
            ) : (
              btn.icon
            )}
            {btn.label}
          </button>
        );
      })}
      <style>{`@keyframes export-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
