/**
 * Jarvis-style Natural Language Command Router
 * 
 * Intercepts user messages before they reach the LLM.
 * Detects actionable intents and executes them directly,
 * showing results inline in the chat.
 */

const ipcRenderer = (window as any).ipcRenderer;

export type CommandIntent =
  | 'terminal'
  | 'git_status'
  | 'git_log'
  | 'git_commit'
  | 'git_diff'
  | 'search_code'
  | 'read_file'
  | 'list_dir'
  | 'remember'
  | 'recall'
  | 'onboard'
  | 'open_scan'
  | 'open_findings'
  | 'open_report'
  | 'open_settings'
  | 'open_files'
  | 'open_terminal'
  | 'open_agents'
  | 'open_usage'
  | 'new_chat'
  | 'none';

export interface CommandResult {
  intent: CommandIntent;
  executed: boolean;
  output?: string;
  error?: string;
  uiAction?: string;
  originalInput: string;
  displayMessage: string;
}

interface IntentPattern {
  intent: CommandIntent;
  patterns: RegExp[];
  extract?: (input: string, match: RegExpMatchArray) => Record<string, string>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // ── Slash commands (highest priority) ──
  { intent: 'terminal', patterns: [/^\/run\s+(.+)/i, /^\/exec\s+(.+)/i, /^\/shell\s+(.+)/i, /^\$\s*(.+)/] },
  { intent: 'git_status', patterns: [/^\/git\s+status$/i] },
  { intent: 'git_log', patterns: [/^\/git\s+log$/i, /^\/git\s+log\s+(\d+)$/i] },
  { intent: 'git_diff', patterns: [/^\/git\s+diff$/i] },
  { intent: 'git_commit', patterns: [/^\/git\s+commit\s+(.+)/i] },
  { intent: 'search_code', patterns: [/^\/search\s+(.+)/i, /^\/grep\s+(.+)/i, /^\/find\s+(.+)/i] },
  { intent: 'read_file', patterns: [/^\/cat\s+(.+)/i, /^\/read\s+(.+)/i, /^\/open\s+file\s+(.+)/i] },
  { intent: 'list_dir', patterns: [/^\/ls$/i, /^\/ls\s+(.+)/i, /^\/dir$/i, /^\/dir\s+(.+)/i] },
  { intent: 'open_scan', patterns: [/^\/scan$/i] },
  { intent: 'open_findings', patterns: [/^\/findings$/i] },
  { intent: 'open_report', patterns: [/^\/report$/i] },
  { intent: 'open_settings', patterns: [/^\/settings$/i, /^\/config$/i] },
  { intent: 'open_files', patterns: [/^\/files$/i, /^\/explorer$/i] },
  { intent: 'open_terminal', patterns: [/^\/terminal$/i, /^\/term$/i] },
  { intent: 'open_agents', patterns: [/^\/agents$/i] },
  { intent: 'open_usage', patterns: [/^\/usage$/i, /^\/costs$/i] },
  { intent: 'new_chat', patterns: [/^\/new$/i, /^\/clear$/i] },
  { intent: 'onboard', patterns: [/^\/onboard$/i, /^\/analyze$/i] },
  { intent: 'remember', patterns: [/^\/remember\s+(.+)/i] },
  { intent: 'recall', patterns: [/^\/recall$/i, /^\/memories$/i, /^\/memory$/i] },

