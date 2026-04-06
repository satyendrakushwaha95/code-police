import * as fs from 'fs';
import * as path from 'path';

export interface TechStackInfo {
  framework: string | null;
  language: string;
  styling: string[];
  database: string[];
  testing: string[];
  buildTool: string | null;
  packageManager: string;
  runtime: string;
  other: string[];
}

export interface FileStats {
  totalFiles: number;
  totalDirs: number;
  byExtension: Record<string, number>;
  largestFiles: Array<{ path: string; lines: number }>;
  totalLines: number;
  sourceFiles: number;
  testFiles: number;
}

export interface ProjectAnalysis {
  techStack: TechStackInfo;
  fileStats: FileStats;
  configFiles: string[];
  entryPoints: string[];
  apiRoutes: string[];
  keyFileSamples: Array<{ path: string; content: string; role: string }>;
  directoryTree: string;
  packageInfo: { name?: string; version?: string; description?: string; dependencies: number; devDependencies: number } | null;
  detectedPatterns: string[];
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  '.svelte-kit', '.cache', '__pycache__', '.tox', '.venv', 'venv',
  'target', '.gradle', '.idea', '.vscode', '.output', '.nuxt',
  'vendor', 'bower_components',
]);

const CONFIG_PATTERNS = [
  'package.json', 'tsconfig.json', 'tsconfig.*.json', 'vite.config.*', 'next.config.*',
  'webpack.config.*', 'rollup.config.*', 'tailwind.config.*', 'postcss.config.*',
  '.eslintrc*', 'eslint.config.*', '.prettierrc*', 'jest.config.*', 'vitest.config.*',
  'Dockerfile', 'docker-compose*.yml', '.env.example', '.gitignore',
  'Cargo.toml', 'go.mod', 'requirements.txt', 'pyproject.toml', 'setup.py',
  'Gemfile', 'composer.json', 'pubspec.yaml', 'pom.xml', 'build.gradle*',
  'angular.json', 'nuxt.config.*', 'svelte.config.*', 'astro.config.*',
  'prisma/schema.prisma', 'drizzle.config.*',
];

const ENTRY_POINT_PATTERNS = [
  'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', 'src/App.tsx', 'src/app.ts',
  'src/app/layout.tsx', 'src/app/page.tsx', 'pages/index.tsx', 'pages/_app.tsx',
  'main.py', 'app.py', 'manage.py', 'main.go', 'cmd/main.go',
  'src/main.rs', 'lib.rs', 'Program.cs', 'Main.java',
  'index.js', 'index.ts', 'server.ts', 'server.js', 'app.js',
];

const API_ROUTE_PATTERNS = [
  /src\/app\/api\/.+\/route\.(ts|js)$/,
  /pages\/api\/.+\.(ts|js)$/,
  /routes\/.+\.(ts|js|py|rb)$/,
  /controllers?\/.+\.(ts|js|py|rb|java|go)$/,
  /api\/.+\.(ts|js|py)$/,
  /endpoints?\/.+\.(ts|js|py)$/,
];

const TEST_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /test_.*\.py$/, /__tests__\//,
  /_test\.go$/, /Test\.java$/,
];

