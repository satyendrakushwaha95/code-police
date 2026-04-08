import * as path from 'path';
import { ScanRule, RawFinding, Finding, ScanLanguage, FindingCategory, FindingSeverity } from '../scan-types';

const LANGUAGE_EXTENSIONS: Record<ScanLanguage, string[]> = {
  java: ['.java', '.kt', '.gradle', '.xml', '.properties', '.yml', '.yaml'],
  angular: ['.ts', '.tsx', '.html', '.json', '.js', '.jsx'],
  php: ['.php', '.blade.php', '.twig', '.inc', '.phtml'],
  general: [
    '.java', '.kt', '.ts', '.tsx', '.js', '.jsx', '.php', '.py', '.rb', '.go',
    '.env', '.yml', '.yaml', '.json', '.xml', '.properties', '.ini', '.cfg',
    '.conf', '.toml', '.dockerfile',
  ],
};

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.jar', '.war', '.ear',
  '.exe', '.dll', '.so', '.dylib', '.class', '.pyc', '.pyo',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg', '.webm',
  '.lock', '.map',
]);

export class RuleRegistry {
  private rules = new Map<string, ScanRule>();
  private rulesByLanguage = new Map<ScanLanguage, ScanRule[]>();

  register(rule: ScanRule): void {
    if (this.rules.has(rule.id)) {
      console.warn(`[RuleRegistry] Duplicate rule ID: ${rule.id}, overwriting`);
    }
    this.rules.set(rule.id, rule);

    const langRules = this.rulesByLanguage.get(rule.language) || [];
    langRules.push(rule);
    this.rulesByLanguage.set(rule.language, langRules);
  }

  registerMany(rules: ScanRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  getRule(id: string): ScanRule | undefined {
    return this.rules.get(id);
  }

  getRulesForLanguage(language: ScanLanguage): ScanRule[] {
    return this.rulesByLanguage.get(language) || [];
  }

  getRulesForFile(filePath: string, languages?: ScanLanguage[]): ScanRule[] {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();
    const applicable: ScanRule[] = [];

    const targetLanguages = languages || (['java', 'angular', 'php', 'general'] as ScanLanguage[]);

    for (const lang of targetLanguages) {
      const langRules = this.rulesByLanguage.get(lang) || [];
      for (const rule of langRules) {
        if (this.matchesFilePattern(filePath, ext, fileName, rule.filePatterns)) {
          if (!rule.excludePatterns || !this.matchesFilePattern(filePath, ext, fileName, rule.excludePatterns)) {
            applicable.push(rule);
          }
        }
      }
    }

    return applicable;
  }

  getRulesFiltered(options?: {
    languages?: ScanLanguage[];
    categories?: FindingCategory[];
    severities?: FindingSeverity[];
    ruleIds?: string[];
  }): ScanRule[] {
    let rules = Array.from(this.rules.values());

    if (options?.languages?.length) {
      rules = rules.filter(r => options.languages!.includes(r.language));
    }
    if (options?.categories?.length) {
      rules = rules.filter(r => options.categories!.includes(r.category));
    }
    if (options?.severities?.length) {
      rules = rules.filter(r => options.severities!.includes(r.severity));
    }
    if (options?.ruleIds?.length) {
      const idSet = new Set(options.ruleIds);
      rules = rules.filter(r => idSet.has(r.id));
    }

    return rules;
  }

  getAllRules(): ScanRule[] {
    return Array.from(this.rules.values());
  }

  getRuleCount(): number {
    return this.rules.size;
  }

  getLanguages(): ScanLanguage[] {
    return Array.from(this.rulesByLanguage.keys());
  }

  private matchesFilePattern(filePath: string, ext: string, fileName: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern.startsWith('*.')) {
        const patternExt = pattern.slice(1);
        if (ext === patternExt || filePath.endsWith(patternExt)) return true;
      } else if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
        if (regex.test(fileName) || regex.test(filePath)) return true;
      } else {
        if (fileName === pattern.toLowerCase() || filePath.endsWith(pattern)) return true;
      }
    }
    return false;
  }
}

