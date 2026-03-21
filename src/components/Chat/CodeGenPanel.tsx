import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';
import CodeBlock from '../common/CodeBlock';

type GenerationType = 'function' | 'api' | 'service' | 'sql' | 'model' | 'script' | 'module';

interface GenerationOption {
  id: GenerationType;
  name: string;
  description: string;
  icon: string;
  inputs: { key: string; label: string; placeholder: string; required: boolean }[];
}

const GENERATION_OPTIONS: GenerationOption[] = [
  {
    id: 'function',
    name: 'Function',
    description: 'Single function or method',
    icon: '⚡',
    inputs: [
      { key: 'functionName', label: 'Function Name', placeholder: 'e.g., calculateTotal', required: true },
      { key: 'inputs', label: 'Input Parameters', placeholder: 'e.g., items: Array<{price: number, qty: number}>', required: true },
      { key: 'output', label: 'Return Type', placeholder: 'e.g., number', required: true },
      { key: 'constraints', label: 'Constraints (optional)', placeholder: 'e.g., must handle empty array', required: false },
      { key: 'edgeCases', label: 'Edge Cases (optional)', placeholder: 'e.g., negative numbers, division by zero', required: false }
    ]
  },
  {
    id: 'api',
    name: 'API Endpoint',
    description: 'REST API endpoint',
    icon: '🔗',
    inputs: [
      { key: 'endpoint', label: 'Endpoint Path', placeholder: 'e.g., /api/users/:id', required: true },
      { key: 'method', label: 'HTTP Method', placeholder: 'GET, POST, PUT, DELETE', required: true },
      { key: 'requestSchema', label: 'Request Schema', placeholder: 'JSON schema for request body', required: false },
      { key: 'responseSchema', label: 'Response Schema', placeholder: 'JSON schema for response', required: false },
      { key: 'auth', label: 'Auth Type', placeholder: 'e.g., JWT, API Key, None', required: false },
      { key: 'db', label: 'Database (optional)', placeholder: 'e.g., PostgreSQL, MongoDB', required: false }
    ]
  },
  {
    id: 'service',
    name: 'Service Layer',
    description: 'Business logic service',
    icon: '🏗️',
    inputs: [
      { key: 'serviceName', label: 'Service Name', placeholder: 'e.g., UserService', required: true },
      { key: 'methods', label: 'Methods', placeholder: 'e.g., create, update, delete, getById', required: true },
      { key: 'dataModel', label: 'Data Model', placeholder: 'e.g., User entity fields', required: false },
      { key: 'validation', label: 'Validation Rules', placeholder: 'e.g., email format, password strength', required: false }
    ]
  },
  {
    id: 'sql',
    name: 'SQL Query',
    description: 'Database query or schema',
    icon: '🗄️',
    inputs: [
      { key: 'queryType', label: 'Query Type', placeholder: 'SELECT, INSERT, UPDATE, CREATE TABLE', required: true },
      { key: 'tableName', label: 'Table Name', placeholder: 'e.g., users', required: true },
      { key: 'columns', label: 'Columns', placeholder: 'e.g., id, name, email, created_at', required: false },
      { key: 'conditions', label: 'Conditions/WHERE', placeholder: 'e.g., WHERE active = true', required: false },
      { key: 'joins', label: 'Joins (optional)', placeholder: 'e.g., LEFT JOIN orders', required: false }
    ]
  },
  {
    id: 'model',
    name: 'Data Model',
    description: 'Type/class/interface definition',
    icon: '📦',
    inputs: [
      { key: 'modelName', label: 'Model Name', placeholder: 'e.g., User, Product, Order', required: true },
      { key: 'fields', label: 'Fields', placeholder: 'e.g., id: string, name: string, email: string', required: true },
      { key: 'relationships', label: 'Relationships (optional)', placeholder: 'e.g., hasMany Orders', required: false },
      { key: 'annotations', label: 'Annotations (optional)', placeholder: 'e.g., @Entity, @Table', required: false }
    ]
  },
  {
    id: 'script',
    name: 'Script/Automation',
    description: 'Automation script',
    icon: '🤖',
    inputs: [
      { key: 'scriptType', label: 'Script Type', placeholder: 'e.g., CLI tool, cron job, webhook handler', required: true },
      { key: 'purpose', label: 'Purpose', placeholder: 'e.g., Process daily reports', required: true },
      { key: 'dependencies', label: 'Dependencies (optional)', placeholder: 'e.g., pandas, requests', required: false }
    ]
  },
  {
    id: 'module',
    name: 'Full Module',
    description: 'Complete feature module',
    icon: '📁',
    inputs: [
      { key: 'moduleName', label: 'Module Name', placeholder: 'e.g., auth, payments', required: true },
      { key: 'features', label: 'Features', placeholder: 'e.g., login, logout, register, reset password', required: true },
      { key: 'techStack', label: 'Tech Stack', placeholder: 'e.g., Express, PostgreSQL, JWT', required: false }
    ]
  }
];

