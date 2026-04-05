import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';

interface Persona {
  id: string;
  name: string;
  description: string;
  expertise: string[];
  style: string;
  instructions: string;
}

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'senior-dev',
    name: 'Senior Developer',
    description: 'Experienced developer focused on best practices, code quality, and architecture',
    expertise: ['System Design', 'Code Review', 'Performance Optimization', 'Security'],
    style: 'Technical, precise, and thorough',
    instructions: 'Provide production-ready code with proper error handling, TypeScript types, and comments. Consider edge cases and suggest improvements.'
  },
  {
    id: 'junior-dev',
    name: 'Junior Developer Mentor',
    description: 'Friendly mentor helping beginners learn programming',
    expertise: ['Teaching', 'Basic Concepts', 'Step-by-step Guidance', 'Code Examples'],
    style: 'Patient, encouraging, and educational',
    instructions: 'Explain concepts simply, provide examples, and encourage learning. Break down complex topics into smaller parts.'
  },
  {
    id: 'qa-engineer',
    name: 'QA Engineer',
    description: 'Quality assurance expert focused on testing and bug prevention',
    expertise: ['Testing Strategies', 'Edge Cases', 'Test Coverage', 'Bug Detection'],
    style: 'Thorough, methodical, and detail-oriented',
    instructions: 'Consider test cases, edge cases, and potential failure points. Suggest ways to verify correctness.'
  },
  {
    id: 'devops',
    name: 'DevOps Engineer',
    description: 'Infrastructure and deployment specialist',
    expertise: ['CI/CD', 'Docker', 'Kubernetes', 'Cloud Infrastructure', 'Monitoring'],
    style: 'Practical, automated, and reliable',
    instructions: 'Focus on automation, reproducibility, and operational excellence. Suggest deployment strategies and monitoring.'
  },
  {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Product-focused thinking for building user value',
    expertise: ['User Stories', 'Feature Planning', 'Prioritization', 'Business Value'],
    style: 'Strategic, user-centric, and practical',
    instructions: 'Consider user needs, business value, and implementation complexity. Suggest MVP approaches and future enhancements.'
  },
  {
    id: 'security-expert',
    name: 'Security Expert',
    description: 'Cybersecurity specialist focused on secure code',
    expertise: ['Security Audits', 'Vulnerability Assessment', 'Secure Coding', 'Compliance'],
    style: 'Vigilant, thorough, and risk-aware',
    instructions: 'Identify security vulnerabilities, suggest secure alternatives, and consider compliance requirements.'
  }
];

interface PromptEnhancerPanelProps {
  onClose: () => void;
  onInsertToChat?: (prompt: string) => void;
}

