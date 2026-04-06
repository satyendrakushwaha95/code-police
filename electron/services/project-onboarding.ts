import { BrowserWindow } from 'electron';
import { analyzeProject, ProjectAnalysis } from './project-analyzer';
import { getProviderRegistry } from './providers/provider-registry';
import { getModelRouter } from './model-router';
import { getUsageTracker } from './usage-tracker';

export interface OnboardingReport {
  projectName: string;
  techStackSummary: string;
  architectureOverview: string;
  mermaidDiagram: string;
  keyFilesMap: string;
  apiSurface: string;
  dataSchemaDiagram: string;
  healthAssessment: string;
  directoryTree: string;
  rawAnalysis: ProjectAnalysis;
}

function buildTechStackSection(analysis: ProjectAnalysis): string {
  const ts = analysis.techStack;
  const lines: string[] = [];
  if (ts.framework) lines.push(`**Framework:** ${ts.framework}`);
  lines.push(`**Language:** ${ts.language}`);
  if (ts.buildTool) lines.push(`**Build Tool:** ${ts.buildTool}`);
  lines.push(`**Package Manager:** ${ts.packageManager}`);
  lines.push(`**Runtime:** ${ts.runtime}`);
  if (ts.styling.length > 0) lines.push(`**Styling:** ${ts.styling.join(', ')}`);
  if (ts.database.length > 0) lines.push(`**Database:** ${ts.database.join(', ')}`);
  if (ts.testing.length > 0) lines.push(`**Testing:** ${ts.testing.join(', ')}`);
  if (ts.other.length > 0) lines.push(`**Integrations:** ${ts.other.join(', ')}`);
  if (analysis.packageInfo) {
    lines.push(`**Packages:** ${analysis.packageInfo.dependencies} production, ${analysis.packageInfo.devDependencies} dev`);
  }
  return lines.join('\n');
}

function buildHealthSection(analysis: ProjectAnalysis): string {
  const fs = analysis.fileStats;
  const lines: string[] = [];
  lines.push(`**Files:** ${fs.totalFiles} total (${fs.sourceFiles} source, ${fs.testFiles} test)`);
  lines.push(`**Directories:** ${fs.totalDirs}`);
  lines.push(`**Lines of Code:** ~${fs.totalLines.toLocaleString()}`);

  const coverage = fs.sourceFiles > 0 ? Math.round((fs.testFiles / fs.sourceFiles) * 100) : 0;
  const coverageIcon = coverage > 50 ? '✅' : coverage > 20 ? '⚠️' : '❌';
  lines.push(`**Test Coverage:** ${coverageIcon} Tests exist for ~${coverage}% of source files`);

  if (fs.largestFiles.length > 0) {
    lines.push('\n**Largest Files** (may need splitting):');
    for (const f of fs.largestFiles.slice(0, 5)) {
      const icon = f.lines > 500 ? '🔴' : f.lines > 300 ? '🟡' : '🟢';
      lines.push(`- ${icon} \`${f.path}\` — ${f.lines} lines`);
    }
  }

  if (analysis.detectedPatterns.length > 0) {
    lines.push('\n**Detected Patterns:**');
    for (const p of analysis.detectedPatterns) {
      lines.push(`- ✅ ${p}`);
    }
  }

  return lines.join('\n');
}

function buildApiSection(analysis: ProjectAnalysis): string {
  if (analysis.apiRoutes.length === 0) return '*No API routes detected.*';
  const lines = analysis.apiRoutes.slice(0, 20).map(r => `- \`${r}\``);
  if (analysis.apiRoutes.length > 20) lines.push(`- *... and ${analysis.apiRoutes.length - 20} more*`);
  return lines.join('\n');
}

function buildLLMPrompt(analysis: ProjectAnalysis): string {
  const fileSamples = analysis.keyFileSamples
    .map(s => `### ${s.path} (${s.role})\n\`\`\`\n${s.content}\n\`\`\``)
    .join('\n\n');

  const topExtensions = Object.entries(analysis.fileStats.byExtension)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ext, count]) => `${ext}: ${count} files`)
    .join(', ');

  return `You are a senior architect analyzing a codebase. Generate a structured analysis.

## Project Facts
- ${analysis.fileStats.totalFiles} files, ${analysis.fileStats.totalDirs} directories
- Primary language: ${analysis.techStack.language}
- Framework: ${analysis.techStack.framework || 'None detected'}
- File types: ${topExtensions}
- Entry points: ${analysis.entryPoints.join(', ') || 'None detected'}
- API routes: ${analysis.apiRoutes.length} detected
- Config files: ${analysis.configFiles.join(', ')}

## Key File Samples
${fileSamples}

## Directory Structure (top 3 levels)
\`\`\`
${analysis.directoryTree.slice(0, 3000)}
\`\`\`

Based on this analysis, provide TWO things:

1. **ARCHITECTURE_OVERVIEW**: A 3-5 sentence description of how this project is structured. Mention the main layers, data flow, and key architectural decisions. Be specific to THIS project, not generic.

2. **MERMAID_DIAGRAM**: A Mermaid flowchart (using \`graph TD\`) showing the main components and how they connect. Keep it to 5-12 nodes maximum. Use descriptive labels.

3. **KEY_FILES_MAP**: Group the most important files by their role (Entry Points, API Layer, Data Layer, Business Logic, Config). For each file, add a brief 5-10 word description of what it does. Only include files that actually exist based on the samples and directory tree above.

Format your response EXACTLY like this (use these exact delimiters):

---ARCHITECTURE_OVERVIEW---
(your architecture description here)
---MERMAID_DIAGRAM---
\`\`\`mermaid
graph TD
  A[Component] --> B[Component]
\`\`\`
---KEY_FILES_MAP---
(your key files map here)
---END---`;
}

