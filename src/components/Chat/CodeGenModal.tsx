import { useState } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';
import './Chat.css';

interface CodeTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
}

const CODE_TEMPLATES: CodeTemplate[] = [
  {
    id: 'react-component',
    name: 'React Component',
    category: 'Frontend',
    description: 'Create a new React functional component',
    prompt: 'Generate a React functional component with TypeScript. Include props interface, proper typing, and common patterns like useState or useEffect if needed.'
  },
  {
    id: 'react-hook',
    name: 'Custom React Hook',
    category: 'Frontend',
    description: 'Create a custom React hook',
    prompt: 'Generate a custom React hook with TypeScript. Include proper typing for the hook return value and any parameters.'
  },
  {
    id: 'api-endpoint',
    name: 'API Endpoint',
    category: 'Backend',
    description: 'Create a REST API endpoint handler',
    prompt: 'Generate a REST API endpoint handler. Include request/response types, error handling, and proper status codes.'
  },
  {
    id: 'database-model',
    name: 'Database Model',
    category: 'Backend',
    description: 'Create a database schema/model',
    prompt: 'Generate a database schema/model. Include fields, types, relationships, and indexes.'
  },
  {
    id: 'class-ts',
    name: 'TypeScript Class',
    category: 'Backend',
    description: 'Create a TypeScript class',
    prompt: 'Generate a TypeScript class with proper typing, constructor, and methods.'
  },
  {
    id: 'function-ts',
    name: 'TypeScript Function',
    category: 'Backend',
    description: 'Create a TypeScript function',
    prompt: 'Generate a TypeScript function with proper typing for parameters and return type.'
  },
  {
    id: 'test-file',
    name: 'Test File',
    category: 'Testing',
    description: 'Create a test file',
    prompt: 'Generate a test file with test cases. Use a testing framework like Jest or Vitest.'
  },
  {
    id: 'sql-query',
    name: 'SQL Query',
    category: 'Database',
    description: 'Generate a SQL query',
    prompt: 'Generate a SQL query with proper joins, filters, and aggregations if needed.'
  },
  {
    id: 'dockerfile',
    name: 'Dockerfile',
    category: 'DevOps',
    description: 'Create a Dockerfile',
    prompt: 'Generate a Dockerfile for a Node.js application. Include best practices like multi-stage builds.'
  },
  {
    id: 'github-action',
    name: 'GitHub Action',
    category: 'DevOps',
    description: 'Create a GitHub Actions workflow',
    prompt: 'Generate a GitHub Actions workflow file for CI/CD. Include linting, testing, and deployment steps.'
  }
];

interface CodeGenModalProps {
  onClose: () => void;
  onInsertCode: (code: string, filename: string) => void;
}

export default function CodeGenModal({ onClose, onInsertCode }: CodeGenModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<CodeTemplate | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [filename, setFilename] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

  const categories = [...new Set(CODE_TEMPLATES.map(t => t.category))];

  const generateCode = async () => {
    const prompt = selectedTemplate 
      ? `${selectedTemplate.prompt}\n\n${customPrompt}`
      : customPrompt;

    if (!prompt.trim()) {
      showToast('Please select a template or enter a custom prompt', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const messages = [
        { 
          role: 'system' as const, 
          content: 'You are a code generation assistant. Generate high-quality, well-documented code. Use TypeScript by default. Include necessary imports. Respond with ONLY the code in a code block, no explanations.'
        },
        { 
          role: 'user' as const, 
          content: prompt
        }
      ];

      let model = settings.model;
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'code_generation');
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
      const content = data.message?.content || '';
      
      // Extract code from markdown if present
      const codeMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
      setGeneratedCode(codeMatch ? codeMatch[1].trim() : content.trim());
    } catch (err: any) {
      showToast(`Generation failed: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (!generatedCode.trim()) {
      showToast('No code to insert', 'error');
      return;
    }
    if (!filename.trim()) {
      showToast('Please enter a filename', 'error');
      return;
    }
    onInsertCode(generatedCode, filename);
    showToast('Code inserted', 'success');
    onClose();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content code-gen-modal">
        <div className="modal-header">
          <h2>⚡ Code Scaffolding</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {!generatedCode ? (
            <>
              <div className="template-grid">
                {categories.map(cat => (
                  <div key={cat} className="template-category">
                    <h3 className="category-title">{cat}</h3>
                    <div className="template-list">
                      {CODE_TEMPLATES.filter(t => t.category === cat).map(template => (
                        <button
                          key={template.id}
                          className={`template-btn ${selectedTemplate?.id === template.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedTemplate(template);
                            setCustomPrompt('');
                          }}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="custom-prompt-section">
                <label>Additional Requirements</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={selectedTemplate 
                    ? `Add specific requirements for ${selectedTemplate.name}...`
                    : 'Describe what you want to generate...'}
                  rows={4}
                />
              </div>

              <button 
                className="btn btn-primary generate-btn"
                onClick={generateCode}
                disabled={isGenerating || (!selectedTemplate && !customPrompt.trim())}
              >
                {isGenerating ? 'Generating...' : 'Generate Code'}
              </button>
            </>
          ) : (
            <div className="code-output">
              <div className="filename-input">
                <label>Filename</label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="e.g., MyComponent.tsx"
                />
              </div>
              
              <div className="code-preview">
                <pre>{generatedCode}</pre>
              </div>

              <div className="code-actions">
                <button className="btn btn-ghost" onClick={copyToClipboard}>
                  📋 Copy
                </button>
                <button className="btn btn-ghost" onClick={() => setGeneratedCode('')}>
                  ✏️ Edit Prompt
                </button>
                <button className="btn btn-primary" onClick={handleInsert}>
                  💾 Save to File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