function detectFramework(files: string[], pkgJson: any): string | null {
  const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };
  if (deps['next']) return `Next.js ${deps['next'].replace('^', '').replace('~', '')}`;
  if (deps['nuxt']) return `Nuxt ${deps['nuxt'].replace('^', '')}`;
  if (deps['@angular/core']) return `Angular ${deps['@angular/core'].replace('^', '')}`;
  if (deps['svelte'] || deps['@sveltejs/kit']) return 'SvelteKit';
  if (deps['astro']) return 'Astro';
  if (deps['vue']) return `Vue ${deps['vue'].replace('^', '')}`;
  if (deps['react']) {
    if (deps['vite']) return `React + Vite`;
    if (deps['react-scripts']) return 'Create React App';
    return `React ${deps['react'].replace('^', '')}`;
  }
  if (deps['express']) return 'Express.js';
  if (deps['fastify']) return 'Fastify';
  if (deps['hono']) return 'Hono';
  if (deps['electron']) return 'Electron';
  if (files.some(f => f === 'manage.py')) return 'Django';
  if (files.some(f => f === 'app.py' || f.includes('flask'))) return 'Flask';
  if (files.some(f => f.endsWith('.go') && f.includes('main'))) return 'Go';
  if (files.some(f => f === 'Cargo.toml')) return 'Rust';
  if (files.some(f => f === 'pom.xml')) return 'Spring/Maven';
  if (files.some(f => f.includes('build.gradle'))) return 'Gradle';
  if (files.some(f => f === 'Gemfile')) return 'Ruby/Rails';
  if (files.some(f => f === 'composer.json')) return 'Laravel/PHP';
  if (files.some(f => f === 'pubspec.yaml')) return 'Flutter/Dart';
  return null;
}

function detectLanguage(stats: Record<string, number>): string {
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript', '.jsx': 'JavaScript',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
    '.cs': 'C#', '.rb': 'Ruby', '.php': 'PHP', '.dart': 'Dart', '.swift': 'Swift',
    '.cpp': 'C++', '.c': 'C',
  };
  let best = 'Unknown';
  let bestCount = 0;
  for (const [ext, count] of Object.entries(stats)) {
    if (langMap[ext] && count > bestCount) {
      best = langMap[ext];
      bestCount = count;
    }
  }
  return best;
}

function detectStyling(files: string[], pkgJson: any): string[] {
  const result: string[] = [];
  const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };
  if (deps['tailwindcss']) result.push('Tailwind CSS');
  if (deps['@mui/material'] || deps['@material-ui/core']) result.push('Material UI');
  if (deps['@chakra-ui/react']) result.push('Chakra UI');
  if (deps['styled-components']) result.push('Styled Components');
  if (deps['@emotion/react']) result.push('Emotion');
  if (deps['bootstrap'] || deps['react-bootstrap']) result.push('Bootstrap');
  if (files.some(f => f.endsWith('.scss') || f.endsWith('.sass'))) result.push('SCSS');
  if (files.some(f => f.endsWith('.less'))) result.push('Less');
  if (result.length === 0 && files.some(f => f.endsWith('.css'))) result.push('CSS');
  return result;
}

function detectDatabase(pkgJson: any): string[] {
  const result: string[] = [];
  const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };
  if (deps['prisma'] || deps['@prisma/client']) result.push('Prisma');
  if (deps['drizzle-orm']) result.push('Drizzle');
  if (deps['typeorm']) result.push('TypeORM');
  if (deps['sequelize']) result.push('Sequelize');
  if (deps['mongoose'] || deps['mongodb']) result.push('MongoDB');
  if (deps['pg'] || deps['postgres']) result.push('PostgreSQL');
  if (deps['mysql2'] || deps['mysql']) result.push('MySQL');
  if (deps['better-sqlite3'] || deps['sqlite3']) result.push('SQLite');
  if (deps['redis'] || deps['ioredis']) result.push('Redis');
  if (deps['@supabase/supabase-js']) result.push('Supabase');
  if (deps['firebase'] || deps['firebase-admin']) result.push('Firebase');
  return result;
}

function detectTesting(pkgJson: any): string[] {
  const result: string[] = [];
  const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };
  if (deps['jest'] || deps['@jest/core']) result.push('Jest');
  if (deps['vitest']) result.push('Vitest');
  if (deps['mocha']) result.push('Mocha');
  if (deps['cypress']) result.push('Cypress');
  if (deps['playwright'] || deps['@playwright/test']) result.push('Playwright');
  if (deps['@testing-library/react']) result.push('React Testing Library');
  if (deps['supertest']) result.push('Supertest');
  return result;
}

