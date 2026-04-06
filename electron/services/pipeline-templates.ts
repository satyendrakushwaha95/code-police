import { PipelineTemplateConfig, PipelineTemplate } from './pipeline-types';

export const PIPELINE_TEMPLATES: PipelineTemplateConfig[] = [
  {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'Fast bug fixes — skips review and validation',
    stages: ['plan', 'action', 'execute'],
    icon: '⚡',
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Full pipeline for most tasks',
    stages: ['plan', 'action', 'review', 'validate', 'execute'],
    icon: '🔄',
  },
  {
    id: 'deep-review',
    name: 'Deep Review',
    description: 'Thorough review with research and security audit',
    stages: ['research', 'plan', 'action', 'review', 'security', 'validate', 'execute'],
    icon: '🔍',
  },
  {
    id: 'docs-only',
    name: 'Docs Only',
    description: 'Documentation tasks — no code execution',
    stages: ['research', 'plan', 'action', 'review'],
    icon: '📝',
  },
  {
    id: 'refactor',
    name: 'Refactor',
    description: 'Code restructuring with safety checks',
    stages: ['research', 'action', 'review', 'validate', 'execute'],
    icon: '🔧',
  },
];

export function getTemplateById(id: PipelineTemplate): PipelineTemplateConfig | undefined {
  return PIPELINE_TEMPLATES.find(t => t.id === id);
}

export function getDefaultTemplate(): PipelineTemplateConfig {
  return PIPELINE_TEMPLATES.find(t => t.id === 'standard')!;
}
