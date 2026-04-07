export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  author?: string;
  tags: string[];
  systemPrompt: string;
  defaultModel: string;
  enabledTools: AgentToolConfig[];
  constraints: AgentConstraints;
  knowledgeBase: KnowledgeBaseConfig;
  pipelineStages: AgentPipelineConfig;
  conversationStarters?: string[];
}

export interface AgentToolConfig {
  toolId: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

export interface AgentConstraints {
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  maxFileSize: number;
  allowedLanguages: string[];
  requireApproval: boolean;
  autoExecute: boolean;
}

export interface KnowledgeBaseConfig {
  enabled: boolean;
  files: KnowledgeFile[];
  urls: string[];
  totalSize: number;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  path: string;
  type: 'text' | 'markdown' | 'code';
  size: number;
  embeddingId?: string;
  addedAt: number;
}

export interface AgentPipelineConfig {
  stages: {
    plan: { enabled: boolean; model?: string };
    action: { enabled: boolean; model?: string };
    review: { enabled: boolean; model?: string };
    validate: { enabled: boolean; model?: string };
    execute: { enabled: boolean; model?: string };
    [key: string]: { enabled: boolean; model?: string } | undefined;
  };
  maxRetries: number;
  timeoutMs: number;
  template?: string;
  enableAgentLoop?: boolean;
  approvalStages?: string[];
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  icon?: string;
  tags?: string[];
  systemPrompt?: string;
  defaultModel?: string;
  enabledTools?: AgentToolConfig[];
  constraints?: Partial<AgentConstraints>;
  knowledgeBase?: Partial<KnowledgeBaseConfig>;
  pipelineStages?: Partial<AgentPipelineConfig>;
  author?: string;
}

export type UpdateAgentInput = Partial<CreateAgentInput>;

export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  allowedFilePatterns: ['**/*'],
  blockedFilePatterns: [],
  maxFileSize: 10485760,
  allowedLanguages: [
    'typescript', 'javascript', 'python', 'java', 'go', 'rust',
    'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin', 'scala',
    'perl', 'lua', 'dart', 'groovy', 'haskell', 'elixir', 'erlang',
    'fsharp', 'visualbasic', 'r', 'matlab', 'objective-c',
    'html', 'css', 'scss', 'less', 'sql', 'graphql', 'shell',
    'yaml', 'json', 'xml', 'markdown', 'vue', 'svelte',
  ],
  requireApproval: false,
  autoExecute: true,
};

export const DEFAULT_KNOWLEDGE_BASE: KnowledgeBaseConfig = {
  enabled: false,
  files: [],
  urls: [],
  totalSize: 0,
};

export const DEFAULT_AGENT_PIPELINE: AgentPipelineConfig = {
  stages: {
    plan: { enabled: true },
    action: { enabled: true },
    review: { enabled: true },
    validate: { enabled: true },
    execute: { enabled: true },
  },
  maxRetries: 2,
  timeoutMs: 600000,
};

