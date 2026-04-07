import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CodeOutput, ExecuteResult } from '../pipeline-types';
import { AgentMemoryService } from '../memory';

const DANGEROUS_COMMANDS = [
  'rm -rf', 'del /f /s', 'format', 'diskpart', 'fdisk',
  'mkfs', 'dd if=', '> /dev/sd', 'chmod 777', 'icacls /grant',
  'net user', 'net localgroup', 'reg delete', 'shutdown',
  'taskkill /f', 'kill -9', 'pkill -f'
];

function getAppSourceRoot(): string {
  return path.normalize(process.env.APP_ROOT || path.join(__dirname, '..', '..'));
}

function isInsideAppSource(targetRoot: string): boolean {
  const appRoot = getAppSourceRoot();
  const normalizedTarget = path.normalize(targetRoot);
  return normalizedTarget === appRoot || normalizedTarget.startsWith(appRoot + path.sep);
}

export class ExecutorAgent {
  private projectRoot: string = '';
  private auditDb: AgentMemoryService | null = null;

  setProjectRoot(root: string) {
    this.projectRoot = root;
  }

  setAuditDb(db: AgentMemoryService) {
    this.auditDb = db;
  }

  async execute(
    codeOutput: CodeOutput,
    projectRoot?: string
  ): Promise<ExecuteResult> {
    const root = projectRoot || this.projectRoot;
    const executedFiles: string[] = [];
    const failedFiles: string[] = [];
    const commandResults: { command: string; output: string; success: boolean }[] = [];

    const isSelfWorkspace = isInsideAppSource(root);
    if (isSelfWorkspace) {
      console.warn(`[ExecutorAgent] Workspace is the app's own source directory — all writes blocked to prevent self-modification`);
    }

    for (const fileChange of codeOutput.file_changes) {
      try {
        const fullPath = path.isAbsolute(fileChange.file_path)
          ? fileChange.file_path
          : path.join(root, fileChange.file_path);

        const relativePath = path.relative(root, fullPath);

        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          console.warn(`[ExecutorAgent] Blocked path traversal: ${fileChange.file_path}`);
          failedFiles.push(fileChange.file_path);
          await this.logAudit('write_file', { path: fullPath, blocked: true }, false, 'Path traversal attempt');
          continue;
        }

        if (isSelfWorkspace) {
          console.warn(`[ExecutorAgent] Blocked write to app source: ${relativePath}`);
          failedFiles.push(fileChange.file_path);
          await this.logAudit('write_file', { path: fullPath, blocked: true }, false, 'Cannot write to app source directory');
          continue;
        }

        switch (fileChange.operation) {
          case 'create':
          case 'modify':
            await this.ensureDirectoryExists(path.dirname(fullPath));
            await fs.writeFile(fullPath, fileChange.content, 'utf-8');
            executedFiles.push(fileChange.file_path);
            await this.logAudit('write_file', { path: fullPath }, true);
            break;

          case 'delete':
            await fs.unlink(fullPath);
            executedFiles.push(fileChange.file_path);
            await this.logAudit('delete_file', { path: fullPath }, true);
            break;
        }
      } catch (err) {
        failedFiles.push(fileChange.file_path);
        await this.logAudit(
          fileChange.operation === 'delete' ? 'delete_file' : 'write_file',
          { path: fileChange.file_path },
          false,
          String(err)
        );
      }
    }

    const summary = executedFiles.length > 0
      ? `Executed ${executedFiles.length} file changes${failedFiles.length > 0 ? `, ${failedFiles.length} failed` : ''}`
      : 'No files to execute';

    return {
      executed_files: executedFiles,
      failed_files: failedFiles,
      command_results: commandResults,
      summary
    };
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }

  private async logAudit(
    toolName: string,
    params: Record<string, unknown>,
    success: boolean,
    error?: string
  ): Promise<void> {
    if (this.auditDb) {
      try {
        await this.auditDb.addAuditLog({
          action: toolName,
          toolName,
          parameters: JSON.stringify(params),
          result: success ? 'success' : error,
          timestamp: Date.now(),
          userConfirmed: true
        });
      } catch (err) {
        console.warn('[ExecutorAgent] Failed to log audit:', err);
      }
    }
  }
}

let instance: ExecutorAgent | null = null;

export function getExecutorAgent(): ExecutorAgent {
  if (!instance) {
    instance = new ExecutorAgent();
  }
  return instance;
}
