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
import { getDecomposerAgent } from './agents/decomposer-agent';
import { PipelineRun, PipelineOptions, PipelineStage, PipelineTemplate, StageResult, TaskPlan, CodeOutput, ReviewResult, ExecuteResult, ValidationResult, ResearchResult, SecurityResult, DecompositionResult, ActivityLogEntry, RealTimeStatus, StreamCallback, ToolCall, ToolResult, ApprovalRequest } from './pipeline-types';
import { VectorDBService } from './vectordb';
import { OllamaEmbeddingsService, OllamaChatMessage } from './embeddings';
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
  private decomposerAgent = getDecomposerAgent();
  private cancellationFlags = new Map<string, boolean>();
  private pendingApprovals = new Map<string, {
    resolve: (decision: 'approve' | 'reject') => void;
    stage: string;
  }>();
  private approvalElapsed = 0;
  private vectordb: VectorDBService | null = null;
  private projectRoot: string = '';
  private activeAgent: AgentConfig | null = null;
  private ollama = new OllamaEmbeddingsService();

  constructor(stateStore: PipelineStateStore, vectordb?: VectorDBService) {
    this.stateStore = stateStore;
    this.vectordb = vectordb || null;
  }

  setVectorDB(vectordb: VectorDBService) { this.vectordb = vectordb; }
  setProjectRoot(root: string) { this.projectRoot = root; this.coderAgent.setProjectRoot(root); }
  getActiveAgent(): AgentConfig | null { return this.activeAgent; }

  setActiveAgent(agentId: string | null) {
    if (agentId) {
      const agentManager = getAgentManager();
      this.activeAgent = agentManager.getById(agentId) || null;
    } else {
      this.activeAgent = null;
    }
  }

  private getEffectiveOptions(options: PipelineOptions): PipelineOptions {
    const result = { ...options };
    if (this.activeAgent?.pipelineStages) {
      result.maxRetries = this.activeAgent.pipelineStages.maxRetries ?? options.maxRetries;
      result.timeoutMs = this.activeAgent.pipelineStages.timeoutMs ?? options.timeoutMs;
    }
    return result;
  }

  private isStageEnabled(stage: PipelineStage): boolean {
    if (!this.activeAgent?.pipelineStages) return true;
    return this.activeAgent.pipelineStages.stages[stage]?.enabled ?? true;
  }

  private resolveStageModel(stage: PipelineStage, routerModel: string): string {
    const stageModel = this.activeAgent?.pipelineStages?.stages?.[stage]?.model;
    if (stageModel) return stageModel;
    return routerModel;
  }

  // ── Main Entry ────────────────────────────────────────────────────────

  async run(
    taskDescription: string,
    options: PipelineOptions,
    projectRoot?: string,
    runIdOverride?: string,
    template?: PipelineTemplate,
    agentId?: string
  ): Promise<{ runId: string }> {
    const effectiveOptions = this.getEffectiveOptions(options);
    const root = projectRoot || this.projectRoot;
    const effectiveAgentId = agentId || this.activeAgent?.id;

    const agentTemplate = this.activeAgent?.pipelineStages?.template as PipelineTemplate | undefined;
    const agentLoop = this.activeAgent?.pipelineStages?.enableAgentLoop;
    const effectiveTemplate = template || agentTemplate || 'standard';

    if (agentLoop !== undefined) {
      effectiveOptions.enableAgentLoop = agentLoop;
    }

    const run = await this.stateStore.createRun(taskDescription, runIdOverride, root, effectiveTemplate, effectiveAgentId);
    const runId = run.id;

    if (root) this.coderAgent.setProjectRoot(root);

    const graph = buildPipelineGraph(effectiveTemplate);
    const context: PipelineContext = {
      taskDescription,
      retryCountByStage: {},
      replanCount: 0,
      template: effectiveTemplate,
      stageNotes: [],
    };

    return this.executeGraph(runId, graph, context, effectiveOptions, root, effectiveTemplate);
  }

  // ── Resume from Checkpoint ────────────────────────────────────────────

  async resume(runId: string): Promise<{ runId: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);

    const checkpoint = await this.stateStore.loadCheckpoint(runId);
    if (!checkpoint) throw new Error(`No checkpoint found for run ${runId}`);

    const { context, lastStage } = checkpoint;
    context.stageNotes = context.stageNotes || [];
    const effectiveTemplate = (run.template || 'standard') as PipelineTemplate;
    const root = run.project_root || this.projectRoot;

    if (run.agent_id) this.setActiveAgent(run.agent_id);
    if (root) this.coderAgent.setProjectRoot(root);

    if (run.status === 'awaiting_approval') {
      const stageResult = this.getStageResultFromContext(context, lastStage as PipelineStage);
      const summary = this.buildApprovalSummary(lastStage, stageResult);
      await this.stateStore.updateRunStatus(runId, 'awaiting_approval');
      this.emitApprovalRequest(runId, lastStage, stageResult, summary);

      const decision = await new Promise<'approve' | 'reject'>((resolve) => {
        this.pendingApprovals.set(runId, { resolve, stage: lastStage });
      });

      if (decision === 'reject') {
        await this.stateStore.finalizeRun(runId, 'FAIL');
        this.emitComplete(runId, 'FAIL', context.codeOutput || undefined);
        return { runId };
      }
    }

    const graph = buildPipelineGraph(effectiveTemplate);
    const effectiveOptions = this.getEffectiveOptions({ maxRetries: 2, timeoutMs: 10 * 60 * 1000, autoExecute: true });

    const runData = await this.stateStore.getRun(runId);
    const stageOrder = runData?.stage_order || [];
    const lastIdx = stageOrder.indexOf(lastStage as PipelineStage);
    const remainingStages = lastIdx >= 0 ? stageOrder.slice(lastIdx + 1) : stageOrder;

    const resumeEntry: PipelineStage | null = remainingStages.length > 0
      ? remainingStages[0]
      : null;

    if (!resumeEntry) {
      await this.stateStore.finalizeRun(runId, 'PASS');
      this.emitComplete(runId, 'PASS', context.codeOutput || undefined);
      this.stateStore.recordAnalytics(runId, effectiveTemplate);
      return { runId };
    }

    await this.stateStore.updateRunStatus(runId, 'running');
    this.emitRealTimeUpdate(runId, lastStage, 'processing', this.createActivityLog(`Resumed from checkpoint (${lastStage}), continuing from ${resumeEntry}`, 'info'));

    return this.executeGraph(runId, graph, context, effectiveOptions, root, effectiveTemplate, resumeEntry);
  }

  // ── Graph Walker (supports parallel) ──────────────────────────────────

  private async executeGraph(
    runId: string,
    graph: ReturnType<typeof buildPipelineGraph>,
    context: PipelineContext,
    options: PipelineOptions,
    root: string,
    template: string,
    startOverride?: PipelineStage | PipelineStage[] | null
  ): Promise<{ runId: string }> {
    const deadline = Date.now() + options.timeoutMs;
    this.approvalElapsed = 0;
    const completedStages = new Set<PipelineStage>();

    const entryStages = startOverride !== undefined
      ? startOverride
      : graph.entry;
    let pending = new Set<PipelineStage>(
      entryStages === null ? [] : Array.isArray(entryStages) ? entryStages : [entryStages]
    );

    try {
      while (pending.size > 0) {
        if (this.isCancelled(runId)) return this.handleCancellation(runId, template);
        if (Date.now() > deadline + this.approvalElapsed) return this.handleTimeout(runId, 'Pipeline timed out', template);

        const ready = [...pending].filter(stage => {
          const node = graph.nodes.get(stage);
          if (!node?.waitFor) return true;
          return node.waitFor.every(dep => completedStages.has(dep));
        });

        if (ready.length === 0) {
          console.error('[Pipeline] Deadlock — all pending stages have unmet dependencies:', [...pending]);
          await this.stateStore.finalizeRun(runId, 'FAIL');
          this.emitError(runId, 'Pipeline deadlock: circular stage dependencies');
          this.stateStore.recordAnalytics(runId, template);
          return { runId };
        }

        const stageResults = ready.length === 1
          ? [await this.runSingleNode(runId, ready[0], graph, context, options, root)]
          : await Promise.all(ready.map(stage => this.runSingleNode(runId, stage, graph, context, options, root)));

        for (const { stage, result, next } of stageResults) {
          pending.delete(stage);
          if (result === '__FAIL__') {
            await this.stateStore.finalizeRun(runId, 'FAIL');
            this.emitComplete(runId, 'FAIL', context.codeOutput || undefined);
            this.stateStore.recordAnalytics(runId, template);
            return { runId };
          }
          if (result === '__CHILDREN_SPAWNED__') {
            return { runId };
          }
          completedStages.add(stage);
          if (next) {
            const nextStages = Array.isArray(next) ? next : [next];
            nextStages.forEach(s => pending.add(s));
          }
        }
      }

      const reviewConfident = (context.reviewResult?.confidence_score ?? 0) >= 0.7;
      const hasFailure = (context.reviewResult?.verdict === 'FAIL') ||
        (context.validationResult && !context.validationResult.passed && !reviewConfident) ||
        (context.securityResult?.verdict === 'FAIL');
      const finalVerdict = hasFailure ? 'FAIL' : 'PASS';
      await this.stateStore.finalizeRun(runId, finalVerdict);
      this.emitComplete(runId, finalVerdict, context.codeOutput || undefined);
      this.stateStore.recordAnalytics(runId, template);
      return { runId };
    } catch (err) {
      console.error('[PipelineOrchestrator] Unhandled error:', err);
      await this.stateStore.updateRunStatus(runId, 'failed');
      this.emitError(runId, String(err));
      this.stateStore.recordAnalytics(runId, template);
      return { runId };
    } finally {
      this.cancellationFlags.delete(runId);
    }
  }

  private async runSingleNode(
    runId: string,
    stage: PipelineStage,
    graph: ReturnType<typeof buildPipelineGraph>,
    context: PipelineContext,
    options: PipelineOptions,
    root: string
  ): Promise<{ stage: PipelineStage; result: any; next: PipelineStage | PipelineStage[] | null }> {
    const node = graph.nodes.get(stage);
    if (!node) {
      this.emitError(runId, `Unknown stage: ${stage}`);
      return { stage, result: '__FAIL__', next: null };
    }

    if (!this.isStageEnabled(stage)) {
      await this.markStageSkipped(runId, stage, 'Disabled by agent config');
      return { stage, result: null, next: node.resolveNext(context, null) };
    }

    if (node.condition && !node.condition(context)) {
      await this.markStageSkipped(runId, stage, 'Condition not met');
      return { stage, result: null, next: node.resolveNext(context, null) };
    }

    const result = await this.executeSingleStage(runId, stage, context, options, root);

    if (!result) {
      const stageRetries = context.retryCountByStage[stage] || 0;
      if (node.onFail === 'retry' && stageRetries < (node.maxRetries || 2)) {
        context.retryCountByStage[stage] = stageRetries + 1;
        await this.stateStore.incrementRetryCount(runId);
        return this.runSingleNode(runId, stage, graph, context, options, root);
      }
      if (node.onFail === 'replan' && context.replanCount < MAX_REPLANS) {
        context.replanCount++;
        return { stage, result: null, next: 'plan' };
      }
      if (node.onFail === 'skip') {
        await this.markStageSkipped(runId, stage, 'Stage failed, skipping');
        return { stage, result: null, next: node.resolveNext(context, null) };
      }
      return { stage, result: '__FAIL__', next: null };
    }

    this.updateContext(context, stage, result);
    await this.stateStore.saveCheckpoint(runId, stage, context);

    if (this.shouldAwaitApproval(stage)) {
      const approvalStart = Date.now();
      const decision = await this.requestApproval(runId, stage, result);
      this.approvalElapsed += (Date.now() - approvalStart);
      if (decision === 'reject') {
        await this.stateStore.finalizeRun(runId, 'FAIL');
        this.emitComplete(runId, 'FAIL', context.codeOutput || undefined);
        return { stage, result: '__FAIL__', next: null };
      }
    }

    if (stage === 'plan' && result && options.smartSkip) {
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

    if (stage === 'decompose' && result) {
      const decomp = result as DecompositionResult;
      if (decomp.subtasks.length > 1) {
        const run = await this.stateStore.getRun(runId);
        const stageOrder = run?.stage_order || [];
        const decompIdx = stageOrder.indexOf('decompose');
        const remainingStages = decompIdx >= 0 ? stageOrder.slice(decompIdx + 1) : [];
        for (const s of remainingStages) {
          await this.markStageSkipped(runId, s as PipelineStage, 'Delegated to subtasks');
        }

        await this.spawnChildRuns(runId, decomp, options, root);
        return { stage, result: '__CHILDREN_SPAWNED__', next: null };
      }
    }

    return { stage, result, next: node.resolveNext(context, result) };
  }

  // ── Child Run Spawning (Decomposition) ────────────────────────────────

  private async spawnChildRuns(
    parentRunId: string,
    decomp: DecompositionResult,
    options: PipelineOptions,
    root: string
  ): Promise<void> {
    this.emitRealTimeUpdate(parentRunId, 'decompose', 'processing',
      this.createActivityLog(`Spawning ${decomp.subtasks.length} child pipelines (sequential)...`, 'info'));

    let failedChildren = 0;

    for (let i = 0; i < decomp.subtasks.length; i++) {
      const subtask = decomp.subtasks[i];
      const childRunId = `${parentRunId}_sub_${i}`;
      const childTemplate = subtask.template || 'standard';
      const childAgentId = subtask.agentId || this.activeAgent?.id;

      this.emitRealTimeUpdate(parentRunId, 'decompose', 'processing',
        this.createActivityLog(`Running subtask ${i + 1}/${decomp.subtasks.length}: ${subtask.description.slice(0, 60)}...`, 'info'));

      try {
        await this.runChildPipeline(subtask.description, options, root, childRunId, childTemplate, childAgentId, parentRunId, i);
      } catch {
        failedChildren++;
      }
    }

    const childRuns = await this.stateStore.getChildRuns(parentRunId);
    const failedRuns = childRuns.filter(r => r.status === 'failed' || r.final_verdict === 'FAIL').length;

    if (failedRuns > 0 || failedChildren > 0) {
      await this.stateStore.finalizeRun(parentRunId, 'FAIL');
      this.emitComplete(parentRunId, 'FAIL');
    } else {
      await this.stateStore.finalizeRun(parentRunId, 'PASS');
      this.emitComplete(parentRunId, 'PASS');
    }
    this.stateStore.recordAnalytics(parentRunId, 'complex');
  }

  private async runChildPipeline(
    taskDescription: string, options: PipelineOptions, root: string,
    runId: string, template: PipelineTemplate, agentId?: string,
    parentRunId?: string, subtaskIndex?: number
  ): Promise<{ runId: string }> {
    const effectiveOptions = this.getEffectiveOptions({ ...options });
    const effectiveTemplate = template || 'standard';
    const run = await this.stateStore.createRun(taskDescription, runId, root, effectiveTemplate, agentId, parentRunId, subtaskIndex);
    if (root) this.coderAgent.setProjectRoot(root);
    const graph = buildPipelineGraph(effectiveTemplate);
    const context: PipelineContext = { taskDescription, retryCountByStage: {}, replanCount: 0, template: effectiveTemplate, stageNotes: [] };
    return this.executeGraph(runId, graph, context, effectiveOptions, root, effectiveTemplate);
  }

  // ── Stage Dispatch ────────────────────────────────────────────────────

  private async executeSingleStage(
    runId: string, stage: PipelineStage, context: PipelineContext, options: PipelineOptions, root: string
  ): Promise<any> {
    const onChunk: StreamCallback = (content, accumulated) => {
      this.emitStageStream(runId, stage, content, accumulated, false);
    };
    const finishStream = () => this.emitStageStream(runId, stage, '', '', true);

    switch (stage) {
      case 'research': return this.runResearchStage(runId, context, options, root, onChunk).finally(finishStream);
      case 'plan': return this.runPlanStage(runId, context, options, onChunk).finally(finishStream);
      case 'action':
        if (options.enableAgentLoop) {
          return this.runAgenticActionStage(runId, context, options, root, onChunk).finally(finishStream);
        }
        return this.runActionStage(runId, context, options, onChunk).finally(finishStream);
      case 'review': return this.runReviewStage(runId, context, options, onChunk).finally(finishStream);
      case 'security': return this.runSecurityStage(runId, context, options, root, onChunk).finally(finishStream);
      case 'validate': return this.runValidateStage(runId, context, options, onChunk).finally(finishStream);
      case 'execute': return this.runExecuteStage(runId, context, root);
      case 'decompose': return this.runDecomposeStage(runId, context, options, root, onChunk).finally(finishStream);
      default: return null;
    }
  }

  private updateContext(context: PipelineContext, stage: PipelineStage, result: any): void {
    switch (stage) {
      case 'research': context.researchResult = result; break;
      case 'plan': context.taskPlan = result; break;
      case 'action': context.codeOutput = result; break;
      case 'review': context.reviewResult = result; break;
      case 'security': context.securityResult = result; break;
      case 'validate': context.validationResult = result; break;
      case 'decompose': context.decompositionResult = result; break;
    }
  }

  // ── Individual Stage Runners ──────────────────────────────────────────

  private async runResearchStage(runId: string, context: PipelineContext, options: PipelineOptions, root: string, onChunk: StreamCallback): Promise<ResearchResult | null> {
    this.emitStageUpdate(runId, 'research', 'running');
    this.emitRealTimeUpdate(runId, 'research', 'sending', this.createActivityLog('Starting codebase research...'));
    const researchModel = await this.router.resolve('planning');
    const startTime = Date.now();
    const modelUsed = this.resolveStageModel('research', researchModel.resolvedModel);
    try {
      this.emitRealTimeUpdate(runId, 'research', 'processing', this.createActivityLog('Analyzing project structure...'));
      const result = await this.researchAgent.execute(context.taskDescription, root, { ...researchModel, resolvedModel: modelUsed }, onChunk);
      await this.saveStageResult(runId, 'research', 1, { status: 'complete', model_used: modelUsed, duration_ms: Date.now() - startTime, output: result });
      this.recordStageUsage(runId, 'research', modelUsed, Date.now() - startTime);
      this.emitStageUpdate(runId, 'research', 'complete', result);
      this.emitRealTimeUpdate(runId, 'research', 'complete', this.createActivityLog(`Research found ${result.key_findings.length} findings across ${result.files_examined.length} files`, 'success'));
      return result;
    } catch (err) {
      const errorMsg = String(err);
      await this.saveStageResult(runId, 'research', 1, { status: 'failed', model_used: modelUsed, duration_ms: Date.now() - startTime, error: errorMsg });
      this.emitStageUpdate(runId, 'research', 'failed', { error: errorMsg });
      return null;
    }
  }

  private async runPlanStage(runId: string, context: PipelineContext, options: PipelineOptions, onChunk: StreamCallback): Promise<TaskPlan | null> {
    this.emitStageUpdate(runId, 'plan', 'running');
    this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog('Preparing task context...'));
    const planContext = await this.getContext(context.taskDescription);
    const planModel = await this.router.resolve('planning');
    const planStartTime = Date.now();
    const modelUsed = this.resolveStageModel('plan', planModel.resolvedModel);
    this.emitRealTimeUpdate(runId, 'plan', 'sending', this.createActivityLog(`Sending to ${modelUsed}`), { input_preview: context.taskDescription.slice(0, 500) });
    try {
      let augmentedTask = context.taskDescription;
      if (context.researchResult) {
        augmentedTask += `\n\n## Research Findings\n${context.researchResult.summary}\n\nKey findings:\n${context.researchResult.key_findings.map(f => `- ${f}`).join('\n')}`;
      }
      const knowledgeFiles = this.activeAgent?.knowledgeBase?.files?.map(f => ({ name: f.name, content: f.path })) || [];
      const taskPlan = await this.plannerAgent.execute(augmentedTask, planContext, { ...planModel, resolvedModel: modelUsed }, {
        agent: this.activeAgent ? { ...this.activeAgent, defaultModel: modelUsed } : undefined,
        knowledgeFiles: this.activeAgent?.knowledgeBase?.enabled ? knowledgeFiles : undefined,
      }, onChunk);
      await this.saveStageResult(runId, 'plan', 1, { status: 'complete', model_used: modelUsed, duration_ms: Date.now() - planStartTime, output: taskPlan });
      this.recordStageUsage(runId, 'plan', modelUsed, Date.now() - planStartTime);
      this.emitStageUpdate(runId, 'plan', 'complete', taskPlan);
      this.emitRealTimeUpdate(runId, 'plan', 'complete', this.createActivityLog(`Plan completed in ${((Date.now() - planStartTime) / 1000).toFixed(1)}s`, 'success'));
      return taskPlan;
    } catch (err) {
      const errorMsg = err instanceof PlannerError ? err.message : String(err);
      await this.saveStageResult(runId, 'plan', 1, { status: 'failed', model_used: modelUsed, duration_ms: Date.now() - planStartTime, error: errorMsg });
      this.emitStageUpdate(runId, 'plan', 'failed', { error: errorMsg });
      return null;
    }
  }

  private async runActionStage(runId: string, context: PipelineContext, options: PipelineOptions, onChunk: StreamCallback): Promise<CodeOutput | null> {
    if (!context.taskPlan) return null;
    this.emitStageUpdate(runId, 'action', 'running');
    const codeModel = await this.router.resolve('code_generation');
    const codeStartTime = Date.now();
    const codeModelUsed = this.resolveStageModel('action', codeModel.resolvedModel);
    const attempt = (context.retryCountByStage['action'] || 0) + 1;
    const reviewIssues = context.reviewResult?.issues.filter(i => i.severity === 'error' || i.severity === 'warning') || [];
    this.emitRealTimeUpdate(runId, 'action', 'sending', this.createActivityLog(`Sending to ${codeModelUsed}`));
    try {
      const agentConfig = this.activeAgent ? { systemPrompt: this.activeAgent.systemPrompt, constraints: this.activeAgent.constraints, enabledTools: this.activeAgent.enabledTools } : undefined;
      const codeOutput = await this.coderAgent.execute(context.taskPlan, new Map(), reviewIssues, { ...codeModel, resolvedModel: codeModelUsed }, agentConfig, onChunk);
      await this.saveStageResult(runId, 'action', attempt, { status: 'complete', model_used: codeModelUsed, duration_ms: Date.now() - codeStartTime, output: codeOutput });
      this.recordStageUsage(runId, 'action', codeModelUsed, Date.now() - codeStartTime);
      this.emitStageUpdate(runId, 'action', 'complete', codeOutput);
      return codeOutput;
    } catch (err) {
      const errorMsg = err instanceof SecurityError ? err.message : String(err);
      await this.saveStageResult(runId, 'action', attempt, { status: 'failed', model_used: codeModelUsed, duration_ms: Date.now() - codeStartTime, error: errorMsg });
      this.emitStageUpdate(runId, 'action', 'failed', { error: errorMsg });
      return null;
    }
  }

  // ── Agentic Action Stage (Tool Use) ───────────────────────────────────

  private async runAgenticActionStage(runId: string, context: PipelineContext, options: PipelineOptions, root: string, onChunk: StreamCallback): Promise<CodeOutput | null> {
    if (!context.taskPlan) return null;
    this.emitStageUpdate(runId, 'action', 'running');

    const maxIterations = options.maxToolIterations || 15;
    const allowedTools = this.activeAgent?.enabledTools?.filter(t => t.enabled).map(t => t.toolId) || ['read_file', 'list_directory', 'grep_search', 'find_files'];
    const toolDescriptions = this.buildToolDescriptions(allowedTools);

    const codeModel = await this.router.resolve('code_generation');
    const modelUsed = this.resolveStageModel('action', codeModel.resolvedModel);
    const startTime = Date.now();
    const attempt = (context.retryCountByStage['action'] || 0) + 1;

    const agentSystemPrompt = this.activeAgent?.systemPrompt
      ? `${this.activeAgent.systemPrompt}\n\nYou are also a code generation expert with tool access.`
      : 'You are an agentic code generation expert with tool access.';

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: `${agentSystemPrompt}

You can call tools to read files, search code, and inspect the project before generating code.

## Available Tools
${toolDescriptions}

## How to Call Tools
To call a tool, include a JSON block in your response:
{"tool_calls": [{"tool": "tool_name", "params": {"param": "value"}}]}

When you are DONE and ready to output the final code, respond with the standard code output JSON (no tool_calls):
{"file_changes": [...], "summary": "..."}` },
      { role: 'user', content: `## Task\n${context.taskPlan.task_description}\n\n## Approach\n${context.taskPlan.approach_notes}\n\n## Subtasks\n${context.taskPlan.subtasks.map(st => `- ${st.description}`).join('\n')}\n\n## Acceptance Criteria\n${context.taskPlan.acceptance_criteria.map(c => `- ${c}`).join('\n')}\n\nUse tools to explore the codebase, then generate the code.` }
    ];

    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;
      this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog(`Agent iteration ${iteration}/${maxIterations}...`));

      let rawOutput = '';
      try {
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelUsed, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
          onChunk(chunk.message.content, rawOutput);
        }
      }
      } catch (llmErr) {
        await this.saveStageResult(runId, 'action', attempt, { status: 'failed', model_used: modelUsed, duration_ms: Date.now() - startTime, error: `LLM error: ${llmErr}` });
        this.emitStageUpdate(runId, 'action', 'failed', { error: String(llmErr) });
        return null;
      }

      const toolCalls = this.parseToolCalls(rawOutput);
      if (toolCalls.length === 0) {
        const codeOutput = this.parseCodeOutputFromRaw(rawOutput);
        if (codeOutput) {
          await this.saveStageResult(runId, 'action', attempt, { status: 'complete', model_used: modelUsed, duration_ms: Date.now() - startTime, output: codeOutput });
          this.recordStageUsage(runId, 'action', modelUsed, Date.now() - startTime);
          this.emitStageUpdate(runId, 'action', 'complete', codeOutput);
          return codeOutput;
        }
        messages.push({ role: 'assistant', content: rawOutput });
        messages.push({ role: 'user', content: 'Please output the final code as the required JSON schema with "file_changes" and "summary".' });
        continue;
      }

      messages.push({ role: 'assistant', content: rawOutput });

      const toolResults: ToolResult[] = [];
      for (const call of toolCalls) {
        if (!allowedTools.includes(call.tool)) {
          toolResults.push({ tool: call.tool, output: `Tool "${call.tool}" is not allowed`, success: false });
          continue;
        }
        const safeParams = call.params || {};
        this.emitRealTimeUpdate(runId, 'action', 'processing', this.createActivityLog(`Tool: ${call.tool}(${JSON.stringify(safeParams).slice(0, 80)})`));
        try {
          const { executeTool } = await import('./tools');
          const result = await executeTool(call.tool, safeParams);
          const output = String((result as any)?.output || (result as any)?.result || JSON.stringify(result) || '').slice(0, 3000);
          toolResults.push({ tool: call.tool, output, success: (result as any).success !== false });
        } catch (err) {
          toolResults.push({ tool: call.tool, output: `Error: ${err}`, success: false });
        }
      }

      const toolResultMsg = toolResults.map(r => `## ${r.tool}: ${r.success ? 'OK' : 'FAILED'}\n${r.output}`).join('\n\n');
      messages.push({ role: 'user', content: `Tool results:\n\n${toolResultMsg}\n\nContinue. When done, output the final code JSON.` });
    }

    await this.saveStageResult(runId, 'action', attempt, { status: 'failed', model_used: modelUsed, duration_ms: Date.now() - startTime, error: 'Agent loop exhausted iterations' });
    this.emitStageUpdate(runId, 'action', 'failed', { error: 'Agent loop exhausted iterations' });
    return null;
  }

  private parseToolCalls(rawOutput: string): ToolCall[] {
    const match = rawOutput.match(/"tool_calls"\s*:\s*(\[[\s\S]*?\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* not valid */ }
    }
    return [];
  }

  private parseCodeOutputFromRaw(rawOutput: string): CodeOutput | null {
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*"file_changes"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.file_changes)) {
          return { file_changes: parsed.file_changes, summary: parsed.summary || '' };
        }
      }
    } catch { /* not valid */ }
    return null;
  }

  private buildToolDescriptions(allowedTools: string[]): string {
    const desc: Record<string, string> = {
      read_file: 'Read file contents. Params: { file_path: string }',
      list_directory: 'List directory. Params: { directory_path: string }',
      grep_search: 'Search code. Params: { pattern: string, directory?: string }',
      find_files: 'Find files. Params: { pattern: string, directory?: string }',
      write_file: 'Write file. Params: { file_path: string, content: string }',
      execute_command: 'Run command. Params: { command: string }',
      git_status: 'Git status. Params: {}',
      get_file_diff: 'Git diff. Params: {}',
      run_tests: 'Run tests. Params: { command?: string }',
      file_exists: 'Check file. Params: { file_path: string }',
      get_file_info: 'File info. Params: { file_path: string }',
    };
    return allowedTools.filter(t => desc[t]).map(t => `- ${t}: ${desc[t]}`).join('\n');
  }

  private async runReviewStage(runId: string, context: PipelineContext, options: PipelineOptions, onChunk: StreamCallback): Promise<ReviewResult | null> {
    if (!context.taskPlan || !context.codeOutput) return null;
    this.emitStageUpdate(runId, 'review', 'running');
    const reviewModel = await this.router.resolve('review');
    const reviewModelUsed = this.resolveStageModel('review', reviewModel.resolvedModel);
    const reviewStartTime = Date.now();
    const attempt = (context.retryCountByStage['review'] || 0) + 1;
    this.emitRealTimeUpdate(runId, 'review', 'sending', this.createActivityLog(`Sending to ${reviewModelUsed}`));
    try {
      let reviewResult = await this.reviewerAgent.execute(context.taskPlan, context.codeOutput, { ...reviewModel, resolvedModel: reviewModelUsed }, onChunk);
      const hasErrors = reviewResult.issues.some(i => i.severity === 'error');
      if (reviewResult.verdict === 'FAIL' && !hasErrors && reviewResult.confidence_score >= 0.5) {
        reviewResult = { ...reviewResult, verdict: 'PASS' };
      }
      await this.saveStageResult(runId, 'review', attempt, { status: 'complete', model_used: reviewModelUsed, duration_ms: Date.now() - reviewStartTime, output: reviewResult });
      this.recordStageUsage(runId, 'review', reviewModelUsed, Date.now() - reviewStartTime);
      this.emitStageUpdate(runId, 'review', 'complete', reviewResult);
      return reviewResult;
    } catch (err) {
      await this.saveStageResult(runId, 'review', attempt, { status: 'failed', model_used: reviewModelUsed, duration_ms: Date.now() - reviewStartTime, error: String(err) });
      this.emitStageUpdate(runId, 'review', 'failed', { error: String(err) });
      return null;
    }
  }

  private async runSecurityStage(runId: string, context: PipelineContext, options: PipelineOptions, root: string, onChunk: StreamCallback): Promise<SecurityResult | null> {
    if (!context.codeOutput || !context.taskPlan) { await this.markStageSkipped(runId, 'security', 'No code output'); return null; }
    this.emitStageUpdate(runId, 'security', 'running');
    const securityModel = await this.router.resolve('review');
    const securityModelUsed = this.resolveStageModel('security', securityModel.resolvedModel);
    const startTime = Date.now();
    try {
      const result = await this.securityAgent.execute(context.codeOutput, context.taskPlan, root, { ...securityModel, resolvedModel: securityModelUsed }, onChunk);
      await this.saveStageResult(runId, 'security', 1, { status: 'complete', model_used: securityModelUsed, duration_ms: Date.now() - startTime, output: result });
      this.recordStageUsage(runId, 'security', securityModelUsed, Date.now() - startTime);
      this.emitStageUpdate(runId, 'security', 'complete', result);
      return result;
    } catch (err) {
      await this.saveStageResult(runId, 'security', 1, { status: 'failed', model_used: securityModelUsed, duration_ms: Date.now() - startTime, error: String(err) });
      this.emitStageUpdate(runId, 'security', 'failed', { error: String(err) });
      return null;
    }
  }

  private async runValidateStage(runId: string, context: PipelineContext, options: PipelineOptions, onChunk: StreamCallback): Promise<ValidationResult | null> {
    if (!context.taskPlan || !context.codeOutput || !context.reviewResult) return null;
    this.emitStageUpdate(runId, 'validate', 'running');
    const validateModel = await this.router.resolve('review');
    const validateModelUsed = this.resolveStageModel('validate', validateModel.resolvedModel);
    const startTime = Date.now();
    try {
      const result = await this.validatorAgent.execute(context.taskPlan, context.codeOutput, context.reviewResult, { ...validateModel, resolvedModel: validateModelUsed }, onChunk);
      await this.saveStageResult(runId, 'validate', 1, { status: 'complete', model_used: validateModelUsed, duration_ms: Date.now() - startTime, output: result });
      this.recordStageUsage(runId, 'validate', validateModelUsed, Date.now() - startTime);
      this.emitStageUpdate(runId, 'validate', 'complete', result);
      return result;
    } catch (err) {
      await this.saveStageResult(runId, 'validate', 1, { status: 'failed', model_used: validateModelUsed, duration_ms: Date.now() - startTime, error: String(err) });
      this.emitStageUpdate(runId, 'validate', 'failed', { error: String(err) });
      return null;
    }
  }

  private async runExecuteStage(runId: string, context: PipelineContext, root: string): Promise<ExecuteResult | null> {
    if (!context.codeOutput) return null;
    this.emitStageUpdate(runId, 'execute', 'running');
    const startTime = Date.now();
    try {
      const result = await this.executorAgent.execute(context.codeOutput, root);
      await this.saveStageResult(runId, 'execute', 1, { status: 'complete', model_used: 'local-execution', duration_ms: Date.now() - startTime, output: result });
      this.emitStageUpdate(runId, 'execute', 'complete', result);
      return result;
    } catch (err) {
      await this.saveStageResult(runId, 'execute', 1, { status: 'failed', model_used: 'local-execution', duration_ms: Date.now() - startTime, error: String(err) });
      this.emitStageUpdate(runId, 'execute', 'failed', { error: String(err) });
      return null;
    }
  }

  private async runDecomposeStage(runId: string, context: PipelineContext, options: PipelineOptions, root: string, onChunk: StreamCallback): Promise<DecompositionResult | null> {
    this.emitStageUpdate(runId, 'decompose', 'running');
    this.emitRealTimeUpdate(runId, 'decompose', 'sending', this.createActivityLog('Decomposing task into subtasks...'));
    const decompModel = await this.router.resolve('planning');
    const startTime = Date.now();
    const modelUsed = this.resolveStageModel('decompose', decompModel.resolvedModel);

    const agentManager = getAgentManager();
    const allAgents = agentManager.getAll().map((a: AgentConfig) => ({
      id: a.id, name: a.name, description: a.description, tags: a.tags,
    }));
    this.decomposerAgent.setValidAgentIds(allAgents.map((a: { id: string }) => a.id));

    try {
      const result = await this.decomposerAgent.execute(
        context.taskDescription, context.researchResult,
        { ...decompModel, resolvedModel: modelUsed },
        allAgents.length > 0 ? allAgents : undefined,
        onChunk,
      );
      await this.saveStageResult(runId, 'decompose', 1, { status: 'complete', model_used: modelUsed, duration_ms: Date.now() - startTime, output: result });
      this.recordStageUsage(runId, 'decompose', modelUsed, Date.now() - startTime);
      this.emitStageUpdate(runId, 'decompose', 'complete', result);
      this.emitRealTimeUpdate(runId, 'decompose', 'complete', this.createActivityLog(`Decomposed into ${result.subtasks.length} subtask(s)`, 'success'));
      return result;
    } catch (err) {
      await this.saveStageResult(runId, 'decompose', 1, { status: 'failed', model_used: modelUsed, duration_ms: Date.now() - startTime, error: String(err) });
      this.emitStageUpdate(runId, 'decompose', 'failed', { error: String(err) });
      return null;
    }
  }

  // ── Approval Mechanism (HITL) ────────────────────────────────────────

  private shouldAwaitApproval(stage: PipelineStage): boolean {
    const approvalStages = this.activeAgent?.pipelineStages?.approvalStages;
    if (!approvalStages || approvalStages.length === 0) return false;
    return approvalStages.includes(stage);
  }

  private async requestApproval(runId: string, stage: string, result: any): Promise<'approve' | 'reject'> {
    await this.stateStore.updateRunStatus(runId, 'awaiting_approval');
    const summary = this.buildApprovalSummary(stage, result);
    this.emitApprovalRequest(runId, stage, result, summary);

    return new Promise<'approve' | 'reject'>((resolve) => {
      this.pendingApprovals.set(runId, { resolve, stage });
    });
  }

  private emitApprovalRequest(runId: string, stage: string, result: any, message: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('pipeline:await_approval', {
          runId, stage, stageResult: result, message,
          options: ['approve', 'reject'],
        } as ApprovalRequest);
      }
    }
  }

  private buildApprovalSummary(stage: string, result: any): string {
    switch (stage) {
      case 'plan': {
        const plan = result as TaskPlan;
        return `**Plan Ready**\n\nTask: ${plan.task_description}\n\nSubtasks:\n${plan.subtasks.map(s => `- ${s.description}`).join('\n')}\n\nComplexity: ${plan.estimated_complexity}`;
      }
      case 'action': {
        const code = result as CodeOutput;
        return `**Code Generated**\n\n${code.file_changes.length} file(s) changed:\n${code.file_changes.map(f => `- ${f.operation}: \`${f.file_path}\``).join('\n')}\n\n${code.summary}`;
      }
      case 'review': {
        const review = result as ReviewResult;
        return `**Review Complete**\n\nVerdict: ${review.verdict} (confidence: ${review.confidence_score})\n\n${review.issues.length} issue(s):\n${review.issues.map(i => `- [${i.severity}] ${i.description}`).join('\n')}`;
      }
      case 'security': {
        const sec = result as SecurityResult;
        return `**Security Scan Complete**\n\nVerdict: ${sec.verdict} (score: ${sec.score}/100)\n\n${sec.vulnerabilities.length} vulnerability(ies) found`;
      }
      default:
        return `**${stage} stage completed** — awaiting your approval to continue.`;
    }
  }

  async handleApproval(runId: string, decision: 'approve' | 'reject'): Promise<void> {
    const pending = this.pendingApprovals.get(runId);
    if (!pending) return;

    this.pendingApprovals.delete(runId);
    await this.stateStore.updateRunStatus(runId, 'running');
    pending.resolve(decision);
  }

  // ── Retry / Analyze (preserved) ───────────────────────────────────────

  cancel(runId: string): void { this.cancellationFlags.set(runId, true); }

  async retryFix(runId: string, suggestions: string[]): Promise<{ runId: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const taskPlan = run.stages.plan?.output as TaskPlan | undefined;
    if (!taskPlan?.subtasks?.length) throw new Error('No valid task plan available.');
    await this.stateStore.prepareForRetry(runId);
    const root = run.project_root || this.projectRoot;
    if (root) this.coderAgent.setProjectRoot(root);

    const codeModel = await this.router.resolve('code_generation');
    const codeModelUsed = this.resolveStageModel('action', codeModel.resolvedModel);
    const codeStartTime = Date.now();
    const reviewIssues = suggestions.map(s => ({ description: s, severity: 'error' as const }));

    try {
      const codeOutput = await this.coderAgent.execute(taskPlan, new Map(), reviewIssues, { ...codeModel, resolvedModel: codeModelUsed });
      await this.saveStageResult(runId, 'action', 1, { status: 'complete', model_used: codeModelUsed, duration_ms: Date.now() - codeStartTime, output: codeOutput });
      this.recordStageUsage(runId, 'action', codeModelUsed, Date.now() - codeStartTime);
      this.emitStageUpdate(runId, 'action', 'complete', codeOutput);

      const reviewModel = await this.router.resolve('review');
      const reviewModelUsed = this.resolveStageModel('review', reviewModel.resolvedModel);
      const reviewResult = await this.reviewerAgent.execute(taskPlan, codeOutput, { ...reviewModel, resolvedModel: reviewModelUsed });
      await this.saveStageResult(runId, 'review', 1, { status: 'complete', model_used: reviewModelUsed, duration_ms: 0, output: reviewResult });
      this.emitStageUpdate(runId, 'review', 'complete', reviewResult);

      if (reviewResult.verdict === 'PASS') {
        const valModel = await this.router.resolve('review');
        const valModelUsed = this.resolveStageModel('validate', valModel.resolvedModel);
        const valResult = await this.validatorAgent.execute(taskPlan, codeOutput, reviewResult, { ...valModel, resolvedModel: valModelUsed });
        await this.saveStageResult(runId, 'validate', 1, { status: 'complete', model_used: valModelUsed, duration_ms: 0, output: valResult });
        if (valResult?.passed || (reviewResult.confidence_score >= 0.7)) {
          const execResult = await this.executorAgent.execute(codeOutput, root);
          await this.saveStageResult(runId, 'execute', 1, { status: 'complete', model_used: 'local-execution', duration_ms: 0, output: execResult });
          const execVerdict = execResult.failed_files.length === 0 ? 'PASS' : 'FAIL';
          await this.stateStore.finalizeRun(runId, execVerdict);
          this.emitComplete(runId, execVerdict, codeOutput);
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
      this.emitError(runId, `Retry failed: ${err}`);
      return { runId };
    }
  }

  async analyzeAndRetry(runId: string, userPrompt: string): Promise<{ runId: string; action: string; stage?: string; task?: string; feedback?: string; reason?: string }> {
    const run = await this.stateStore.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const lower = userPrompt.toLowerCase().trim();
    if (lower.includes('cancel') || lower.includes('abort') || lower.includes('stop')) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', feedback: userPrompt };
    }
    if (lower.includes('restart') || lower.includes('start over')) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', task: run.task_description, reason: 'User requested restart' };
    }
    const taskPlan = run.stages.plan?.output as TaskPlan | undefined;
    if (!taskPlan?.subtasks?.length) {
      await this.stateStore.updateRunStatus(runId, 'cancelled');
      this.emitCancelled(runId);
      return { runId, action: 'cancelled', reason: 'No valid plan available' };
    }
    await this.stateStore.prepareForRetry(runId);
    return { runId, action: 'retry_with_feedback', stage: 'action', feedback: userPrompt };
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  private isCancelled(runId: string): boolean { return this.cancellationFlags.get(runId) === true; }

  private getStageResultFromContext(context: PipelineContext, stage: PipelineStage): any {
    switch (stage) {
      case 'plan': return context.taskPlan;
      case 'action': return context.codeOutput;
      case 'review': return context.reviewResult;
      case 'security': return context.securityResult;
      case 'validate': return context.validationResult;
      case 'research': return context.researchResult;
      case 'decompose': return context.decompositionResult;
      default: return null;
    }
  }

  private async markStageSkipped(runId: string, stage: PipelineStage, reason: string): Promise<void> {
    await this.saveStageResult(runId, stage, 1, { status: 'skipped', model_used: '', error: reason });
    this.emitStageUpdate(runId, stage, 'skipped');
  }

  private recordStageUsage(runId: string, stage: string, model: string, durationMs: number): void {
    try {
      const shared = getSharedOllama();
      const usage = shared.lastUsage;
      if (!usage) return;
      getUsageTracker().record({ messageId: `pipeline:${runId}:${stage}`, conversationId: `pipeline:${runId}`, providerId: 'ollama-default', model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens, durationMs, timestamp: Date.now() });
    } catch (err) { console.warn(`[Pipeline] Usage tracking failed for ${stage}:`, err); }
  }

  private async getContext(taskDescription: string): Promise<Array<{ content: string; relativeFilePath: string }>> {
    if (!this.vectordb) return [];
    try {
      const embeddings = new OllamaEmbeddingsService();
      const queryVector = await embeddings.generateEmbedding('nomic-embed-text:latest', taskDescription);
      const results = await this.vectordb.searchSimilar(queryVector, 5);
      return results.map(r => ({ content: r.content, relativeFilePath: r.relativeFilePath }));
    } catch { return []; }
  }

  private async saveStageResult(runId: string, stage: string, attempt: number, result: StageResult<any>): Promise<void> {
    await this.stateStore.saveStageResult(runId, stage, attempt, result);
  }

  private async handleCancellation(runId: string, template?: string): Promise<{ runId: string }> {
    await this.stateStore.updateRunStatus(runId, 'cancelled');
    this.emitCancelled(runId);
    this.stateStore.recordAnalytics(runId, template);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  private async handleTimeout(runId: string, message: string, template?: string): Promise<{ runId: string }> {
    await this.stateStore.updateRunStatus(runId, 'failed');
    this.emitError(runId, message);
    this.stateStore.recordAnalytics(runId, template);
    this.cancellationFlags.delete(runId);
    return { runId };
  }

  // ── Emitters ──────────────────────────────────────────────────────────

  private emitStageUpdate(runId: string, stage: string, status: string, output?: any): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:stage_update', { runId, stage, status, output }); }
  }

  private emitRealTimeUpdate(runId: string, stage: string, subStatus: RealTimeStatus, logEntry?: ActivityLogEntry, data?: { input_preview?: string; output_preview?: string }): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:realtime_update', { runId, stage, subStatus, logEntry, data }); }
  }

  private emitStageStream(runId: string, stage: string, content: string, accumulated: string, done: boolean): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:stage_stream', { runId, stage, content, accumulated: accumulated.slice(-5000), done }); }
  }

  private createActivityLog(message: string, type: ActivityLogEntry['type'] = 'info'): ActivityLogEntry {
    return { timestamp: Date.now(), message, type };
  }

  private emitComplete(runId: string, verdict: string, output?: CodeOutput): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:complete', { runId, verdict, finalOutput: output }); }
  }

  private emitCancelled(runId: string): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:cancelled', { runId }); }
  }

  private emitError(runId: string, error: string): void {
    for (const win of BrowserWindow.getAllWindows()) { if (!win.isDestroyed()) win.webContents.send('pipeline:error', { runId, error }); }
  }
}

let instance: PipelineOrchestrator | null = null;
export function getPipelineOrchestrator(stateStore?: PipelineStateStore, vectordb?: VectorDBService): PipelineOrchestrator {
  if (!instance) { instance = new PipelineOrchestrator(stateStore || new PipelineStateStore(), vectordb); }
  return instance;
}
