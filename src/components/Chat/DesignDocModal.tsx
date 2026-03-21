import { useState } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';
import './Chat.css';

type DesignDocType = 'PRD' | 'HLD' | 'LLD';

interface DesignDocModalProps {
  onClose: () => void;
}

export default function DesignDocModal({ onClose }: DesignDocModalProps) {
  const [docType, setDocType] = useState<DesignDocType>('PRD');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [features, setFeatures] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { settings } = useSettings();
  const { state: workspace } = useWorkspace();
  const { showToast } = useToast();

  const getSystemPrompt = (type: DesignDocType): string => {
    switch (type) {
      case 'PRD':
        return `You are a product manager creating a Product Requirements Document (PRD). 
Create a comprehensive PRD with the following sections:
1. Title and Version
2. Executive Summary
3. Goals and Objectives
4. User Personas
5. Functional Requirements
6. Non-Functional Requirements
7. User Stories
8. Acceptance Criteria
9. Technical Constraints
10. Timeline (High Level)

Use professional formatting with markdown.`;
      case 'HLD':
        return `You are a software architect creating a High-Level Design Document (HLD).
Create a comprehensive HLD with the following sections:
1. Overview
2. Architecture Diagram (use mermaid syntax)
3. Component Design
4. Data Flow
5. API Design (if applicable)
6. Security Considerations
7. Scalability Plan
8. Technology Stack
9. Integration Points

Use professional formatting with markdown. Include mermaid diagrams where appropriate.`;
      case 'LLD':
        return `You are a software engineer creating a Low-Level Design Document (LLD).
Create a comprehensive LLD with the following sections:
1. Module Overview
2. Class/Module Design
3. Database Schema
4. API Endpoints (detailed)
5. Data Structures
6. Error Handling
7. Edge Cases
8. Testing Strategy

Use professional formatting with markdown.`;
    }
  };

  const getUserPrompt = (): string => {
    let prompt = `Generate a ${docType} for the following project:\n\n`;
    prompt += `**Project Name:** ${projectName}\n\n`;
    prompt += `**Description:** ${description}\n\n`;
    
    if (features.trim()) {
      prompt += `**Features:**\n${features}\n\n`;
    }
    
    if (workspace.rootPath) {
      prompt += `Use the workspace context at ${workspace.rootPath} for reference.`;
    }
    
    return prompt;
  };

  const generateDocument = async () => {
    if (!projectName.trim() || !description.trim()) {
      showToast('Please provide project name and description', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const messages = [
        { role: 'system' as const, content: getSystemPrompt(docType) },
        { role: 'user' as const, content: getUserPrompt() }
      ];

      let model = settings.model;
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'documentation');
        model = routing.resolvedModel;
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.statusText}`);
      }

      const data = await response.json();
      setGeneratedDoc(data.message?.content || 'No response generated');
    } catch (err: any) {
      showToast(`Generation failed: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDoc);
    showToast('Copied to clipboard', 'success');
  };

  const downloadDoc = () => {
    const blob = new Blob([generatedDoc], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_${docType}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Document downloaded', 'success');
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content design-doc-modal">
        <div className="modal-header">
          <h2>📄 Design Document Generator</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="doc-type-selector">
            <button 
              className={`doc-type-btn ${docType === 'PRD' ? 'active' : ''}`}
              onClick={() => setDocType('PRD')}
            >
              PRD
            </button>
            <button 
              className={`doc-type-btn ${docType === 'HLD' ? 'active' : ''}`}
              onClick={() => setDocType('HLD')}
            >
              HLD
            </button>
            <button 
              className={`doc-type-btn ${docType === 'LLD' ? 'active' : ''}`}
              onClick={() => setDocType('LLD')}
            >
              LLD
            </button>
          </div>

          {!generatedDoc ? (
            <div className="doc-input-form">
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the project purpose and scope"
                  rows={4}
                />
              </div>
              
              <div className="form-group">
                <label>Features (optional, one per line)</label>
                <textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  placeholder="List key features"
                  rows={4}
                />
              </div>

              <button 
                className="btn btn-primary generate-btn"
                onClick={generateDocument}
                disabled={isGenerating || !projectName.trim() || !description.trim()}
              >
                {isGenerating ? 'Generating...' : `Generate ${docType}`}
              </button>
            </div>
          ) : (
            <div className="doc-output">
              <div className="doc-output-actions">
                <button className="btn btn-ghost" onClick={copyToClipboard}>
                  📋 Copy
                </button>
                <button className="btn btn-ghost" onClick={downloadDoc}>
                  💾 Download
                </button>
                <button className="btn btn-ghost" onClick={() => setGeneratedDoc('')}>
                  ✏️ Edit
                </button>
              </div>
              <pre className="doc-content">{generatedDoc}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