function detectPackageManager(rootPath: string): string {
  if (fs.existsSync(path.join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootPath, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(rootPath, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(rootPath, 'Pipfile.lock'))) return 'pipenv';
  if (fs.existsSync(path.join(rootPath, 'poetry.lock'))) return 'poetry';
  if (fs.existsSync(path.join(rootPath, 'go.sum'))) return 'go modules';
  if (fs.existsSync(path.join(rootPath, 'Cargo.lock'))) return 'cargo';
  return 'unknown';
}

function buildTreeString(rootPath: string, prefix: string = '', depth: number = 0, maxDepth: number = 3): string {
  if (depth >= maxDepth) return '';
  let result = '';
  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true })
      .filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 25);

    entries.forEach((entry, i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const icon = entry.isDirectory() ? '📁 ' : '';
      result += `${prefix}${connector}${icon}${entry.name}\n`;
      if (entry.isDirectory()) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        result += buildTreeString(path.join(rootPath, entry.name), newPrefix, depth + 1, maxDepth);
      }
    });
  } catch { /* permission error */ }
  return result;
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function readFileSafe(filePath: string, maxBytes: number = 8000): string {
  try {
    const buf = Buffer.alloc(maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    fs.closeSync(fd);
    return buf.toString('utf-8', 0, bytesRead);
  } catch {
    return '';
  }
}

export async function analyzeProject(rootPath: string): Promise<ProjectAnalysis> {
  const allFiles: string[] = [];
  const allDirs: string[] = [];
  const byExtension: Record<string, number> = {};
  const fileSizes: Array<{ path: string; lines: number }> = [];

  // Recursive scan
  function scan(dir: string, rel: string, depth: number) {
    if (depth > 6) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          allDirs.push(relPath);
          scan(fullPath, relPath, depth + 1);
        } else if (entry.isFile()) {
          allFiles.push(relPath);
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) byExtension[ext] = (byExtension[ext] || 0) + 1;
        }
      }
    } catch { /* skip */ }
  }
  scan(rootPath, '', 0);

  // Parse package.json if exists
  let pkgJson: any = null;
  const pkgPath = path.join(rootPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try { pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch {}
  }

  // Count lines for source files (sample up to 200)
  const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.rb', '.php', '.dart', '.swift', '.cpp', '.c', '.vue', '.svelte']);
  let totalLines = 0;
  let sourceFiles = 0;
  const sampleFiles = allFiles.filter(f => sourceExts.has(path.extname(f).toLowerCase())).slice(0, 200);
  for (const f of sampleFiles) {
    const lines = countLines(path.join(rootPath, f));
    totalLines += lines;
    sourceFiles++;
    fileSizes.push({ path: f, lines });
  }
  fileSizes.sort((a, b) => b.lines - a.lines);

  const testFiles = allFiles.filter(f => TEST_PATTERNS.some(p => p.test(f))).length;

  // Detect config files
  const configFiles = allFiles.filter(f => {
    const name = path.basename(f);
    return CONFIG_PATTERNS.some(p => {
      if (p.includes('*')) {
        const regex = new RegExp('^' + p.replace('.', '\\.').replace('*', '.*') + '$');
        return regex.test(name);
      }
      return name === p || f === p;
    });
  });

  // Detect entry points
  const entryPoints = allFiles.filter(f =>
    ENTRY_POINT_PATTERNS.some(p => f.endsWith(p) || f === p)
  );

  // Detect API routes
  const apiRoutes = allFiles.filter(f =>
    API_ROUTE_PATTERNS.some(p => p.test(f))
  );

  // Tech stack
  const techStack: TechStackInfo = {
    framework: detectFramework(allFiles, pkgJson),
    language: detectLanguage(byExtension),
    styling: detectStyling(allFiles, pkgJson),
    database: detectDatabase(pkgJson),
    testing: detectTesting(pkgJson),
    buildTool: pkgJson?.devDependencies?.vite ? 'Vite' : pkgJson?.devDependencies?.webpack ? 'Webpack' : pkgJson?.devDependencies?.esbuild ? 'esbuild' : null,
    packageManager: detectPackageManager(rootPath),
    runtime: pkgJson ? 'Node.js' : fs.existsSync(path.join(rootPath, 'go.mod')) ? 'Go' : fs.existsSync(path.join(rootPath, 'Cargo.toml')) ? 'Rust' : fs.existsSync(path.join(rootPath, 'requirements.txt')) ? 'Python' : 'Unknown',
    other: [],
  };

  const deps = { ...(pkgJson?.dependencies || {}), ...(pkgJson?.devDependencies || {}) };
  if (deps['socket.io'] || deps['ws']) techStack.other.push('WebSockets');
  if (deps['graphql'] || deps['@apollo/server']) techStack.other.push('GraphQL');
  if (deps['trpc'] || deps['@trpc/server']) techStack.other.push('tRPC');
  if (deps['stripe']) techStack.other.push('Stripe');
  if (deps['@aws-sdk/client-s3'] || deps['aws-sdk']) techStack.other.push('AWS SDK');

  // Detected patterns
  const detectedPatterns: string[] = [];
  if (allFiles.some(f => f.includes('middleware'))) detectedPatterns.push('Middleware pattern');
  if (allDirs.some(d => d.includes('hooks'))) detectedPatterns.push('Custom hooks');
  if (allDirs.some(d => d.includes('store') || d.includes('redux') || d.includes('zustand'))) detectedPatterns.push('State management');
  if (allDirs.some(d => d.includes('services') || d.includes('lib'))) detectedPatterns.push('Service layer');
  if (allDirs.some(d => d.includes('utils') || d.includes('helpers'))) detectedPatterns.push('Utility layer');
  if (allFiles.some(f => f.endsWith('.module.css') || f.endsWith('.module.scss'))) detectedPatterns.push('CSS Modules');
  if (allFiles.some(f => f.includes('.d.ts'))) detectedPatterns.push('Type declarations');
  if (configFiles.some(f => f.includes('docker'))) detectedPatterns.push('Containerized');
  if (allFiles.some(f => f.includes('.github/workflows'))) detectedPatterns.push('CI/CD (GitHub Actions)');
  if (allFiles.some(f => f.includes('prisma/schema'))) detectedPatterns.push('Prisma ORM');

  // Sample key files for LLM analysis (read first ~2KB of important files)
  const keyFileSamples: Array<{ path: string; content: string; role: string }> = [];
  const samplesToRead: Array<{ path: string; role: string }> = [
    ...entryPoints.slice(0, 3).map(p => ({ path: p, role: 'entry point' })),
    ...apiRoutes.slice(0, 3).map(p => ({ path: p, role: 'API route' })),
    ...configFiles.filter(f => ['package.json', 'tsconfig.json'].some(c => f.endsWith(c))).slice(0, 2).map(p => ({ path: p, role: 'config' })),
  ];
  // Add schema files
  const schemaFiles = allFiles.filter(f => f.includes('schema.prisma') || f.includes('schema.ts') || f.includes('models/') || f.includes('entities/'));
  samplesToRead.push(...schemaFiles.slice(0, 2).map(p => ({ path: p, role: 'data model' })));

  for (const sample of samplesToRead.slice(0, 10)) {
    const content = readFileSafe(path.join(rootPath, sample.path), 2000);
    if (content) keyFileSamples.push({ path: sample.path, content, role: sample.role });
  }

  // Package info
  const packageInfo = pkgJson ? {
    name: pkgJson.name,
    version: pkgJson.version,
    description: pkgJson.description,
    dependencies: Object.keys(pkgJson.dependencies || {}).length,
    devDependencies: Object.keys(pkgJson.devDependencies || {}).length,
  } : null;

  // Directory tree (top 3 levels)
  const directoryTree = buildTreeString(rootPath);

  return {
    techStack,
    fileStats: {
      totalFiles: allFiles.length,
      totalDirs: allDirs.length,
      byExtension,
      largestFiles: fileSizes.slice(0, 10),
      totalLines,
      sourceFiles,
      testFiles,
    },
    configFiles,
    entryPoints,
    apiRoutes,
    keyFileSamples,
    directoryTree,
    packageInfo,
    detectedPatterns,
  };
}
