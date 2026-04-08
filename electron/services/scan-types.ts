// ── Scan System Type Definitions ──────────────────────────────────────────────

export type ScanLanguage = 'java' | 'angular' | 'php' | 'general';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'security' | 'bug' | 'quality' | 'dependency' | 'config';
export type ScanStatus = 'running' | 'complete' | 'failed' | 'cancelled';
export type FindingStatus = 'open' | 'fixed' | 'ignored' | 'false_positive';
export type LlmVerdict = 'confirmed' | 'false_positive' | 'needs_review';
export type ScanProfileId = 'full' | 'quick' | 'owasp' | 'dependency' | 'quality' | 'custom';
export type ScanPhase =
  | 'initializing'
  | 'analyzing_project'
  | 'discovering_files'
  | 'scanning_rules'
  | 'auditing_dependencies'
  | 'auditing_config'
  | 'indexing_vectors'
  | 'llm_analysis'
  | 'aggregating'
  | 'generating_summary'
  | 'complete';

export type ReportFormat = 'html' | 'pdf' | 'sarif' | 'json' | 'markdown';

// ── Rule Types ───────────────────────────────────────────────────────────────

export interface ScanRule {
  id: string;
  language: ScanLanguage;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  cweId?: string;
  owaspCategory?: string;
  filePatterns: string[];
  excludePatterns?: string[];
  detect: (content: string, filePath: string) => RawFinding[];
  fixGuidance: string;
}

export interface RawFinding {
  line: number;
  column?: number;
  endLine?: number;
  matchedCode: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

// ── Finding Types ────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  scanId: string;
  ruleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  type: string;
  title: string;
  description: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  columnStart?: number;
  codeSnippet?: string;
  cweId?: string;
  owaspCategory?: string;
  confidence: 'high' | 'medium' | 'low';
  llmValidated: boolean;
  llmVerdict?: LlmVerdict;
  llmExplanation?: string;
  fixAvailable: boolean;
  fixCode?: string;
  fixExplanation?: string;
  status: FindingStatus;
  createdAt: number;
}

export interface DependencyFinding {
  id: string;
  scanId: string;
  packageName: string;
  currentVersion?: string;
  fixedVersion?: string;
  severity: FindingSeverity;
  cveId?: string;
  description?: string;
  ecosystem: 'npm' | 'composer' | 'maven';
}

// ── Scan Types ───────────────────────────────────────────────────────────────

export interface ScanConfig {
  projectRoot: string;
  profile: ScanProfileId;
  languages?: ScanLanguage[];
  fileGlobs?: string[];
  excludeGlobs?: string[];
  severityThreshold?: FindingSeverity;
  enableLlmReview: boolean;
  enableDependencyAudit: boolean;
  enableConfigAudit: boolean;
  maxFileSizeBytes?: number;
  customRuleIds?: string[];
}

export interface ScanRecord {
  id: string;
  projectRoot: string;
  projectName?: string;
  profile: ScanProfileId;
  status: ScanStatus;
  languages: ScanLanguage[];
  startedAt: number;
  completedAt?: number;
  totalFiles: number;
  filesScanned: number;
  healthScore?: number;
  summary?: string;
  config: ScanConfig;
}

export interface ScanResults {
  scan: ScanRecord;
  findings: Finding[];
  dependencyFindings: DependencyFinding[];
  metrics: ScanMetrics;
}

export interface ScanMetrics {
  id: string;
  scanId: string;
  projectRoot: string;
  healthScore: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  totalFindings: number;
  filesScanned: number;
  scanDuration: number;
  llmTokensUsed: number;
  timestamp: number;
}

export interface ScanSummary {
  id: string;
  projectRoot: string;
  projectName?: string;
  profile: ScanProfileId;
  status: ScanStatus;
  healthScore?: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  startedAt: number;
  completedAt?: number;
  scanDuration?: number;
}

export interface ScanComparison {
  scanA: ScanSummary;
  scanB: ScanSummary;
  newFindings: Finding[];
  resolvedFindings: Finding[];
  unchangedCount: number;
  healthScoreDelta: number;
}

// ── Progress & Events ────────────────────────────────────────────────────────

export interface ScanProgress {
  scanId: string;
  phase: ScanPhase;
  filesScanned: number;
  totalFiles: number;
  currentFile?: string;
  findingsCount: number;
  elapsedMs: number;
  message?: string;
}

// ── Report Types ─────────────────────────────────────────────────────────────

export interface ReportOptions {
  scanId: string;
  format: ReportFormat;
  includeFixSuggestions: boolean;
  includeLlmExplanations: boolean;
  severityFilter?: FindingSeverity[];
  outputPath?: string;
}

export interface ReportResult {
  filePath?: string;
  content?: string;
  format: ReportFormat;
  sizeBytes: number;
}

export interface ReportData {
  scan: ScanRecord;
  findings: Finding[];
  dependencyFindings: DependencyFinding[];
  metrics: ScanMetrics;
  trend: TrendDataPoint[];
  executiveSummary?: string;
}

export interface TrendDataPoint {
  scanId: string;
  healthScore: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  timestamp: number;
}

// ── Fix Types ────────────────────────────────────────────────────────────────

export interface FixResult {
  findingId: string;
  fixedCode: string;
  explanation: string;
  breakingChanges: boolean;
  testSuggestion?: string;
}

export interface ApplyResult {
  findingId: string;
  filePath: string;
  success: boolean;
  error?: string;
  backupPath?: string;
}

// ── Filter Types ─────────────────────────────────────────────────────────────

export interface FindingFilters {
  severity?: FindingSeverity[];
  category?: FindingCategory[];
  language?: ScanLanguage[];
  type?: string[];
  filePath?: string;
  status?: FindingStatus[];
  cweId?: string;
  llmVerdict?: LlmVerdict[];
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

// ── Scan Profile ─────────────────────────────────────────────────────────────

export interface ScanProfile {
  id: ScanProfileId;
  name: string;
  description: string;
  icon: string;
  enableLlmReview: boolean;
  enableDependencyAudit: boolean;
  enableConfigAudit: boolean;
  ruleFilter?: {
    categories?: FindingCategory[];
    severities?: FindingSeverity[];
    languages?: ScanLanguage[];
    ruleIds?: string[];
  };
  quickScanOnly?: boolean;
}

// ── Dependency Audit ─────────────────────────────────────────────────────────

export interface DependencyAuditResult {
  ecosystem: 'npm' | 'composer' | 'maven';
  findings: DependencyFinding[];
  totalPackages: number;
  auditCommand?: string;
  rawOutput?: string;
}

// ── LLM Analysis ─────────────────────────────────────────────────────────────

export interface LlmReviewRequest {
  findings: Finding[];
  fileContents: Map<string, string>;
  relatedCode?: Array<{ filePath: string; content: string; relevance: string }>;
}

export interface LlmReviewResult {
  findingId: string;
  verdict: LlmVerdict;
  confidence: number;
  explanation: string;
  attackVector?: string;
}

export interface LlmFixRequest {
  finding: Finding;
  fileContent: string;
  fixGuidance: string;
}
