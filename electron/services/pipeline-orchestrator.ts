import { BrowserWindow } from 'electron';
import { PipelineStateStore } from './pipeline-state';
import { getModelRouter } from './model-router';
import { getPlannerAgent, PlannerError } from './agents/planner-agent';
import { getCoderAgent, SecurityError } from './agents/coder-agent';
import { getReviewerAgent } from './agents/reviewer-agent';
import { getExecutorAgent } from './agents/executor-agent';
import { getValidatorAgent } from './agents/validator-agent';
import { PipelineRun, PipelineOptions, PipelineStage, StageResult, TaskPlan, CodeOutput, ReviewResult, ExecuteResult, ValidationResult, ActivityLogEntry, RealTimeStatus } from './pipeline-types';
import { VectorDBService } from './vectordb';
import { OllamaEmbeddingsService } from './embeddings';
import { getAgentManager } from './agent-manager';
import { AgentConfig } from './agent-types';
import { getUsageTracker } from './usage-tracker';
import { getSharedOllama } from './shared-ollama';

export class PipelineOrchestrator {
  private stateStore: PipelineStateStore;
  private router = getModelRouter();
  private plannerAgent = getPlannerAgent();
  private coderAgent = getCoderAgent();
  private reviewerAgent = getReviewerAgent();
  private executorAgent = getExecutorAgent();
  private validatorAgent = getValidatorAgent();
  private cancellationFlags = new Map<string, boolean>();
  private vectordb: VectorDBService | null = null;
  private projectRoot: string = '';
  private activeAgent: AgentConfig | null = null;
  private ollama = new OllamaEmbeddingsService();

  constructor(stateStore: PipelineStateStore, vectordb?: VectorDBService) {
    this.stateStore = stateStore;
    this.vectordb = vectordb || null;
  }

  setVectorDB(vectordb: VectorDBService) {
    this.vectordb = vectordb;
  }

  setProjectRoot(root: string) {
    this.projectRoot = root;
    this.coderAgent.setProjectRoot(root);
  }

  setActiveAgent(agentId: string | null) {
    if (agentId) {
      const agentManager = getAgentManager();
      this.activeAgent = agentManager.getById(agentId) || null;
    } else {
      this.activeAgent = null;
    }
  }

  getActiveAgent(): AgentConfig | null {
    return this.activeAgent;
  }

  private getEffectiveOptions(options: PipelineOptions): PipelineOptions {
    if (this.activeAgent?.pipelineStages) {
      return {
        ...options,
        maxRetries: this.activeAgent.pipelineStages.maxRetries ?? options.maxRetries,
        timeoutMs: this.activeAgent.pipelineStages.timeoutMs ?? options.timeoutMs,
      };
    }
    return options;
  }

  private isStageEnabled(stage: PipelineStage): boolean {
    if (!this.activeAgent?.pipelineStages) return true;
    return this.activeAgent.pipelineStages.stages[stage]?.enabled ?? true;
  }

  async run(
    taskDescription: string,
    options: PipelineOptions,
    projectRoot?: string,
    runIdOverride?: string
  ): Promise<{ runId: string }> {
    const effectiveOptions = this.getEffectiveOptions(options);
    const root = projectRoot || this.projectRoot;
    const run = await this.stateStore.createRun(taskDescription, runIdOverride, root);
    const deadline = Date.now() + effectiveOptions.timeoutMs;
    const runId = run.id;

    if (root) {
      this.coderAgent.setProjectRoot(root);
    }

    const agentInfo = this.activeAgent ? ` (Agent: ${this.activeAgent.name})` : '';
    this.emitStageUpdate(runId, 'plan', 'running');
    this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog(`Preparing task context...${agentInfo}`));

    try {
      if (this.isCancelled(runId)) {
        return this.handleCancellation(runId);
      }

      if (Date.now() > deadline) {
        return this.handleTimeout(runId, 'Plan stage timed out');
      }

      const context = await this.getContext(taskDescription);
      this.emitRealTimeUpdate(runId, 'plan', 'processing', this.createActivityLog(`Context retrieved: ${context.length} files found`));

      const planModel = await this.router.resolve('planning');
      const planStartTime = Date.now();
      const modelUsed = this.activeAgent?.defaultModel || planModel.resolvedModel;

      this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog(`Sending data to model: ${modelUsed}${this.activeAgent ? ` (${this.activeAgent.name})` : ''}`), {
        input_preview: taskDescription.slice(0, 500)
      });

