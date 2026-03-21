import { useCallback, useState } from 'react';
import './CodeBlock.css';

interface CodeFile {
  filename: string;
  content: string;
  language?: string;
}

interface CodeBlockProps {
  files: CodeFile[];
  className?: string;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
    css: 'CSS', scss: 'SCSS', html: 'HTML', json: 'JSON', md: 'Markdown',
    yml: 'YAML', yaml: 'YAML', sql: 'SQL', sh: 'Bash', php: 'PHP',
    c: 'C', cpp: 'C++', cs: 'C#', swift: 'Swift', kt: 'Kotlin'
  };
  return langMap[ext] || ext.toUpperCase();
}

export default function CodeBlock({ files, className = '' }: CodeBlockProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFile = files[activeIndex];
  
  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(activeFile.content);
  }, [activeFile.content]);

  if (files.length === 0) {
    return null;
  }

  const lines = activeFile.content.split('\n');
  const language = activeFile.language || detectLanguage(activeFile.filename);

  return (
    <div className={`code-block-container ${className}`}>
      {files.length > 1 && (
        <div className="code-block-tabs">
          {files.map((file, idx) => (
            <button
              key={idx}
              className={`code-block-tab ${idx === activeIndex ? 'active' : ''}`}
              onClick={() => setActiveIndex(idx)}
            >
              <span className="tab-name">{file.filename.split('/').pop()}</span>
            </button>
          ))}
        </div>
      )}
      
      <div className="code-block">
        <div className="code-block-header">
          <span className="code-block-lang">{language}</span>
          <span className="code-block-filename">{activeFile.filename}</span>
          <span className="code-block-lines">{lines.length} lines</span>
          <button className="code-block-copy" onClick={copyToClipboard} title="Copy to clipboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
        </div>
        <div className="code-block-body">
          <div className="code-block-line-numbers">
            {lines.map((_, i) => (
              <span key={i} className="line-num">{i + 1}</span>
            ))}
          </div>
          <pre className="code-block-content"><code>{activeFile.content}</code></pre>
        </div>
      </div>
    </div>
  );
}
