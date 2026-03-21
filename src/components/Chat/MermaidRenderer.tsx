import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  code: string;
}

export default function MermaidRenderer({ code }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'var(--font-sans)',
    });
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;
      
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, code);
        setSvg(svg);
        setError('');
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError(err.message || 'Failed to render diagram');
        setSvg('');
      }
    };

    if (code) {
      renderDiagram();
    }
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-error">
        <span className="mermaid-error-icon">⚠️</span>
        <span className="mermaid-error-text">Diagram failed to render</span>
        <details>
          <summary>Show code</summary>
          <pre>{code}</pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-loading">Rendering diagram...</div>;
  }

  return (
    <div 
      className="mermaid-diagram" 
      dangerouslySetInnerHTML={{ __html: svg }} 
    />
  );
}