      let taskPlan: TaskPlan;
      try {
        this.emitRealTimeUpdate(runId, 'plan', 'processing', this.createActivityLog('Model started processing'));
        
        const knowledgeFiles = this.activeAgent?.knowledgeBase?.files
          ? this.activeAgent.knowledgeBase.files.map(f => ({ name: f.name, content: f.path }))
          : [];
        
        taskPlan = await this.plannerAgent.execute(taskDescription, context, planModel, {
          agent: this.activeAgent || undefined,
          knowledgeFiles: this.activeAgent?.knowledgeBase?.enabled ? knowledgeFiles : undefined,
        });
        this.emitRealTimeUpdate(runId, 'plan', 'waiting', this.createActivityLog('Response received from model', 'success'));
      } catch (err) {
        const errorMsg = err instanceof PlannerError ? err.message : String(err);
        await this.saveStageResult(runId, 'plan', 1, {
          status: 'failed',
          model_used: modelUsed,
          duration_ms: Date.now() - planStartTime,
          error: errorMsg
        });
        await this.stateStore.updateRunStatus(runId, 'failed');
        this.emitError(runId, `Plan failed: ${errorMsg}`);
        return { runId };
      }

      await this.saveStageResult(runId, 'plan', 1, {
        status: 'complete',
        model_used: modelUsed,
        duration_ms: Date.now() - planStartTime,
        output: taskPlan
      });
      this.recordStageUsage(runId, 'plan', modelUsed, Date.now() - planStartTime);
      this.emitStageUpdate(runId, 'plan', 'complete', taskPlan);
      this.emitRealTimeUpdate(runId, 'plan', 'complete', this.createActivityLog(`Plan completed in ${((Date.now() - planStartTime) / 1000).toFixed(1)}s${this.activeAgent ? ` using ${this.activeAgent.name}` : ''}`, 'success'));

      let codeOutput: CodeOutput | null = null;
      let reviewResult: ReviewResult | null = null;
      let attempt = 1;
      const maxAutoAttempts = 2;

      while (attempt <= maxAutoAttempts) {
        if (this.isCancelled(runId)) {
          return this.handleCancellation(runId);
        }

        if (Date.now() > deadline) {
          return this.handleTimeout(runId, 'Code stage timed out');
        }

        this.emitStageUpdate(runId, 'action', 'running');
        this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog('Preparing code generation request...'));

        const codeModel = await this.router.resolve('code_generation');
        const codeStartTime = Date.now();
        const codeModelUsed = this.activeAgent?.defaultModel || codeModel.resolvedModel;

        const fileContents = new Map<string, string>();

        const reviewIssues = attempt > 1 && reviewResult
          ? reviewResult.issues.filter(i => i.severity === 'error' || i.severity === 'warning')
          : [];

