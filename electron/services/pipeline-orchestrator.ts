import { BrowserWindow } from 'electron';
import { PipelineStateStore } from './pipeline-state';
import { getModelRouter } from './model-router';
import { getPlannerAgent, PlannerError } from './agents/planner-agent';
import { getCoderAgent, SecurityError } from './agents/coder-agent';
import { getReviewerAgent } from './agents/reviewer-agent';
import { getExecutorAgent } from './agents/executor-agent';
import { getValidatorAgent } from './agents/validator-agent';
import { getResearchAgent } from './agents/research-agent';
import { getSecurityAgent } from './agents/security-agent';
import { PipelineRun, PipelineOptions, PipelineStage, PipelineTemplate, StageResult, TaskPlan, CodeOutput, ReviewResult, ExecuteResult, ValidationResult, ResearchResult, SecurityResult, ActivityLogEntry, RealTimeStatus } from './pipeline-types';
import { VectorDBService } from './vectordb';
import { OllamaEmbeddingsService } from './embeddings';
import { getAgentManager } from './agent-manager';
import { AgentConfig } from './agent-types';
import { getUsageTracker } from './usage-tracker';
import { getSharedOllama } from './shared-ollama';
import { buildPipelineGraph, PipelineContext, MAX_REPLANS } from './pipeline-graph';

