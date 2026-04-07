import { PipelineStage, PipelineTemplate, TaskPlan, CodeOutput, ReviewResult, SecurityResult, ValidationResult, ResearchResult, DecompositionResult } from './pipeline-types';

export interface PipelineContext {
  taskDescription: string;
  taskPlan?: TaskPlan;
  codeOutput?: CodeOutput;
  reviewResult?: ReviewResult;
  securityResult?: SecurityResult;
  validationResult?: ValidationResult;
  researchResult?: ResearchResult;
  decompositionResult?: DecompositionResult;
  retryCountByStage: Record<string, number>;
  replanCount: number;
  template: PipelineTemplate;
  stageNotes: string[];
}

export interface StageNode {
  id: PipelineStage;
  condition?: (context: PipelineContext) => boolean;
  onFail: 'stop' | 'retry' | 'skip' | 'replan';
  maxRetries?: number;
  resolveNext: (context: PipelineContext, result: any) => PipelineStage | PipelineStage[] | null;
  waitFor?: PipelineStage[];
}

export interface PipelineGraph {
  entry: PipelineStage | PipelineStage[];
  nodes: Map<PipelineStage, StageNode>;
}

export const MAX_REPLANS = 2;

export function buildPipelineGraph(template: PipelineTemplate): PipelineGraph {
  const nodes = new Map<PipelineStage, StageNode>();

  switch (template) {
    case 'quick-fix':
      // Plan → Action → Execute
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 2, resolveNext: () => 'execute' });
      nodes.set('execute', { id: 'execute', onFail: 'stop', resolveNext: () => null });
      return { entry: 'plan', nodes };

    case 'deep-review':
      // Research → Plan → Action → Review → Security → Validate → Execute
      nodes.set('research', { id: 'research', onFail: 'skip', resolveNext: () => 'plan' });
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 2, resolveNext: () => 'review' });
      nodes.set('review', {
        id: 'review', onFail: 'retry', maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'security';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('security', {
        id: 'security', onFail: 'stop',
        resolveNext: (ctx) => {
          const criticalCount = ctx.securityResult?.vulnerabilities.filter(v => v.severity === 'critical').length || 0;
          return criticalCount > 0 ? null : 'validate';
        },
      });
      nodes.set('validate', { id: 'validate', onFail: 'stop', resolveNext: (ctx) => {
        if (ctx.validationResult?.passed) return 'execute';
        if ((ctx.reviewResult?.confidence_score ?? 0) >= 0.7) return 'execute';
        return null;
      }});
      nodes.set('execute', { id: 'execute', onFail: 'stop', resolveNext: () => null });
      return { entry: 'research', nodes };

    case 'docs-only':
      // Research → Plan → Action → Review
      nodes.set('research', { id: 'research', onFail: 'skip', resolveNext: () => 'plan' });
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 1, resolveNext: () => 'review' });
      nodes.set('review', { id: 'review', onFail: 'stop', resolveNext: () => null });
      return { entry: 'research', nodes };

    case 'refactor':
      // Research → Plan → Action → Review → Validate → Execute
      nodes.set('research', { id: 'research', onFail: 'skip', resolveNext: () => 'plan' });
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 2, resolveNext: () => 'review' });
      nodes.set('review', {
        id: 'review', onFail: 'retry', maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', { id: 'validate', onFail: 'stop', resolveNext: (ctx) => {
        if (ctx.validationResult?.passed) return 'execute';
        if ((ctx.reviewResult?.confidence_score ?? 0) >= 0.7) return 'execute';
        return null;
      }});
      nodes.set('execute', { id: 'execute', onFail: 'stop', resolveNext: () => null });
      return { entry: 'research', nodes };

    case 'complex':
      // Research → Decompose → Plan → Action → Review → Validate → Execute
      // If decompose produces multiple subtasks, plan-execute are delegated to children
      nodes.set('research', { id: 'research', onFail: 'skip', resolveNext: () => 'decompose' });
      nodes.set('decompose', {
        id: 'decompose', onFail: 'stop',
        resolveNext: (ctx) => {
          if (ctx.decompositionResult && ctx.decompositionResult.subtasks.length > 1) return null;
          return 'plan';
        },
      });
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 2, resolveNext: () => 'review' });
      nodes.set('review', {
        id: 'review', onFail: 'retry', maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', { id: 'validate', onFail: 'stop', resolveNext: (ctx) => {
        if (ctx.validationResult?.passed) return 'execute';
        if ((ctx.reviewResult?.confidence_score ?? 0) >= 0.7) return 'execute';
        return null;
      }});
      nodes.set('execute', { id: 'execute', onFail: 'stop', resolveNext: () => null });
      return { entry: 'research', nodes };

    default: // 'standard'
      // Plan → Action → Review → Validate → Execute
      nodes.set('plan', { id: 'plan', onFail: 'stop', resolveNext: () => 'action' });
      nodes.set('action', { id: 'action', onFail: 'retry', maxRetries: 2, resolveNext: () => 'review' });
      nodes.set('review', {
        id: 'review', onFail: 'retry', maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', { id: 'validate', onFail: 'stop', resolveNext: (ctx) => {
        if (ctx.validationResult?.passed) return 'execute';
        if ((ctx.reviewResult?.confidence_score ?? 0) >= 0.7) return 'execute';
        return null;
      }});
      nodes.set('execute', { id: 'execute', onFail: 'stop', resolveNext: () => null });
      return { entry: 'plan', nodes };
  }
}