const DETERMINISM_MODES = [
  { id: 'strict', name: 'Strict', description: 'Deterministic, minimal hallucination', icon: '🎯' },
  { id: 'flexible', name: 'Flexible', description: 'Creative, may add optimizations', icon: '✨' }
];

interface CodeGenPanelProps {
  onClose: () => void;
  onInsertCode: (code: string, filename: string) => void;
}

export default function CodeGenPanel({ onClose, onInsertCode }: CodeGenPanelProps) {
  const [generationType, setGenerationType] = useState<GenerationType>('function');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [optionalPrompt, setOptionalPrompt] = useState('');
  const [determinismMode, setDeterminismMode] = useState<'strict' | 'flexible'>('strict');
  const [generatedPlan, setGeneratedPlan] = useState<string[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatedTests, setGeneratedTests] = useState('');
  const [generatedExplanation, setGeneratedExplanation] = useState('');
  const [generatedSetup, setGeneratedSetup] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'tests' | 'explanation' | 'setup'>('code');
  const [showPlan, setShowPlan] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [panelWidth, setPanelWidth] = useState(520);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

  const currentOption = GENERATION_OPTIONS.find(o => o.id === generationType);

  const requiredInputs = currentOption?.inputs.filter(i => i.required) || [];
  const missingRequired = requiredInputs.filter(i => !inputs[i.key]?.trim());

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(450, Math.min(800, window.innerWidth - e.clientX));
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

  const handleInputChange = (key: string, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const generatePlan = () => {
    if (missingRequired.length > 0) {
      setWarnings([`Missing required fields: ${missingRequired.map(i => i.label).join(', ')}`]);
      return;
    }

    setWarnings([]);
    
    const planSteps: string[] = [];
    
    switch (generationType) {
      case 'function':
        planSteps.push('1. Define function signature with proper typing');
        planSteps.push('2. Implement core logic based on requirements');
        planSteps.push('3. Add input validation');
        planSteps.push('4. Handle edge cases');
        planSteps.push('5. Add JSDoc/type documentation');
        planSteps.push('6. Generate unit tests');
        break;
      case 'api':
        planSteps.push('1. Define request/response schemas');
        planSteps.push('2. Create route handler');
        planSteps.push('3. Implement business logic');
        planSteps.push('4. Add authentication/authorization');
        planSteps.push('5. Add input validation');
        planSteps.push('6. Implement error handling');
        planSteps.push('7. Add database queries if applicable');
        planSteps.push('8. Generate integration tests');
        break;
      case 'service':
        planSteps.push('1. Define service interface');
        planSteps.push('2. Implement CRUD methods');
        planSteps.push('3. Add validation logic');
        planSteps.push('4. Implement error handling');
        planSteps.push('5. Add database operations');
        planSteps.push('6. Generate unit tests');
        break;
      case 'sql':
        planSteps.push('1. Analyze query requirements');
        planSteps.push('2. Optimize for performance');
        planSteps.push('3. Add proper indexing hints');
        planSteps.push('4. Ensure SQL injection safety');
        planSteps.push('5. Add comments for clarity');
        break;
      case 'model':
        planSteps.push('1. Define core fields with types');
        planSteps.push('2. Add validation decorators');
        planSteps.push('3. Define relationships');
        planSteps.push('4. Add database annotations');
        break;
      case 'script':
        planSteps.push('1. Define CLI interface');
        planSteps.push('2. Implement core logic');
        planSteps.push('3. Add error handling');
        planSteps.push('4. Implement logging');
        planSteps.push('5. Add configuration handling');
        break;
      case 'module':
        planSteps.push('1. Create folder structure');
        planSteps.push('2. Define data models');
        planSteps.push('3. Implement service layer');
        planSteps.push('4. Create API routes');
        planSteps.push('5. Add validation middleware');
        planSteps.push('6. Write database migrations');
        planSteps.push('7. Generate unit and integration tests');
        planSteps.push('8. Add README and setup instructions');
        break;
    }

    setGeneratedPlan(planSteps);
    setShowPlan(true);
  };

  const generateCode = async () => {
    if (missingRequired.length > 0) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const inputDetails = Object.entries(inputs)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');

      const modeInstruction = determinismMode === 'strict' 
        ? 'Be precise and deterministic. Do not add extra features or optimizations not explicitly requested.'
        : 'Feel free to add optimizations and best practices where appropriate.';

      const systemPrompt = `You are a code generation expert. Generate production-ready code based on the user's requirements.

Generation Type: ${currentOption?.name}
${modeInstruction}

IMPORTANT: Output your response in this exact format:
---CODE---
// All code files here
---TESTS---
// Test files here
---EXPLANATION---
// Brief explanation of what was generated
---SETUP---
// Setup/installation instructions here
---END---`;

      const userPrompt = `
## Intent
${currentOption?.description}

## Inputs / Requirements
${inputDetails}

${optionalPrompt ? `## Additional Instructions\n${optionalPrompt}` : ''}

Generate the code following the plan.`;
      
      let model = settings.model;
      try {
        const routing = await ollamaService.resolveModel(
          [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
          ],
          undefined,
          'code_generation'
        );
        model = routing.resolvedModel;
        if (routing.usedFallback) {
          showToast(`Using fallback model: ${model}`, 'info');
        }
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stream: false
        })
      });

      const data = await response.json();
      const content = data.message?.content || '';
      
      const codeMatch = content.match(/---CODE---\n([\s\S]*?)---TESTS---/);
      const testsMatch = content.match(/---TESTS---\n([\s\S]*?)---EXPLANATION---/);
      const explanationMatch = content.match(/---EXPLANATION---\n([\s\S]*?)---SETUP---/);
      const setupMatch = content.match(/---SETUP---\n([\s\S]*?)---END---/);

      setGeneratedCode(codeMatch ? codeMatch[1].trim() : content);
      setGeneratedTests(testsMatch ? testsMatch[1].trim() : '');
      setGeneratedExplanation(explanationMatch ? explanationMatch[1].trim() : '');
      setGeneratedSetup(setupMatch ? setupMatch[1].trim() : '');
      
      showToast('Code generated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate code', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = (code: string, filename: string) => {
    onInsertCode(code, filename);
    showToast(`Inserted ${filename}`, 'success');
  };

  return (
    <div className="side-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="side-panel-resize-handle" onMouseDown={startResize} />
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
          Code Generator
        </div>
        <div className="side-panel-actions">
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="side-panel-content" style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
        {/* Generation Type */}
        <div className="form-group">
          <label>Generation Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
            {GENERATION_OPTIONS.map(option => (
              <button
                key={option.id}
                className={`btn ${generationType === option.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setGenerationType(option.id); setInputs({}); setGeneratedCode(''); setShowPlan(false); }}
                style={{ fontSize: '11px', padding: '8px 6px', textAlign: 'left' }}
              >
                <span style={{ marginRight: '4px' }}>{option.icon}</span>
                {option.name}
              </button>
            ))}
          </div>
        </div>

        {/* Determinism Mode */}
        <div className="form-group">
          <label>Determinism Mode</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {DETERMINISM_MODES.map(mode => (
              <button
                key={mode.id}
                className={`btn ${determinismMode === mode.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setDeterminismMode(mode.id as 'strict' | 'flexible')}
                style={{ flex: 1, fontSize: '11px' }}
                title={mode.description}
              >
                {mode.icon} {mode.name}
              </button>
            ))}
          </div>
        </div>

        {/* Intent */}
        <div className="form-group">
          <label>Intent (What do you want?)</label>
          <input
            type="text"
            value={inputs.intent || ''}
            onChange={(e) => handleInputChange('intent', e.target.value)}
            placeholder={currentOption?.description}
            className="form-input"
          />
        </div>

        {/* Dynamic Inputs */}
        {currentOption?.inputs.filter(i => i.key !== 'intent').map(input => (
          <div key={input.key} className="form-group">
            <label>
              {input.label}
              {!input.required && <span style={{ fontWeight: 400, opacity: 0.6 }}> (optional)</span>}
            </label>
            {['inputs', 'fields', 'methods', 'features', 'columns', 'constraints', 'edgeCases', 'validation', 'relationships'].includes(input.key) ? (
              <textarea
                value={inputs[input.key] || ''}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                placeholder={input.placeholder}
                rows={2}
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              />
            ) : (
              <input
                type="text"
                value={inputs[input.key] || ''}
                onChange={(e) => handleInputChange(input.key, e.target.value)}
                placeholder={input.placeholder}
                className="form-input"
              />
            )}
          </div>
        ))}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ padding: '10px', background: 'rgba(255, 193, 7, 0.1)', borderRadius: '6px', marginBottom: '12px', border: '1px solid var(--warning)' }}>
            <div style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600 }}>⚠️ Warnings</div>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '4px' }}>{w}</div>
            ))}
          </div>
        )}

        {/* Optional Prompt */}
        <div className="form-group">
          <label>Additional Instructions (optional)</label>
          <textarea
            value={optionalPrompt}
            onChange={(e) => setOptionalPrompt(e.target.value)}
            placeholder="Any extra requirements or specific patterns to follow..."
            rows={2}
            className="form-input"
            style={{ fontSize: '12px' }}
          />
        </div>

        {/* Plan Preview */}
        {!showPlan ? (
          <button 
            className="btn btn-secondary" 
            onClick={generatePlan}
            disabled={missingRequired.length > 0}
            style={{ width: '100%', marginBottom: '12px' }}
          >
            👁️ Preview Plan
          </button>
        ) : (
          <div style={{ marginBottom: '12px' }}>
            <button 
              className="btn btn-ghost" 
              onClick={() => setShowPlan(false)}
              style={{ width: '100%', marginBottom: '8px', fontSize: '11px' }}
            >
              Hide Plan
            </button>
            <div style={{ 
              padding: '12px', 
              background: 'var(--bg-primary)', 
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>📋 Plan</div>
              {generatedPlan.map((step, i) => (
                <div key={i} style={{ fontSize: '12px', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generate Button */}
        <button 
          className="btn btn-primary" 
          onClick={generateCode}
          disabled={isGenerating || missingRequired.length > 0}
          style={{ width: '100%', marginBottom: '20px' }}
        >
          {isGenerating ? '⏳ Generating...' : '🚀 Generate Code'}
        </button>

        {/* Output Tabs */}
        {generatedCode && (
          <div>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              {(['code', 'tests', 'explanation', 'setup'] as const).map(tab => (
                <button
                  key={tab}
                  className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab(tab)}
                  style={{ flex: 1, fontSize: '11px', padding: '6px' }}
                >
                  {tab === 'code' && '📄'}
                  {tab === 'tests' && '🧪'}
                  {tab === 'explanation' && '💡'}
                  {tab === 'setup' && '⚙️'}
                  {' '}{tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <CodeBlock 
                files={[{ 
                  filename: activeTab === 'code' ? `generated.${generationType === 'sql' ? 'sql' : 'ts'}` : 
                          activeTab === 'tests' ? 'generated.test.ts' : 
                          activeTab === 'explanation' ? 'README.md' : 'setup.sh',
                  content: activeTab === 'code' ? generatedCode : 
                           activeTab === 'tests' ? (generatedTests || '// No tests generated') :
                           activeTab === 'explanation' ? (generatedExplanation || '// No explanation provided') :
                           (generatedSetup || '// No setup instructions')
                }]} 
              />
            </div>

            {activeTab === 'code' && generatedCode && (
              <button 
                className="btn btn-primary" 
                onClick={() => handleInsert(generatedCode, `generated.${generationType === 'sql' ? 'sql' : 'ts'}`)}
                style={{ width: '100%' }}
              >
                📥 Insert to File Panel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