  // ── Natural language patterns ──
  { intent: 'terminal', patterns: [
    /^run\s+(.+)/i,
    /^execute\s+(.+)/i,
    /^install\s+([\w@\-\/\.]+)/i,
    /^npm\s+(.+)/i,
    /^yarn\s+(.+)/i,
    /^pnpm\s+(.+)/i,
    /^pip\s+(.+)/i,
    /^python\s+(.+)/i,
    /^node\s+(.+)/i,
    /^npx\s+(.+)/i,
    /^cargo\s+(.+)/i,
    /^go\s+(run|build|test|mod)\s*(.*)/i,
    /^docker\s+(.+)/i,
    /^make\s*(.*)/i,
  ]},
  { intent: 'git_status', patterns: [
    /^(what('?s|\s+is)\s+the\s+)?git\s+status/i,
    /^show\s+(me\s+)?(the\s+)?git\s+status/i,
    /^what('?s|\s+has)\s+changed\??$/i,
    /^any\s+(changes|modifications)\??$/i,
    /^status$/i,
  ]},
  { intent: 'git_log', patterns: [
    /^(show\s+(me\s+)?)?(recent\s+)?commits?\??$/i,
    /^git\s+log$/i,
    /^(show\s+(me\s+)?)?(the\s+)?commit\s+history/i,
    /^what\s+(were|was)\s+the\s+(last|recent)\s+commits?\??$/i,
  ]},
  { intent: 'git_diff', patterns: [
    /^(show\s+(me\s+)?)?(the\s+)?diff$/i,
    /^what\s+(did\s+)?(i|we)\s+change\??$/i,
    /^show\s+(me\s+)?changes$/i,
    /^git\s+diff$/i,
  ]},
  { intent: 'git_commit', patterns: [
    /^commit\s+(with\s+message\s+)?["']?(.+?)["']?$/i,
    /^save\s+(my\s+)?changes\s*(as|with)?\s*["']?(.+?)["']?$/i,
  ]},
  { intent: 'search_code', patterns: [
    /^search\s+(for\s+|the\s+codebase\s+for\s+)?["']?(.+?)["']?$/i,
    /^find\s+(where|all|every|the)\s+(.+)/i,
    /^grep\s+(.+)/i,
    /^where\s+(is|are|do\s+we)\s+(.+)/i,
  ]},
  { intent: 'list_dir', patterns: [
    /^(list|show)\s+(me\s+)?(the\s+)?files(\s+in\s+(.+))?$/i,
    /^what('?s|\s+is)\s+in\s+(this\s+)?(folder|directory|dir)\??$/i,
    /^ls$/i,
  ]},
  { intent: 'onboard', patterns: [
    /^onboard\s+(this\s+)?project$/i,
    /^analyze\s+(this\s+)?(project|codebase|repo)$/i,
    /^scan\s+(this\s+)?(project|codebase|repo)$/i,
    /^(explain|understand|describe)\s+(this\s+)?(project|codebase|repo)$/i,
    /^what\s+is\s+this\s+(project|codebase|repo)\??$/i,
    /^give\s+me\s+(an?\s+)?(overview|summary)\s+(of\s+)?(this\s+)?(project|codebase|repo)$/i,
  ]},
  { intent: 'remember', patterns: [
    /^remember\s+(that\s+)?(.+)/i,
    /^(note|save|store)\s+(that\s+)?(.+)/i,
    /^don'?t\s+forget\s+(that\s+)?(.+)/i,
  ]},
  { intent: 'recall', patterns: [
    /^what\s+do\s+you\s+(remember|know)\s*(about\s+me)?\??$/i,
    /^(show|list)\s+(my\s+)?memories$/i,
  ]},
];

function detectIntent(input: string): { intent: CommandIntent; match: RegExpMatchArray | null } {
  const trimmed = input.trim();

  for (const entry of INTENT_PATTERNS) {
    for (const pattern of entry.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { intent: entry.intent, match };
      }
    }
  }

  return { intent: 'none', match: null };
}

function extractCommand(input: string, intent: CommandIntent, match: RegExpMatchArray): string {
  switch (intent) {
    case 'terminal': {
      // For "run X", "execute X", extract X. For "npm test", use whole input.
      if (/^(run|execute|\/run|\/exec|\/shell|\$)\s+/i.test(input.trim())) {
        return input.trim().replace(/^(\/run|\/exec|\/shell|\$|run|execute)\s+/i, '').trim();
      }
      // For "install express", prepend npm
      if (/^install\s+/i.test(input.trim())) {
        return `npm install ${input.trim().replace(/^install\s+/i, '')}`;
      }
      return input.trim();
    }
    case 'git_commit': {
      const commitMatch = input.match(/(?:commit|save\s+(?:my\s+)?changes)\s*(?:with\s+message\s+|as\s+|with\s+)?["']?(.+?)["']?$/i);
      return commitMatch?.[1] || 'Auto-commit';
    }
    case 'search_code': {
      const searchMatch = input.match(/(?:search|find|grep|where)\s+(?:for\s+|the\s+codebase\s+for\s+|where\s+|all\s+|every\s+|the\s+|is\s+|are\s+|do\s+we\s+)?["']?(.+?)["']?$/i);
      return searchMatch?.[1] || input;
    }
    case 'git_log': {
      const logMatch = input.match(/(\d+)/);
      return logMatch?.[1] || '10';
    }
    case 'list_dir': {
      const dirMatch = input.match(/(?:in|at)\s+(.+)$/i);
      return dirMatch?.[1] || '.';
    }
    case 'read_file': {
      const fileMatch = input.match(/(?:\/cat|\/read|\/open\s+file)\s+(.+)/i);
      return fileMatch?.[1] || '';
    }
    default:
      return input;
  }
}

export async function routeCommand(
  input: string,
  workspacePath?: string
): Promise<CommandResult> {
  const { intent, match } = detectIntent(input);

  if (intent === 'none') {
    return { intent: 'none', executed: false, originalInput: input, displayMessage: '' };
  }

  const command = match ? extractCommand(input, intent, match) : '';

  // UI panel openers — don't execute anything, just signal which panel to open
  const uiIntents: Record<string, string> = {
    open_scan: 'scan',
    open_findings: 'findings',
    open_report: 'report',
    open_settings: 'settings',
    open_files: 'files',
    open_terminal: 'terminal',
    open_agents: 'agents',
    open_usage: 'usage',
    new_chat: 'new_chat',
  };

  if (intent in uiIntents) {
    return {
      intent,
      executed: true,
      uiAction: uiIntents[intent],
      originalInput: input,
      displayMessage: `Opening ${uiIntents[intent].replace('_', ' ')}...`,
    };
  }

  // Executable commands — run via IPC tools
  try {
    let result: any;
    let displayMessage = '';

    switch (intent) {
      case 'onboard': {
        // This is handled specially in ChatView — signal it as a UI action
        return {
          intent,
          executed: true,
          uiAction: 'onboard',
          originalInput: input,
          displayMessage: 'Starting project onboarding...',
        };
      }

      case 'remember': {
        const factContent = input.replace(/^(\/remember|remember|note|save|store|don'?t\s+forget)\s+(that\s+)?/i, '').trim();
        if (!factContent) {
          return { intent, executed: false, originalInput: input, displayMessage: 'Nothing to remember. Usage: "remember that we use TypeScript"' };
        }
        result = await ipcRenderer.invoke('memory:add', {
          category: 'general',
          content: factContent,
          source: 'user',
          confidence: 1.0,
        });
        displayMessage = `**Remembered:** ${factContent}`;
        return { intent, executed: true, originalInput: input, displayMessage };
      }

      case 'recall': {
        const memories = await ipcRenderer.invoke('memory:getAll');
        if (!memories || memories.length === 0) {
          displayMessage = "I don't have any memories stored yet. Tell me things to remember with:\n\n`/remember <fact>` or just say *\"remember that ...\"*";
        } else {
          const lines = memories.map((m: any) =>
            `- **[${m.category}]** ${m.content} *(${new Date(m.createdAt).toLocaleDateString()})*`
          );
          displayMessage = `**My Memories** (${memories.length})\n\n${lines.join('\n')}`;
        }
        return { intent, executed: true, originalInput: input, displayMessage };
      }

      case 'terminal': {
        result = await ipcRenderer.invoke('tools:execute', 'execute_command', {
          command,
          cwd: workspacePath || process.cwd?.() || '.',
        });
        displayMessage = `**\`$ ${command}\`**\n\n${result.success
          ? `\`\`\`\n${result.output || '(no output)'}\n\`\`\``
          : `**Error:**\n\`\`\`\n${result.error || result.output || 'Command failed'}\n\`\`\``
        }`;
        break;
      }

      case 'git_status': {
        result = await ipcRenderer.invoke('tools:execute', 'git_status', {
          cwd: workspacePath,
        });
        displayMessage = `**Git Status**\n\n\`\`\`\n${result.output || result.error || 'No output'}\n\`\`\``;
        break;
      }

      case 'git_log': {
        const limit = parseInt(command) || 10;
        result = await ipcRenderer.invoke('tools:execute', 'git_log', {
          cwd: workspacePath,
          limit,
        });
        displayMessage = `**Recent Commits** (last ${limit})\n\n\`\`\`\n${result.output || result.error || 'No output'}\n\`\`\``;
        break;
      }

      case 'git_diff': {
        result = await ipcRenderer.invoke('tools:execute', 'get_file_diff', {
          cwd: workspacePath,
        });
        displayMessage = `**Git Diff**\n\n\`\`\`diff\n${result.output || '(no changes)'}\n\`\`\``;
        break;
      }

      case 'git_commit': {
        result = await ipcRenderer.invoke('tools:execute', 'git_commit', {
          message: command,
          files: '.',
          cwd: workspacePath,
        });
        displayMessage = result.success
          ? `**Committed:** ${command}\n\n\`\`\`\n${result.output}\n\`\`\``
          : `**Commit failed:**\n\`\`\`\n${result.error || result.output}\n\`\`\``;
        break;
      }

      case 'search_code': {
        result = await ipcRenderer.invoke('tools:execute', 'grep_search', {
          pattern: command,
          path: workspacePath || '.',
        });
        const output = result.output || '';
        const lines = output.split('\n').filter(Boolean);
        displayMessage = `**Search: \`${command}\`** — ${lines.length} matches\n\n\`\`\`\n${lines.slice(0, 30).join('\n')}${lines.length > 30 ? '\n... and more' : ''}\n\`\`\``;
        break;
      }

      case 'list_dir': {
        const dirPath = command === '.' ? (workspacePath || '.') : command;
        result = await ipcRenderer.invoke('tools:execute', 'list_directory', {
          path: dirPath,
        });
        try {
          const entries = JSON.parse(result.output || '[]');
          const formatted = entries.map((e: any) => `${e.isDirectory ? '📁' : '📄'} ${e.name}`).join('\n');
          displayMessage = `**Directory:** \`${dirPath}\`\n\n${formatted || '(empty)'}`;
        } catch {
          displayMessage = `**Directory listing:**\n\n\`\`\`\n${result.output || result.error}\n\`\`\``;
        }
        break;
      }

      case 'read_file': {
        result = await ipcRenderer.invoke('tools:execute', 'read_file', {
          path: command,
        });
        const ext = command.split('.').pop() || '';
        displayMessage = result.success
          ? `**File:** \`${command}\`\n\n\`\`\`${ext}\n${result.output?.slice(0, 5000)}${(result.output?.length || 0) > 5000 ? '\n... (truncated)' : ''}\n\`\`\``
          : `**Error reading \`${command}\`:** ${result.error}`;
        break;
      }
    }

    return {
      intent,
      executed: true,
      output: result?.output,
      error: result?.success === false ? result.error : undefined,
      originalInput: input,
      displayMessage,
    };
  } catch (err: any) {
    return {
      intent,
      executed: false,
      error: err.message,
      originalInput: input,
      displayMessage: `**Error:** ${err.message}`,
    };
  }
}

export function getSlashCommandHints(): Array<{ command: string; description: string }> {
  return [
    { command: '/run <command>', description: 'Execute a terminal command' },
    { command: '$ <command>', description: 'Execute a terminal command (shorthand)' },
    { command: '/git status', description: 'Show git status' },
    { command: '/git log', description: 'Show recent commits' },
    { command: '/git diff', description: 'Show changes' },
    { command: '/git commit <msg>', description: 'Commit all changes' },
    { command: '/search <term>', description: 'Search codebase' },
    { command: '/ls [path]', description: 'List directory contents' },
    { command: '/read <file>', description: 'Read a file' },
    { command: '/scan', description: 'Open scan dashboard' },
    { command: '/findings', description: 'Open findings' },
    { command: '/report', description: 'Open report' },
    { command: '/settings', description: 'Open settings' },
    { command: '/usage', description: 'View usage & costs' },
    { command: '/agents', description: 'Manage agents' },
    { command: '/onboard', description: 'Analyze & onboard current project' },
    { command: '/remember <fact>', description: 'Store a memory' },
    { command: '/recall', description: 'Show all memories' },
    { command: '/new', description: 'New chat' },
  ];
}

export function isCommand(input: string): boolean {
  const { intent } = detectIntent(input);
  return intent !== 'none';
}
