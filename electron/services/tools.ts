import { app, ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AgentMemoryService } from './memory';

let auditDb: AgentMemoryService | null = null;

export function setAuditDb(db: AgentMemoryService) {
  auditDb = db;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  userConfirmed?: boolean;
}

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'append_file',
    description: 'Append content to an existing file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to append to the file' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the filesystem',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to delete' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and directories in a folder',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a new directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path for the new directory' }
      },
      required: ['path']
    }
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command (use with caution)',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' }
      },
      required: ['command']
    }
  },
  {
    name: 'file_exists',
    description: 'Check if a file or directory exists',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to check' }
      },
      required: ['path']
    }
  },
  {
    name: 'get_file_info',
    description: 'Get information about a file (size, modified date, etc.)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' }
      },
      required: ['path']
    }
  },
  // Search & Code Analysis
  {
    name: 'grep_search',
    description: 'Search code by pattern/regex',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (supports regex)' },
        path: { type: 'string', description: 'Directory to search in' },
        filePattern: { type: 'string', description: 'File pattern to match (e.g., *.ts)' }
      },
      required: ['pattern', 'path']
    }
  },
  {
    name: 'find_files',
    description: 'Find files by name pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'File name pattern (e.g., *.tsx)' },
        path: { type: 'string', description: 'Directory to search in' }
      },
      required: ['pattern', 'path']
    }
  },
  {
    name: 'get_file_diff',
    description: 'Get git diff of file changes',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (optional, shows all if empty)' },
        staged: { type: 'boolean', description: 'Show staged changes' }
      },
      required: []
    }
  },
  // Git Operations
  {
    name: 'git_status',
    description: 'Get repository status',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: []
    }
  },
  {
    name: 'git_log',
    description: 'View commit history',
    parameters: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory' },
        limit: { type: 'number', description: 'Number of commits to show' }
      },
      required: []
    }
  },
  {
    name: 'git_commit',
    description: 'Create commits',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: { type: 'string', description: 'Files to stage (comma separated or "." for all)' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['message']
    }
  },
  // Web & API
  {
    name: 'http_request',
    description: 'Make HTTP requests',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)' },
        headers: { type: 'string', description: 'JSON headers object' },
        body: { type: 'string', description: 'Request body' }
      },
      required: ['url']
    }
  },
  {
    name: 'fetch_url',
    description: 'Fetch web content',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' }
      },
      required: ['url']
    }
  },
  // Development
  {
    name: 'run_tests',
    description: 'Execute test suites',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Test command (e.g., npm test, jest)' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  },
  {
    name: 'lint_code',
    description: 'Run linters',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Lint command (e.g., npm run lint, eslint .)' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  },
  {
    name: 'format_code',
    description: 'Format code',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Format command (e.g., npm run format, prettier --write .)' },
        cwd: { type: 'string', description: 'Working directory' }
      },
      required: ['command']
    }
  },
  // Utilities
  {
    name: 'get_timestamp',
    description: 'Get current time/date',
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', description: 'Format: iso, unix, readable' }
      },
      required: []
    }
  },
  {
    name: 'calculate',
    description: 'Perform calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression (e.g., 2+2, Math.sqrt(16))' }
      },
      required: ['expression']
    }
  },
  {
    name: 'read_env',
    description: 'Read environment variables',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable name (empty for all)' }
      },
      required: []
    }
  }
];

const DANGEROUS_COMMANDS = [
  'rm -rf', 'del /f /s', 'format', 'diskpart', 'fdisk',
  'mkfs', 'dd if=', '> /dev/sd', 'chmod 777', 'icacls /grant',
  'net user', 'net localgroup', 'reg delete', 'shutdown',
  'taskkill /f', 'kill -9', 'pkill -f'
];

const MODIFY_TOOLS = ['write_file', 'append_file', 'delete_file', 'create_directory'];

function isCommandSafe(command: string): boolean {
  const lower = command.toLowerCase();
  return !DANGEROUS_COMMANDS.some(danger => lower.includes(danger.toLowerCase()));
}

async function askConfirmation(toolName: string, params: Record<string, unknown>): Promise<boolean> {
  try {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return false;
    
    const details = JSON.stringify(params, null, 2).slice(0, 500);
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm File Modification',
      message: `Allow ${toolName}?`,
      detail: `Parameters:\n${details}`,
    });
    return response === 1;
  } catch {
    return false;
  }
}

async function logAudit(toolName: string, params: Record<string, unknown>, result: ToolResult, userConfirmed: boolean) {
  if (!auditDb) return;
  try {
    auditDb.addAuditLog({
      timestamp: Date.now(),
      action: 'tool_execution',
      toolName,
      parameters: JSON.stringify(params).slice(0, 1000),
      result: result.success ? result.output : result.error,
      userConfirmed,
    });
  } catch {
    // Silently fail audit logging
  }
}