function emitProgress(stage: string, message: string): void {
  const windows = BrowserWindow.getAllWindows();
  for (const w of windows) {
    if (!w.isDestroyed()) {
      w.webContents.send('onboarding:progress', { stage, message });
    }
  }
}

export async function runOnboarding(rootPath: string): Promise<OnboardingReport> {
  const projectName = rootPath.split(/[/\\]/).pop() || 'project';

  // Phase 1: Static analysis (no LLM, instant)
  emitProgress('analyzing', 'Scanning project files...');
  const analysis = await analyzeProject(rootPath);
  emitProgress('analyzing', `Found ${analysis.fileStats.totalFiles} files across ${analysis.fileStats.totalDirs} directories`);

  // Phase 2: LLM analysis for architecture overview + diagram
  emitProgress('generating', 'Generating architecture overview...');

  let architectureOverview = '';
  let mermaidDiagram = '';
  let keyFilesMap = '';

  try {
    const router = getModelRouter();
    const decision = await router.resolve('documentation');
    const registry = getProviderRegistry();

    let fullResponse = '';
    for await (const chunk of registry.chatStream(
      decision.providerId,
      decision.resolvedModel,
      [{ role: 'user', content: buildLLMPrompt(analysis) }],
      { temperature: 0.3, max_tokens: 3000 }
    )) {
      fullResponse += chunk.content;
      if (chunk.done && chunk.usage) {
        try {
          const tracker = getUsageTracker();
          tracker.record({
            messageId: `onboarding:${Date.now()}`,
            conversationId: `onboarding:${projectName}`,
            providerId: decision.providerId,
            model: decision.resolvedModel,
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            durationMs: 0,
            timestamp: Date.now(),
          });
        } catch { /* best effort */ }
      }
    }

    // Parse sections from LLM response
    const archMatch = fullResponse.match(/---ARCHITECTURE_OVERVIEW---\s*([\s\S]*?)---MERMAID_DIAGRAM---/);
    const mermaidMatch = fullResponse.match(/---MERMAID_DIAGRAM---\s*([\s\S]*?)---KEY_FILES_MAP---/);
    const keyFilesMatch = fullResponse.match(/---KEY_FILES_MAP---\s*([\s\S]*?)---END---/);

    architectureOverview = archMatch?.[1]?.trim() || 'Architecture analysis not available.';
    const mermaidRaw = mermaidMatch?.[1]?.trim() || '';
    const mermaidCode = mermaidRaw.match(/```mermaid\s*([\s\S]*?)```/);
    mermaidDiagram = mermaidCode?.[1]?.trim() || mermaidRaw;
    keyFilesMap = keyFilesMatch?.[1]?.trim() || '';
  } catch (err) {
    architectureOverview = 'LLM analysis unavailable. See static analysis below.';
    mermaidDiagram = '';
    keyFilesMap = '';
  }

  emitProgress('complete', 'Onboarding report ready');

  return {
    projectName,
    techStackSummary: buildTechStackSection(analysis),
    architectureOverview,
    mermaidDiagram,
    keyFilesMap,
    apiSurface: buildApiSection(analysis),
    dataSchemaDiagram: '',
    healthAssessment: buildHealthSection(analysis),
    directoryTree: analysis.directoryTree,
    rawAnalysis: analysis,
  };
}

export function formatOnboardingReport(report: OnboardingReport): string {
  const sections: string[] = [];

  sections.push(`# 📋 Project Onboarding: ${report.projectName}\n`);

  sections.push(`## 🛠 Tech Stack\n\n${report.techStackSummary}\n`);

  if (report.architectureOverview) {
    sections.push(`## 🏗 Architecture Overview\n\n${report.architectureOverview}\n`);
  }

  if (report.mermaidDiagram) {
    sections.push(`## 📊 Architecture Diagram\n\n\`\`\`mermaid\n${report.mermaidDiagram}\n\`\`\`\n`);
  }

  if (report.keyFilesMap) {
    sections.push(`## 🗂 Key Files\n\n${report.keyFilesMap}\n`);
  }

  if (report.apiSurface !== '*No API routes detected.*') {
    sections.push(`## 🌐 API Surface\n\n${report.apiSurface}\n`);
  }

  sections.push(`## 🏥 Code Health\n\n${report.healthAssessment}\n`);

  sections.push(`## 📁 Directory Structure\n\n\`\`\`\n${report.directoryTree.slice(0, 3000)}\n\`\`\`\n`);

  return sections.join('\n---\n\n');
}
