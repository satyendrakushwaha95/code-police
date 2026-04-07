import { useState } from 'react';
import { ollamaService } from '../../services/ollama';
import { useSettings } from '../../store/SettingsContext';
import './Agent.css';

const ipcRenderer = (window as any).ipcRenderer;

interface GeneratedAgentConfig {
  name: string;
  description: string;
  icon: string;
  tags: string[];
  systemPrompt: string;
  enabledTools: string[];
  allowedLanguages: string[];
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  requireApproval: boolean;
  pipelineStages: Record<string, boolean>;
  conversationStarters: string[];
}

interface AgentGenerateBarProps {
  onGenerated: (config: GeneratedAgentConfig) => void;
}

const AVAILABLE_TOOL_IDS = [
  'read_file', 'write_file', 'append_file', 'delete_file',
  'list_directory', 'create_directory', 'execute_command',
  'file_exists', 'get_file_info', 'grep_search', 'find_files',
  'get_file_diff', 'git_status', 'git_log', 'git_commit',
  'http_request', 'fetch_url', 'run_tests', 'lint_code',
  'format_code', 'get_timestamp', 'calculate', 'read_env',
];

const GENERATE_PROMPT = `You are an AI agent configuration generator. Given a user's description, create a complete agent configuration.

Available tools (pick only the relevant ones):
- read_file: Read file contents
- write_file: Create/overwrite files
- append_file: Append to files
- delete_file: Delete files
- list_directory: List directory contents
- create_directory: Create directories
- execute_command: Run shell commands (dangerous — only enable if needed)
- file_exists: Check file existence
- get_file_info: Get file metadata
- grep_search: Search code by pattern
- find_files: Find files by name
- get_file_diff: Get git diff
- git_status: Git repo status
- git_log: View commit history
- git_commit: Create commits
- http_request: Make HTTP requests
- fetch_url: Fetch web content
- run_tests: Run test suites
- lint_code: Run linters
- format_code: Format code
- get_timestamp: Get current time
- calculate: Math calculations
- read_env: Read environment variables

Respond with ONLY valid JSON matching this exact schema:
{
  "name": "string (2-4 words, professional)",
  "description": "string (1 sentence, what this agent specializes in)",
  "icon": "single emoji that represents this agent's role",
  "tags": ["3-5 relevant lowercase tags"],
  "systemPrompt": "detailed expert system prompt (200-400 words) defining the agent's personality, expertise, guidelines, and output format preferences",
  "enabledTools": ["tool_id_1", "tool_id_2"],
  "allowedLanguages": ["language1", "language2"],
  "allowedFilePatterns": ["*.ext1", "*.ext2", "**/*"],
  "blockedFilePatterns": ["*.env", "node_modules/**", ".git/**"],
  "requireApproval": false,
  "pipelineStages": { "plan": true, "action": true, "review": true, "validate": true, "execute": true },
  "conversationStarters": ["short prompt 1 (5-10 words)", "short prompt 2", "short prompt 3", "short prompt 4"]
}

Rules for the systemPrompt:
- Write it as a direct instruction to the AI ("You are an expert...")
- Include specific expertise areas with bullet points
- Include numbered guidelines for how to approach tasks
- Mention preferred patterns, frameworks, or approaches relevant to the specialty
- Be specific, not generic — tailor it to the described role

Rules for conversationStarters:
- Each should be a short, actionable task (5-10 words)
- Relevant to the agent's specialty
- Diverse — cover different aspects of the agent's capabilities`;

export default function AgentGenerateBar({ onGenerated }: AgentGenerateBarProps) {
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  const handleGenerate = async () => {
    const text = description.trim();
    if (!text || text.length < 10) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await ollamaService.chatComplete(
        'ollama-default',
        settings.model,
        [
          { role: 'system', content: GENERATE_PROMPT },
          { role: 'user', content: `Create an agent for: ${text}` },
        ],
        { temperature: 0.5, max_tokens: 2000 },
        'agent_generation'
      );

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        setError('Failed to parse AI response. Try again with a more specific description.');
        return;
      }

      const parsed = JSON.parse(jsonMatch[0]) as GeneratedAgentConfig;

      // Validate tool IDs
      parsed.enabledTools = (parsed.enabledTools || []).filter(t => AVAILABLE_TOOL_IDS.includes(t));

      if (!parsed.name || !parsed.systemPrompt) {
        setError('Generated config is incomplete. Try a more detailed description.');
        return;
      }

      onGenerated(parsed);
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Generation failed. Check your model connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="agent-generate-bar">
      <div className="generate-input-row">
        <div className="generate-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
            <path d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/>
          </svg>
        </div>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
          placeholder="Describe your agent... e.g. 'React performance optimizer that reviews code for re-renders'"
          disabled={isGenerating}
          className="generate-input"
        />
        <button
          className={`btn btn-primary generate-btn ${isGenerating ? 'generating' : ''}`}
          onClick={handleGenerate}
          disabled={isGenerating || description.trim().length < 10}
        >
          {isGenerating ? (
            <>
              <svg className="generate-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93"/></svg>
              Generating...
            </>
          ) : (
            'Generate Agent'
          )}
        </button>
      </div>
      {error && <div className="generate-error">{error}</div>}
    </div>
  );
}

export type { GeneratedAgentConfig };
