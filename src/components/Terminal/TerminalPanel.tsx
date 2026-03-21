import { useState, useRef, useEffect } from 'react';
import './Terminal.css';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
  timestamp: number;
}

interface TerminalPanelProps {
  onClose?: () => void;
}

export default function TerminalPanel({ onClose }: TerminalPanelProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 'welcome',
      type: 'system',
      content: 'Terminal ready. Type a command and press Enter to execute.',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [panelWidth, setPanelWidth] = useState(500);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(400, Math.min(800, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  const executeCommand = async () => {
    if (!input.trim() || isExecuting) return;

    const command = input.trim();
    setInput('');
    setIsExecuting(true);

    // Add input line
    const inputLine: TerminalLine = {
      id: `input-${Date.now()}`,
      type: 'input',
      content: `$ ${command}`,
      timestamp: Date.now()
    };
    setLines(prev => [...prev, inputLine]);

    try {
      const result = await (window as any).ipcRenderer.invoke('tools:execute', 'execute_command', {
        command,
        timeout: 30000
      });

      if (result.success) {
        const outputLine: TerminalLine = {
          id: `output-${Date.now()}`,
          type: 'output',
          content: result.output || '',
          timestamp: Date.now()
        };
        setLines(prev => [...prev, outputLine]);
      } else {
        const errorLine: TerminalLine = {
          id: `error-${Date.now()}`,
          type: 'error',
          content: result.error || 'Command failed',
          timestamp: Date.now()
        };
        setLines(prev => [...prev, errorLine]);
      }
    } catch (err: any) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: err.message || 'Execution failed',
        timestamp: Date.now()
      };
      setLines(prev => [...prev, errorLine]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    }
  };

  const clearTerminal = () => {
    setLines([{
      id: 'cleared',
      type: 'system',
      content: 'Terminal cleared.',
      timestamp: Date.now()
    }]);
  };

  return (
    <div className="terminal-panel" ref={panelRef} style={{ width: `${panelWidth}px` }} onClick={focusInput}>
      <div className="terminal-resize-handle" onMouseDown={startResize} />
      <div className="terminal-header">
        <span className="terminal-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          Terminal
        </span>
        <div className="terminal-actions">
          <button className="terminal-btn" onClick={clearTerminal} title="Clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
          {onClose && (
            <button className="terminal-btn" onClick={onClose} title="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="terminal-content" ref={terminalRef}>
        {lines.map(line => (
          <div key={line.id} className={`terminal-line ${line.type}`}>
            <pre>{line.content}</pre>
          </div>
        ))}
      </div>

      <div className="terminal-input-container">
        <span className="terminal-prompt">$</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          disabled={isExecuting}
          autoFocus
        />
      </div>
    </div>
  );
}