export async function executeTool(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
  const timestamp = Date.now();
  let userConfirmed = false;
  
  // Check if this tool requires confirmation
  if (MODIFY_TOOLS.includes(toolName)) {
    userConfirmed = await askConfirmation(toolName, params);
    if (!userConfirmed) {
      const result = { 
        success: false, 
        error: 'User denied confirmation', 
        toolName, 
        parameters: params, 
        timestamp,
        userConfirmed: false 
      };
      await logAudit(toolName, params, result, userConfirmed);
      return result;
    }
  }
  
  try {
    switch (toolName) {
      case 'read_file': {
        const filePath = params.path as string;
        const content = await fs.readFile(filePath, 'utf-8');
        const result = { success: true, output: content, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'write_file': {
        const filePath = params.path as string;
        const content = params.content as string;
        await fs.writeFile(filePath, content, 'utf-8');
        const result = { success: true, output: `File written successfully: ${filePath}`, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'append_file': {
        const filePath = params.path as string;
        const content = params.content as string;
        await fs.appendFile(filePath, content, 'utf-8');
        const result = { success: true, output: `Content appended to: ${filePath}`, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'delete_file': {
        const filePath = params.path as string;
        await fs.unlink(filePath);
        const result = { success: true, output: `File deleted: ${filePath}`, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'list_directory': {
        const dirPath = params.path as string;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const out = entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          isFile: e.isFile()
        }));
        const result = { success: true, output: JSON.stringify(out, null, 2), toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'create_directory': {
        const dirPath = params.path as string;
        await fs.mkdir(dirPath, { recursive: true });
        const result = { success: true, output: `Directory created: ${dirPath}`, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      case 'execute_command': {
        const command = params.command as string;
        if (!isCommandSafe(command)) {
          const result = { 
            success: false, 
            error: 'Command blocked: potentially dangerous operation detected', 
            toolName, 
            parameters: params, 
            timestamp,
            userConfirmed: false
          };
          await logAudit(toolName, params, result, userConfirmed);
          return result;
        }
        
        const cwd = params.cwd as string || process.cwd();
        const timeout = (params.timeout as number) || 30000;
        
        return new Promise<ToolResult>((resolve) => {
          const child = spawn(command, [], { 
            shell: true, 
            cwd,
            env: { ...process.env }
          });
          
          let stdout = '';
          let stderr = '';
          
          const timeoutId = setTimeout(() => {
            child.kill('SIGTERM');
            const result = { 
              success: false, 
              error: 'Command timed out', 
              toolName, 
              parameters: params, 
              timestamp,
              userConfirmed
            };
            logAudit(toolName, params, result, userConfirmed);
            resolve(result);
          }, timeout);
          
          child.stdout.on('data', (data) => { stdout += data.toString(); });
          child.stderr.on('data', (data) => { stderr += data.toString(); });
          
          child.on('close', (code) => {
            clearTimeout(timeoutId);
            const output = code === 0 ? stdout : `Exit code: ${code}\n${stderr || stdout}`;
            const result = { 
              success: code === 0, 
              output: output.trim(), 
              error: code !== 0 ? stderr.trim() : undefined,
              toolName, 
              parameters: params, 
              timestamp,
              userConfirmed
            };
            logAudit(toolName, params, result, userConfirmed);
            resolve(result);
          });
          
          child.on('error', (err) => {
            clearTimeout(timeoutId);
            const result = { 
              success: false, 
              error: err.message, 
              toolName, 
              parameters: params, 
              timestamp,
              userConfirmed
            };
            logAudit(toolName, params, result, userConfirmed);
            resolve(result);
          });
        });
      }
      
      case 'file_exists': {
        const filePath = params.path as string;
        try {
          await fs.access(filePath);
          const result = { success: true, output: 'true', toolName, parameters: params, timestamp, userConfirmed };
          await logAudit(toolName, params, result, userConfirmed);
          return result;
        } catch {
          const result = { success: true, output: 'false', toolName, parameters: params, timestamp, userConfirmed };
          await logAudit(toolName, params, result, userConfirmed);
          return result;
        }
      }
      
      case 'get_file_info': {
        const filePath = params.path as string;
        const stats = await fs.stat(filePath);
        const result = { 
          success: true, 
          output: JSON.stringify({
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile()
          }, null, 2), 
          toolName, 
          parameters: params, 
          timestamp,
          userConfirmed
        };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }

      // Search & Code Analysis
      case 'grep_search': {
        const pattern = params.pattern as string;
        const searchPath = params.path as string;
        const filePattern = params.filePattern as string || '*';
        const grepCmd = `grep -rn "${pattern}" --include="${filePattern}" "${searchPath}"`;
        return executeTool('execute_command', { command: grepCmd });
      }

      case 'find_files': {
        const pattern = params.pattern as string;
        const searchPath = params.path as string;
        const findCmd = `find "${searchPath}" -name "${pattern}" -type f`;
        return executeTool('execute_command', { command: findCmd });
      }

      case 'get_file_diff': {
        const diffPath = params.path as string || '';
        const staged = params.staged as boolean || false;
        const diffCmd = staged ? `git diff --cached ${diffPath}` : `git diff ${diffPath}`;
        return executeTool('execute_command', { command: diffCmd });
      }

      // Git Operations
      case 'git_status': {
        const gitCwd = params.cwd as string || process.cwd();
        return executeTool('execute_command', { command: 'git status', cwd: gitCwd });
      }

      case 'git_log': {
        const gitCwd = params.cwd as string || process.cwd();
        const limit = params.limit as number || 10;
        return executeTool('execute_command', { command: `git log --oneline -${limit}`, cwd: gitCwd });
      }

      case 'git_commit': {
        const message = params.message as string;
        const files = params.files as string || '.';
        const gitCwd = params.cwd as string || process.cwd();
        const commitCmd = `git add ${files} && git commit -m "${message}"`;
        return executeTool('execute_command', { command: commitCmd, cwd: gitCwd });
      }

      // Web & API
      case 'http_request': {
        const url = params.url as string;
        const method = (params.method as string || 'GET').toUpperCase();
        const headers = params.headers as string || '{}';
        const body = params.body as string || '';
        let curlCmd = `curl -X ${method}`;
        try {
          const headersObj = JSON.parse(headers);
          for (const [key, value] of Object.entries(headersObj)) {
            curlCmd += ` -H "${key}: ${value}"`;
          }
        } catch {}
        if (body && method !== 'GET') {
          curlCmd += ` -d '${body}'`;
        }
        curlCmd += ` "${url}"`;
        return executeTool('execute_command', { command: curlCmd });
      }

      case 'fetch_url': {
        const url = params.url as string;
        return executeTool('execute_command', { command: `curl -s "${url}"` });
      }

      // Development
      case 'run_tests': {
        const testCmd = params.command as string;
        const testCwd = params.cwd as string || process.cwd();
        return executeTool('execute_command', { command: testCmd, cwd: testCwd });
      }

      case 'lint_code': {
        const lintCmd = params.command as string;
        const lintCwd = params.cwd as string || process.cwd();
        return executeTool('execute_command', { command: lintCmd, cwd: lintCwd });
      }

      case 'format_code': {
        const formatCmd = params.command as string;
        const formatCwd = params.cwd as string || process.cwd();
        return executeTool('execute_command', { command: formatCmd, cwd: formatCwd });
      }

      // Utilities
      case 'get_timestamp': {
        const format = params.format as string || 'iso';
        const now = new Date();
        let output = '';
        switch (format) {
          case 'unix': output = String(Math.floor(now.getTime() / 1000)); break;
          case 'readable': output = now.toLocaleString(); break;
          default: output = now.toISOString(); break;
        }
        const result = { success: true, output, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }

      case 'calculate': {
        const expression = params.expression as string;
        try {
          const fn = new Function(`return ${expression}`);
          const output = String(fn());
          const result = { success: true, output, toolName, parameters: params, timestamp, userConfirmed };
          await logAudit(toolName, params, result, userConfirmed);
          return result;
        } catch (err: any) {
          const result = { success: false, error: err.message, toolName, parameters: params, timestamp, userConfirmed };
          await logAudit(toolName, params, result, userConfirmed);
          return result;
        }
      }

      case 'read_env': {
        const varName = params.name as string || '';
        let output = '';
        if (varName) {
          output = process.env[varName] || '';
        } else {
          output = JSON.stringify(process.env, null, 2);
        }
        const result = { success: true, output, toolName, parameters: params, timestamp, userConfirmed };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
      
      default: {
        const result = { 
          success: false, 
          error: `Unknown tool: ${toolName}`, 
          toolName, 
          parameters: params, 
          timestamp,
          userConfirmed: false
        };
        await logAudit(toolName, params, result, userConfirmed);
        return result;
      }
    }
  } catch (err: any) {
    const result = { 
      success: false, 
      error: err.message, 
      toolName, 
      parameters: params, 
      timestamp,
      userConfirmed: false
    };
    await logAudit(toolName, params, result, userConfirmed);
    return result;
  }
}

export function registerToolHandlers(db?: AgentMemoryService) {
  if (db) {
    setAuditDb(db);
  }
  
  ipcMain.handle('tools:list', () => {
    return AVAILABLE_TOOLS;
  });

  ipcMain.handle('tools:execute', async (_, toolName: string, params: Record<string, unknown>) => {
    const result = await executeTool(toolName, params);
    return result;
  });
}
