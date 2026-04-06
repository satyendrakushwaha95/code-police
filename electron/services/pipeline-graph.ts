import { PipelineStage, PipelineTemplate, TaskPlan, CodeOutput, ReviewResult, SecurityResult, ValidationResult, ResearchResult } from './pipeline-types';

export interface PipelineContext {
  taskDescription: string;
  taskPlan?: TaskPlan;
  codeOutput?: CodeOutput;
  reviewResult?: ReviewResult;
  securityResult?: SecurityResult;
  validationResult?: ValidationResult;
  researchResult?: ResearchResult;
  retryCountByStage: Record<string, number>;
  replanCount: number;
  template: PipelineTemplate;
}

export interface StageNode {
  id: PipelineStage;
  condition?: (context: PipelineContext) => boolean;
  onFail: 'stop' | 'retry' | 'skip' | 'replan';
  maxRetries?: number;
  resolveNext: (context: PipelineContext, result: any) => PipelineStage | null;
}

export interface PipelineGraph {
  entry: PipelineStage;
  nodes: Map<PipelineStage, StageNode>;
}

export const MAX_REPLANS = 2;

export function buildPipelineGraph(template: PipelineTemplate): PipelineGraph {
  const nodes = new Map<PipelineStage, StageNode>();

  switch (template) {
    case 'quick-fix':
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'execute',
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'plan', nodes };

    case 'deep-review':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'plan',
      });
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'security';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('security', {
        id: 'security',
        onFail: 'stop',
        resolveNext: (ctx) => {
          const criticalCount = ctx.securityResult?.vulnerabilities.filter(v => v.severity === 'critical').length || 0;
          if (criticalCount > 0) return null;
          return 'validate';
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    case 'docs-only':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'plan',
      });
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 1,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    case 'refactor':
      nodes.set('research', {
        id: 'research',
        onFail: 'skip',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'research', nodes };

    default: // 'standard'
      nodes.set('plan', {
        id: 'plan',
        onFail: 'stop',
        resolveNext: () => 'action',
      });
      nodes.set('action', {
        id: 'action',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: () => 'review',
      });
      nodes.set('review', {
        id: 'review',
        onFail: 'retry',
        maxRetries: 2,
        resolveNext: (ctx) => {
          if (ctx.reviewResult?.verdict === 'PASS') return 'validate';
          ctx.retryCountByStage['review'] = (ctx.retryCountByStage['review'] || 0) + 1;
          if (ctx.retryCountByStage['review'] < 2) return 'action';
          return null;
        },
      });
      nodes.set('validate', {
        id: 'validate',
        onFail: 'stop',
        resolveNext: (ctx) => ctx.validationResult?.passed ? 'execute' : null,
      });
      nodes.set('execute', {
        id: 'execute',
        onFail: 'stop',
        resolveNext: () => null,
      });
      return { entry: 'plan', nodes };
  }
}