export class PipelineOrchestrator {
  private stateStore: PipelineStateStore;
  private router = getModelRouter();
  private plannerAgent = getPlannerAgent();
  private coderAgent = getCoderAgent();
  private reviewerAgent = getReviewerAgent();
  private executorAgent = getExecutorAgent();
  private validatorAgent = getValidatorAgent();
  private researchAgent = getResearchAgent();
  private securityAgent = getSecurityAgent();
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
    runIdOverride?: string,
    template?: PipelineTemplate
  ): Promise<{ runId: string }> {
    const effectiveOptions = this.getEffectiveOptions(options);
    const root = projectRoot || this.projectRoot;
    const effectiveTemplate = template || 'standard';
    const run = await this.stateStore.createRun(taskDescription, runIdOverride, root, effectiveTemplate);
    const deadline = Date.now() + effectiveOptions.timeoutMs;
    const runId = run.id;

    if (root) {
      this.coderAgent.setProjectRoot(root);
    }

    const graph = buildPipelineGraph(effectiveTemplate);
    const context: PipelineContext = {
      taskDescription,
      retryCountByStage: {},
      replanCount: 0,
      template: effectiveTemplate,
    };

    let currentStage: PipelineStage | null = graph.entry;

    try {
      while (currentStage) {
        if (this.isCancelled(runId)) return this.handleCancellation(runId, effectiveTemplate);
        if (Date.now() > deadline) return this.handleTimeout(runId, `${currentStage} stage timed out`, effectiveTemplate);

        const node = graph.nodes.get(currentStage);
        if (!node) {
          console.error(`[Pipeline] Unknown stage: ${currentStage}`);
          await this.stateStore.finalizeRun(runId, 'FAIL');
          this.emitError(runId, `Unknown stage in pipeline graph: ${currentStage}`);
          this.stateStore.recordAnalytics(runId, effectiveTemplate);
          return { runId };
        }

        if (!this.isStageEnabled(currentStage)) {
          await this.markStageSkipped(runId, currentStage, 'Disabled by agent config');
          currentStage = node.resolveNext(context, null);
          continue;
        }

        if (node.condition && !node.condition(context)) {
          await this.markStageSkipped(runId, currentStage, 'Condition not met');
          currentStage = node.resolveNext(context, null);
          continue;
        }

        const result = await this.executeSingleStage(runId, currentStage, context, effectiveOptions, root);

        if (!result) {
          const stageRetries = context.retryCountByStage[currentStage] || 0;

          if (node.onFail === 'retry' && stageRetries < (node.maxRetries || 2)) {
            context.retryCountByStage[currentStage] = stageRetries + 1;
            await this.stateStore.incrementRetryCount(runId);
            continue;
          }
          if (node.onFail === 'replan' && context.replanCount < MAX_REPLANS) {
            context.replanCount++;
            currentStage = 'plan';
            continue;
          }
          if (node.onFail === 'skip') {
            await this.markStageSkipped(runId, currentStage, 'Stage failed, skipping');
            currentStage = node.resolveNext(context, null);
            continue;
          }
          // onFail === 'stop' or exhausted retries
          await this.stateStore.finalizeRun(runId, 'FAIL');
          this.emitComplete(runId, 'FAIL', context.codeOutput || undefined);
          this.stateStore.recordAnalytics(runId, effectiveTemplate);
          return { runId };
        }

        this.updateContext(context, currentStage, result);

        if (currentStage === 'plan' && result && effectiveOptions.smartSkip) {
          const plan = result as TaskPlan;
          const isDocTask = plan.subtasks?.every((s: any) =>
            s.description.toLowerCase().includes('document') ||
            s.description.toLowerCase().includes('readme') ||
            s.description.toLowerCase().includes('spec')
          );
          if (isDocTask) {
            await this.markStageSkipped(runId, 'validate', 'Documentation task (smart skip)');
            await this.markStageSkipped(runId, 'execute', 'Documentation task (smart skip)');
          }
        }

        currentStage = node.resolveNext(context, result);
      }

      await this.stateStore.finalizeRun(runId, 'PASS');
      this.emitComplete(runId, 'PASS', context.codeOutput || undefined);
      this.stateStore.recordAnalytics(runId, effectiveTemplate);
      return { runId };

    } catch (err) {
      console.error('[PipelineOrchestrator] Unhandled error:', err);
      await this.stateStore.updateRunStatus(runId, 'failed');
      this.emitError(runId, String(err));
      this.stateStore.recordAnalytics(runId, effectiveTemplate);
      return { runId };
    } finally {
      this.cancellationFlags.delete(runId);
    }
  }

  private async executeSingleStage(
    runId: string,
    stage: PipelineStage,
    context: PipelineContext,
    options: PipelineOptions,
    root: string
  ): Promise<any> {
    switch (stage) {
      case 'research':
        return this.runResearchStage(runId, context, options, root);
      case 'plan':
        return this.runPlanStage(runId, context, options);
      case 'action':
        return this.runActionStage(runId, context, options);
      case 'review':
        return this.runReviewStage(runId, context, options);
      case 'security':
        return this.runSecurityStage(runId, context, options, root);
      case 'validate':
        return this.runValidateStage(runId, context, options);
      case 'execute':
        return this.runExecuteStage(runId, context, root);
      default:
        return null;
    }
  }

  private updateContext(context: PipelineContext, stage: PipelineStage, result: any): void {
    switch (stage) {
      case 'research':
        context.researchResult = result;
        break;
      case 'plan':
        context.taskPlan = result;
        break;
      case 'action':
        context.codeOutput = result;
        break;
      case 'review':
        context.reviewResult = result;
        break;
      case 'security':
        context.securityResult = result;
        break;
      case 'validate':
        context.validationResult = result;
        break;
    }
  }

  // --- Individual Stage Runners ---

  private async runResearchStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions,
    root: string
  ): Promise<ResearchResult | null> {
    this.emitStageUpdate(runId, 'research', 'running');
    this.emitRealTimeUpdate(runId, 'research', 'sending', this.createActivityLog('Starting codebase research...'));

    const researchModel = await this.router.resolve('planning');
    const startTime = Date.now();
    const modelUsed = this.activeAgent?.defaultModel || researchModel.resolvedModel;

    try {
      this.emitRealTimeUpdate(runId, 'research', 'processing', this.createActivityLog('Analyzing project structure...'));
      const result = await this.researchAgent.execute(context.taskDescription, root, { ...researchModel, resolvedModel: modelUsed });

      await this.saveStageResult(runId, 'research', 1, {
        status: 'complete',
        model_used: modelUsed,
        duration_ms: Date.now() - startTime,
        output: result,
      });
      this.recordStageUsage(runId, 'research', modelUsed, Date.now() - startTime);
      this.emitStageUpdate(runId, 'research', 'complete', result);
      this.emitRealTimeUpdate(runId, 'research', 'complete', this.createActivityLog(
        `Research found ${result.key_findings.length} findings across ${result.files_examined.length} files`,
        'success'
      ));
      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'research', 1, {
        status: 'failed',
        model_used: modelUsed,
        duration_ms: Date.now() - startTime,
        error: errorMsg,
      });
      this.emitStageUpdate(runId, 'research', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'research', 'failed', this.createActivityLog(`Research failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async runPlanStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions
  ): Promise<TaskPlan | null> {
    const agentInfo = this.activeAgent ? ` (Agent: ${this.activeAgent.name})` : '';
    this.emitStageUpdate(runId, 'plan', 'running');
    this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog(`Preparing task context...${agentInfo}`));

    const planContext = await this.getContext(context.taskDescription);
    this.emitRealTimeUpdate(runId, 'plan', 'processing', this.createActivityLog(`Context retrieved: ${planContext.length} files found`));

    const planModel = await this.router.resolve('planning');
    const planStartTime = Date.now();
    const modelUsed = this.activeAgent?.defaultModel || planModel.resolvedModel;

    this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog(`Sending data to model: ${modelUsed}${this.activeAgent ? ` (${this.activeAgent.name})` : ''}`), {
      input_preview: context.taskDescription.slice(0, 500)
    });

    try {
      this.emitRealTimeUpdate(runId, 'plan', 'processing', this.createActivityLog('Model started processing'));

      const knowledgeFiles = this.activeAgent?.knowledgeBase?.files
        ? this.activeAgent.knowledgeBase.files.map(f => ({ name: f.name, content: f.path }))
        : [];

      // Augment task description with research findings if available
      let augmentedTask = context.taskDescription;
      if (context.researchResult) {
        augmentedTask += `\n\n## Research Findings\n${context.researchResult.summary}\n\nKey findings:\n${context.researchResult.key_findings.map(f => `- ${f}`).join('\n')}`;
      }

      const taskPlan = await this.plannerAgent.execute(augmentedTask, planContext, planModel, {
        agent: this.activeAgent || undefined,
        knowledgeFiles: this.activeAgent?.knowledgeBase?.enabled ? knowledgeFiles : undefined,
      });
      this.emitRealTimeUpdate(runId, 'plan', 'waiting', this.createActivityLog('Response received from model', 'success'));

      await this.saveStageResult(runId, 'plan', 1, {
        status: 'complete',
        model_used: modelUsed,
        duration_ms: Date.now() - planStartTime,
        output: taskPlan
      });
      this.recordStageUsage(runId, 'plan', modelUsed, Date.now() - planStartTime);
      this.emitStageUpdate(runId, 'plan', 'complete', taskPlan);
      this.emitRealTimeUpdate(runId, 'plan', 'complete', this.createActivityLog(`Plan completed in ${((Date.now() - planStartTime) / 1000).toFixed(1)}s`, 'success'));

      return taskPlan;
    } catch (err) {
      const errorMsg = err instanceof PlannerError ? err.message : String(err);
      await this.saveStageResult(runId, 'plan', 1, {
        status: 'failed',
        model_used: modelUsed,
        duration_ms: Date.now() - planStartTime,
        error: errorMsg
      });
      this.emitStageUpdate(runId, 'plan', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'plan', 'failed', this.createActivityLog(`Plan failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async runActionStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions
  ): Promise<CodeOutput | null> {
    if (!context.taskPlan) return null;

    this.emitStageUpdate(runId, 'action', 'running');
    this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog('Preparing code generation request...'));

    const codeModel = await this.router.resolve('code_generation');
    const codeStartTime = Date.now();
    const codeModelUsed = this.activeAgent?.defaultModel || codeModel.resolvedModel;
    const attempt = (context.retryCountByStage['action'] || 0) + 1;

    const fileContents = new Map<string, string>();

    const reviewIssues = context.reviewResult
      ? context.reviewResult.issues.filter(i => i.severity === 'error' || i.severity === 'warning')
      : [];

    if (reviewIssues.length > 0) {
      this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog(`Incorporating ${reviewIssues.length} issues from previous review`));
    }

    this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog(`Sending code request to model: ${codeModelUsed}${this.activeAgent ? ` (${this.activeAgent.name})` : ''}`), {
      input_preview: `Task: ${context.taskPlan.task_description.slice(0, 200)}...`
    });

    try {
      this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog('Model generating code...'));

      const agentConfig = this.activeAgent ? {
        systemPrompt: this.activeAgent.systemPrompt,
        constraints: this.activeAgent.constraints,
        enabledTools: this.activeAgent.enabledTools,
      } : undefined;

      const codeOutput = await this.coderAgent.execute(
        context.taskPlan,
        fileContents,
        reviewIssues,
        { ...codeModel, resolvedModel: codeModelUsed },
        agentConfig
      );
      this.emitRealTimeUpdate(runId, 'action', 'waiting', this.createActivityLog('Code generation complete', 'success'), {
        output_preview: `${codeOutput.file_changes.length} file changes`
      });

      await this.saveStageResult(runId, 'action', attempt, {
        status: 'complete',
        model_used: codeModelUsed,
        duration_ms: Date.now() - codeStartTime,
        output: codeOutput
      });
      this.recordStageUsage(runId, 'action', codeModelUsed, Date.now() - codeStartTime);
      this.emitStageUpdate(runId, 'action', 'complete', codeOutput);
      this.emitRealTimeUpdate(runId, 'action', 'complete', this.createActivityLog(`Code stage completed in ${((Date.now() - codeStartTime) / 1000).toFixed(1)}s`, 'success'));

      return codeOutput;
    } catch (err) {
      const errorMsg = err instanceof SecurityError ? err.message : String(err);
      await this.saveStageResult(runId, 'action', attempt, {
        status: 'failed',
        model_used: codeModelUsed,
        duration_ms: Date.now() - codeStartTime,
        error: errorMsg
      });
      this.emitStageUpdate(runId, 'action', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'action', 'failed', this.createActivityLog(`Code generation failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async runReviewStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions
  ): Promise<ReviewResult | null> {
    if (!context.taskPlan || !context.codeOutput) return null;

    this.emitStageUpdate(runId, 'review', 'running');
    this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog('Preparing code review request...'));

    const reviewModel = await this.router.resolve('review');
    const reviewStartTime = Date.now();
    const attempt = (context.retryCountByStage['review'] || 0) + 1;

    this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog(`Sending review request to model: ${reviewModel.resolvedModel}`), {
      input_preview: `${context.codeOutput.file_changes.length} files to review`
    });

    try {
      this.emitRealTimeUpdate(runId, 'review', 'processing', this.createActivityLog('Model reviewing code...'));
      let reviewResult = await this.reviewerAgent.execute(context.taskPlan, context.codeOutput, reviewModel);
      this.emitRealTimeUpdate(runId, 'review', 'waiting', this.createActivityLog('Review complete', 'success'), {
        output_preview: `Verdict: ${reviewResult.verdict}, ${reviewResult.issues.length} issues`
      });

      // Auto-pass if confidence is decent and no errors
      const hasErrors = reviewResult.issues.some(i => i.severity === 'error');
      if (reviewResult.verdict === 'FAIL' && !hasErrors && reviewResult.confidence_score >= 0.5) {
        reviewResult = { ...reviewResult, verdict: 'PASS' };
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

      return reviewResult;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'review', attempt, {
        status: 'failed',
        model_used: reviewModel.resolvedModel,
        duration_ms: Date.now() - reviewStartTime,
        error: errorMsg
      });
      this.emitStageUpdate(runId, 'review', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'review', 'failed', this.createActivityLog(`Review failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async runSecurityStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions,
    root: string
  ): Promise<SecurityResult | null> {
    if (!context.codeOutput || !context.taskPlan) {
      await this.markStageSkipped(runId, 'security', 'No code output available');
      return null;
    }

    this.emitStageUpdate(runId, 'security', 'running');
    this.emitRealTimeUpdate(runId, 'security', 'sending', this.createActivityLog('Starting security audit...'));

    const securityModel = await this.router.resolve('review');
    const startTime = Date.now();

    try {
      this.emitRealTimeUpdate(runId, 'security', 'processing', this.createActivityLog('Scanning for vulnerabilities...'));
      const result = await this.securityAgent.execute(context.codeOutput, context.taskPlan, root, securityModel);

      await this.saveStageResult(runId, 'security', 1, {
        status: 'complete',
        model_used: securityModel.resolvedModel,
        duration_ms: Date.now() - startTime,
        output: result,
      });
      this.recordStageUsage(runId, 'security', securityModel.resolvedModel, Date.now() - startTime);
      this.emitStageUpdate(runId, 'security', 'complete', result);
      this.emitRealTimeUpdate(runId, 'security', 'complete', this.createActivityLog(
        `Security audit: ${result.verdict} (score: ${result.score}/100, ${result.vulnerabilities.length} issues)`,
        result.verdict === 'PASS' ? 'success' : 'error'
      ));
      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'security', 1, {
        status: 'failed',
        model_used: securityModel.resolvedModel,
        duration_ms: Date.now() - startTime,
        error: errorMsg,
      });
      this.emitStageUpdate(runId, 'security', 'failed', { error: errorMsg });
      this.emitRealTimeUpdate(runId, 'security', 'failed', this.createActivityLog(`Security audit failed: ${errorMsg}`, 'error'));
      return null;
    }
  }

  private async runValidateStage(
    runId: string,
    context: PipelineContext,
    options: PipelineOptions
  ): Promise<ValidationResult | null> {
    if (!context.taskPlan || !context.codeOutput || !context.reviewResult) return null;

    this.emitStageUpdate(runId, 'validate', 'running');
    this.emitRealTimeUpdate(runId, 'validate', 'sending', this.createActivityLog('Preparing validation request...'));

    const validateModel = await this.router.resolve('review');
    const validateStartTime = Date.now();

    try {
      this.emitRealTimeUpdate(runId, 'validate', 'processing', this.createActivityLog('Validating against acceptance criteria...'));
      const validationResult = await this.validatorAgent.execute(
        context.taskPlan,
        context.codeOutput,
        context.reviewResult,
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

  private async runExecuteStage(
    runId: string,
    context: PipelineContext,
    root: string
  ): Promise<ExecuteResult | null> {
    if (!context.codeOutput) return null;

    this.emitStageUpdate(runId, 'execute', 'running');
    this.emitRealTimeUpdate(runId, 'execute', 'sending', this.createActivityLog('Preparing to execute file changes...'));

    const executeStartTime = Date.now();

    try {
      this.emitRealTimeUpdate(runId, 'execute', 'processing', this.createActivityLog(`Executing ${context.codeOutput.file_changes.length} file changes...`));
      const executeResult = await this.executorAgent.execute(context.codeOutput, root);
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

  // --- Retry/Analyze Methods (preserved from original) ---

  cancel(runId: string): void {
    this.cancellationFlags.set(runId, true);
  }

  async retryFix(
    runId: string,
    suggestions: string[]
  ): Promise<{ runId: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const taskPlan = run.stages.plan?.output as TaskPlan | undefined;
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
      this.emitRealTimeUpdate(runId, 'review', 'complete', this.createActivityLog(`Review completed in ${((Date.now() - reviewStartTime) / 1000).toFixed(1)}s`, 'success'));

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

    const wantsToCancel = userPromptLower.includes('cancel') || userPromptLower.includes('abort') || userPromptLower.includes('stop');
    const wantsToRestart = userPromptLower.includes('restart') || userPromptLower.includes('start over') || userPromptLower.includes('from scratch');

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

    const taskPlan = run.stages.plan?.output as TaskPlan | undefined;
    const hasValidPlan = taskPlan && taskPlan.subtasks && taskPlan.subtasks.length > 0;

    if (!hasValidPlan) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', reason: 'No valid plan available - restart required' };
    }

    await this.stateStore.prepareForRetry(runId);
    return {
      runId,
      action: 'retry_with_feedback',
      stage: 'action',
      feedback: userPrompt
    };
  }

  // --- Legacy helpers used by retryFix ---

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
      this.emitRealTimeUpdate(runId, 'validate', 'processing', this.createActivityLog('Validating against acceptance criteria...'));
      const validationResult = await this.validatorAgent.execute(taskPlan, codeOutput, reviewResult, validateModel);

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
      return null;
    }
  }

  private async executeStage(
    runId: string,
    codeOutput: CodeOutput,
    root: string
  ): Promise<ExecuteResult | null> {
    this.emitStageUpdate(runId, 'execute', 'running');
    const executeStartTime = Date.now();

    try {
      const executeResult = await this.executorAgent.execute(codeOutput, root);
      await this.saveStageResult(runId, 'execute', 1, {
        status: 'complete',
        model_used: 'local-execution',
        duration_ms: Date.now() - executeStartTime,
        output: executeResult
      });
      this.emitStageUpdate(runId, 'execute', 'complete', executeResult);
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
      return null;
    }
  }

  // --- Utilities ---

  private isCancelled(runId: string): boolean {
    return this.cancellationFlags.get(runId) === true;
  }

  private async markStageSkipped(runId: string, stage: PipelineStage, reason: string): Promise<void> {
    await this.saveStageResult(runId, stage, 1, {
      status: 'skipped',
      model_used: '',
      error: reason,
    });
    this.emitStageUpdate(runId, stage, 'skipped');
  }

  private recordStageUsage(runId: string, stage: string, model: string, durationMs: number): void {
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
    stage: string,
    attempt: number,
    result: StageResult<any>
  ): Promise<void> {
    await this.stateStore.saveStageResult(runId, stage, attempt, result);
  }

  private handleCancellation(runId: string, template?: string): { runId: string } {
    this.stateStore.updateRunStatus(runId, 'cancelled');
    this.emitCancelled(runId);
    this.stateStore.recordAnalytics(runId, template);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  private handleTimeout(runId: string, message: string, template?: string): { runId: string } {
    this.stateStore.updateRunStatus(runId, 'failed');
    this.emitError(runId, message);
    this.stateStore.recordAnalytics(runId, template);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  private emitStageUpdate(runId: string, stage: string, status: string, output?: any): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:stage_update', { runId, stage, status, output });
      }
    }
  }

  private emitRealTimeUpdate(runId: string, stage: string, subStatus: RealTimeStatus, logEntry?: ActivityLogEntry, data?: { input_preview?: string; output_preview?: string }): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:realtime_update', { runId, stage, subStatus, logEntry, data });
      }
    }
  }

  private createActivityLog(message: string, type: ActivityLogEntry['type'] = 'info'): ActivityLogEntry {
    return { timestamp: Date.now(), message, type };
  }

  private emitComplete(runId: string, verdict: string, output?: CodeOutput): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:complete', { runId, verdict, finalOutput: output });
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
