import { useState, useCallback, useEffect } from 'react';
import { useAgents, type AgentConfig, type CreateAgentInput, type UpdateAgentInput } from '../../store/AgentContext';
import { useToast } from '../../hooks/useToast';
import ToolPicker from './ToolPicker';
import KnowledgeUploader from './KnowledgeUploader';
import AgentTestConsole from './AgentTestConsole';
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
      { toolId: 'edit_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.html', '*.css', '*.scss', '*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.md', '**/*.html', '**/*.css', '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'build/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'html', 'css'],
      requireApproval: true,
      autoExecute: false,
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
      { toolId: 'edit_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'search_files', enabled: true },
      { toolId: 'execute_command', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.js', '*.py', '*.go', '*.rs', '*.java', '*.sql', '*.yaml', '*.json', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'build/**', 'secrets/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java'],
      requireApproval: true,
      autoExecute: false,
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
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.go', '*.java', '*.md', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'java'],
      requireApproval: false,
      autoExecute: false,
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
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.java', '*.md', '**/*.ts', '**/*.js', '**/*.py'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**', 'secrets/**'],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'java'],
      requireApproval: false,
      autoExecute: false,
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
      { toolId: 'edit_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', 'Dockerfile', 'docker-compose*.yml', '*.yaml', '*.yml', '*.json', '*.tf', '*.sh', 'Makefile', '**/Dockerfile', '**/*.yaml', '**/*.yml'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'secrets/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['yaml', 'json', 'hcl', 'bash', 'shell'],
      requireApproval: true,
      autoExecute: false,
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
      { toolId: 'edit_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.py', '*.sql', '*.yaml', '*.yml', '*.json', '*.scala', '*.java', '**/*.py', '**/*.sql', '**/*.yaml'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 20971520,
      allowedLanguages: ['python', 'sql', 'scala', 'java'],
      requireApproval: true,
      autoExecute: false,
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
      { toolId: 'edit_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'search_files', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['*', '**/*', '*.md', '*.txt', '*.rst', '*.html', '*.tex', '**/*.md'],
      blockedFilePatterns: ['*.env', 'node_modules/**', '.git/**', 'dist/**'],
      maxFileSize: 10485760,
      allowedLanguages: ['markdown', 'plaintext'],
      requireApproval: true,
      autoExecute: false,
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

  const updatePipelineStage = useCallback((stage: 'plan' | 'action' | 'review' | 'validate' | 'execute', enabled: boolean) => {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content agent-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Agent' : 'Create New Agent'}</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            Basic Info
          </button>
          <button
            className={`tab ${activeTab === 'prompt' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompt')}
          >
            System Prompt
          </button>
          <button
            className={`tab ${activeTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveTab('tools')}
          >
            Tools
          </button>
          <button
            className={`tab ${activeTab === 'knowledge' ? 'active' : ''}`}
            onClick={() => setActiveTab('knowledge')}
          >
            Knowledge
          </button>
          <button
            className={`tab ${activeTab === 'advanced' ? 'active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            Advanced
          </button>
        </div>
        {isEditing && agent && (
          <div className="modal-actions">
            <button className="btn btn-sm" onClick={() => setShowTestConsole(true)}>
              Test Agent
            </button>
          </div>
        )}

        <div className="modal-body">
          {activeTab === 'basic' && !isEditing && (
            <div className="form-section presets-section">
              <div className="form-group">
                <label>Start from a preset (optional)</label>
                <div className="presets-grid">
                  <button
                    className={`preset-card ${!presetId ? 'selected' : ''}`}
                    onClick={() => {
                      setPresetId(undefined);
                      setFormData(prev => ({
                        ...prev,
                        name: prev.name || '',
                        description: prev.description || '',
                        icon: prev.icon || '🤖',
                        systemPrompt: prev.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                        defaultModel: prev.defaultModel || 'qwen3-coder:480b-cloud',
                        enabledTools: prev.enabledTools || [],
                        constraints: prev.constraints || undefined,
                      }));
                    }}
                  >
                    <span className="preset-icon">✨</span>
                    <span className="preset-name">Blank Agent</span>
                    <span className="preset-desc">Start from scratch</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-web-developer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-web-developer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">🌐</span>
                    <span className="preset-name">Web Developer</span>
                    <span className="preset-desc">React, Vue, Angular</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-backend-developer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-backend-developer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">⚙️</span>
                    <span className="preset-name">Backend Developer</span>
                    <span className="preset-desc">APIs, microservices</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-code-reviewer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-code-reviewer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">🔍</span>
                    <span className="preset-name">Code Reviewer</span>
                    <span className="preset-desc">Quality & best practices</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-security-auditor' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-security-auditor');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">🔒</span>
                    <span className="preset-name">Security Auditor</span>
                    <span className="preset-desc">Vulnerability detection</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-devops-engineer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-devops-engineer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">🚀</span>
                    <span className="preset-name">DevOps Engineer</span>
                    <span className="preset-desc">CI/CD, Docker, K8s</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-data-engineer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-data-engineer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">📊</span>
                    <span className="preset-name">Data Engineer</span>
                    <span className="preset-desc">Pipelines, ETL</span>
                  </button>
                  <button
                    className={`preset-card ${presetId === 'preset-technical-writer' ? 'selected' : ''}`}
                    onClick={() => {
                      const preset = PRESETS.find(p => p.id === 'preset-technical-writer');
                      if (preset) applyPreset(preset);
                    }}
                  >
                    <span className="preset-icon">📝</span>
                    <span className="preset-name">Technical Writer</span>
                    <span className="preset-desc">Docs, README</span>
                  </button>
                </div>
              </div>
            </div>
          )}
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
                  rows={15}
                  className="code-textarea"
                />
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
                  <label>Pipeline Stages</label>
                  <span className="tooltip-icon">?</span>
                  <span className="tooltip-content">The pipeline determines how tasks are processed. Plan analyzes requirements, Action generates code, Review checks quality, Validate tests correctness, and Execute applies changes.</span>
                </div>
                <div className="pipeline-stages">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.pipelineStages?.stages?.plan?.enabled ?? true}
                      onChange={(e) => updatePipelineStage('plan', e.target.checked)}
                    />
                    Plan
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.pipelineStages?.stages?.action?.enabled ?? true}
                      onChange={(e) => updatePipelineStage('action', e.target.checked)}
                    />
                    Action (Code Generation)
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.pipelineStages?.stages?.review?.enabled ?? true}
                      onChange={(e) => updatePipelineStage('review', e.target.checked)}
                    />
                    Review
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.pipelineStages?.stages?.validate?.enabled ?? true}
                      onChange={(e) => updatePipelineStage('validate', e.target.checked)}
                    />
                    Validate
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.pipelineStages?.stages?.execute?.enabled ?? true}
                      onChange={(e) => updatePipelineStage('execute', e.target.checked)}
                    />
                    Execute
                  </label>
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
                    checked={formData.constraints?.requireApproval ?? true}
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

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving || !formData.name.trim()}
          >
            {isSaving ? 'Saving...' : (isEditing ? 'Update Agent' : 'Create Agent')}
          </button>
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