export function createDefaultAgentConfig(input: CreateAgentInput | Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: (input as Partial<AgentConfig>).id || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: input.name || 'Custom Agent',
    description: input.description || '',
    icon: input.icon || '🤖',
    version: (input as Partial<AgentConfig>).version || '1.0.0',
    createdAt: (input as Partial<AgentConfig>).createdAt || Date.now(),
    updatedAt: (input as Partial<AgentConfig>).updatedAt || Date.now(),
    author: input.author,
    tags: input.tags || [],
    systemPrompt: input.systemPrompt || 'You are a helpful AI assistant.',
    defaultModel: input.defaultModel || 'qwen3-coder:480b-cloud',
    enabledTools: input.enabledTools || [],
    constraints: { ...DEFAULT_AGENT_CONSTRAINTS, ...(input.constraints || {}) },
    knowledgeBase: input.knowledgeBase ? { ...DEFAULT_KNOWLEDGE_BASE, ...input.knowledgeBase } : DEFAULT_KNOWLEDGE_BASE,
    pipelineStages: input.pipelineStages ? { ...DEFAULT_AGENT_PIPELINE, ...input.pipelineStages } : DEFAULT_AGENT_PIPELINE,
  };
}

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'general' | 'code' | 'review' | 'security' | 'documentation';
  systemPrompt: string;
  defaultModel: string;
  enabledTools: AgentToolConfig[];
  constraints: AgentConstraints;
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'preset-web-developer',
    name: 'Web Developer',
    description: 'Specialized for building modern web applications with React, Vue, or Angular',
    icon: '🌐',
    category: 'code',
    systemPrompt: `You are an expert web developer AI assistant specialized in creating modern, responsive web applications.

Your expertise includes:
- Frontend frameworks: React, Vue, Angular, Svelte, Next.js
- CSS frameworks: Tailwind, Bootstrap, Material UI, Chakra UI
- Build tools: Vite, Webpack, esbuild
- Best practices: Component architecture, state management, responsive design, accessibility

When generating code:
1. Write semantic, accessible HTML
2. Use modern CSS (flexbox, grid, custom properties)
3. Follow framework-specific best practices
4. Include proper error handling
5. Add comments for complex logic`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'html', 'css'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-backend-developer',
    name: 'Backend Developer',
    description: 'Specialized for building APIs, microservices, and server applications',
    icon: '⚙️',
    category: 'code',
    systemPrompt: `You are an expert backend developer AI assistant specialized in building robust, scalable server applications.

Your expertise includes:
- Languages: Node.js, Python, Go, Rust, Java, C#
- Frameworks: Express, FastAPI, Django, Spring Boot, .NET
- Databases: PostgreSQL, MySQL, MongoDB, Redis
- APIs: REST, GraphQL, gRPC
- Architecture: Microservices, Serverless, Event-driven

When generating code:
1. Write clean, maintainable code with proper error handling
2. Implement proper input validation and sanitization
3. Use appropriate data structures and algorithms
4. Consider scalability and performance
5. Follow security best practices`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
      { toolId: 'execute_command', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 10485760,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-code-reviewer',
    name: 'Code Reviewer',
    description: 'Specialized for reviewing code quality, security, and best practices',
    icon: '🔍',
    category: 'review',
    systemPrompt: `You are an expert code reviewer AI assistant specialized in identifying issues, improving code quality, and ensuring best practices.

Your expertise includes:
- Code quality: Readability, maintainability, complexity
- Security: Vulnerability detection, secure coding practices
- Performance: Optimization opportunities, bottlenecks
- Best practices: Design patterns, SOLID principles, clean code
- Testing: Test coverage, edge cases

When reviewing code:
1. Identify critical bugs and security issues first
2. Suggest specific, actionable improvements
3. Explain why changes are recommended
4. Consider the broader context and architecture
5. Balance perfection with pragmatism`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-security-auditor',
    name: 'Security Auditor',
    description: 'Specialized for identifying security vulnerabilities and recommending fixes',
    icon: '🔒',
    category: 'security',
    systemPrompt: `You are an expert security auditor AI assistant specialized in finding and mitigating security vulnerabilities.

Your expertise includes:
- OWASP Top 10 vulnerabilities
- Injection attacks (SQL, XSS, Command)
- Authentication and authorization issues
- Cryptography best practices
- Secure coding standards

When auditing code:
1. Look for common vulnerability patterns
2. Check input validation and sanitization
3. Verify authentication and authorization
4. Look for sensitive data exposure
5. Suggest specific fixes with code examples`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 5242880,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'java', 'csharp'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-devops-engineer',
    name: 'DevOps Engineer',
    description: 'Specialized for CI/CD, containerization, and infrastructure automation',
    icon: '🚀',
    category: 'code',
    systemPrompt: `You are an expert DevOps engineer AI assistant specialized in automating infrastructure and deployment processes.

Your expertise includes:
- Containerization: Docker, Kubernetes
- CI/CD: GitHub Actions, GitLab CI, Jenkins
- Infrastructure as Code: Terraform, Pulumi
- Cloud platforms: AWS, GCP, Azure
- Monitoring: Prometheus, Grafana, ELK Stack

When generating configurations:
1. Follow platform best practices
2. Include proper security configurations
3. Add health checks and monitoring
4. Make configurations reproducible
5. Include rollback strategies`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 10485760,
      allowedLanguages: ['yaml', 'json', 'hcl', 'bash', 'shell'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-data-engineer',
    name: 'Data Engineer',
    description: 'Specialized for data pipelines, ETL processes, and analytics',
    icon: '📊',
    category: 'code',
    systemPrompt: `You are an expert data engineer AI assistant specialized in building data pipelines and processing systems.

Your expertise includes:
- ETL/ELT processes
- Data warehouses: Snowflake, BigQuery, Redshift
- Stream processing: Kafka, Flink, Spark
- Data formats: Parquet, Avro, ORC
- Python: Pandas, PySpark, Dask

When generating code:
1. Optimize for data processing efficiency
2. Handle errors and data quality issues
3. Include proper logging and monitoring
4. Make transformations idempotent
5. Consider scalability and cost`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 20971520,
      allowedLanguages: ['python', 'sql', 'scala', 'java'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-technical-writer',
    name: 'Technical Writer',
    description: 'Specialized for creating documentation, README files, and API docs',
    icon: '📝',
    category: 'documentation',
    systemPrompt: `You are an expert technical writer AI assistant specialized in creating clear, comprehensive documentation.

Your expertise includes:
- README files and getting started guides
- API documentation
- Architecture decision records
- User manuals and tutorials
- Code documentation and comments

When writing documentation:
1. Start with the audience in mind
2. Use clear, simple language
3. Include code examples
4. Add visual aids where helpful
5. Keep documentation up to date`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 10485760,
      allowedLanguages: ['markdown', 'plaintext'],
      requireApproval: false,
      autoExecute: true,
    },
  },
  {
    id: 'preset-general-assistant',
    name: 'General Assistant',
    description: 'A balanced assistant for general purpose tasks and multi-language projects',
    icon: '🤖',
    category: 'general',
    systemPrompt: `You are a helpful AI assistant for general programming tasks.

Your expertise includes:
- Multiple programming languages
- Problem solving and debugging
- Code explanation and education
- Best practices and patterns
- Learning new technologies

When helping:
1. Understand the user's goals first
2. Provide clear explanations
3. Include working examples
4. Suggest improvements
5. Be patient and thorough`,
    defaultModel: 'qwen3-coder:480b-cloud',
    enabledTools: [
      { toolId: 'read_file', enabled: true },
      { toolId: 'write_file', enabled: true },
      { toolId: 'list_directory', enabled: true },
      { toolId: 'grep_search', enabled: true },
    ],
    constraints: {
      allowedFilePatterns: ['**/*'],
      blockedFilePatterns: [],
      maxFileSize: 10485760,
      allowedLanguages: ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'csharp', 'ruby', 'php'],
      requireApproval: false,
      autoExecute: true,
    },
  },
];
