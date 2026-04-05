import { useState } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';
import './Chat.css';

interface RefactorOperation {
  id: string;
  name: string;
  description: string;
}

const REFACTOR_OPERATIONS: RefactorOperation[] = [
  { id: 'extract-function', name: 'Extract Function', description: 'Extract code into a new function' },
  { id: 'extract-variable', name: 'Extract Variable', description: 'Extract expression into a variable' },
  { id: 'rename', name: 'Rename', description: 'Rename variables, functions, or classes' },
  { id: 'inline', name: 'Inline', description: 'Inline variables or functions' },
  { id: 'move', name: 'Move', description: 'Move code to a different location' },
  { id: 'convert-function', name: 'Convert to Arrow', description: 'Convert function to arrow function' },
  { id: 'add-types', name: 'Add TypeScript Types', description: 'Add explicit type annotations' },
  { id: 'simplify', name: 'Simplify Expression', description: 'Simplify complex expressions' },
  { id: 'optimize-imports', name: 'Optimize Imports', description: 'Remove unused imports' },
  { id: 'custom', name: 'Custom Refactoring', description: 'Describe your own refactoring' }
];

interface RefactorModalProps {
  code: string;
  filename: string;
  onApply: (newCode: string) => void;
  onClose: () => void;
}

export default function RefactorModal({ code, filename, onApply, onClose }: RefactorModalProps) {
  const [selectedOp, setSelectedOp] = useState<RefactorOperation | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [refactoredCode, setRefactoredCode] = useState('');
  const [isRefactoring, setIsRefactoring] = useState(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

  const getRefactorPrompt = (): string => {
    const basePrompt = `Refactor the following code from ${filename}:\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
    
    switch (selectedOp?.id) {
      case 'extract-function':
        return basePrompt + 'Extract the selected code into a well-named function with appropriate parameters.';
      case 'extract-variable':
        return basePrompt + 'Extract complex expressions into well-named variables.';
      case 'rename':
        return basePrompt + 'Rename variables/functions to be more descriptive and follow naming conventions.';
      case 'inline':
        return basePrompt + 'Inline unnecessary variables and simplify the code.';
      case 'move':
        return basePrompt + 'Reorganize the code for better structure and readability.';
      case 'convert-function':
        return basePrompt + 'Convert regular functions to arrow functions where appropriate.';
      case 'add-types':
        return basePrompt + 'Add explicit TypeScript type annotations to all variables, parameters, and return types.';
      case 'simplify':
        return basePrompt + 'Simplify complex expressions and make the code more readable.';
      case 'optimize-imports':
        return basePrompt + 'Organize and remove unused imports.';
      case 'custom':
        return basePrompt + customPrompt;
      default:
        return basePrompt + 'Improve this code: make it more readable, efficient, and follow best practices.';
    }
  };

  const refactorCode = async () => {
    setIsRefactoring(true);
    try {
      const messages = [
        { 
          role: 'system' as const, 
          content: 'You are a code refactoring assistant. Generate ONLY the refactored code. No explanations, no markdown unless for code blocks. Keep the same functionality but improve the code quality.'
        },
        { 
          role: 'user' as const, 
          content: getRefactorPrompt()
        }
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
      setRefactoredCode(codeMatch ? codeMatch[1].trim() : content.trim());
    } catch (err: any) {
      showToast(`Refactoring failed: ${err.message}`, 'error');
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleApply = () => {
    if (!refactoredCode.trim()) {
      showToast('No refactored code to apply', 'error');
      return;
    }
    onApply(refactoredCode);
    showToast('Refactoring applied', 'success');
    onClose();
  };

  const copyRefactored = () => {
    navigator.clipboard.writeText(refactoredCode);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content refactor-modal">
        <div className="modal-header">
          <h2>🔧 Refactoring Tools</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {!refactoredCode ? (
            <>
              <div className="original-code-preview">
                <h3>Original Code ({filename})</h3>
                <pre>{code}</pre>
              </div>

              <div className="refactor-operations">
                <h3>Select Refactoring Type</h3>
                <div className="operation-grid">
                  {REFACTOR_OPERATIONS.map(op => (
                    <button
                      key={op.id}
                      className={`operation-btn ${selectedOp?.id === op.id ? 'active' : ''}`}
                      onClick={() => setSelectedOp(op)}
                      title={op.description}
                    >
                      {op.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedOp?.id === 'custom' && (
                <div className="custom-refactor-prompt">
                  <label>Describe the refactoring</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Describe what you want to change..."
                    rows={3}
                  />
                </div>
              )}

              <button 
                className="btn btn-primary"
                onClick={refactorCode}
                disabled={isRefactoring}
              >
                {isRefactoring ? 'Refactoring...' : 'Apply Refactoring'}
              </button>
            </>
          ) : (
            <div className="refactor-result">
              <div className="refactor-actions">
                <button className="btn btn-ghost" onClick={copyRefactored}>
                  📋 Copy
                </button>
                <button className="btn btn-ghost" onClick={() => setRefactoredCode('')}>
                  ↩️ Back
                </button>
              </div>

              <div className="refactor-diff">
                <div className="diff-panel">
                  <h4>Original</h4>
                  <pre className="diff-old">{code}</pre>
                </div>
                <div className="diff-panel">
                  <h4>Refactored</h4>
                  <pre className="diff-new">{refactoredCode}</pre>
                </div>
              </div>

              <div className="apply-actions">
                <button className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleApply}>
                  ✓ Apply Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