        if (reviewIssues.length > 0) {
          this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog(`Incorporating ${reviewIssues.length} issues from previous review`));
        }

        this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog(`Sending code request to model: ${codeModelUsed}${this.activeAgent ? ` (${this.activeAgent.name})` : ''}`), {
          input_preview: `Task: ${taskPlan.task_description.slice(0, 200)}...`
        });

        try {
          this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog('Model generating code...'));
          
          const agentConfig = this.activeAgent ? {
            systemPrompt: this.activeAgent.systemPrompt,
            constraints: this.activeAgent.constraints,
            enabledTools: this.activeAgent.enabledTools,
          } : undefined;
          
          codeOutput = await this.coderAgent.execute(
            taskPlan,
            fileContents,
            reviewIssues,
            { ...codeModel, resolvedModel: codeModelUsed },
            agentConfig
          );
          this.emitRealTimeUpdate(runId, 'action', 'waiting', this.createActivityLog('Code generation complete', 'success'), {
            output_preview: `${codeOutput.file_changes.length} file changes`
          });
        } catch (err) {
          const errorMsg = err instanceof SecurityError ? err.message : String(err);
          await this.saveStageResult(runId, 'action', attempt, {
            status: 'failed',
            model_used: codeModel.resolvedModel,
            duration_ms: Date.now() - codeStartTime,
            error: errorMsg
          });
          await this.stateStore.updateRunStatus(runId, 'failed');
          this.emitError(runId, `Code failed: ${errorMsg}`);
          return { runId };
        }

        await this.saveStageResult(runId, 'action', attempt, {
          status: 'complete',
          model_used: codeModel.resolvedModel,
          duration_ms: Date.now() - codeStartTime,
          output: codeOutput
        });
        this.recordStageUsage(runId, 'action', codeModelUsed, Date.now() - codeStartTime);
        this.emitStageUpdate(runId, 'action', 'complete', codeOutput);
        this.emitRealTimeUpdate(runId, 'action', 'complete', this.createActivityLog(`Code stage completed in ${((Date.now() - codeStartTime) / 1000).toFixed(1)}s`, 'success'));

        if (this.isCancelled(runId)) {
          return this.handleCancellation(runId);
        }

        this.emitStageUpdate(runId, 'review', 'running');
        this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog('Preparing code review request...'));

        const reviewModel = await this.router.resolve('review');
        const reviewStartTime = Date.now();

        this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog(`Sending review request to model: ${reviewModel.resolvedModel}`), {
          input_preview: `${codeOutput!.file_changes.length} files to review`
        });

        this.emitRealTimeUpdate(runId, 'review', 'processing', this.createActivityLog('Model reviewing code...'));
        reviewResult = await this.reviewerAgent.execute(taskPlan, codeOutput!, reviewModel);
        this.emitRealTimeUpdate(runId, 'review', 'waiting', this.createActivityLog('Review complete', 'success'), {
          output_preview: `Verdict: ${reviewResult.verdict}, ${reviewResult.issues.length} issues`
        });

        // Auto-pass if confidence is decent and no errors (only warnings/info)
        const hasErrors = reviewResult.issues.some(i => i.severity === 'error');
        if (reviewResult.verdict === 'FAIL' && !hasErrors && reviewResult.confidence_score >= 0.5) {
          reviewResult.verdict = 'PASS';
        }

        await this.saveStageResult(runId, 'review', attempt, {
          status: 'complete',
          model_used: reviewModel.resolvedModel,
          duration_ms: Date.now() - reviewStartTime,
          output: reviewResult
        });
        this.recordStageUsage(runId, 'review', reviewModel.resolvedModel, Date.now() - reviewStartTime);
        this.emitStageUpdate(runId, 'review', 'complete', reviewResult);
        this.emitRealTimeUpdate(runId, 'review', 'complete', this.createActivityLog(`Review completed in ${((Date.now() - reviewStartTime) / 1000).toFixed(1)}s`, 'success'));

        if (reviewResult.verdict === 'PASS') {
          const validationResult = await this.runValidation(runId, taskPlan, codeOutput!, reviewResult);
          
          if (validationResult && !validationResult.passed) {
            await this.stateStore.finalizeRun(runId, 'FAIL');
            this.emitComplete(runId, 'FAIL', codeOutput!);
            return { runId };
          }

          if (options.autoExecute && codeOutput) {
            const executeResult = await this.executeStage(runId, codeOutput, root);
            
            if (executeResult) {
              await this.stateStore.finalizeRun(runId, 'PASS');
              this.emitComplete(runId, 'PASS', codeOutput);
              return { runId };
            } else {
              await this.stateStore.finalizeRun(runId, 'FAIL');
              this.emitError(runId, 'Execute stage failed');
              return { runId };
            }
          }
          
          await this.stateStore.finalizeRun(runId, 'PASS');
          this.emitComplete(runId, 'PASS', codeOutput!);
          return { runId };
        }

        if (attempt < options.maxRetries) {
          await this.stateStore.incrementRetryCount(runId);
        }

        attempt++;
      }

      await this.stateStore.updateRunStatus(runId, 'failed');
      this.emitError(runId, 'Review failed after all retry attempts');
      return { runId };

    } catch (err) {
      console.error('[PipelineOrchestrator] Unhandled error:', err);
      await this.stateStore.updateRunStatus(runId, 'failed');
      this.emitError(runId, String(err));
      return { runId };
    } finally {
      this.cancellationFlags.delete(runId);
    }
  }

  cancel(runId: string): void {
    this.cancellationFlags.set(runId, true);
  }

  private async runValidation(
    runId: string,
    taskPlan: TaskPlan,
    codeOutput: CodeOutput,
    reviewResult: ReviewResult
  ): Promise<ValidationResult | null> {
    this.emitStageUpdate(runId, 'validate', 'running');
    this.emitRealTimeUpdate(runId, 'validate', 'sending', this.createActivityLog('Preparing validation request...'));

    const validateModel = await this.router.resolve('review');
    const validateStartTime = Date.now();

    try {
      this.emitRealTimeUpdate(runId, 'validate', 'processing', this.createActivityLog(`Validating against acceptance criteria...`));
      const validationResult = await this.validatorAgent.execute(
        taskPlan,
        codeOutput,
        reviewResult,
        validateModel
      );

      await this.saveStageResult(runId, 'validate', 1, {
        status: 'complete',
        model_used: validateModel.resolvedModel,
        duration_ms: Date.now() - validateStartTime,
        output: validationResult
      });
      this.recordStageUsage(runId, 'validate', validateModel.resolvedModel, Date.now() - validateStartTime);
      this.emitStageUpdate(runId, 'validate', 'complete', validationResult);
      this.emitRealTimeUpdate(runId, 'validate', 'complete', this.createActivityLog(
        `Validation ${validationResult.passed ? 'passed' : 'failed'} (${validationResult.coverage_score}% coverage)`,
        validationResult.passed ? 'success' : 'error'
      ));

      return validationResult;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'validate', 1, {
        status: 'failed',
        model_used: validateModel.resolvedModel,
        duration_ms: Date.now() - validateStartTime,
        error: errorMsg
      });
      this.emitStageUpdate(runId, 'validate', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'validate', 'failed', this.createActivityLog(`Validation failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async executeStage(
    runId: string,
    codeOutput: CodeOutput,
    root: string
  ): Promise<ExecuteResult | null> {
    this.emitStageUpdate(runId, 'execute', 'running');
    this.emitRealTimeUpdate(runId, 'execute', 'sending', this.createActivityLog('Preparing to execute file changes...'));

    const executeStartTime = Date.now();

    try {
      this.emitRealTimeUpdate(runId, 'execute', 'processing', this.createActivityLog(`Executing ${codeOutput.file_changes.length} file changes...`));
      const executeResult = await this.executorAgent.execute(codeOutput, root);
      this.emitRealTimeUpdate(runId, 'execute', 'waiting', this.createActivityLog('Execution complete', 'success'), {
        output_preview: `${executeResult.executed_files.length} files executed`
      });

      await this.saveStageResult(runId, 'execute', 1, {
        status: 'complete',
        model_used: 'local-execution',
        duration_ms: Date.now() - executeStartTime,
        output: executeResult
      });
      this.emitStageUpdate(runId, 'execute', 'complete', executeResult);
      this.emitRealTimeUpdate(runId, 'execute', 'complete', this.createActivityLog(`Execute completed in ${((Date.now() - executeStartTime) / 1000).toFixed(1)}s`, 'success'));

      return executeResult;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'execute', 1, {
        status: 'failed',
        model_used: 'local-execution',
        duration_ms: Date.now() - executeStartTime,
        error: errorMsg
      });
      this.emitStageUpdate(runId, 'execute', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'execute', 'failed', this.createActivityLog(`Execution failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  async retryFix(
    runId: string,
    suggestions: string[]
  ): Promise<{ runId: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const taskPlan = run.stages.plan.output as TaskPlan | undefined;
    if (!taskPlan || !taskPlan.subtasks || taskPlan.subtasks.length === 0) {
      throw new Error('No valid task plan available. Please start a new pipeline.');
    }

    await this.stateStore.prepareForRetry(runId);

    const root = run.project_root || this.projectRoot;

    if (root) {
      this.coderAgent.setProjectRoot(root);
    }

    this.emitStageUpdate(runId, 'action', 'running');
    this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog('Preparing code generation with user feedback...'));
    this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog(`Incorporating ${suggestions.length} feedback items`));

    const codeModel = await this.router.resolve('code_generation');
    const codeStartTime = Date.now();

    const reviewIssues = suggestions.map(s => ({
      description: s,
      severity: 'error' as const
    }));

    try {
      this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog(`Sending code request to model: ${codeModel.resolvedModel}`), {
        input_preview: `${suggestions.length} feedback items`
      });
      this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog('Model generating code...'));

      const codeOutput = await this.coderAgent.execute(
        taskPlan,
        new Map(),
        reviewIssues,
        codeModel
      );

      await this.saveStageResult(runId, 'action', 1, {
        status: 'complete',
        model_used: codeModel.resolvedModel,
        duration_ms: Date.now() - codeStartTime,
        output: codeOutput
      });
      this.recordStageUsage(runId, 'action', codeModel.resolvedModel, Date.now() - codeStartTime);
      this.emitStageUpdate(runId, 'action', 'complete', codeOutput);
      this.emitRealTimeUpdate(runId, 'action', 'complete', this.createActivityLog(`Code stage completed in ${((Date.now() - codeStartTime) / 1000).toFixed(1)}s`, 'success'), {
        output_preview: `${codeOutput.file_changes.length} file changes`
      });

      this.emitStageUpdate(runId, 'review', 'running');
      this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog('Preparing code review request...'));
      const reviewModel = await this.router.resolve('review');
      const reviewStartTime = Date.now();

      this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog(`Sending review request to model: ${reviewModel.resolvedModel}`), {
        input_preview: `${codeOutput.file_changes.length} files to review`
      });
      this.emitRealTimeUpdate(runId, 'review', 'processing', this.createActivityLog('Model reviewing code...'));

      const reviewResult = await this.reviewerAgent.execute(taskPlan, codeOutput, reviewModel);

      await this.saveStageResult(runId, 'review', 1, {
        status: 'complete',
        model_used: reviewModel.resolvedModel,
        duration_ms: Date.now() - reviewStartTime,
        output: reviewResult
      });
      this.recordStageUsage(runId, 'review', reviewModel.resolvedModel, Date.now() - reviewStartTime);
      this.emitStageUpdate(runId, 'review', 'complete', reviewResult);
      this.emitRealTimeUpdate(runId, 'review', 'complete', this.createActivityLog(`Review completed in ${((Date.now() - reviewStartTime) / 1000).toFixed(1)}s`, 'success'), {
        output_preview: `Verdict: ${reviewResult.verdict}, ${reviewResult.issues.length} issues`
      });

      if (reviewResult.verdict === 'PASS') {
        const validationResult = await this.runValidation(runId, taskPlan, codeOutput, reviewResult);
        
        if (validationResult && validationResult.passed) {
          const executeResult = await this.executeStage(runId, codeOutput, root);
          
          if (executeResult) {
            await this.stateStore.finalizeRun(runId, 'PASS');
            this.emitComplete(runId, 'PASS', codeOutput);
          } else {
            await this.stateStore.finalizeRun(runId, 'FAIL');
            this.emitComplete(runId, 'FAIL', codeOutput);
          }
        } else if (!validationResult) {
          await this.stateStore.finalizeRun(runId, 'FAIL');
          this.emitComplete(runId, 'FAIL', codeOutput);
        } else {
          await this.stateStore.finalizeRun(runId, 'FAIL');
          this.emitComplete(runId, 'FAIL', codeOutput);
        }
      } else {
        await this.stateStore.finalizeRun(runId, 'FAIL');
        this.emitComplete(runId, 'FAIL', codeOutput);
      }

      return { runId };
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'action', 1, {
        status: 'failed',
        model_used: codeModel.resolvedModel,
        duration_ms: Date.now() - codeStartTime,
        error: errorMsg
      });
      this.emitError(runId, `Retry failed: ${errorMsg}`);
      return { runId };
    }
  }

  async analyzeAndRetry(
    runId: string,
    userPrompt: string
  ): Promise<{ runId: string; action: string; stage?: string; task?: string; feedback?: string; reason?: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const userPromptLower = userPrompt.toLowerCase().trim();
    
    // Check for explicit intent keywords
    const wantsToCancel = userPromptLower.includes('cancel') || userPromptLower.includes('abort') || userPromptLower.includes('stop');
    const wantsToRestart = userPromptLower.includes('restart') || userPromptLower.includes('start over') || userPromptLower.includes('from scratch');
    const wantsToContinue = userPromptLower.includes('continue') || userPromptLower.includes('resume') || userPromptLower === '';
    const wantsToRetry = userPromptLower.includes('retry') || userPromptLower.includes('try again');

    // Determine action based on intent
    if (wantsToCancel) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', feedback: userPrompt };
    }

    if (wantsToRestart) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', task: run.task_description, reason: 'User requested restart' };
    }

    // For continue/retry, check if we have a valid plan
    const taskPlan = run.stages.plan.output as TaskPlan | undefined;
    const hasValidPlan = taskPlan && taskPlan.subtasks && taskPlan.subtasks.length > 0;

    if (!hasValidPlan) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', reason: 'No valid plan available - restart required' };
    }

    // Check which stages are complete
    const completedStages = Object.entries(run.stages)
      .filter(([_, s]) => s.status === 'complete')
      .map(([k]) => k);
    
    // Default to retrying from action stage with user's feedback
    await this.stateStore.prepareForRetry(runId);
    return { 
      runId, 
      action: 'retry_with_feedback', 
      stage: 'action', 
      feedback: userPrompt 
    };
  }

  private isCancelled(runId: string): boolean {
    return this.cancellationFlags.get(runId) === true;
  }

  private recordStageUsage(runId: string, stage: PipelineStage, model: string, durationMs: number): void {
    try {
      const shared = getSharedOllama();
      const usage = shared.lastUsage;
      if (!usage) return;

      const tracker = getUsageTracker();
      tracker.record({
        messageId: `pipeline:${runId}:${stage}`,
        conversationId: `pipeline:${runId}`,
        providerId: 'ollama-default',
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn(`[PipelineOrchestrator] Failed to record usage for ${stage}:`, err);
    }
  }

  private async getContext(taskDescription: string): Promise<Array<{ content: string; relativeFilePath: string }>> {
    if (!this.vectordb) {
      return [];
    }

    try {
      const embeddings = new OllamaEmbeddingsService();
      const queryVector = await embeddings.generateEmbedding('nomic-embed-text:latest', taskDescription);
      const results = await this.vectordb.searchSimilar(queryVector, 5);
      return results.map(r => ({
        content: r.content,
        relativeFilePath: r.relativeFilePath
      }));
    } catch (err) {
      console.warn('[PipelineOrchestrator] Failed to get context:', err);
      return [];
    }
  }

  private async saveStageResult(
    runId: string,
    stage: PipelineStage,
    attempt: number,
    result: StageResult<any>
  ): Promise<void> {
    await this.stateStore.saveStageResult(runId, stage, attempt, result);
  }

  private handleCancellation(runId: string): { runId: string } {
    this.stateStore.updateRunStatus(runId, 'cancelled');
    this.emitCancelled(runId);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  private handleTimeout(runId: string, message: string): { runId: string } {
    this.stateStore.updateRunStatus(runId, 'failed');
    this.emitError(runId, message);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  private emitStageUpdate(runId: string, stage: PipelineStage, status: string, output?: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:stage_update', {
          runId,
          stage,
          status,
          output
        });
      }
    }
  }

  private emitRealTimeUpdate(runId: string, stage: PipelineStage, subStatus: RealTimeStatus, logEntry?: ActivityLogEntry, data?: { input_preview?: string; output_preview?: string }): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:realtime_update', {
          runId,
          stage,
          subStatus,
          logEntry,
          data
        });
      }
    }
  }

  private createActivityLog(message: string, type: ActivityLogEntry['type'] = 'info'): ActivityLogEntry {
    return {
      timestamp: Date.now(),
      message,
      type
    };
  }

  private emitComplete(runId: string, verdict: string, output?: CodeOutput): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:complete', {
          runId,
          verdict,
          finalOutput: output
        });
      }
    }
  }

  private emitCancelled(runId: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:cancelled', { runId });
      }
    }
  }

  private emitError(runId: string, error: string): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:error', { runId, error });
      }
    }
  }
}

let instance: PipelineOrchestrator | null = null;

export function getPipelineOrchestrator(stateStore?: PipelineStateStore, vectordb?: VectorDBService): PipelineOrchestrator {
  if (!instance) {
    instance = new PipelineOrchestrator(stateStore || getPipelineStateStore(), vectordb);
  }
  return instance;
}

function getPipelineStateStore(): PipelineStateStore {
  return new PipelineStateStore();
}
