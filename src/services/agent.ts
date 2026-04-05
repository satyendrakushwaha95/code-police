import type { AppSettings } from '../types/settings';
import { ollamaService } from './ollama';

export interface AgentStep {
  id: string;
  stepNumber: number;
  thought: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'executing' | 'completed' | 'error';
  error?: string;
}

export interface AgentTask {
  id: string;
  goal: string;
  steps: AgentStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  currentStep: number;
  maxIterations: number;
  finalResult?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

const DEFAULT_TOOLS: Tool[] = [
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
  }
];

const TOOLS_JSON = JSON.stringify(DEFAULT_TOOLS, null, 2);

export class AgentService {
  private settings: AppSettings;
  private onStepUpdate?: (step: AgentStep) => void;
  private onTaskUpdate?: (task: AgentTask) => void;
  private abortController?: AbortController;

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  setCallbacks(
    onStepUpdate?: (step: AgentStep) => void,
    onTaskUpdate?: (task: AgentTask) => void
  ) {
    this.onStepUpdate = onStepUpdate;
    this.onTaskUpdate = onTaskUpdate;
  }

  async executeTask(goal: string, workspacePath?: string): Promise<AgentTask> {
    const task: AgentTask = {
      id: `task-${Date.now()}`,
      goal,
      steps: [],
      status: 'planning',
      currentStep: 0,
      maxIterations: 10,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    let iteration = 0;

    while (iteration < task.maxIterations && task.status !== 'completed' && task.status !== 'failed') {
      iteration++;
      task.updatedAt = Date.now();

      try {
        // Get the next action from the LLM
        const action = await this.getNextAction(task, workspacePath);
        
        if (!action) {
          task.status = 'completed';
          task.finalResult = 'Task completed successfully.';
          break;
        }

        // Create step
        const step: AgentStep = {
          id: `step-${task.steps.length + 1}`,
          stepNumber: task.steps.length + 1,
          thought: action.thought,
          toolName: action.tool,
          parameters: action.parameters,
          status: 'executing'
        };

        task.steps.push(step);
        task.status = 'executing';
        task.currentStep = step.stepNumber;
        this.onStepUpdate?.(step);
        this.onTaskUpdate?.(task);

        // Execute the tool
        const result = await this.executeTool(action.tool, action.parameters);
        
        step.result = result.output || result.error || '';
        step.status = result.success ? 'completed' : 'error';
        if (result.error) {
          step.error = result.error;
        }

        this.onStepUpdate?.(step);
        this.onTaskUpdate?.(task);

        // Check if we should continue
        const shouldContinue = await this.shouldContinue(task, result);
        
        if (!shouldContinue) {
          task.status = 'completed';
          task.finalResult = this.generateFinalResult(task);
          break;
        }

      } catch (err: any) {
        task.status = 'failed';
        task.finalResult = `Error: ${err.message}`;
        break;
      }
    }

    if (iteration >= task.maxIterations && task.status !== 'completed') {
      task.status = 'failed';
      task.finalResult = 'Maximum iterations reached. Task could not be completed.';
    }

    this.onTaskUpdate?.(task);
    return task;
  }

  private async getNextAction(task: AgentTask, workspacePath?: string): Promise<{
    thought: string;
    tool: string;
    parameters: Record<string, unknown>;
  } | null> {
    const context = this.buildContext(task, workspacePath);
    
    const result = await ollamaService.chatComplete(
      'ollama-default',
      this.settings.model,
      [
        {
          role: 'system',
          content: `You are an autonomous coding agent. Your job is to break down a user goal into steps and execute them using tools.

AVAILABLE TOOLS:
${TOOLS_JSON}

INSTRUCTIONS:
1. Analyze the current task and previous steps
2. Decide on the next tool to use
3. Provide the tool name and parameters
4. If the task is complete, respond with "DONE: <summary>"

Format your response as JSON:
{
  "thought": "Explain your reasoning for this step",
  "tool": "tool_name",
  "parameters": { "param1": "value1" }
}

Or if complete:
{
  "thought": "Summary of what was accomplished",
  "tool": "DONE",
  "parameters": {}
}

Current workspace: ${workspacePath || 'Not specified'}`
        },
        {
          role: 'user',
          content: context
        }
      ],
      undefined,
      'agent_action'
    );

    const content = result.content;

    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (parsed.tool === 'DONE' || parsed.tool === 'done') {
          return null;
        }

        return {
          thought: parsed.thought || '',
          tool: parsed.tool,
          parameters: parsed.parameters || {}
        };
      }
      
      // Check for DONE in response
      if (content.toLowerCase().includes('"tool"') && content.toLowerCase().includes('done')) {
        return null;
      }
      
      throw new Error('No valid action found');
    } catch {
      // If parsing fails, check if task is complete
      if (content.toLowerCase().includes('done') || content.toLowerCase().includes('complete')) {
        return null;
      }
      throw new Error('Failed to parse LLM response');
    }
  }

  private buildContext(task: AgentTask, workspacePath?: string): string {
    let context = `GOAL: ${task.goal}\n\n`;
    
    if (workspacePath) {
      context += `WORKSPACE: ${workspacePath}\n\n`;
    }

    if (task.steps.length > 0) {
      context += 'PREVIOUS STEPS:\n';
      for (const step of task.steps) {
        context += `${step.stepNumber}. ${step.thought}\n`;
        context += `   Tool: ${step.toolName}\n`;
        context += `   Params: ${JSON.stringify(step.parameters)}\n`;
        if (step.result) {
          const truncatedResult = step.result.length > 500 
            ? step.result.substring(0, 500) + '...'
            : step.result;
          context += `   Result: ${truncatedResult}\n`;
        }
        if (step.error) {
          context += `   Error: ${step.error}\n`;
        }
        context += '\n';
      }
    }

    context += '\nWhat is the next step? Respond with JSON.';
    return context;
  }

  private async executeTool(toolName: string, params: Record<string, unknown>): Promise<{
    success: boolean;
    output?: string;
    error?: string;
  }> {
    try {
      const result = await (window as any).ipcRenderer.invoke('tools:execute', toolName, params);
      return {
        success: result.success,
        output: result.output,
        error: result.error
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  private async shouldContinue(task: AgentTask, lastResult: { success: boolean; output?: string; error?: string }): Promise<boolean> {
    const context = this.buildContext(task);
    
    const result = await ollamaService.chatComplete(
      'ollama-default',
      this.settings.model,
      [
        {
          role: 'system',
          content: `You are a task completion checker. Based on the last tool execution result, determine if the task goal has been achieved.

Context:
${context}

Respond with ONLY "YES" if more steps are needed, or "NO" if the task is complete.`
        },
        {
          role: 'user',
          content: `Task Goal: ${task.goal}\nLast Result: ${lastResult.output || lastResult.error || 'No output'}\n\nShould we continue? (YES/NO)`
        }
      ],
      undefined,
      'agent_check'
    );

    const content = result.content.toLowerCase();
    
    return !content.includes('no') && !content.includes('done') && !content.includes('complete');
  }

  private generateFinalResult(task: AgentTask): string {
    const completedSteps = task.steps.filter(s => s.status === 'completed').length;
    return `Task completed in ${completedSteps} steps.\n\nSummary:\n${task.steps.map(s => `- ${s.thought} (${s.toolName})`).join('\n')}`;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
