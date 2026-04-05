import { useState, useMemo, useRef, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import DiffViewer from './DiffViewer';
import { ollamaService } from '../../services/ollama';

interface RefactorCategory {
  id: string;
  name: string;
  icon: string;
  operations: RefactorOperation[];
}

interface RefactorOperation {
  id: string;
  name: string;
  description: string;
}

const REFACTOR_CATEGORIES: RefactorCategory[] = [
  {
    id: 'quality',
    name: 'Code Quality',
    icon: '✨',
    operations: [
      { id: 'reformat', name: 'Reformat Code', description: 'Apply language-specific formatting' },
      { id: 'comments', name: 'Add Comments', description: 'Add meaningful comments and docstrings' },
      { id: 'naming', name: 'Improve Naming', description: 'Replace ambiguous names with descriptive ones' },
      { id: 'simplify', name: 'Simplify Logic', description: 'Reduce nesting and remove dead code' },
    ]
  },
  {
    id: 'performance',
    name: 'Performance',
    icon: '⚡',
    operations: [
      { id: 'optimize_sql', name: 'Optimize SQL', description: 'Replace SELECT *, add indexes, fix N+1 queries' },
      { id: 'optimize_code', name: 'Optimize Code', description: 'Improve loops, memory usage, suggest caching' },
      { id: 'reduce_computation', name: 'Reduce Redundancy', description: 'Detect and remove duplicate computations' },
    ]
  },
  {
    id: 'security',
    name: 'Security',
    icon: '🔒',
    operations: [
      { id: 'fix_vulnerabilities', name: 'Fix Vulnerabilities', description: 'Prevent SQL injection, XSS, and other vulnerabilities' },
      { id: 'input_validation', name: 'Add Input Validation', description: 'Add sanitization and validation for inputs' },
      { id: 'error_handling', name: 'Improve Error Handling', description: 'Add proper try/catch and logging' },
    ]
  },
  {
    id: 'transformation',
    name: 'Transformation',
    icon: '🔄',
    operations: [
      { id: 'to_typescript', name: 'Convert to TypeScript', description: 'Add type annotations and interfaces' },
      { id: 'to_async', name: 'Convert to Async', description: 'Convert synchronous code to async/await' },
      { id: 'to_orm', name: 'Convert to ORM', description: 'Convert raw SQL to ORM queries' },
    ]
  },
  {
    id: 'testing',
    name: 'Testing',
    icon: '🧪',
    operations: [
      { id: 'generate_tests', name: 'Generate Unit Tests', description: 'Create test cases with mocks' },
      { id: 'detect_bugs', name: 'Detect Bugs', description: 'Highlight logical flaws and edge cases' },
      { id: 'explain', name: 'Explain Code', description: 'Provide clear execution flow explanation' },
    ]
  },
  {
    id: 'architecture',
    name: 'Architecture',
    icon: '🏗️',
    operations: [
      { id: 'extract_modules', name: 'Extract Modules', description: 'Improve separation of concerns' },
      { id: 'break_functions', name: 'Break Large Functions', description: 'Split complex functions into smaller ones' },
      { id: 'design_patterns', name: 'Suggest Design Patterns', description: 'Recommend scalable structure' },
    ]
  },
];

interface RefactorPanelProps {
  onClose: () => void;
}

export default function RefactorPanel({ onClose }: RefactorPanelProps) {
  const [code, setCode] = useState('');
  const [selectedOperation, setSelectedOperation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('quality');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExplainChanges, setShowExplainChanges] = useState(false);
  const [refactoredCode, setRefactoredCode] = useState('');
  const [summary, setSummary] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [panelWidth, setPanelWidth] = useState(600);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

  const currentCategory = REFACTOR_CATEGORIES.find(c => c.id === selectedCategory);

  const filteredOperations = useMemo(() => {
    if (!searchQuery.trim()) return currentCategory?.operations || [];
    const query = searchQuery.toLowerCase();
    return REFACTOR_CATEGORIES
      .flatMap(c => c.operations)
      .filter(op => 
        op.name.toLowerCase().includes(query) || 
        op.description.toLowerCase().includes(query)
      );
  }, [searchQuery, currentCategory]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(450, Math.min(900, window.innerWidth - e.clientX));
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

  const handleRefactor = async () => {
    if (!code.trim() || !selectedOperation) {
      showToast('Please enter code and select an operation', 'error');
      return;
    }

    setIsRefactoring(true);
    try {
      const operation = REFACTOR_CATEGORIES
        .flatMap(c => c.operations)
        .find(op => op.id === selectedOperation);

      let systemPrompt = '';
      
      switch (selectedOperation) {
        case 'reformat':
          systemPrompt = `You are a code formatter. Reformat the following code according to best practices for the language. Only output the formatted code, no explanations.`;
          break;
        case 'comments':
          systemPrompt = `You are a code documentation expert. Add meaningful JSDoc comments and inline comments to explain the code. Only output the commented code.`;
          break;
        case 'naming':
          systemPrompt = `You are a code improvement expert. Rename variables, functions, and classes to be more descriptive and follow naming conventions. Only output the improved code.`;
          break;
        case 'simplify':
          systemPrompt = `You are a code simplification expert. Reduce nesting, remove dead code, and simplify complex logic. Preserve the original functionality. Only output the simplified code.`;
          break;
        case 'optimize_sql':
          systemPrompt = `You are a SQL optimization expert. Optimize the SQL query:
- Replace SELECT * with explicit columns
- Use parameterized queries to prevent SQL injection
- Suggest indexes where applicable
- Fix N+1 query patterns
Output only the optimized SQL with brief summary.`;
          break;
        case 'optimize_code':
          systemPrompt = `You are a performance optimization expert. Optimize the code:
- Improve loops and reduce memory usage
- Suggest caching strategies
- Remove redundant operations
Only output the optimized code.`;
          break;
        case 'reduce_computation':
          systemPrompt = `You are a code optimization expert. Find and remove redundant computations. Cache repeated calculations. Only output the optimized code.`;
          break;
        case 'fix_vulnerabilities':
          systemPrompt = `You are a security expert. Fix security vulnerabilities in the code:
- Prevent SQL injection
- Sanitize inputs
- Fix XSS vulnerabilities
- Add security best practices
Only output the fixed code.`;
          break;
        case 'input_validation':
          systemPrompt = `You are a validation expert. Add input validation and sanitization to the code. Only output the validated code.`;
          break;
        case 'error_handling':
          systemPrompt = `You are an error handling expert. Add proper try/catch blocks, error logging, and graceful error handling. Only output the improved code.`;
          break;
        case 'to_typescript':
          systemPrompt = `You are a TypeScript conversion expert. Convert the code to TypeScript with proper types and interfaces. Preserve all business logic. Only output the TypeScript code.`;
          break;
        case 'to_async':
          systemPrompt = `You are an async conversion expert. Convert synchronous code to async/await. Preserve all business logic. Only output the async code.`;
          break;
        case 'to_orm':
          systemPrompt = `You are an ORM expert. Convert raw SQL queries to ORM syntax (e.g., TypeORM, Prisma, Sequelize). Preserve all business logic. Only output the ORM code.`;
          break;
        case 'generate_tests':
          systemPrompt = `You are a testing expert. Generate comprehensive unit tests for the code:
- Cover edge cases
- Include mock setup
- Use the appropriate testing framework
Only output the test code.`;
          break;
        case 'detect_bugs':
          systemPrompt = `You are a bug detection expert. Analyze the code for logical flaws, edge cases, and potential bugs. Provide a detailed report.`;
          break;
        case 'explain':
          systemPrompt = `You are a code explanation expert. Provide a clear, concise explanation of what the code does and how it works.`;
          break;
        case 'extract_modules':
          systemPrompt = `You are an architecture expert. Suggest how to extract modules and improve separation of concerns. Provide the refactored code structure.`;
          break;
        case 'break_functions':
          systemPrompt = `You are a code refactoring expert. Break large functions into smaller, focused functions. Preserve all functionality. Only output the refactored code.`;
          break;
        case 'design_patterns':
          systemPrompt = `You are a design patterns expert. Suggest and apply appropriate design patterns to improve the code structure. Only output the improved code.`;
          break;
        default:
          systemPrompt = `You are a code refactoring expert. Improve the code based on the operation: ${operation?.name}. Only output the refactored code.`;
      }

      const userPrompt = showExplainChanges 
        ? `Operation: ${operation?.name}\n\nCode:\n${code}`
        : `Code:\n${code}`;

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
      ];

      let model = settings.model;
      let providerId = 'ollama-default';
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'code_refactor');
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
        'code_refactor'
      );
      const content = result.content;
      
      if (selectedOperation === 'detect_bugs' || selectedOperation === 'explain') {
        setRefactoredCode('');
        setSummary([content]);
        setAssumptions([]);
      } else if (showExplainChanges) {
        const codeMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        const summaryMatch = content.match(/Summary:([\s\S]*?)(?:Assumptions:|$)/i);
        const assumptionsMatch = content.match(/Assumptions:([\s\S]*?)$/i);
        
        setRefactoredCode(codeMatch ? codeMatch[1].trim() : content.split('\n').filter((l: string) => !l.startsWith('-')).join('\n'));
        setSummary(summaryMatch ? summaryMatch[1].trim().split('\n').filter((l: string) => l.trim()) : []);
        setAssumptions(assumptionsMatch ? assumptionsMatch[1].trim().split('\n').filter((l: string) => l.trim()) : []);
      } else {
        const codeMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        setRefactoredCode(codeMatch ? codeMatch[1].trim() : content);
        setSummary([]);
        setAssumptions([]);
      }
      
      showToast('Refactoring complete', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to refactor code', 'error');
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleAutoFixAll = async () => {
    if (!code.trim()) {
      showToast('Please enter code to refactor', 'error');
      return;
    }
    
    setSelectedOperation('auto_fix_all');
    setIsRefactoring(true);
    
    try {
      const messages = [
        { 
          role: 'system' as const, 
          content: `You are an expert code refactoring assistant. Apply a safe, comprehensive refactor:
1. Clean code (format, simplify, improve naming)
2. Optimize (performance, reduce redundancy)
3. Secure (fix vulnerabilities, add validation, error handling)
4. Document (add meaningful comments)

Preserve original functionality. Use best practices. Output only the refactored code with brief summary.`
        },
        { role: 'user' as const, content: `Code:\n${code}` }
      ];

      let model = settings.model;
      let providerId = 'ollama-default';
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'code_refactor');
        model = routing.resolvedModel;
        providerId = routing.providerId || 'ollama-default';
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const result = await ollamaService.chatComplete(
        providerId,
        model,
        messages,
        undefined,
        'code_refactor'
      );
      const content = result.content;
      const codeMatch = content.match(/```(?:\w+)?\n([\s\S]*?)```/);
      setRefactoredCode(codeMatch ? codeMatch[1].trim() : content);
      setSelectedOperation('');
      showToast('Auto-fix complete', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to auto-fix', 'error');
    } finally {
      setIsRefactoring(false);
    }
  };

  return (
    <div className="side-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="side-panel-resize-handle" onMouseDown={startResize} />
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Refactor Assistant
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
        <div className="form-group">
          <label>Code to Refactor</label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your code here..."
            rows={6}
            disabled={isRefactoring}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search operations..."
            className="form-input"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {REFACTOR_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`btn ${selectedCategory === cat.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setSelectedCategory(cat.id); setSearchQuery(''); }}
              style={{ fontSize: '11px', padding: '4px 8px' }}
              title={cat.name}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label>Select Operation</label>
          <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
            {filteredOperations.map(op => (
              <button
                key={op.id}
                className={`operation-btn ${selectedOperation === op.id ? 'active' : ''}`}
                onClick={() => setSelectedOperation(op.id)}
                style={{ 
                  width: '100%', 
                  textAlign: 'left', 
                  padding: '8px 12px',
                  marginBottom: '4px',
                  background: selectedOperation === op.id ? 'var(--primary)' : 'transparent',
                  color: selectedOperation === op.id ? 'white' : 'var(--text-primary)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{op.name}</div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>{op.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showExplainChanges}
              onChange={(e) => setShowExplainChanges(e.target.checked)}
            />
            <span style={{ fontSize: '13px' }}>Explain Changes</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button 
            className="btn btn-primary" 
            onClick={handleRefactor}
            disabled={isRefactoring || !code.trim() || !selectedOperation}
            style={{ flex: 1 }}
          >
            {isRefactoring ? 'Processing...' : 'Refactor'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleAutoFixAll}
            disabled={isRefactoring || !code.trim()}
            title="Clean → Optimize → Secure → Document"
          >
            Auto Fix All
          </button>
        </div>

        {(refactoredCode || summary.length > 0) && (
          <div>
            {summary.length > 0 && (
              <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--primary)' }}>Summary</div>
                {summary.map((item, i) => (
                  <div key={i} style={{ fontSize: '12px', marginBottom: '4px' }}>• {item}</div>
                ))}
                {assumptions.length > 0 && (
                  <>
                    <div style={{ fontWeight: 600, marginTop: '8px', marginBottom: '8px', color: 'var(--warning)' }}>Assumptions</div>
                    {assumptions.map((item, i) => (
                      <div key={i} style={{ fontSize: '12px', opacity: 0.8 }}>• {item}</div>
                    ))}
                  </>
                )}
              </div>
            )}

            {refactoredCode && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Result
                </label>
                <DiffViewer
                  oldCode={code}
                  newCode={refactoredCode}
                  oldLabel="Original"
                  newLabel="Refactored"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
