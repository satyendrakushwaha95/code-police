import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import MermaidRenderer from './MermaidRenderer';
import { ollamaService } from '../../services/ollama';

type DocType = 'prd' | 'hld' | 'lld';

interface DesignDocPanelProps {
  onClose: () => void;
}

export default function DesignDocPanel({ onClose }: DesignDocPanelProps) {
  const [docType, setDocType] = useState<DocType>('prd');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState('');
  const [requirements, setRequirements] = useState('');
  const [techStack, setTechStack] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [diagram, setDiagram] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [panelWidth, setPanelWidth] = useState(700);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(450, Math.min(1000, window.innerWidth - e.clientX));
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

  const generateDoc = async () => {
    if (!projectName.trim() || !description.trim()) {
      showToast('Please fill in project name and description', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      let systemPrompt = '';
      let userPrompt = '';

      switch (docType) {
        case 'prd':
          systemPrompt = `You are a product requirement document generator. Generate a comprehensive PRD including:
1. Overview
2. User Stories
3. Functional Requirements (detailed)
4. Non-Functional Requirements
5. User Flow (as Mermaid flowchart)
6. Data Model (as Mermaid ER diagram)
7. UI/UX Requirements
8. Acceptance Criteria
9. Risks and Assumptions

Use Mermaid syntax for diagrams. Format with clear headings and bullet points.`;
          userPrompt = `Project: ${projectName}

Description: ${description}

Features (comma-separated): ${features}
Requirements: ${requirements}
Target Users: ${targetUsers}
Tech Stack: ${techStack}`;
          break;
        case 'hld':
          systemPrompt = `You are a high-level design document generator. Generate a comprehensive HLD including:
1. Architecture Overview
2. System Components
3. Data Flow Diagram (as Mermaid flowchart)
4. Technology Stack
5. API Design (as Mermaid sequence diagram)
6. Database Architecture
7. Security Design
8. Scalability Considerations

Use Mermaid syntax for diagrams. Format with clear headings.`;
          userPrompt = `Project: ${projectName}

Description: ${description}

Features: ${features}
Requirements: ${requirements}
Target Users: ${targetUsers}
Tech Stack: ${techStack}`;
          break;
        case 'lld':
          systemPrompt = `You are a low-level design document generator. Generate a comprehensive LLD including:
1. Module Design
2. Class/Function Interfaces
3. Database Schema (as Mermaid ER diagram)
4. Sequence Diagram (as Mermaid)
5. Error Handling
6. Edge Cases
7. API Endpoint Specifications
8. Data Validation Rules

Use Mermaid syntax for diagrams. Format with clear headings.`;
          userPrompt = `Project: ${projectName}

Description: ${description}

Features: ${features}
Requirements: ${requirements}
Tech Stack: ${techStack}`;
          break;
      }

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];

      let model = settings.model;
      let providerId = 'ollama-default';
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'documentation');
        model = routing.resolvedModel;
        providerId = routing.providerId || 'ollama-default';
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const result = await ollamaService.chatComplete(
        providerId,
        model,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        undefined,
        'documentation'
      );
      const content = result.content;
      
      setGeneratedDoc(content);
      
      const diagramMatch = content.match(/```mermaid\n([\s\S]*?)```/);
      if (diagramMatch) {
        setDiagram(diagramMatch[1].trim());
      } else {
        setDiagram('');
      }
      
      showToast('Document generated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate document', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="side-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="side-panel-resize-handle" onMouseDown={startResize} />
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Design Document Generator
        </div>
        <div className="side-panel-actions">
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="side-panel-content">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['prd', 'hld', 'lld'] as DocType[]).map(type => (
            <button
              key={type}
              className={`btn ${docType === type ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDocType(type)}
              disabled={isGenerating}
              style={{ flex: 1 }}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label>Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="E.g., E-Commerce Platform"
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want to build..."
            rows={3}
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Key Features (comma-separated)</label>
          <input
            type="text"
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder="E.g., User auth, Payment processing, Dashboard"
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Requirements</label>
          <textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="Specific requirements and constraints..."
            rows={2}
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Tech Stack (optional)</label>
          <input
            type="text"
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
            placeholder="E.g., React, Node.js, PostgreSQL"
            disabled={isGenerating}
          />
        </div>

        <div className="form-group">
          <label>Target Users (optional)</label>
          <input
            type="text"
            value={targetUsers}
            onChange={(e) => setTargetUsers(e.target.value)}
            placeholder="E.g., Developers, End users, Admins"
            disabled={isGenerating}
          />
        </div>

        <button 
          className="btn btn-primary" 
          onClick={generateDoc}
          disabled={isGenerating}
          style={{ width: '100%', marginBottom: '20px' }}
        >
          {isGenerating ? 'Generating...' : `Generate ${docType.toUpperCase()}`}
        </button>

        {generatedDoc && (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Generated Document
            </label>
            <div style={{
              background: 'var(--bg-primary)',
              padding: '16px',
              borderRadius: '8px',
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '13px',
              lineHeight: '1.6'
            }} dangerouslySetInnerHTML={{ 
              __html: generatedDoc
                .replace(/```mermaid\n[\s\S]*?```/g, '[Diagram]')
                .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre>$1</pre>')
                .replace(/\n/g, '<br/>')
            }} />
            
            {diagram && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Diagram
                </label>
                <MermaidRenderer code={diagram} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