export default function PromptEnhancerPanel({ onClose, onInsertToChat }: PromptEnhancerPanelProps) {
  const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_PERSONAS[0]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [showPersonaEditor, setShowPersonaEditor] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [panelWidth, setPanelWidth] = useState(550);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { settings } = useSettings();
  const { showToast } = useToast();

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

  const allPersonas = [...DEFAULT_PERSONAS, ...customPersonas];

  const enhancePrompt = async () => {
    if (!inputPrompt.trim()) {
      showToast('Please enter a prompt to enhance', 'error');
      return;
    }

    setIsEnhancing(true);
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `You are a prompt enhancer. Enhance the user's prompt based on the following persona:

Persona: ${selectedPersona.name}
Description: ${selectedPersona.description}
Expertise: ${selectedPersona.expertise.join(', ')}
Style: ${selectedPersona.style}
Instructions: ${selectedPersona.instructions}

Your task is to rewrite/enhance the user's prompt to get better results from an AI assistant. Make it more specific, detailed, and tailored to this persona's expertise. Keep the core request but add context, constraints, and details that would help produce a better response.

Only output the enhanced prompt, no explanations.`
        },
        {
          role: 'user' as const,
          content: `Enhance this prompt:\n\n${inputPrompt}`
        }
      ];

      let model = settings.model;
      let providerId = 'ollama-default';
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'chat_general');
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
        'prompt_enhance'
      );
      const enhanced = result.content?.trim() || '';
      setEnhancedPrompt(enhanced);
      showToast('Prompt enhanced!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to enhance prompt', 'error');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(enhancedPrompt);
    showToast('Copied to clipboard!', 'success');
  };

  const handleInsert = () => {
    if (onInsertToChat) {
      onInsertToChat(enhancedPrompt);
      showToast('Prompt inserted to chat!', 'success');
    } else {
      navigator.clipboard.writeText(enhancedPrompt);
      showToast('Copied to clipboard!', 'success');
    }
  };

  const handleNewPersona = () => {
    setEditingPersona({
      id: `custom-${Date.now()}`,
      name: '',
      description: "",
      expertise: [],
      style: "",
      instructions: ""
    });
    setShowPersonaEditor(true);
  };

  const handleSavePersona = () => {
    if (!editingPersona?.name.trim()) {
      showToast('Persona name is required', 'error');
      return;
    }
    
    if (customPersonas.find(p => p.id === editingPersona.id)) {
      setCustomPersonas(customPersonas.map(p => p.id === editingPersona.id ? editingPersona : p));
    } else {
      setCustomPersonas([...customPersonas, editingPersona]);
    }
    setShowPersonaEditor(false);
    setEditingPersona(null);
  };

  const handleDeletePersona = (id: string) => {
    setCustomPersonas(customPersonas.filter(p => p.id !== id));
  };

  return (
    <div className="side-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="side-panel-resize-handle" onMouseDown={startResize} />
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          Prompt Enhancer
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
        {!showPersonaEditor ? (
          <>
            <div className="form-group">
              <label>Select Persona</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                {allPersonas.map(persona => (
                  <div
                    key={persona.id}
                    onClick={() => setSelectedPersona(persona)}
                    style={{
                      padding: '10px 12px',
                      background: selectedPersona.id === persona.id ? 'var(--accent-glow)' : 'var(--bg-tertiary)',
                      border: `1px solid ${selectedPersona.id === persona.id ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{persona.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {persona.description}
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-ghost"
                onClick={handleNewPersona}
                style={{ marginTop: '8px', width: '100%', fontSize: '12px' }}
              >
                + Create Custom Persona
              </button>
            </div>

            <div style={{ 
              padding: '12px', 
              background: 'var(--bg-primary)', 
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>
                {selectedPersona.name}
              </div>
              <div>Expertise: {selectedPersona.expertise?.join(', ') || 'General'}</div>
              <div>Style: {selectedPersona.style}</div>
            </div>

            <div className="form-group">
              <label>Your Prompt</label>
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Enter your prompt here..."
                rows={4}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={enhancePrompt}
              disabled={isEnhancing}
              style={{ width: '100%', marginBottom: '16px' }}
            >
              {isEnhancing ? 'Enhancing...' : 'Enhance Prompt'}
            </button>

            {enhancedPrompt && (
              <div className="form-group">
                <label>Enhanced Prompt</label>
                <div style={{
                  background: 'var(--bg-primary)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  marginBottom: '12px'
                }}>
                  {enhancedPrompt}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={handleCopy} style={{ flex: 1 }}>
                    Copy
                  </button>
                  <button className="btn btn-primary" onClick={handleInsert} style={{ flex: 1 }}>
                    Use in Chat
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setShowPersonaEditor(false)}
              style={{ marginBottom: '12px', fontSize: '12px' }}
            >
              ← Back to Personas
            </button>

            <div className="form-group">
              <label>Persona Name</label>
              <input
                type="text"
                value={editingPersona?.name || ''}
                onChange={(e) => setEditingPersona(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="e.g., Database Expert"
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                value={editingPersona?.description || ''}
                onChange={(e) => setEditingPersona(prev => prev ? { ...prev, description: e.target.value } : null)}
                placeholder="Brief description of this persona"
              />
            </div>

            <div className="form-group">
              <label>Expertise (comma-separated)</label>
              <input
                type="text"
                value={editingPersona?.expertise?.join(', ') || ''}
                onChange={(e) => setEditingPersona(prev => prev ? { ...prev, expertise: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : null)}
                placeholder="e.g., SQL, Performance, Indexing"
              />
            </div>

            <div className="form-group">
              <label>Communication Style</label>
              <input
                type="text"
                value={editingPersona?.style || ''}
                onChange={(e) => setEditingPersona(prev => prev ? { ...prev, style: e.target.value } : null)}
                placeholder="e.g., Concise and practical"
              />
            </div>

            <div className="form-group">
              <label>Instructions</label>
              <textarea
                value={editingPersona?.instructions || ''}
                onChange={(e) => setEditingPersona(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                placeholder="Instructions for how to enhance prompts..."
                rows={3}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" onClick={handleSavePersona} style={{ flex: 1 }}>
                Save Persona
              </button>
              {editingPersona && editingPersona.id.startsWith('custom-') && customPersonas.some(p => p.id === editingPersona.id) && (
                <button 
                  className="btn btn-ghost" 
                  onClick={() => { handleDeletePersona(editingPersona.id); setShowPersonaEditor(false); }}
                  style={{ color: 'var(--error)' }}
                >
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
