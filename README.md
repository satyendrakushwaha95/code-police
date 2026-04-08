# Code Police

LLM-augmented security and bug scanner for **Java**, **Angular**, and **PHP** projects. Runs entirely locally — no cloud dependencies.

## What It Does

- **203 security & bug rules** across Java/Spring (60), Angular/TS (50), PHP/Laravel (60), and general (33)
- **LLM-powered deep analysis** — false positive elimination, attack vector explanation, fix generation
- **Dependency auditing** — npm audit, composer audit, Maven CVE checking (local, no external tools)
- **5 export formats** — self-contained HTML, PDF, SARIF v2.1.0 (GitHub/VS Code), JSON, Markdown
- **Scan history** — track security posture over time, compare scans, see regressions

## Quick Start

### Prerequisites

- Node.js 18+
- An LLM provider (Ollama recommended for local use)

### Setup

```bash
npm install
npm run dev
```

### First Scan

1. Open a project folder from the Dashboard
2. Select a scan profile (Quick Scan, Full Audit, OWASP Top 10, etc.)
3. Click **Start Scan**
4. Review findings in the Findings tab
5. Export a report from the Report tab

### With Ollama (recommended)

```bash
ollama serve
ollama pull llama3
```

Enable "LLM Deep Analysis" in scan controls for false positive elimination and fix generation.

## Scan Profiles

| Profile | What it does |
|---------|-------------|
| **Quick Scan** | Changed files only (git diff), critical+high rules, no LLM |
| **Full Audit** | All 203 rules + LLM review + dependency audit |
| **OWASP Top 10** | Security rules targeting OWASP categories |
| **Dependency Audit** | Package manifest scanning for known CVEs |
| **Code Quality** | Bug patterns, type safety, performance anti-patterns |
| **Custom** | Pick your own rule sets and severity levels |

## Tech Stack

- **Desktop**: Electron
- **UI**: React 19 + TypeScript + Vite
- **Editor**: Monaco
- **Data**: SQLite (better-sqlite3) + LanceDB (vector search)
- **LLM**: Ollama (local) / OpenAI / Anthropic (optional cloud)

## Build

```bash
npm run build          # TypeScript + Vite build
npm run pack           # Electron builder (unpacked)
npm run dist:win       # Windows installer
```

## License

Private
