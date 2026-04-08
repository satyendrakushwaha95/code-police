import { ScanProfile, ScanProfileId } from './scan-types';

export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'quick',
    name: 'Quick Scan',
    description: 'Scans only files changed since the last scan (git diff). Fast feedback loop.',
    icon: '⚡',
    enableLlmReview: false,
    enableDependencyAudit: false,
    enableConfigAudit: true,
    quickScanOnly: true,
    ruleFilter: {
      severities: ['critical', 'high'],
    },
  },
  {
    id: 'full',
    name: 'Full Audit',
    description: 'Comprehensive scan of all source files with LLM deep analysis and dependency audit.',
    icon: '🛡️',
    enableLlmReview: true,
    enableDependencyAudit: true,
    enableConfigAudit: true,
  },
  {
    id: 'owasp',
    name: 'OWASP Top 10',
    description: 'Targeted scan for OWASP Top 10 vulnerability categories: injection, auth, XSS, SSRF, etc.',
    icon: '🎯',
    enableLlmReview: true,
    enableDependencyAudit: false,
    enableConfigAudit: true,
    ruleFilter: {
      categories: ['security'],
    },
  },
  {
    id: 'dependency',
    name: 'Dependency Audit',
    description: 'Scans package manifests for known CVEs. Runs npm audit, composer audit, Maven checks.',
    icon: '📦',
    enableLlmReview: false,
    enableDependencyAudit: true,
    enableConfigAudit: false,
    ruleFilter: {
      categories: ['dependency'],
    },
  },
  {
    id: 'quality',
    name: 'Code Quality',
    description: 'Bug patterns, code smells, type safety issues, and performance anti-patterns.',
    icon: '🔍',
    enableLlmReview: false,
    enableDependencyAudit: false,
    enableConfigAudit: false,
    ruleFilter: {
      categories: ['bug', 'quality'],
    },
  },
  {
    id: 'custom',
    name: 'Custom Scan',
    description: 'Choose which rule sets, languages, and severity levels to include.',
    icon: '⚙️',
    enableLlmReview: true,
    enableDependencyAudit: true,
    enableConfigAudit: true,
  },
];

export function getProfileById(id: ScanProfileId): ScanProfile | undefined {
  return SCAN_PROFILES.find(p => p.id === id);
}

export function getDefaultProfile(): ScanProfile {
  return SCAN_PROFILES.find(p => p.id === 'full')!;
}
