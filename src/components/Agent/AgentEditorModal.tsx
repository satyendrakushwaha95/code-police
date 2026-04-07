import { useState, useCallback, useEffect } from 'react';
import { useAgents, type AgentConfig, type CreateAgentInput, type UpdateAgentInput } from '../../store/AgentContext';
import { useToast } from '../../hooks/useToast';
import ToolPicker from './ToolPicker';
import KnowledgeUploader from './KnowledgeUploader';
import AgentTestConsole from './AgentTestConsole';
import AgentGenerateBar, { type GeneratedAgentConfig } from './AgentGenerateBar';
import './Agent.css';

const ipcRenderer = (window as any).ipcRenderer;

interface AgentEditorModalProps {
  agent: AgentConfig | null;
  onClose: () => void;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant specialized in coding and software development.

Your responsibilities:
- Write clean, maintainable, and well-documented code
- Follow best practices and coding standards
- Consider performance, security, and maintainability
- Provide clear explanations when helpful

Guidelines:
1. Always verify your code is correct and secure
2. Add appropriate error handling
3. Consider edge cases
4. Write tests when applicable
5. Ask clarifying questions when requirements are unclear`;

interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  defaultModel: string;
  enabledTools: { toolId: string; enabled: boolean }[];
  constraints: {
    allowedFilePatterns: string[];
    blockedFilePatterns: string[];
    maxFileSize: number;
    allowedLanguages: string[];
    requireApproval: boolean;
    autoExecute: boolean;
  };
}

const PRESETS: AgentPreset[] = [
  {
    id: 'preset-web-developer',
    name: 'Web Developer',
    description: 'Specialized for building modern web applications',
    icon: '🌐',
    systemPrompt: `You are an expert web developer AI assistant specialized in creating modern, responsive web applications.

Your expertise includes:
- Frontend frameworks: React, Vue, Angular, Svelte, Next.js
- CSS frameworks: Tailwind, Bootstrap, Material UI
- Best practices: Component architecture, state management, responsive design

When generating code:
1. Write semantic, accessible HTML
2. Use modern CSS (flexbox, grid, custom properties)
3. Follow framework-specific best practices
4. Include proper error handling`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.html', '*.css', '*.scss', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md', '**/*.html', '**/*.css', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'build/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'html', 'css'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-backend-developer',
    name: 'Backend Developer',
    description: 'Specialized for building APIs and server applications',
    icon: '⚙️',
    systemPrompt: `You are an expert backend developer AI assistant specialized in building robust, scalable server applications.

Your expertise includes:
- Languages: Node.js, Python, Go, Rust, Java
- Frameworks: Express, FastAPI, Django, Spring Boot
- APIs: REST, GraphQL
- Best practices: Error handling, security, scalability`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
      { toolId: 'execute_command', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.js', '*.py', '*.go', '*.rs', '*.java', '*.sql', '*.yaml', '*.json', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'build/**', 'secrets/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-code-reviewer',
    name: 'Code Reviewer',
    description: 'Specialized for reviewing code quality',
    icon: '🔍',
    systemPrompt: `You are an expert code reviewer AI assistant specialized in identifying issues and improving code quality.

Your expertise includes:
- Code quality: Readability, maintainability, complexity
- Security: Vulnerability detection
- Best practices: Design patterns, SOLID principles

When reviewing code:
1. Identify critical bugs and security issues first
2. Suggest specific, actionable improvements
3. Explain why changes are recommended`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.go', '*.java', '*.md', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'java'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-security-auditor',
    name: 'Security Auditor',
    description: 'Specialized for security vulnerability detection',
    icon: '🔒',
    systemPrompt: `You are an expert security auditor AI assistant specialized in finding security vulnerabilities.

Your expertise includes:
- OWASP Top 10 vulnerabilities
- Injection attacks (SQL, XSS, Command)
- Authentication and authorization issues

When auditing code:
1. Look for common vulnerability patterns
2. Check input validation and sanitization
3. Suggest specific fixes with code examples`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java', '*.md', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'secrets/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'java'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-devops-engineer',
    name: 'DevOps Engineer',
    description: 'Specialized for CI/CD and infrastructure',
    icon: '🚀',
    systemPrompt: `You are an expert DevOps engineer AI assistant specialized in automating infrastructure.

Your expertise includes:
- Containerization: Docker, Kubernetes
- CI/CD: GitHub Actions, GitLab CI
- Infrastructure as Code: Terraform

When generating configurations:
1. Follow platform best practices
2. Include proper security configurations
3. Add health checks and monitoring`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', 'Dockerfile', 'docker-compose*.yml', '*.yaml', '*.yml', '*.json', '*.tf', '*.sh', 'Makefile', '**/Dockerfile', '**/*.yaml', '**/*.yml'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'secrets/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['yaml', 'json', 'hcl', 'bash', 'shell'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-data-engineer',
    name: 'Data Engineer',
    description: 'Specialized for data pipelines and ETL',
    icon: '📊',
    systemPrompt: `You are an expert data engineer AI assistant specialized in building data pipelines.

Your expertise includes:
- ETL/ELT processes
- Data formats: Parquet, Avro, ORC
- Python: Pandas, PySpark

When generating code:
1. Optimize for data processing efficiency
2. Handle errors and data quality issues
3. Consider scalability and cost`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.py', '*.sql', '*.yaml', '*.yml', '*.json', '*.scala', '*.java', '**/*.py', '**/*.sql', '**/*.yaml'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 20971520,
      allowedLanguages: ['python', 'sql', 'scala', 'java'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-technical-writer',
    name: 'Technical Writer',
    description: 'Specialized for documentation',
    icon: '📝',
    systemPrompt: `You are an expert technical writer AI assistant specialized in creating documentation.

Your expertise includes:
- README files and getting started guides
- API documentation
- Architecture decision records

When writing documentation:
1. Start with the audience in mind
2. Use clear, simple language
3. Include code examples`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.md', '*.txt', '*.rst', '*.html', '*.tex', '**/*.md'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['markdown', 'plaintext'],
      requireApproval: false,
      autoExecute: true,
    },
  },
];

export default function AgentEditorModal({ agent, onClose }: AgentEditorModalProps) {
  const { createAgent, updateAgent } = useAgents();
  const { showToast } = useToast();
  const isEditing = agent !== null;

  const [formData, setFormData] = useState<CreateAgentInput>({
    name: agent?.name || '',
    description: agent?.description || '',
    icon: agent?.icon || '🤖',
    tags: agent?.tags || [],
    systemPrompt: agent?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    defaultModel: agent?.defaultModel || 'qwen3-coder:480b-cloud',
    enabledTools: agent?.enabledTools || [],
    constraints: agent?.constraints ? { ...agent.constraints } : undefined,
    pipelineStages: agent?.pipelineStages ? { ...agent.pipelineStages } : undefined,
    conversationStarters: agent?.conversationStarters || [],
  });

  const [knowledgeFiles, setKnowledgeFiles] = useState<any[]>(agent?.knowledgeBase?.files || []);

  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'prompt' | 'tools' | 'knowledge' | 'advanced'>('basic');
  const [showTestConsole, setShowTestConsole] = useState(false);
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const result = await ipcRenderer.invoke('ollama:listModels');
        const models = (result.models || []).map((m: { name: string }) => m.name);
        setAvailableModels(models);
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
  }, []);

  const applyGenerated = useCallback((config: GeneratedAgentConfig) => {
    setFormData(prev => ({
      ...prev,
      name: config.name,
      description: config.description,
      icon: config.icon,
      tags: config.tags || [],
      systemPrompt: config.systemPrompt,
      enabledTools: (config.enabledTools || []).map(t => ({ toolId: t, enabled: true })),
      constraints: {
        allowedFilePatterns: config.allowedFilePatterns || ['*', '**/*'],
        blockedFilePatterns: config.blockedFilePatterns || ['*.env', 'node_modules/**', '.git/**'],
        maxFileSize: 10485760,
        allowedLanguages: config.allowedLanguages || [],
        requireApproval: config.requireApproval ?? false,
        autoExecute: true,
      },
      pipelineStages: config.pipelineStages ? {
        stages: {
          plan: { enabled: config.pipelineStages.plan ?? true },
          action: { enabled: config.pipelineStages.action ?? true },
          review: { enabled: config.pipelineStages.review ?? true },
          validate: { enabled: config.pipelineStages.validate ?? true },
          execute: { enabled: config.pipelineStages.execute ?? true },
        },
        maxRetries: 2,
        timeoutMs: 600000,
      } : prev.pipelineStages,
      conversationStarters: config.conversationStarters || [],
    }));
    showToast(`Agent "${config.name}" generated! Review and save.`, 'success');
  }, [showToast]);

  const applyPreset = useCallback((preset: AgentPreset) => {
    setPresetId(preset.id);
    setFormData(prev => ({
      ...prev,
      presetId: preset.id,
      name: preset.name,
      description: preset.description,
      icon: preset.icon,
      systemPrompt: preset.systemPrompt,
      defaultModel: preset.defaultModel,
      enabledTools: [...preset.enabledTools],
      constraints: { ...preset.constraints },
    }));
  }, []);

  const handleInputChange = useCallback((
    field: keyof CreateAgentInput,
    value: string | string[] | undefined
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags?.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tag],
      }));
      setTagInput('');
    }
  }, [tagInput, formData.tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || [],
    }));
  }, []);

  const handleToolsChange = useCallback((tools: typeof formData.enabledTools) => {
    setFormData(prev => ({ ...prev, enabledTools: tools }));
  }, []);

  const updatePipelineStageModel = useCallback((stage: string, model: string) => {
    setFormData(prev => {
      const currentStages = prev.pipelineStages?.stages || {};
      const currentStage = currentStages[stage] || { enabled: true };
      return {
        ...prev,
        pipelineStages: {
          ...prev.pipelineStages,
          stages: {
            ...currentStages,
            [stage]: { ...currentStage, model: model || undefined },
          },
        },
      };
    });
  }, []);

  const updatePipelineStage = useCallback((stage: string, enabled: boolean) => {
    setFormData(prev => {
      const currentStages = prev.pipelineStages?.stages || {
        plan: { enabled: true },
        action: { enabled: true },
        review: { enabled: true },
        validate: { enabled: true },
        execute: { enabled: true },
      };
      return {
        ...prev,
        pipelineStages: {
          ...prev.pipelineStages,
          stages: {
            ...currentStages,
            [stage]: { enabled },
          },
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) {
      showToast('Agent name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && agent) {
        const updateData: UpdateAgentInput = {
          ...formData,
        };
        await updateAgent(agent.id, updateData);
        showToast(`Updated ${formData.name}`, 'success');
      } else {
        await createAgent(formData);
        showToast(`Created ${formData.name}`, 'success');
      }
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save agent', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [formData, isEditing, agent, createAgent, updateAgent, showToast, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }, [handleAddTag]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content agent-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? `Edit: ${formData.name || 'Agent'}` : 'Create New Agent'}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isEditing && agent && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTestConsole(true)}>Test</button>
            )}
            <button className="btn-icon" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {!isEditing && (
          <AgentGenerateBar onGenerated={applyGenerated} />
        )}

        <div className="agent-builder-body">
          {/* Preset sidebar */}
          {!isEditing && (
            <div className="agent-builder-sidebar">
              <div className="preset-sidebar-label">Presets</div>
              <button className={`preset-sidebar-item ${!presetId ? 'active' : ''}`} onClick={() => { setPresetId(undefined); }}>
                <span className="preset-sidebar-icon">✨</span>
                <span className="preset-sidebar-name">Blank</span>
              </button>
              {PRESETS.map(p => (
                <button key={p.id} className={`preset-sidebar-item ${presetId === p.id ? 'active' : ''}`} onClick={() => applyPreset(p)}>
                  <span className="preset-sidebar-icon">{p.icon}</span>
                  <span className="preset-sidebar-name">{p.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="agent-builder-main">
            <div className="tabs">
              <button className={`tab ${activeTab === 'basic' ? 'active' : ''}`} onClick={() => setActiveTab('basic')}>Identity</button>
              <button className={`tab ${activeTab === 'prompt' ? 'active' : ''}`} onClick={() => setActiveTab('prompt')}>Prompt</button>
              <button className={`tab ${activeTab === 'tools' ? 'active' : ''}`} onClick={() => setActiveTab('tools')}>Tools</button>
              <button className={`tab ${activeTab === 'knowledge' ? 'active' : ''}`} onClick={() => setActiveTab('knowledge')}>Knowledge</button>
              <button className={`tab ${activeTab === 'advanced' ? 'active' : ''}`} onClick={() => setActiveTab('advanced')}>Pipeline</button>
            </div>

            <div className="modal-body">
          {activeTab === 'basic' && (
            <div className="form-section">
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="My Custom Agent"
                />
              </div>

              <div className="form-group">
                <label htmlFor="icon">Icon</label>
                <div className="icon-picker">
                  <input
                    id="icon"
                    type="text"
                    value={formData.icon}
                    onChange={(e) => handleInputChange('icon', e.target.value)}
                    placeholder="🤖"
                    className="icon-input"
                  />
                  <div className="icon-suggestions">
                    {['🤖', '💻', '🔧', '📝', '🔍', '📋', '🚀', '🎯', '💡', '⚡'].map(emoji => (
                      <button
                        key={emoji}
                        className={`icon-btn ${formData.icon === emoji ? 'active' : ''}`}
                        onClick={() => handleInputChange('icon', emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="A brief description of what this agent does..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label htmlFor="model">Default Model</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">The AI model used by default for this agent. Can be overridden per-task.</span>
                </div>
                <select
                  id="model"
                  value={formData.defaultModel}
                  onChange={(e) => handleInputChange('defaultModel', e.target.value)}
                >
                  {availableModels.length === 0 && (
                    <option value="" disabled>Loading models...</option>
                  )}
                  {availableModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                  {formData.defaultModel && !availableModels.includes(formData.defaultModel) && (
                    <option value={formData.defaultModel}>{formData.defaultModel} (not installed)</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Tags</label>
                <div className="tags-input">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a tag..."
                  />
                  <button className="btn btn-sm" onClick={handleAddTag}>Add</button>
                </div>
                {formData.tags && formData.tags.length > 0 && (
                  <div className="tags-list">
                    {formData.tags.map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Conversation Starters</label>
                <p className="help-text">Suggested prompts shown when this agent is selected in chat.</p>
                <div className="starters-list">
                  {(formData.conversationStarters || []).map((s, i) => (
                    <div key={i} className="starter-item">
                      <input
                        type="text"
                        value={s}
                        onChange={e => {
                          const updated = [...(formData.conversationStarters || [])];
                          updated[i] = e.target.value;
                          setFormData(prev => ({ ...prev, conversationStarters: updated }));
                        }}
                        placeholder="e.g. Build a login form with React"
                      />
                      <button className="btn-icon btn-sm" onClick={() => {
                        setFormData(prev => ({ ...prev, conversationStarters: (prev.conversationStarters || []).filter((_, j) => j !== i) }));
                      }}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                  {(formData.conversationStarters || []).length < 5 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setFormData(prev => ({ ...prev, conversationStarters: [...(prev.conversationStarters || []), ''] }));
                    }}>+ Add Starter</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="form-section">
              <div className="form-group">
                <label htmlFor="systemPrompt">System Prompt</label>
                <p className="help-text">
                  This defines how your agent behaves and what it specializes in.
                </p>
                <textarea
                  id="systemPrompt"
                  value={formData.systemPrompt}
                  onChange={(e) => handleInputChange('systemPrompt', e.target.value)}
                  placeholder="You are a helpful AI assistant..."
                  rows={12}
                  className="code-textarea"
                />
                <div className="prompt-preview-bar">
                  <span className="prompt-preview-stat">
                    ~{Math.ceil((formData.systemPrompt?.length || 0) / 4)} tokens
                  </span>
                  <span className="prompt-preview-stat">
                    {(formData.systemPrompt?.length || 0).toLocaleString()} chars
                  </span>
                  <span className="prompt-preview-stat">
                    {(formData.systemPrompt?.split('\n').length || 0)} lines
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div className="form-section">
              <div className="form-group">
                <label>Enabled Tools</label>
                <p className="help-text">
                  Select which tools this agent can use.
                </p>
                <ToolPicker
                  selectedTools={formData.enabledTools || []}
                  onChange={handleToolsChange}
                />
              </div>
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div className="form-section">
              <div className="form-group">
                <label>Knowledge Base</label>
                <p className="help-text">
                  Add files to give your agent context about your codebase or domain.
                </p>
                <KnowledgeUploader
                  files={knowledgeFiles}
                  agentId={agent?.id || 'new'}
                  onFilesChange={setKnowledgeFiles}
                />
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="form-section">
              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label>Pipeline Template</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">The template determines which stages run and in what order. Each template is optimized for a different workflow.</span>
                </div>
                <select
                  value={formData.pipelineStages?.template || 'standard'}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    pipelineStages: { ...prev.pipelineStages, template: e.target.value },
                  }))}
                >
                  <option value="standard">🔄 Standard — Plan → Action → Review → Validate → Execute</option>
                  <option value="quick-fix">⚡ Quick Fix — Plan → Action → Execute</option>
                  <option value="deep-review">🔍 Deep Review — Research → Plan → Action → Review → Security → Validate → Execute</option>
                  <option value="docs-only">📝 Docs Only — Research → Plan → Action → Review</option>
                  <option value="refactor">🔧 Refactor — Research → Action → Review → Validate → Execute</option>
                  <option value="complex">🧩 Complex Task — Research → Decompose → Plan → Action → Review → Validate → Execute</option>
                </select>
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label>Tool Use (Agent Loop)</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">When enabled, the Action stage can read files, search code, and run commands during code generation — iterating until done instead of a single LLM call.</span>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={formData.pipelineStages?.enableAgentLoop ?? false}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      pipelineStages: { ...prev.pipelineStages, enableAgentLoop: e.target.checked },
                    }))}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label>Stage Configuration</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">Enable/disable stages and assign a specific model per stage. "Use Router" uses the model configured in Settings → Model Router.</span>
                </div>
                <div className="pipeline-stage-config">
                  {[
                    { id: 'research', label: 'Research', hint: 'Codebase analysis' },
                    { id: 'plan', label: 'Plan', hint: 'Task planning' },
                    { id: 'decompose', label: 'Decompose', hint: 'Break into subtasks' },
                    { id: 'action', label: 'Action', hint: 'Code generation' },
                    { id: 'review', label: 'Review', hint: 'Code quality check' },
                    { id: 'security', label: 'Security', hint: 'Vulnerability scan' },
                    { id: 'validate', label: 'Validate', hint: 'Acceptance criteria' },
                    { id: 'execute', label: 'Execute', hint: 'Apply file changes' },
                  ].map(stg => (
                    <div key={stg.id} className="pipeline-stage-row">
                      <label className="stage-toggle">
                        <input
                          type="checkbox"
                          checked={formData.pipelineStages?.stages?.[stg.id]?.enabled ?? true}
                          onChange={(e) => updatePipelineStage(stg.id, e.target.checked)}
                        />
                        <div className="stage-info">
                          <span className="stage-label">{stg.label}</span>
                          <span className="stage-hint">{stg.hint}</span>
                        </div>
                      </label>
                      {stg.id !== 'execute' && (
                        <select
                          className="stage-model-select"
                          value={formData.pipelineStages?.stages?.[stg.id]?.model || ''}
                          onChange={(e) => updatePipelineStageModel(stg.id, e.target.value)}
                          disabled={!(formData.pipelineStages?.stages?.[stg.id]?.enabled ?? true)}
                        >
                          <option value="">Use Router Default</option>
                          {availableModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label>Approval Checkpoints</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">Select stages where the pipeline pauses for your review before continuing. This enables human-in-the-loop control.</span>
                </div>
                <p className="help-text">The pipeline will pause after these stages and wait for your approval in chat.</p>
                <div className="approval-stages-grid">
                  {[
                    { id: 'plan', label: 'Plan', hint: 'Review the task breakdown' },
                    { id: 'action', label: 'Action', hint: 'Review generated code' },
                    { id: 'review', label: 'Review', hint: 'Review code quality verdict' },
                    { id: 'security', label: 'Security', hint: 'Review security scan results' },
                  ].map(stg => (
                    <label key={stg.id} className="approval-stage-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.pipelineStages?.approvalStages?.includes(stg.id) ?? false}
                        onChange={(e) => {
                          const current = formData.pipelineStages?.approvalStages || [];
                          const updated = e.target.checked
                            ? [...current, stg.id]
                            : current.filter(s => s !== stg.id);
                          setFormData(prev => ({
                            ...prev,
                            pipelineStages: { ...prev.pipelineStages, approvalStages: updated },
                          }));
                        }}
                      />
                      <div className="approval-stage-info">
                        <span className="approval-stage-name">Pause after {stg.label}</span>
                        <span className="approval-stage-hint">{stg.hint}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label>Max Retries</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">Maximum number of times to retry a failed stage before giving up.</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={formData.pipelineStages?.maxRetries ?? 2}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    pipelineStages: {
                      ...prev.pipelineStages,
                      maxRetries: parseInt(e.target.value) || 2,
                    },
                  }))}
                />
              </div>

              <div className="form-group">
                <div className="tooltip-wrapper">
                  <label htmlFor="requireApproval">Require Approval</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">When enabled, you'll be asked to confirm before any file changes are applied to your project.</span>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={formData.constraints?.requireApproval ?? false}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      constraints: {
                        ...prev.constraints,
                        requireApproval: e.target.checked,
                      },
                    }))}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          )}
            </div>

            <div className="agent-builder-footer">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving || !formData.name.trim()}
              >
                {isSaving ? 'Saving...' : (isEditing ? 'Update Agent' : 'Create Agent')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showTestConsole && agent && (
        <AgentTestConsole
          agent={agent}
          onClose={() => setShowTestConsole(false)}
        />
      )}
    </div>
  );
}