// ── Utility Functions for Rule Authors ─────────────────────────────────────

export function detectLanguage(filePath: string): ScanLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();

  if (['.java', '.kt'].includes(ext)) return 'java';
  if (ext === '.gradle' || fileName === 'pom.xml' || fileName === 'build.gradle') return 'java';

  if (['.php', '.phtml', '.inc'].includes(ext)) return 'php';
  if (filePath.endsWith('.blade.php') || filePath.endsWith('.twig')) return 'php';
  if (fileName === 'composer.json') return 'php';

  if (['.ts', '.tsx'].includes(ext)) return 'angular';
  if (fileName === 'angular.json' || fileName === 'tsconfig.json') return 'angular';

  return null;
}

export function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

export function getLanguageExtensions(language: ScanLanguage): string[] {
  return LANGUAGE_EXTENSIONS[language] || [];
}

export function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function extractSnippet(content: string, line: number, contextLines: number = 3): string {
  const lines = content.split('\n');
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  return lines.slice(start, end).map((l, i) => {
    const lineNum = start + i + 1;
    const marker = lineNum === line ? '>' : ' ';
    return `${marker} ${String(lineNum).padStart(4)} | ${l}`;
  }).join('\n');
}

export function findAllMatches(
  content: string,
  regex: RegExp,
  filePath: string,
): RawFinding[] {
  const findings: RawFinding[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineContent = lines[i];
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let match: RegExpExecArray | null;

    while ((match = globalRegex.exec(lineContent)) !== null) {
      findings.push({
        line: i + 1,
        column: match.index + 1,
        matchedCode: match[0],
        context: extractSnippet(content, i + 1),
      });
      if (!regex.flags.includes('g')) break;
    }
  }

  return findings;
}

export function findMultilineMatches(
  content: string,
  regex: RegExp,
): RawFinding[] {
  const findings: RawFinding[] = [];
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(content)) !== null) {
    const linesBefore = content.slice(0, match.index).split('\n');
    const line = linesBefore.length;
    const endLine = line + match[0].split('\n').length - 1;

    findings.push({
      line,
      endLine,
      column: linesBefore[linesBefore.length - 1].length + 1,
      matchedCode: match[0],
      context: extractSnippet(content, line),
    });
  }

  return findings;
}

export function lineContains(line: string, ...tokens: string[]): boolean {
  const lower = line.toLowerCase();
  return tokens.some(t => lower.includes(t.toLowerCase()));
}

export function isCommentLine(line: string, language: ScanLanguage): boolean {
  const trimmed = line.trim();
  switch (language) {
    case 'java':
      return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    case 'angular':
      return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    case 'php':
      return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    default:
      return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*');
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance: RuleRegistry | null = null;

export function getRuleRegistry(): RuleRegistry {
  if (!instance) {
    instance = new RuleRegistry();
  }
  return instance;
}

export function initializeRuleRegistry(): RuleRegistry {
  const registry = getRuleRegistry();
  if (registry.getRuleCount() > 0) return registry;

  // Static imports are resolved at bundle time — safe for Vite/Rollup
  // The actual rule packs are imported at the top of scan-engine.ts and passed in via loadAllRules()
  console.warn('[RuleRegistry] initializeRuleRegistry called but rules must be loaded via loadAllRules()');
  return registry;
}

export function loadAllRules(
  generalRules: ScanRule[],
  javaRules: ScanRule[],
  angularRules: ScanRule[],
  phpRules: ScanRule[],
): RuleRegistry {
  const registry = getRuleRegistry();
  if (registry.getRuleCount() > 0) return registry;

  registry.registerMany(generalRules);
  registry.registerMany(javaRules);
  registry.registerMany(angularRules);
  registry.registerMany(phpRules);

  console.log(`[RuleRegistry] Initialized with ${registry.getRuleCount()} rules`);
  return registry;
}
