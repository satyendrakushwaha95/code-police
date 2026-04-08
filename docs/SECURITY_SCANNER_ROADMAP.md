# LocalMind Security — Transformation Roadmap

> **From**: AI Engineering Workspace (chat + code generation + pipelines)  
> **To**: LLM-Augmented Security & Bug Scanner for Java, Angular, PHP projects  
> **Principle**: Everything runs locally. No external SAST tools. No cloud dependencies (unless user adds a cloud provider for LLM).

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [What Gets Removed](#3-what-gets-removed)
4. [What Gets Kept](#4-what-gets-kept)
5. [What Gets Built](#5-what-gets-built)
6. [Data Model](#6-data-model)
7. [Scan Engine Design](#7-scan-engine-design)
8. [Language Rule Packs](#8-language-rule-packs)
9. [LLM Integration Layer](#9-llm-integration-layer)
10. [Reporting & Sharing](#10-reporting--sharing)
11. [Frontend Architecture](#11-frontend-architecture)
12. [IPC Contract](#12-ipc-contract)
13. [Implementation Phases](#13-implementation-phases)
14. [File-Level Task List](#14-file-level-task-list)

---

## 1. Product Vision

### What This Tool Does

A desktop application where developers open their Java, Angular, or PHP project and get:

1. **Deep security scanning** — not just regex pattern matching, but LLM-augmented analysis that understands data flow, business logic, and attack vectors
2. **Bug detection** — common bug patterns per language (null safety, resource leaks, race conditions, type mismatches)
3. **Actionable findings** — every vulnerability comes with severity, CWE ID, exact file+line, explanation of the attack vector, and an LLM-generated fix
4. **Scan history** — track security posture over time, see regressions, compare scans
5. **Fix generation** — click a finding, see the proposed fix in a diff viewer, apply it

### Why It's Different

| Existing Tools | LocalMind Security |
|---|---|
| Regex/AST pattern matching only | Regex + LLM deep reasoning on code context |
| Generic rules, many false positives | Language-specific rules + LLM false-positive elimination |
| Findings with no fix | Every finding gets an LLM-generated remediation patch |
| No semantic understanding | Vector DB indexes the project, LLM understands cross-file data flow |
| Cloud-dependent (Snyk, Sonar Cloud) | Fully local (Ollama) or optional cloud LLM |
| Per-seat SaaS pricing | One desktop app, run locally |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS                    │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Scan Engine   │  │ LLM Analyzer │  │ Fix Generator         │  │
│  │              │  │              │  │                       │  │
│  │ ┌──────────┐ │  │ Provider     │  │ Takes finding +       │  │
│  │ │ Java     │ │  │ Registry     │  │ file context →        │  │
│  │ │ Rules    │ │  │ (Ollama /    │  │ LLM generates patch   │  │
│  │ ├──────────┤ │  │  OpenAI /    │  │ → DiffViewer          │  │
│  │ │ Angular  │ │  │  Anthropic)  │  └───────────────────────┘  │
│  │ │ Rules    │ │  │              │                              │
│  │ ├──────────┤ │  │ Deep Review  │  ┌───────────────────────┐  │
│  │ │ PHP      │ │  │ per cluster  │  │ Scan State Store      │  │
│  │ │ Rules    │ │  │ of findings  │  │ (SQLite)              │  │
│  │ ├──────────┤ │  └──────────────┘  │                       │  │
│  │ │ General  │ │                    │ Scans, findings,      │  │
│  │ │ Rules    │ │  ┌──────────────┐  │ history, metrics      │  │
│  │ └──────────┘ │  │ VectorDB     │  └───────────────────────┘  │
│  │              │  │ (LanceDB)    │                              │
│  │ File Scanner │  │              │  ┌───────────────────────┐  │
│  │ Dep Auditor  │  │ Semantic     │  │ Project Analyzer      │  │
│  │ Config Audit │  │ code search  │  │ (tech stack, files)   │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                 │
│                         IPC BRIDGE                              │
├─────────────────────────────────────────────────────────────────┤
│                      ELECTRON RENDERER                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Scan          │  │ Findings     │  │ Fix Viewer            │  │
│  │ Dashboard     │  │ Explorer     │  │ (DiffViewer)          │  │
│  │              │  │              │  │                       │  │
│  │ Health score │  │ Sortable     │  │ Before/after code     │  │
│  │ Scan history │  │ table with   │  │ with apply button     │  │
│  │ Charts       │  │ severity,    │  │                       │  │
│  │ Quick scan   │  │ type, file   │  └───────────────────────┘  │
│  └──────────────┘  │ filters      │                              │
│                    └──────────────┘  ┌───────────────────────┐  │
│  ┌──────────────┐                    │ Report View           │  │
│  │ Sidebar       │  ┌──────────────┐ │ Formatted document    │  │
│  │              │  │ Report       │  │ for reading/sharing   │  │
│  │ Scan history │  │ Generator    │  │ Export: HTML, PDF,    │  │
│  │ Navigation   │  │ (Backend)    │  │ SARIF, JSON, Markdown │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                  │
│  ┌──────────────┐                    ┌───────────────────────┐  │
│  │ Chat (kept)   │  ┌──────────────┐ │ File Panel (kept)     │  │
│  │ Ask about     │  │ Settings     │  │ Browse + view code    │  │
│  │ findings      │  │ (kept)       │  └───────────────────────┘  │
│  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow for a Scan

```
User clicks "Start Scan" (profile: Full Audit / Quick Scan / OWASP Top 10 / etc.)
        │
        ▼
┌─ Scan Orchestrator ──────────────────────────────────────────────┐
│                                                                  │
│  1. PROJECT ANALYSIS                                             │
│     └─ project-analyzer.ts detects language, framework, files    │
│                                                                  │
│  2. FILE DISCOVERY                                               │
│     └─ Walk project tree, filter by language/glob, respect       │
│        .gitignore, collect source files to scan                  │
│                                                                  │
│  3. STATIC RULE ENGINE (parallel per file)                       │
│     ├─ Load rule pack for detected language(s)                   │
│     ├─ Run each rule's regex/logic against file content          │
│     ├─ Record raw findings with file, line, column, snippet      │
│     └─ Tag each finding with CWE ID, severity, category          │
│                                                                  │
│  4. DEPENDENCY AUDIT (parallel with step 3)                      │
│     ├─ package.json → npm audit --json (Node/Angular)            │
│     ├─ composer.json → composer audit --format=json (PHP)        │
│     ├─ pom.xml → parse <dependency> versions vs known CVEs (Java)│
│     └─ All run locally via child_process                         │
│                                                                  │
│  5. CONFIG AUDIT (parallel with step 3)                          │
│     ├─ .env files with secrets                                   │
│     ├─ CORS / CSP headers in config                              │
│     ├─ Debug mode enabled in production config                   │
│     ├─ Insecure cookie flags                                     │
│     └─ Framework-specific security settings                      │
│                                                                  │
│  6. SEMANTIC INDEXING                                             │
│     └─ Index scanned files into VectorDB (if not already)        │
│                                                                  │
│  7. LLM DEEP ANALYSIS                                            │
│     ├─ Cluster raw findings by file/type                         │
│     ├─ For each cluster, pull surrounding code + related files    │
│     │   from VectorDB                                            │
│     ├─ Send to LLM with security-analyst prompt                  │
│     ├─ LLM validates/enriches each finding:                      │
│     │   - Confirms or marks as false positive                    │
│     │   - Explains the actual attack vector                      │
│     │   - Rates exploitability                                   │
│     │   - Generates remediation code                             │
│     └─ Merge LLM results back into findings                      │
│                                                                  │
│  8. AGGREGATION                                                  │
│     ├─ Deduplicate findings                                      │
│     ├─ Calculate health score                                    │
│     ├─ Generate scan summary                                     │
│     └─ Persist to SQLite (scan_results table)                    │
│                                                                  │
│  9. EMIT RESULTS                                                 │
│     └─ Push to renderer via IPC events                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. What Gets Removed

### Frontend Components to Delete

| File | Reason |
|------|--------|
| `src/components/Chat/CodeGenModal.tsx` | Code generation feature |
| `src/components/Chat/CodeGenPanel.tsx` | Code generation feature |
| `src/components/Chat/RefactorModal.tsx` | Code refactoring feature |
| `src/components/Chat/RefactorPanel.tsx` | Code refactoring feature |
| `src/components/Chat/DesignDocModal.tsx` | Design doc generation |
| `src/components/Chat/DesignDocPanel.tsx` | Design doc generation |
| `src/components/Chat/TaskPlannerModal.tsx` | Task planning (code-gen oriented) |
| `src/components/Chat/TaskPlannerPanel.tsx` | Task planning (code-gen oriented) |
| `src/components/Chat/PromptEnhancerPanel.tsx` | Prompt enhancement (code-gen oriented) |
| `src/components/Compare/ComparePanel.tsx` | Model comparison (code-gen oriented) |
| `src/components/Compare/CompareModelPicker.tsx` | Model comparison |
| `src/components/Compare/CompareResponseCard.tsx` | Model comparison |
| `src/components/Compare/Compare.css` | Model comparison styles |

### Backend Agents to Delete

| File | Reason |
|------|--------|
| `electron/services/agents/planner-agent.ts` | Plans code generation tasks |
| `electron/services/agents/coder-agent.ts` | Generates code |
| `electron/services/agents/reviewer-agent.ts` | Reviews generated code |
| `electron/services/agents/executor-agent.ts` | Executes/writes generated code to disk |
| `electron/services/agents/validator-agent.ts` | Validates generated code |
| `electron/services/agents/decomposer-agent.ts` | Decomposes code-gen tasks |

### Backend Services to Remove/Gut

| File | Action |
|------|--------|
| `electron/services/pipeline-orchestrator.ts` | **Replace** with `ScanOrchestrator` |
| `electron/services/pipeline-graph.ts` | **Replace** with scan stage graph |
| `electron/services/pipeline-templates.ts` | **Replace** with scan profiles |
| `electron/services/pipeline-types.ts` | **Replace** with scan types |
| `electron/services/pipeline-state.ts` | **Adapt** for scan state |

### Hooks/Services to Remove

| File | Action |
|------|--------|
| `src/hooks/useCompare.ts` | Delete (compare feature removed) |
| `src/hooks/usePipeline.ts` | **Replace** with `useScan.ts` |
| `src/services/agent.ts` | Delete (agentic code-gen service) |

### Features to Strip from Kept Files

| File | What to Remove |
|------|---------------|
| `src/components/Sidebar/Sidebar.tsx` | Remove pipeline, compare, code-gen, refactor, design-doc buttons. Add scan-related navigation. |
| `src/components/Chat/ChatView.tsx` | Remove code-gen modal triggers, refactor modal, design doc modal, task planner. Keep chat core. |
| `src/components/Chat/ChatInput.tsx` | Remove compare shortcut, code-gen slash commands. Add scan-related slash commands. |
| `src/components/CommandPalette/CommandPalette.tsx` | Remove code-gen/refactor/design-doc actions. Add scan actions. |
| `src/services/command-router.ts` | Remove code-gen/refactor command intents. Add scan intents. |
| `electron/main.ts` | Remove pipeline IPC handlers, compare handlers. Add scan IPC handlers. |

---

## 4. What Gets Kept

### Kept As-Is

| Component | Why |
|-----------|-----|
| `electron/services/providers/` (all files) | LLM provider system is essential for LLM-powered analysis |
| `electron/services/vectordb.ts` | Semantic code search for cross-file analysis |
| `electron/services/embeddings.ts` | Embedding generation for VectorDB |
| `electron/services/chunker.ts` | File chunking for embedding |
| `electron/services/shared-ollama.ts` | Shared Ollama client |
| `electron/services/model-router.ts` | Route scan tasks to appropriate models |
| `electron/services/routing-config.ts` | Routing configuration persistence |
| `electron/services/memory.ts` | SQLite service (conversations, audit log) |
| `electron/services/usage-tracker.ts` | Track LLM token usage during scans |
| `electron/services/long-term-memory.ts` | Could store learned project patterns |
| `electron/services/agent-manager.ts` | Custom agent system (repurposed for custom scan agents) |
| `electron/services/agent-store.ts` | Agent persistence |
| `electron/services/agent-types.ts` | Agent type definitions |
| `electron/services/tools.ts` | Tool execution (file read, grep used during scans) |
| `electron/preload.ts` | IPC bridge |
| `src/components/Chat/ChatView.tsx` | Chat for discussing findings (stripped of code-gen features) |
| `src/components/Chat/ChatInput.tsx` | Chat input (stripped) |
| `src/components/Chat/MessageBubble.tsx` | Message rendering |
| `src/components/Chat/MermaidRenderer.tsx` | Diagram rendering (useful for architecture diagrams in reports) |
| `src/components/Chat/DiffViewer.tsx` | Essential for showing fix patches |
| `src/components/Chat/SemanticSearchModal.tsx` | Search code semantically |
| `src/components/FilePanel/` (all files) | Browse project files |
| `src/components/Settings/` (all files) | App settings |
| `src/components/Terminal/TerminalPanel.tsx` | Terminal access |
| `src/components/Usage/UsageDashboard.tsx` | Track LLM usage |
| `src/components/common/CodeBlock.tsx` | Code display |
| `src/components/Sidebar/Sidebar.tsx` | Navigation (modified) |
| `src/components/CommandPalette/CommandPalette.tsx` | Quick actions (modified) |
| `src/store/ConversationContext.tsx` | Chat state |
| `src/store/SettingsContext.tsx` | Settings state |
| `src/store/WorkspaceContext.tsx` | Workspace/project state |
| `src/hooks/useEditorState.ts` | File panel state |
| `src/hooks/useKeyboardShortcuts.ts` | Keyboard shortcuts (modified) |
| `src/hooks/useModelRouter.ts` | Model routing |
| `src/hooks/useToast.tsx` | Toast notifications |
| `src/services/command-router.ts` | Command routing (modified) |
| `src/services/database.ts` | SQLite facade |
| `src/services/fileReader.ts` | File reading utilities |
| `src/services/ollama.ts` | Ollama service |
| `src/services/storage.ts` | Local storage helpers |
| `src/types/` (all files) | Type definitions (extended) |
| `src/utils/` (all files) | Utilities |

### Kept and Heavily Modified

| Component | Modifications |
|-----------|--------------|
| `electron/services/agents/security-agent.ts` | Becomes the core scan engine with 200+ rules across 4 languages |
| `electron/services/agents/research-agent.ts` | Repurposed for pre-scan project analysis |
| `electron/services/project-analyzer.ts` | Extended with security-specific detection |
| `src/components/Agent/` (all files) | Repurposed for "Custom Scan Agent" builder |
| `src/store/AgentContext.tsx` | Repurposed for scan agent config |
| `src/App.tsx` | New layout with scan dashboard as primary view |

---

## 5. What Gets Built

### New Backend Files

| File | Purpose |
|------|--------|
| `electron/services/scan-engine.ts` | Core scan engine: file discovery, rule execution, finding aggregation |
| `electron/services/scan-orchestrator.ts` | Orchestrates full scan flow (analyze → scan → LLM review → aggregate) |
| `electron/services/scan-state.ts` | SQLite persistence for scans, findings, history |
| `electron/services/scan-types.ts` | All TypeScript types for the scan system |
| `electron/services/scan-profiles.ts` | Scan profile definitions (Quick, Full, OWASP, Dependency, Quality, Custom) |
| `electron/services/rules/rule-registry.ts` | Rule registration, loading, and execution framework |
| `electron/services/rules/java-rules.ts` | Java/Spring security & bug rules (60+ rules) |
| `electron/services/rules/angular-rules.ts` | Angular/TypeScript security & bug rules (50+ rules) |
| `electron/services/rules/php-rules.ts` | PHP/Laravel security & bug rules (60+ rules) |
| `electron/services/rules/general-rules.ts` | Language-agnostic rules (secrets, configs, general patterns) |
| `electron/services/scan-analyzer.ts` | LLM-powered deep analysis: cluster findings, enrich, eliminate false positives |
| `electron/services/fix-generator.ts` | LLM-powered fix generation for individual findings |
| `electron/services/report-generator.ts` | Generate scan reports (HTML, PDF, SARIF, JSON, Markdown) |
| `electron/services/report-templates.ts` | HTML template for self-contained report (inline CSS + highlight.js) |
| `electron/services/dependency-auditor.ts` | Local dependency scanning for npm, composer, maven |

### New Frontend Files

| File | Purpose |
|------|--------|
| `src/components/ScanDashboard/ScanDashboard.tsx` | Main dashboard: health score, scan controls, summary stats |
| `src/components/ScanDashboard/ScanDashboard.css` | Dashboard styles |
| `src/components/ScanDashboard/HealthScore.tsx` | Circular health score visualization |
| `src/components/ScanDashboard/ScanControls.tsx` | Scan profile picker + start/stop controls |
| `src/components/ScanDashboard/SeverityChart.tsx` | Severity breakdown visualization |
| `src/components/ScanDashboard/ScanSummary.tsx` | Last scan summary card |
| `src/components/Findings/FindingsExplorer.tsx` | Main findings table/list with filters |
| `src/components/Findings/FindingsExplorer.css` | Findings styles |
| `src/components/Findings/FindingCard.tsx` | Individual finding: severity, type, code snippet, CWE, fix button |
| `src/components/Findings/FindingDetail.tsx` | Expanded finding detail with full code context and fix diff |
| `src/components/Findings/FindingFilters.tsx` | Filter bar: severity, language, type, file, CWE |
| `src/components/ScanHistory/ScanHistory.tsx` | Scan history list with comparison |
| `src/components/ScanHistory/ScanHistory.css` | History styles |
| `src/components/ScanHistory/ScanCompare.tsx` | Compare two scan results side by side |
| `src/components/Report/ReportView.tsx` | In-app report document renderer (formatted, readable, top-to-bottom) |
| `src/components/Report/ReportView.css` | Report view styles (print-friendly, document layout) |
| `src/components/Report/TrendChart.tsx` | SVG-based health score trend line chart (last N scans) |
| `src/components/Report/ExportControls.tsx` | Export format buttons (HTML, PDF, SARIF, JSON, Clipboard) |
| `src/hooks/useScan.ts` | Scan state management hook (replaces usePipeline) |
| `src/hooks/useScanHistory.ts` | Scan history hook |
| `src/store/ScanContext.tsx` | React context for scan state |

---

## 6. Data Model

### SQLite Tables

```sql
-- Core scan record
CREATE TABLE scans (
  id            TEXT PRIMARY KEY,
  project_root  TEXT NOT NULL,
  project_name  TEXT,
  profile       TEXT NOT NULL,          -- 'full' | 'quick' | 'owasp' | 'dependency' | 'quality' | 'custom'
  status        TEXT NOT NULL,          -- 'running' | 'complete' | 'failed' | 'cancelled'
  languages     TEXT,                   -- JSON array: ['java', 'angular', 'php']
  started_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  total_files   INTEGER DEFAULT 0,
  files_scanned INTEGER DEFAULT 0,
  health_score  INTEGER,                -- 0-100
  summary       TEXT,                   -- LLM-generated summary
  config        TEXT                    -- JSON scan configuration used
);

-- Individual findings
CREATE TABLE findings (
  id              TEXT PRIMARY KEY,
  scan_id         TEXT NOT NULL REFERENCES scans(id),
  rule_id         TEXT NOT NULL,         -- e.g. 'java/sql-injection'
  severity        TEXT NOT NULL,         -- 'critical' | 'high' | 'medium' | 'low' | 'info'
  category        TEXT NOT NULL,         -- 'security' | 'bug' | 'quality' | 'dependency' | 'config'
  type            TEXT NOT NULL,         -- 'sql-injection' | 'xss' | 'hardcoded-secret' etc
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  line_start      INTEGER,
  line_end        INTEGER,
  column_start    INTEGER,
  code_snippet    TEXT,                  -- The vulnerable code
  cwe_id          TEXT,                  -- 'CWE-89' etc
  owasp_category  TEXT,                  -- 'A03:2021 Injection' etc
  confidence      TEXT DEFAULT 'high',   -- 'high' | 'medium' | 'low'  (from rule)
  llm_validated   INTEGER DEFAULT 0,     -- 1 if LLM confirmed, 0 if static only
  llm_verdict     TEXT,                  -- 'confirmed' | 'false_positive' | 'needs_review'
  llm_explanation TEXT,                  -- LLM's explanation of attack vector
  fix_available   INTEGER DEFAULT 0,
  fix_code        TEXT,                  -- LLM-generated fix
  fix_explanation TEXT,
  status          TEXT DEFAULT 'open',   -- 'open' | 'fixed' | 'ignored' | 'false_positive'
  created_at      INTEGER NOT NULL
);

-- Dependency vulnerabilities
CREATE TABLE dependency_findings (
  id              TEXT PRIMARY KEY,
  scan_id         TEXT NOT NULL REFERENCES scans(id),
  package_name    TEXT NOT NULL,
  current_version TEXT,
  fixed_version   TEXT,
  severity        TEXT NOT NULL,
  cve_id          TEXT,
  description     TEXT,
  ecosystem       TEXT NOT NULL          -- 'npm' | 'composer' | 'maven'
);

-- Scan analytics over time
CREATE TABLE scan_metrics (
  id              TEXT PRIMARY KEY,
  scan_id         TEXT NOT NULL REFERENCES scans(id),
  project_root    TEXT NOT NULL,
  health_score    INTEGER,
  critical_count  INTEGER DEFAULT 0,
  high_count      INTEGER DEFAULT 0,
  medium_count    INTEGER DEFAULT 0,
  low_count       INTEGER DEFAULT 0,
  info_count      INTEGER DEFAULT 0,
  total_findings  INTEGER DEFAULT 0,
  files_scanned   INTEGER DEFAULT 0,
  scan_duration   INTEGER,              -- milliseconds
  llm_tokens_used INTEGER DEFAULT 0,
  timestamp       INTEGER NOT NULL
);

-- Index for fast queries
CREATE INDEX idx_findings_scan ON findings(scan_id);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_file ON findings(file_path);
CREATE INDEX idx_findings_type ON findings(type);
CREATE INDEX idx_findings_status ON findings(status);
CREATE INDEX idx_metrics_project ON scan_metrics(project_root);
CREATE INDEX idx_metrics_timestamp ON scan_metrics(timestamp);
```

---

## 7. Scan Engine Design

### Rule Structure

```typescript
interface ScanRule {
  id: string;                                    // 'java/sql-injection-jdbc'
  language: 'java' | 'angular' | 'php' | 'general';
  category: 'security' | 'bug' | 'quality';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;                                 // 'SQL Injection via JDBC'
  description: string;                           // Full description of the vulnerability
  cweId?: string;                                // 'CWE-89'
  owaspCategory?: string;                        // 'A03:2021'
  
  // File targeting
  filePatterns: string[];                        // ['*.java', '*.kt']
  excludePatterns?: string[];                    // ['*Test.java', '*Spec.java']
  
  // Detection
  detect: (content: string, filePath: string) => RawFinding[];
  
  // Fix template (used as input to LLM fix generation)
  fixGuidance: string;                           // 'Use PreparedStatement instead of string concatenation'
}

interface RawFinding {
  line: number;
  column?: number;
  endLine?: number;
  matchedCode: string;                           // The exact code that matched
  context?: string;                              // Surrounding lines for context
  metadata?: Record<string, unknown>;            // Rule-specific data
}
```

### Rule Execution Flow

```
For each source file:
  1. Determine language from extension
  2. Load applicable rule pack(s)
  3. Read file content (skip if > 500KB or binary)
  4. For each rule where filePatterns matches:
     a. Call rule.detect(content, filePath)
     b. For each RawFinding:
        - Extract code snippet (matched line ± 3 context lines)
        - Create Finding record with all metadata
        - Tag with CWE, OWASP category
  5. Emit progress event per file
```

### File Discovery

```
1. Walk project tree recursively
2. Respect .gitignore (parse and apply patterns)
3. Skip known non-source dirs: node_modules, vendor, target, build, dist, .git
4. Skip binary files (detect via extension list + magic bytes check)
5. Categorize files by language:
   - Java:    *.java, *.kt, *.gradle, *.xml (pom.xml, web.xml, etc.)
   - Angular: *.ts, *.html, *.json (angular.json, environment.ts, etc.)
   - PHP:     *.php, *.blade.php, *.twig, composer.json, .env
   - General: *.yml, *.yaml, *.json, *.env*, *.properties, *.ini, Dockerfile
6. For Quick Scan: only scan files changed since last scan (git diff)
```

---

## 8. Language Rule Packs

### Java Rules (60+ rules)

**Security — Injection (CWE-89, CWE-78, CWE-90, CWE-917)**
- SQL injection via string concatenation in JDBC Statement
- SQL injection via string concatenation in JPA/JPQL queries
- SQL injection in MyBatis XML mapper (${} vs #{})
- HQL injection in Hibernate
- Command injection via Runtime.exec() with user input
- Command injection via ProcessBuilder with unsanitized args
- LDAP injection via string concatenation in search filters
- Expression Language injection in JSP/JSF
- XPath injection

**Security — Authentication & Session (CWE-287, CWE-384, CWE-613)**
- Hardcoded credentials in source code
- Hardcoded JWT secrets
- Weak password hashing (MD5, SHA1 for passwords)
- Missing CSRF protection in Spring Security config
- Overly permissive Spring Security rules (permitAll on sensitive endpoints)
- Session fixation (no session regeneration after login)
- Missing session timeout configuration

**Security — Cryptography (CWE-327, CWE-328, CWE-330)**
- Weak hash algorithms (MD5, SHA1 for security purposes)
- Insecure random number generation (java.util.Random vs SecureRandom)
- ECB mode in encryption
- Hardcoded encryption keys/IVs
- Disabled certificate validation (TrustAllCerts)
- Insecure TLS version (TLSv1.0, TLSv1.1)

**Security — Data Exposure (CWE-200, CWE-532, CWE-209)**
- Sensitive data in log statements (password, token, SSN in logger calls)
- Stack traces exposed to users (no error handling in controllers)
- Verbose error messages in REST responses
- PII in URLs/query parameters
- Missing @JsonIgnore on sensitive entity fields

**Security — XXE & Deserialization (CWE-611, CWE-502)**
- XXE in XML parsing (DocumentBuilderFactory without secure features)
- XXE in SAXParser without secure processing
- Unsafe deserialization (ObjectInputStream without type filtering)
- Unsafe JSON deserialization with enableDefaultTyping

**Security — File & Path (CWE-22, CWE-434)**
- Path traversal via user-controlled file paths
- Unrestricted file upload (no extension/type validation)
- Temporary file with insecure permissions

**Security — Spring-Specific**
- @RequestMapping without method restriction
- Missing input validation (@Valid/@Validated)
- CORS misconfiguration (allowedOrigins = "*" with credentials)
- Actuator endpoints exposed without authentication
- Debug mode in production (spring.jpa.show-sql, etc.)

**Bug Patterns**
- NullPointerException: unguarded nullable return values
- Resource leak: unclosed streams/connections outside try-with-resources
- Synchronization issues: non-atomic check-then-act patterns
- equals() without hashCode()
- Mutable static fields
- Empty catch blocks swallowing exceptions

### Angular Rules (50+ rules)

**Security — XSS (CWE-79)**
- bypassSecurityTrustHtml/Style/Script/Url/ResourceUrl usage
- innerHTML binding in templates [innerHTML]
- Direct DOM manipulation (ElementRef.nativeElement)
- Unsafe use of document.write / document.writeln
- DomSanitizer bypass without validation

**Security — Injection & Data (CWE-89, CWE-200)**
- API keys / secrets in environment.ts files
- API keys in source code or templates
- Hardcoded tokens in HttpClient headers
- Sensitive data in localStorage/sessionStorage
- Credentials in HTTP basic auth headers

**Security — HTTP & Communication (CWE-319, CWE-346)**
- HTTP (not HTTPS) URLs for API endpoints
- Missing Content-Security-Policy headers
- CORS wildcard in proxy.conf.json
- Missing HttpOnly/Secure flags for cookies
- Missing CSRF token in POST requests

**Security — Angular-Specific**
- Open redirect in Router navigation
- Route guards bypassed by direct URL access
- Missing CanDeactivate guard for unsaved data
- Server-side rendering (SSR) XSS via platform-server
- Unsafe eval in Angular expressions

**Security — Dependencies & Config**
- Outdated Angular version with known CVEs
- Source maps enabled in production build
- Angular devtools/debug enabled in production
- Overly permissive TypeScript compiler options (no strict)

**Bug Patterns**
- Observable memory leak: subscribe without unsubscribe/takeUntil
- Unhandled HTTP errors (no catchError in pipe)
- Multiple subscription to same observable
- ngOnChanges without SimpleChanges type check
- Circular dependency detection
- Template expression complexity (heavy computation in templates)
- Missing OnPush change detection for performance

### PHP Rules (60+ rules)

**Security — Injection (CWE-89, CWE-78, CWE-94)**
- SQL injection: raw $_GET/$_POST/$_REQUEST in queries
- SQL injection: variable interpolation in SQL strings
- SQL injection: missing parameterized queries (PDO/MySQLi)
- Command injection: exec/system/passthru/shell_exec/popen with user input
- Code injection: eval() with user input
- Code injection: preg_replace with /e modifier
- include/require with user-controlled paths (LFI/RFI)
- LDAP injection in ldap_search filters

**Security — XSS (CWE-79)**
- Reflected XSS: echo/print of unsanitized $_GET/$_POST
- Stored XSS: database output without htmlspecialchars/htmlentities
- Template injection in Blade/Twig ({!! !!} in Blade)
- Missing Content-Type header (text/html default)

**Security — File & Upload (CWE-434, CWE-22)**
- Unrestricted file upload (no MIME/extension check)
- Path traversal via user-controlled paths in file operations
- Predictable temporary file names
- Insecure file permissions (chmod 777)

**Security — Authentication (CWE-287, CWE-916)**
- Weak password hashing (md5/sha1 instead of password_hash)
- Timing attack in password comparison (== instead of hash_equals)
- Session fixation (no session_regenerate_id after login)
- Missing session configuration (cookie flags, lifetime)

**Security — Deserialization & Crypto (CWE-502, CWE-327)**
- Unsafe deserialization (unserialize on user input)
- Weak encryption (mcrypt, ECB mode)
- Hardcoded encryption keys
- Insecure random (rand/mt_rand instead of random_bytes)

**Security — Laravel-Specific**
- Mass assignment vulnerability (no $fillable/$guarded)
- Raw DB queries without bindings
- Debug mode in production (.env APP_DEBUG=true)
- Missing CSRF middleware
- Exposed .env file (check for .env in public)
- Insecure Eloquent $casts

**Security — Configuration (CWE-16)**
- display_errors enabled in production
- register_globals enabled
- allow_url_include enabled
- Insecure session.cookie_httponly setting
- Missing error_reporting configuration

**Bug Patterns**
- Type juggling issues (== vs === for critical comparisons)
- Undefined variable usage
- Array key existence without isset/array_key_exists
- Missing return type declarations
- Empty catch blocks
- Deprecated function usage

### General Rules (30+ rules)

**Secrets & Credentials**
- API keys in any source file (generic patterns)
- Private keys (PEM format)
- AWS access keys
- Database connection strings with passwords
- OAuth client secrets
- JWT secrets

**Configuration**
- .env files with secrets committed
- Debug/development mode in production configs
- Default/weak passwords in config files
- Overly permissive CORS configuration
- Missing security headers
- Dockerfile security (running as root, latest tag)

**Git & SCM**
- Sensitive files not in .gitignore
- Credentials in git history (check .git/config)

---

## 9. LLM Integration Layer

### When the LLM is Used

The LLM is NOT used for basic pattern matching (that's the static rule engine). The LLM is used for:

1. **False Positive Elimination** — After static rules find candidates, the LLM reviews with full context and marks false positives
2. **Attack Vector Explanation** — The LLM explains HOW the vulnerability can be exploited
3. **Fix Generation** — The LLM generates actual remediation code
4. **Cross-File Analysis** — Using VectorDB context, the LLM traces data flow across files
5. **Scan Summary** — The LLM generates a human-readable summary of the scan

### LLM Prompts

**False Positive Review Prompt:**
```
You are a senior security engineer reviewing potential vulnerabilities found by static analysis.

For each finding below, analyze the code and its surrounding context. Determine if the finding is:
- CONFIRMED: A real vulnerability that should be reported
- FALSE_POSITIVE: Not actually exploitable due to context (sanitization, framework protection, etc.)
- NEEDS_REVIEW: Uncertain, requires human review

For confirmed findings, explain the attack vector in 2-3 sentences.

## Findings to Review
[clustered findings with code context]

Respond as JSON array:
[{
  "finding_id": "...",
  "verdict": "confirmed | false_positive | needs_review",
  "confidence": 0.0-1.0,
  "explanation": "...",
  "attack_vector": "..." // only for confirmed
}]
```

**Fix Generation Prompt:**
```
You are a security engineer fixing a vulnerability.

## Vulnerability
Type: [type]
Severity: [severity]  
CWE: [cweId]
File: [filePath]

## Vulnerable Code
[code snippet with context lines]

## Fix Guidance
[rule's fixGuidance]

Generate the MINIMUM code change needed to fix this vulnerability.
Keep the same code style. Do not refactor unrelated code.

Respond as JSON:
{
  "fixed_code": "...",          // The corrected code
  "explanation": "...",         // What was changed and why
  "breaking_changes": false,    // Does this fix change behavior?
  "test_suggestion": "..."      // How to verify the fix
}
```

### LLM Cost Control

- Batch findings into clusters (by file or by type) to minimize API calls
- Only send findings with medium+ severity to LLM (low/info skip LLM review)
- Cache LLM results per (ruleId + codeHash) to avoid re-reviewing identical code
- Track tokens in usage-tracker for cost visibility
- Allow users to disable LLM review entirely (static-only mode)

---

## 10. Reporting & Sharing

### Overview

The Findings Explorer is operational — it's for the developer actively triaging. A **Report** is a different artifact: a formatted, readable document that a tech lead shares with the team, attaches to a PR, or hands to an auditor. The app supports both an in-app Report View and multiple export formats.

### In-App Report View

A dedicated tab in the main content area alongside Dashboard and Findings:

```
Tab Bar: [Dashboard] [Findings] [Report] [Chat]
```

The Report tab renders a structured document, read top-to-bottom:

```
┌──────────────────────────────────────────────────────────┐
│  SECURITY SCAN REPORT                                    │
│  Project: payment-service  |  April 8, 2026              │
│  Profile: Full Audit  |  Duration: 2m 34s                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ EXECUTIVE SUMMARY                                │    │
│  │                                                  │    │
│  │ Health Score: 64/100 (▼ 8 from last scan)        │    │
│  │                                                  │    │
│  │ 3 critical, 7 high, 12 medium, 8 low findings   │    │
│  │ across 142 files in 4 languages.                 │    │
│  │                                                  │    │
│  │ Key risks: 2 SQL injection paths in UserDao      │    │
│  │ and PaymentService, 1 hardcoded AWS key in       │    │
│  │ config, 3 XSS bypasses in Angular frontend.      │    │
│  │                                                  │    │
│  │ (LLM-generated from findings)                    │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ SEVERITY BREAKDOWN           CATEGORY BREAKDOWN  │    │
│  │ ████████░░ Critical: 3       Security:    22     │    │
│  │ ██████████░ High: 7          Bug:          5     │    │
│  │ ████████████░ Medium: 12     Quality:      3     │    │
│  │ ██████░░░░ Low: 8            Dependency:   0     │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ TREND (last 5 scans)                             │    │
│  │                                                  │    │
│  │  90 ─                                            │    │
│  │  80 ─          ●                                 │    │
│  │  70 ─      ●       ●   ●                        │    │
│  │  60 ─                       ●                    │    │
│  │       Mar 1  Mar 15  Apr 1  Apr 8                │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ── CRITICAL FINDINGS ──────────────────────────────     │
│                                                          │
│  1. SQL Injection via JDBC Statement                     │
│     CWE-89 | OWASP A03:2021 | src/dao/UserDao.java:45   │
│     ┌────────────────────────────────────────────┐       │
│     │ String q = "SELECT * FROM users WHERE      │       │
│     │            id=" + request.getParam("id");  │       │
│     │ stmt.executeQuery(q);                      │       │
│     └────────────────────────────────────────────┘       │
│     Attack: Attacker sends id=1; DROP TABLE users        │
│     Fix: Use PreparedStatement with parameter binding    │
│                                                          │
│  2. Hardcoded AWS Access Key                             │
│     CWE-798 | src/config/AwsConfig.java:12               │
│     ...                                                  │
│                                                          │
│  ── HIGH FINDINGS ──────────────────────────────────     │
│  ...                                                     │
│                                                          │
│  ── DEPENDENCY AUDIT ───────────────────────────────     │
│  │ Package          │ Current │ Fixed   │ Severity │     │
│  │ log4j-core       │ 2.14.1  │ 2.17.1  │ Critical │     │
│  │ spring-web       │ 5.3.8   │ 5.3.18  │ High     │     │
│  ...                                                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ [Export HTML]  [Export PDF]  [Export SARIF]        │    │
│  │ [Copy as Markdown]  [Export JSON]                  │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Export Formats

Since everything is local (no cloud), sharing means exporting a file:

#### 1. HTML Report (primary sharing format)
- **Self-contained** single `.html` file — all CSS inlined, syntax highlighting via inline highlight.js, zero external dependencies
- **Interactive** — collapsible severity sections, in-browser search/filter
- **Print-friendly** — `@media print` CSS rules for clean printouts
- Visually matches the in-app Report View
- Developer emails it, attaches to Jira/GitHub issue, drops in Slack

#### 2. PDF Report
- Generated from the HTML report using Electron's built-in `BrowserWindow.webContents.printToPDF()`
- **No external dependencies** — no puppeteer, no wkhtmltopdf
- Includes page numbers, header/footer with project name and date
- Suitable for compliance, audit handoffs, formal security reviews

#### 3. SARIF (Static Analysis Results Interchange Format)
- Standard JSON format (SARIF v2.1.0) consumed by:
  - **GitHub** — upload via Code Scanning API, shows findings inline on PRs
  - **VS Code** — SARIF Viewer extension renders findings in the editor
  - **Azure DevOps** — native SARIF support in pipelines
- Maps each finding to a SARIF `result` with `ruleId`, `level`, `location`, `message`, and `fix` objects
- Includes tool metadata (`driver.name`, `driver.rules[]` with full descriptions)
- This is the "integrations" play — even without CI/CD wiring, a developer can upload the SARIF to GitHub manually

#### 4. JSON Export
- Raw structured data: full scan record, all findings, dependency findings, metrics
- Schema matches the SQLite data model exactly
- For teams that want to build custom dashboards, ingest into other tools, or archive

#### 5. Clipboard (Markdown)
- One-click copy of the report as formatted Markdown
- Paste directly into a GitHub issue, PR description, Confluence page, or Slack
- Auto-truncated to critical + high findings to keep it concise
- Includes code snippets as fenced code blocks

### Report Generation Backend

```typescript
// electron/services/report-generator.ts

interface ReportOptions {
  scanId: string;
  format: 'html' | 'pdf' | 'sarif' | 'json' | 'markdown';
  includeFixSuggestions: boolean;
  includeLlmExplanations: boolean;
  severityFilter?: ('critical' | 'high' | 'medium' | 'low' | 'info')[];
  outputPath?: string;    // if not provided, returns content as string
}

interface ReportResult {
  filePath?: string;      // if outputPath was provided
  content?: string;       // if no outputPath (for clipboard/markdown)
  format: string;
  sizeBytes: number;
}
```

**HTML generation approach:**
- Template-literal based (no Handlebars/EJS dependency)
- CSS design tokens from the app's `index.css` reused for visual consistency
- Code snippets rendered with inline highlight.js (language-aware)
- SVG-based severity charts (no canvas/chart library needed)
- Single function: `generateHtmlReport(scan, findings, metrics) → string`

**PDF generation approach:**
```typescript
// Uses Electron's built-in capability — zero dependencies
async function generatePdfReport(htmlContent: string): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  const pdf = await win.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  });
  win.destroy();
  return pdf;
}
```

**SARIF generation approach:**
```typescript
// Maps internal findings to SARIF v2.1.0 schema
interface SarifLog {
  $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';
  version: '2.1.0';
  runs: [{
    tool: {
      driver: {
        name: 'LocalMind Security';
        version: string;
        rules: SarifRule[];       // one per unique ruleId
      };
    };
    results: SarifResult[];       // one per finding
    artifacts: SarifArtifact[];   // one per scanned file
  }];
}
```

### Report Data Flow

```
User clicks "Export HTML" (or PDF, SARIF, JSON, Markdown)
        │
        ▼
┌─ Renderer ──────────────────────────────────────────┐
│  ipcRenderer.invoke('scan:generateReport', {        │
│    scanId, format: 'html', includeFixSuggestions     │
│  })                                                  │
└──────────────────────────────────────────────────────┘
        │
        ▼
┌─ Main Process ──────────────────────────────────────┐
│  1. Load scan + findings + metrics from SQLite       │
│  2. Load trend data (last N scans for same project)  │
│  3. Generate LLM executive summary (if not cached)   │
│  4. Call format-specific generator:                  │
│     ├─ html  → template + inline CSS + code blocks   │
│     ├─ pdf   → html → BrowserWindow.printToPDF()     │
│     ├─ sarif → map findings to SARIF 2.1.0 schema    │
│     ├─ json  → JSON.stringify(scan + findings)        │
│     └─ md    → structured markdown with code fences   │
│  5. If outputPath: write file, open save dialog       │
│  6. Return { filePath, sizeBytes } or { content }     │
└──────────────────────────────────────────────────────┘
        │
        ▼
  File saved → toast notification "Report saved to ~/reports/scan-2026-04-08.html"
  or
  Content → clipboard → toast "Report copied to clipboard"
```

### Report Templates Table (what each format includes)

| Section | HTML | PDF | SARIF | JSON | Markdown |
|---------|------|-----|-------|------|----------|
| Executive summary (LLM) | Yes | Yes | No | No | Yes |
| Severity breakdown chart | Yes (SVG) | Yes | No | Raw counts | Text bars |
| Trend chart (last 5 scans) | Yes (SVG) | Yes | No | Raw data | No |
| Findings by severity | Yes (collapsible) | Yes | Yes (results) | Yes | Critical+High only |
| Code snippets | Yes (highlighted) | Yes | Yes (region) | Yes (raw) | Yes (fenced) |
| Attack vector explanation | Yes | Yes | Yes (message) | Yes | Yes |
| Fix suggestions | Optional | Optional | Yes (fix object) | Yes | No |
| Dependency audit table | Yes | Yes | No | Yes | Yes |
| Scan metadata | Yes (header) | Yes (header) | Yes (tool/run) | Yes | Yes (header) |

---

## 11. Frontend Architecture

### Layout Change

**Current:** Sidebar + Chat (primary) + Side Panels (overlay)  
**New:** Sidebar + Scan Dashboard (primary) + Findings/Chat/Files (switchable panels)

```
┌────────┬──────────────────────────────────────────────────┐
│        │                                                  │
│  SIDE  │              MAIN CONTENT AREA                   │
│  BAR   │                                                  │
│        │   ┌─────────────────────────────────────────┐    │
│ ─────  │   │ Tab Bar: [Dashboard] [Findings] [Report] [Chat] │  │
│ Scans  │   ├─────────────────────────────────────────┤    │
│ ─────  │   │                                         │    │
│ Scan 1 │   │  Dashboard Tab:                         │    │
│ Scan 2 │   │    ┌──────────┐  ┌──────────────────┐   │    │
│ Scan 3 │   │    │ Health   │  │ Severity Chart   │   │    │
│        │   │    │ Score    │  │ ████ 3 Critical  │   │    │
│ ─────  │   │    │  72/100  │  │ ███  5 High      │   │    │
│ Quick  │   │    │          │  │ ██   8 Medium    │   │    │
│ Actions│   │    └──────────┘  └──────────────────┘   │    │
│ ─────  │   │                                         │    │
│ New    │   │    ┌────────────────────────────────┐    │    │
│ Scan   │   │    │ Scan Controls                  │    │    │
│        │   │    │ Profile: [Full Audit ▼]         │    │    │
│ Chat   │   │    │ [▶ Start Scan]  [Stop]         │    │    │
│ Files  │   │    └────────────────────────────────┘    │    │
│ Term   │   │                                         │    │
│ Usage  │   │    ┌────────────────────────────────┐    │    │
│ Sett.  │   │    │ Recent Findings Summary        │    │    │
│        │   │    │ ...                            │    │    │
│        │   │    └────────────────────────────────┘    │    │
│        │   └─────────────────────────────────────────┘    │
│        │                                                  │
│        │  ┌──────────────────────────────────────────┐    │
│        │  │ Right Panel: File Viewer / Finding Detail │    │
│        │  └──────────────────────────────────────────┘    │
└────────┴──────────────────────────────────────────────────┘
```

### Findings Explorer Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Findings (42)                                [Export ▼]      │
├─────────────────────────────────────────────────────────────┤
│ Filters: [All Severities ▼] [All Languages ▼] [All Types ▼]│
│          [Search files or findings...]                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ● CRITICAL  SQL Injection via JDBC Statement                │
│   CWE-89   src/main/java/UserDao.java:45    [View Fix]     │
│   String query = "SELECT * FROM users WHERE id=" + userId   │
│                                                             │
│ ● HIGH  Hardcoded API Key                                   │
│   CWE-798  src/config/ApiConfig.java:12     [View Fix]      │
│   private static final String API_KEY = "sk-abc123..."      │
│                                                             │
│ ● HIGH  XSS via bypassSecurityTrustHtml                     │
│   CWE-79   src/app/user/profile.component.ts:28  [View Fix]│
│   this.sanitizer.bypassSecurityTrustHtml(userInput)         │
│                                                             │
│ ● MEDIUM  Missing CSRF Protection                           │
│   CWE-352  src/config/SecurityConfig.java:15                │
│   .csrf().disable()                                         │
│                                                             │
│  ... more findings ...                                      │
│                                                             │
│ ◀ 1  2  3  ... ▶                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. IPC Contract

### New IPC Channels

```typescript
// ── Scan Operations ──────────────────────────────────────
'scan:start'           // (config: ScanConfig) => { scanId: string }
'scan:stop'            // (scanId: string) => void
'scan:getStatus'       // (scanId: string) => ScanStatus
'scan:getResults'      // (scanId: string) => ScanResults
'scan:getHistory'      // (projectRoot: string, limit?: number) => ScanSummary[]
'scan:deleteScan'      // (scanId: string) => void
'scan:compareScan'     // (scanId1: string, scanId2: string) => ScanComparison

// ── Finding Operations ───────────────────────────────────
'scan:getFindings'     // (scanId: string, filters?: FindingFilters) => Finding[]
'scan:getFinding'      // (findingId: string) => FindingDetail
'scan:updateFinding'   // (findingId: string, update: { status }) => void
'scan:generateFix'     // (findingId: string) => FixResult
'scan:applyFix'        // (findingId: string) => ApplyResult

// ── Report & Export Operations ───────────────────────────
'scan:generateReport'  // (scanId, format, options: ReportOptions) => ReportResult
'scan:getReportData'   // (scanId) => ReportData  (structured data for in-app Report tab)
'scan:getReportTrend'  // (projectRoot, limit?) => TrendDataPoint[]  (health score over time)

// ── Scan Events (main → renderer) ───────────────────────
'scan:progress'        // { scanId, phase, filesScanned, totalFiles, currentFile }
'scan:finding'         // { scanId, finding }  (real-time as findings are discovered)
'scan:complete'        // { scanId, summary }
'scan:error'           // { scanId, error }

// ── Removed IPC Channels ────────────────────────────────
// DELETE: pipeline:*, compare:*
// KEEP: chat:*, provider:*, usage:*, memory:*, router:*, agent:*, fs:*, db:*, tools:*
```

---

## 13. Implementation Phases

### Phase 1: Scan Engine Core (Backend)

**Goal:** Build the rule engine and file scanner that can scan a project and produce raw findings.

**Tasks:**
1. Create `scan-types.ts` — all TypeScript interfaces
2. Create `rules/rule-registry.ts` — rule loading and execution framework
3. Create `rules/general-rules.ts` — secrets, config, and language-agnostic rules
4. Create `rules/java-rules.ts` — full Java rule pack
5. Create `rules/angular-rules.ts` — full Angular/TS rule pack
6. Create `rules/php-rules.ts` — full PHP rule pack
7. Create `scan-engine.ts` — file discovery, rule execution, finding aggregation
8. Create `scan-profiles.ts` — scan profile definitions
9. Create `dependency-auditor.ts` — npm/composer/maven local audit

### Phase 2: Scan Orchestrator & State (Backend)

**Goal:** Orchestrate the full scan flow with persistence and real-time progress.

**Tasks:**
1. Create `scan-state.ts` — SQLite tables, CRUD for scans/findings
2. Create `scan-orchestrator.ts` — full scan flow coordination
3. Create `scan-analyzer.ts` — LLM-powered finding enrichment
4. Create `fix-generator.ts` — LLM-powered fix generation
5. Wire IPC handlers in `main.ts` (scan:*, finding:*)
6. Modify `project-analyzer.ts` — add security-specific detection

### Phase 3: Frontend — Scan Dashboard & Controls

**Goal:** Build the primary scan UI that replaces the code-gen pipeline view.

**Tasks:**
1. Create `ScanContext.tsx` — React context for scan state
2. Create `useScan.ts` hook — scan operations and real-time updates
3. Create `ScanDashboard/ScanDashboard.tsx` — main dashboard layout
4. Create `ScanDashboard/HealthScore.tsx` — health score widget
5. Create `ScanDashboard/ScanControls.tsx` — profile picker + scan buttons
6. Create `ScanDashboard/SeverityChart.tsx` — severity breakdown
7. Create `ScanDashboard/ScanSummary.tsx` — last scan summary

### Phase 4: Frontend — Findings Explorer

**Goal:** Build the findings table where developers review and act on vulnerabilities.

**Tasks:**
1. Create `Findings/FindingsExplorer.tsx` — main findings view
2. Create `Findings/FindingCard.tsx` — individual finding row
3. Create `Findings/FindingDetail.tsx` — expanded detail with code + fix
4. Create `Findings/FindingFilters.tsx` — filter controls
5. Create `useScanHistory.ts` hook — history and comparison
6. Create `ScanHistory/ScanHistory.tsx` — history list
7. Create `ScanHistory/ScanCompare.tsx` — scan comparison view

### Phase 5: Fix Generation & Application

**Goal:** Allow developers to generate and apply fixes from the findings view.

**Tasks:**
1. Wire fix generation UI in `FindingDetail.tsx`
2. Integrate `DiffViewer.tsx` for fix preview
3. Wire fix application (write to disk via IPC)
4. Add fix status tracking in findings

### Phase 6: Report View & Export

**Goal:** Build the in-app report document and all export formats for sharing.

**Tasks:**
1. Create `report-generator.ts` — core report generation with format dispatching
2. Create `report-templates.ts` — self-contained HTML template with inline CSS + highlight.js
3. Implement HTML export — single-file, interactive, print-friendly
4. Implement PDF export — via Electron `BrowserWindow.printToPDF()` (zero dependencies)
5. Implement SARIF export — SARIF v2.1.0 schema mapping for GitHub/VS Code integration
6. Implement JSON export — raw structured data matching SQLite schema
7. Implement Markdown/Clipboard export — formatted markdown, critical+high only, one-click copy
8. Create `Report/ReportView.tsx` — in-app formatted report document (new tab)
9. Create `Report/TrendChart.tsx` — SVG-based health score trend over time
10. Create `Report/ExportControls.tsx` — export format buttons with save dialog
11. Wire `scan:generateReport`, `scan:getReportData`, `scan:getReportTrend` IPC handlers
12. Add LLM executive summary generation (cached per scan) for report header

### Phase 7: Cleanup & Integration

**Goal:** Remove code-gen features, update navigation, finalize the app identity.

**Tasks:**
1. Delete code-gen components (CodeGenModal, CodeGenPanel, RefactorModal, etc.)
2. Delete code-gen agents (planner, coder, reviewer, executor, validator, decomposer)
3. Delete old pipeline files (pipeline-orchestrator, pipeline-graph, etc.)
4. Strip code-gen features from ChatView, ChatInput, Sidebar
5. Update CommandPalette with scan actions
6. Update keyboard shortcuts
7. Update App.tsx layout for new primary view (Dashboard + Findings + Report + Chat tabs)
8. Update command-router.ts with scan intents
9. Update agent presets for security-focused agents
10. Update app metadata (name, description, icon concepts)

### Phase 8: Polish & Testing

**Goal:** Quality, performance, edge cases.

**Tasks:**
1. Test scans on real Java projects (Spring Boot)
2. Test scans on real Angular projects
3. Test scans on real PHP projects (Laravel)
4. Performance testing on large codebases (10k+ files)
5. LLM prompt tuning for accuracy
6. UI polish, loading states, error handling
7. Scan progress visualization refinement
8. Report visual polish and print-preview testing
9. SARIF validation against GitHub Code Scanning

---

## 14. File-Level Task List

### Phase 1 — New Files to Create

```
electron/services/scan-types.ts              ← All scan-related TypeScript types
electron/services/scan-engine.ts             ← Core file scanner + rule executor
electron/services/scan-profiles.ts           ← Scan profile definitions
electron/services/dependency-auditor.ts      ← Local dependency scanning
electron/services/rules/rule-registry.ts     ← Rule framework
electron/services/rules/java-rules.ts        ← Java rules (60+)
electron/services/rules/angular-rules.ts     ← Angular rules (50+)
electron/services/rules/php-rules.ts         ← PHP rules (60+)
electron/services/rules/general-rules.ts     ← General rules (30+)
```

### Phase 2 — New Files to Create

```
electron/services/scan-state.ts              ← SQLite persistence for scans
electron/services/scan-orchestrator.ts       ← Full scan orchestration
electron/services/scan-analyzer.ts           ← LLM finding enrichment
electron/services/fix-generator.ts           ← LLM fix generation
```

### Phase 2 — Files to Modify

```
electron/main.ts                             ← Add scan IPC handlers, remove pipeline handlers
electron/services/project-analyzer.ts        ← Add security detection
```

### Phase 3 — New Files to Create

```
src/store/ScanContext.tsx                     ← Scan state management
src/hooks/useScan.ts                         ← Scan hook
src/hooks/useScanHistory.ts                  ← History hook
src/components/ScanDashboard/ScanDashboard.tsx
src/components/ScanDashboard/ScanDashboard.css
src/components/ScanDashboard/HealthScore.tsx
src/components/ScanDashboard/ScanControls.tsx
src/components/ScanDashboard/SeverityChart.tsx
src/components/ScanDashboard/ScanSummary.tsx
```

### Phase 4 — New Files to Create

```
src/components/Findings/FindingsExplorer.tsx
src/components/Findings/FindingsExplorer.css
src/components/Findings/FindingCard.tsx
src/components/Findings/FindingDetail.tsx
src/components/Findings/FindingFilters.tsx
src/components/ScanHistory/ScanHistory.tsx
src/components/ScanHistory/ScanHistory.css
src/components/ScanHistory/ScanCompare.tsx
```

### Phase 6 — New Files to Create (Report & Export)

```
electron/services/report-generator.ts        ← Core report generation + format dispatch
electron/services/report-templates.ts        ← Self-contained HTML template (inline CSS + highlight.js)
src/components/Report/ReportView.tsx         ← In-app report document renderer
src/components/Report/ReportView.css         ← Report styles (document layout, print-friendly)
src/components/Report/TrendChart.tsx         ← SVG health score trend chart
src/components/Report/ExportControls.tsx     ← Export buttons (HTML, PDF, SARIF, JSON, Clipboard)
```

### Phase 7 — Files to Delete

```
# Frontend — Code Gen
src/components/Chat/CodeGenModal.tsx
src/components/Chat/CodeGenPanel.tsx
src/components/Chat/RefactorModal.tsx
src/components/Chat/RefactorPanel.tsx
src/components/Chat/DesignDocModal.tsx
src/components/Chat/DesignDocPanel.tsx
src/components/Chat/TaskPlannerModal.tsx
src/components/Chat/TaskPlannerPanel.tsx
src/components/Chat/PromptEnhancerPanel.tsx

# Frontend — Compare
src/components/Compare/ComparePanel.tsx
src/components/Compare/CompareModelPicker.tsx
src/components/Compare/CompareResponseCard.tsx
src/components/Compare/Compare.css

# Backend — Code Gen Agents
electron/services/agents/planner-agent.ts
electron/services/agents/coder-agent.ts
electron/services/agents/reviewer-agent.ts
electron/services/agents/executor-agent.ts
electron/services/agents/validator-agent.ts
electron/services/agents/decomposer-agent.ts

# Backend — Old Pipeline
electron/services/pipeline-orchestrator.ts
electron/services/pipeline-graph.ts
electron/services/pipeline-templates.ts
electron/services/pipeline-types.ts
electron/services/pipeline-state.ts

# Frontend — Old Pipeline
src/components/Pipeline/PipelinePanel.tsx
src/components/Pipeline/PipelineHistory.tsx
src/components/Pipeline/StageCard.tsx
src/components/Pipeline/Pipeline.css
src/components/Pipeline/StageCard.css

# Hooks
src/hooks/useCompare.ts
src/hooks/usePipeline.ts

# Services
src/services/agent.ts
```

### Phase 7 — Files to Modify

```
src/App.tsx                                  ← New layout, remove code-gen panels
src/components/Sidebar/Sidebar.tsx           ← Remove code-gen buttons, add scan nav
src/components/Chat/ChatView.tsx             ← Strip code-gen modals and features
src/components/Chat/ChatInput.tsx            ← Strip code-gen shortcuts
src/components/Chat/Chat.css                 ← Remove code-gen modal styles
src/components/CommandPalette/CommandPalette.tsx ← Replace actions
src/services/command-router.ts               ← Replace command intents
src/hooks/useKeyboardShortcuts.ts            ← Update shortcuts
src/store/AgentContext.tsx                    ← Repurpose for scan agents
src/components/Agent/AgentEditorModal.tsx     ← Repurpose for scan agent config
src/components/Agent/AgentPanel.tsx           ← Repurpose presets
electron/services/agents/security-agent.ts   ← Expand massively (or replaced by scan-engine)
electron/services/agents/research-agent.ts   ← Repurpose for pre-scan analysis
electron/services/agent-types.ts             ← Update presets for security agents
electron/services/agent-manager.ts           ← Update defaults
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| New backend files | 16 |
| New frontend files | 21 |
| Files to delete | 27 |
| Files to modify | 17 |
| Total scan rules planned | 200+ |
| New SQLite tables | 4 |
| New IPC channels | ~18 |
| IPC channels removed | ~20 |
| Export formats | 5 (HTML, PDF, SARIF, JSON, Markdown) |
| Implementation phases | 8 |

---

*This document is the source of truth for the LocalMind Security transformation. Each phase is self-contained and produces a working (if incomplete) system.*
