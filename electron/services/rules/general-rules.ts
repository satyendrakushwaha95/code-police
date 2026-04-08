import type { RawFinding, ScanRule } from '../scan-types';
import { findAllMatches, findMultilineMatches } from './rule-registry';

function normalizeGitignoreLines(content: string): string[] {
  return content.split('\n').map(l => {
    const hash = l.indexOf('#');
    const base = hash >= 0 ? l.slice(0, hash) : l;
    return base.trim();
  }).filter(Boolean);
}

function gitignoreHasPattern(lines: string[], predicate: (line: string) => boolean): boolean {
  return lines.some(predicate);
}

function detectEnvFileSecrets(content: string): RawFinding[] {
  const sensitiveKey = /^(?:.*(?:password|passwd|pwd|secret|api[_-]?key|apikey|private[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|database[_-]?url|connection[_-]?string))\s*=/i;
  const lines = content.split('\n');
  const out: RawFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (sensitiveKey.test(trimmed) && /=/.test(trimmed)) {
      const eq = trimmed.indexOf('=');
      const value = trimmed.slice(eq + 1).trim();
      if (value.length > 0 && !/^\$\{/.test(value) && value !== '""' && value !== "''") {
        out.push({
          line: i + 1,
          column: 1,
          matchedCode: line.length > 200 ? `${line.slice(0, 197)}...` : line,
          context: line,
        });
      }
    }
  }
  return out;
}

function detectMissingSecurityHeaders(content: string): RawFinding[] {
  const looksWebConfig =
    /\b(listen\s+\d+|server\s*\{|proxy_pass|VirtualHost|ServerName|<VirtualHost|ssl_certificate)\b/i.test(
      content,
    );
  if (!looksWebConfig) return [];
  if (/\bX-Frame-Options\s*:\s*DENY\b/i.test(content)) return [];
  return [
    {
      line: 1,
      matchedCode: '(no X-Frame-Options: DENY found in file)',
      context: content.split('\n').slice(0, 5).join('\n'),
    },
  ];
}

function detectDockerfileNoUser(content: string): RawFinding[] {
  const lines = content.split('\n');
  let hasUser = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (/^USER\s+/i.test(t)) {
      hasUser = true;
      break;
    }
  }
  if (hasUser) return [];
  return [
    {
      line: 1,
      matchedCode: '(Dockerfile has no USER directive; container may run as root)',
    },
  ];
}

function detectSensitiveFilePath(filePath: string): RawFinding[] {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  const base = norm.split('/').pop() || norm;
  const patterns: RegExp[] = [
    /(^|\/)id_rsa$/,
    /(^|\/)id_rsa\.pub$/,
    /\.pem$/i,
    /\.key$/i,
    /\.p12$/i,
    /\.pfx$/i,
    /\.jks$/i,
    /(^|\/)credentials(\.json)?$/i,
    /\.keystore$/i,
  ];
  if (patterns.some(re => re.test(norm) || re.test(base))) {
    return [
      {
        line: 1,
        matchedCode: filePath,
        metadata: { reason: 'sensitive_filename' },
      },
    ];
  }
  return [];
}

export function getGeneralRules(): ScanRule[] {
  return [
    {
      id: 'general/hardcoded-api-key',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded API key',
      description:
        'Source contains an assignment or literal that looks like an API key (api_key, apikey, api-key, etc.). Credentials in code can be extracted from repositories and builds.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.env', '*.yml', '*.yaml', '*.json', '*.properties', '*.xml'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:api[_-]?key|apikey)\s*[:=]\s*["']([^"'\\]{8,})["']/gi,
          filePath,
        ).concat(
          findAllMatches(content, /\bapi-key\s*=\s*["']([^"'\\]{8,})["']/gi, filePath),
        ),
      fixGuidance:
        'Remove the key from source. Load secrets from a vault, environment variables injected at runtime, or your platform’s secret manager. Rotate any exposed key.',
    },
    {
      id: 'general/hardcoded-password',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded password',
      description:
        'A password, passwd, or pwd field appears to be assigned a literal string. This exposes credentials to anyone with repo or artifact access.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.env', '*.yml', '*.yaml', '*.json', '*.properties'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\\]{4,})["']/gi,
          filePath,
        ),
      fixGuidance:
        'Use environment variables, a secrets manager, or hashed credentials. Never commit real passwords; rotate if this value was ever real.',
    },
    {
      id: 'general/hardcoded-secret',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded secret or secret_key',
      description:
        'Assignments to secret, secret_key, or similar suggest embedded secrets rather than external secret management.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.yml', '*.yaml', '*.json', '*.properties'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:secret|secret_key|secretKey)\s*[:=]\s*["']([^"'\\]{8,})["']/gi,
          filePath,
        ),
      fixGuidance: 'Externalize secrets via vault or environment injection. Rotate any exposed values.',
    },
    {
      id: 'general/hardcoded-token',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded access token',
      description:
        'Token or access_token fields with literal values are often bearer credentials and should not live in source.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.env', '*.yml', '*.yaml', '*.json'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:token|access_token|accessToken)\s*[:=]\s*["']([^"'\\]{12,})["']/gi,
          filePath,
        ),
      fixGuidance: 'Use short-lived tokens from OAuth/OIDC flows or secret stores; revoke any committed token.',
    },
    {
      id: 'general/private-key-inline',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'PEM private key material in file',
      description:
        'A PEM block beginning with BEGIN PRIVATE KEY or BEGIN RSA PRIVATE KEY indicates private key material in the tree.',
      cweId: 'CWE-321',
      owaspCategory: 'A02:2021 – Cryptographic Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.pem', '*.key', '*.txt', '*.env', '*.yml', '*.yaml'],
      detect: content =>
        findMultilineMatches(
          content,
          /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gim,
        ),
      fixGuidance:
        'Remove the key from the repo immediately, rotate it, and load keys from secure storage or mounted secrets only at runtime.',
    },
    {
      id: 'general/aws-access-key',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'AWS access key ID pattern',
      description: 'A string matching the AWS access key ID format (AKIA…) may be a live credential.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bAKIA[0-9A-Z]{16}\b/g, filePath),
      fixGuidance: 'Deactivate and rotate the key in IAM. Use IAM roles, instance profiles, or OIDC instead of long-lived keys.',
    },
    {
      id: 'general/aws-secret-key',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'Possible AWS secret access key',
      description:
        'AWS secret access keys are often 40-character base64-like strings assigned to AWS_SECRET_ACCESS_KEY or similar.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
          filePath,
        ).concat(findAllMatches(content, /\baws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, filePath)),
      fixGuidance: 'Rotate the secret key immediately. Never commit AWS secrets; use roles or a secrets manager.',
    },
    {
      id: 'general/jwt-secret-hardcoded',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded JWT signing secret',
      description:
        'JWT_SECRET, jwtSecret, or signing secret literals weaken authentication if the secret is embedded in source.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php', '*.json', '*.yml', '*.yaml', '*.env'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:JWT_SECRET|jwtSecret|jwt_secret)\s*[:=]\s*["']([^"'\\]{16,})["']/gi,
          filePath,
        ).concat(
          findAllMatches(
            content,
            /\b(?:signingSecret|signing_secret)\s*[:=]\s*["']([^"'\\]{16,})["']/gi,
            filePath,
          ),
        ),
      fixGuidance: 'Use a strong random secret from the environment or KMS/HSM. Rotate if exposed.',
    },
    {
      id: 'general/database-connection-string',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Database connection string with embedded password',
      description:
        'Connection URLs for MySQL, PostgreSQL, MongoDB, or SQL Server with user:password@ host expose credentials in plain text.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:mysql|mariadb|postgresql|postgres|mongodb(?:\+srv)?|sqlserver|mssql):\/\/[^:]+:[^@\s"']+@[^\s"']+/gi,
          filePath,
        ),
      fixGuidance:
        'Use environment variables or a secrets manager for connection strings. Prefer IAM/database auth where supported.',
    },
    {
      id: 'general/oauth-client-secret',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'OAuth client_secret in source',
      description: 'OAuth client_secret values must not be committed; they authenticate your application to the IdP.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.json', '*.yml', '*.yaml', '*.env', '*.properties'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bclient_secret\s*[:=]\s*["']([^"'\\]{8,})["']/gi,
          filePath,
        ).concat(findAllMatches(content, /"client_secret"\s*:\s*"([^"\\]{8,})"/gi, filePath)),
      fixGuidance: 'Store client_secret in a vault or server-side config only. Rotate at the provider if exposed.',
    },
    {
      id: 'general/generic-secret-assignment',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Long literal assigned to secret-like variable',
      description:
        'Variable names containing secret, key, or token with long alphanumeric literals may indicate embedded secrets.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php'],
      excludePatterns: ['*.min.js'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b[a-z_][a-z0-9_]*(?:secret|Secret|SECRET|_key|Key|_token|Token)[a-z0-9_]*\s*[:=]\s*["']([A-Za-z0-9+/=_-]{20,})["']/g,
          filePath,
        ),
      fixGuidance: 'Confirm whether this is a real secret; if so, move to secure configuration and rotate.',
    },
    {
      id: 'general/base64-credentials',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Basic authentication header with encoded credentials',
      description:
        'Authorization: Basic followed by a long base64 payload often encodes username:password and should not appear in source.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bAuthorization\s*:\s*Basic\s+([A-Za-z0-9+/=]{12,})\b/gi,
          filePath,
        ).concat(
          findAllMatches(content, /["']Authorization["']\s*,\s*["']Basic\s+[A-Za-z0-9+/=]{12,}/gi, filePath),
        ),
      fixGuidance: 'Remove static Basic credentials; use OAuth, API keys from env, or server-side proxying.',
    },
    {
      id: 'general/env-file-secrets',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Sensitive keys in environment file',
      description:
        '.env files often hold passwords, API keys, and tokens. Ensure they are not committed and are loaded only at runtime.',
      cweId: 'CWE-538',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*.env', '.env.*'],
      detect: content => detectEnvFileSecrets(content),
      fixGuidance: 'Add .env to .gitignore, use .env.example without secrets, and inject real values via deployment secrets.',
    },
    {
      id: 'general/debug-mode-production',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Debug mode enabled',
      description: 'DEBUG=true or debug: true in configuration can leak internals and weaken security in production.',
      cweId: 'CWE-489',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*.env', '*.yml', '*.yaml', '*.json', '*.properties', '*.ts', '*.js'],
      detect: (content, filePath) =>
        findAllMatches(content, /^\s*DEBUG\s*=\s*true\s*$/gim, filePath).concat(
          findAllMatches(content, /\bdebug\s*:\s*true\b/gi, filePath),
          findAllMatches(content, /\bNODE_ENV\s*=\s*development\b/gi, filePath),
        ),
      fixGuidance: 'Disable debug flags in production builds; use structured logging with appropriate levels.',
    },
    {
      id: 'general/default-credentials',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Default or trivial password',
      description:
        'Common default passwords (admin, password, 123456) are easily guessed and violate secure credential practices.',
      cweId: 'CWE-1393',
      owaspCategory: 'A07:2021 – Identification and Authentication Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(?:password|passwd|pwd)\s*[:=]\s*["'](?:admin|password|123456|root|guest|test|changeme|default)["']/gi,
          filePath,
        ),
      fixGuidance: 'Replace with unique strong passwords or disable default accounts; enforce password policy.',
    },
    {
      id: 'general/cors-wildcard',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'CORS allows all origins',
      description: 'Access-Control-Allow-Origin: * permits any origin to read responses in browser contexts.',
      cweId: 'CWE-942',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(content, /Access-Control-Allow-Origin\s*:\s*\*/gi, filePath).concat(
          findAllMatches(content, /["']Access-Control-Allow-Origin["']\s*,\s*["']\*["']/gi, filePath),
        ),
      fixGuidance: 'Restrict to explicit trusted origins or derive allowed origin from a server-side allowlist.',
    },
    {
      id: 'general/missing-security-headers',
      language: 'general',
      category: 'security',
      severity: 'low',
      title: 'Missing X-Frame-Options: DENY',
      description:
        'Web server or proxy configuration files that look like HTTP configs should set clickjacking protection such as X-Frame-Options: DENY.',
      cweId: 'CWE-1021',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*.conf', 'nginx.conf', 'httpd.conf', '.htaccess'],
      detect: content => detectMissingSecurityHeaders(content),
      fixGuidance: 'Add X-Frame-Options: DENY or DENY/SAMEORIGIN, or use CSP frame-ancestors as appropriate.',
    },
    {
      id: 'general/http-not-https',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'HTTP URL for external service',
      description:
        'http:// URLs for non-local hosts risk interception; prefer https:// for APIs and public endpoints.',
      cweId: 'CWE-319',
      owaspCategory: 'A02:2021 – Cryptographic Failures',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bhttp:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|\[::1\])([a-z0-9.-]+)(?::\d+)?(?:\/[^\s"'<>]*)?/gi,
          filePath,
        ),
      fixGuidance: 'Use https:// endpoints, TLS for internal services where possible, and HSTS at the edge.',
    },
    {
      id: 'general/insecure-cookie-flags',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Set-Cookie missing security flags',
      description:
        'Set-Cookie lines without Secure, HttpOnly, or SameSite are more vulnerable to theft and CSRF.',
      cweId: 'CWE-614',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*'],
      detect: content => {
        const lines = content.split('\n');
        const out: RawFinding[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!/Set-Cookie\s*:/i.test(line)) continue;
          const lower = line.toLowerCase();
          if (!lower.includes('secure') || !lower.includes('httponly') || !lower.includes('samesite')) {
            out.push({
              line: i + 1,
              matchedCode: line.length > 240 ? `${line.slice(0, 237)}...` : line,
              context: line,
            });
          }
        }
        return out;
      },
      fixGuidance: 'Set Secure; HttpOnly; and SameSite=Lax or Strict for session cookies unless you have a documented exception.',
    },
    {
      id: 'general/wildcard-permissions',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Overly permissive file mode',
      description: 'chmod 777 or 0777 grants read/write/execute to all users.',
      cweId: 'CWE-732',
      owaspCategory: 'A01:2021 – Broken Access Control',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bchmod\s+(?:0?777|777)\b/gi, filePath).concat(
          findAllMatches(content, /\b0o777\b/gi, filePath),
        ),
      fixGuidance: 'Use least privilege (e.g. 750 for dirs, 640 for files) and run services as non-root.',
    },
    {
      id: 'general/exposed-port-binding',
      language: 'general',
      category: 'security',
      severity: 'low',
      title: 'Binding to all interfaces',
      description: 'Listening on 0.0.0.0 or :: exposes the service on all network interfaces.',
      cweId: 'CWE-668',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(content, /\b0\.0\.0\.0\s*:\s*\d{2,5}\b/g, filePath).concat(
          findAllMatches(content, /\[[::]\]\s*:\s*\d{2,5}\b/g, filePath),
          findAllMatches(content, /listen\s+0\.0\.0\.0\s*:\s*\d+/gi, filePath),
        ),
      fixGuidance: 'Bind to 127.0.0.1 for local-only services or place behind a reverse proxy with firewall rules.',
    },
    {
      id: 'general/todo-fixme-security',
      language: 'general',
      category: 'security',
      severity: 'info',
      title: 'TODO/FIXME mentions security',
      description: 'Comments reference security, vulnerability, or hack and may indicate unfinished mitigations.',
      cweId: undefined,
      owaspCategory: undefined,
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\/\/[^\n]*\b(?:TODO|FIXME|XXX)\b[^\n]*\b(?:security|vulnerability|vuln|hack|insecure)\b[^\n]*/gi,
          filePath,
        ).concat(
          findAllMatches(
            content,
            /#(?:[^\n]*)\b(?:TODO|FIXME)\b[^\n]*\b(?:security|vulnerability|vuln|hack|insecure)\b[^\n]*/gi,
            filePath,
          ),
        ),
      fixGuidance: 'Track these as issues, assign owners, and remove or resolve before release.',
    },
    {
      id: 'general/dockerfile-root-user',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Dockerfile may run as root',
      description: 'No USER directive was found; the default user is often root inside the container.',
      cweId: 'CWE-250',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['Dockerfile', 'Dockerfile.*'],
      detect: content => detectDockerfileNoUser(content),
      fixGuidance: 'Add a non-root USER after installing dependencies; use numeric UIDs where helpful.',
    },
    {
      id: 'general/dockerfile-latest-tag',
      language: 'general',
      category: 'security',
      severity: 'low',
      title: 'Dockerfile uses :latest image tag',
      description: 'FROM ...:latest produces non-reproducible builds and can pull unexpected image versions.',
      cweId: 'CWE-1104',
      owaspCategory: 'A06:2021 – Vulnerable and Outdated Components',
      filePatterns: ['Dockerfile', 'Dockerfile.*'],
      detect: (content, filePath) =>
        findAllMatches(content, /^\s*FROM\s+[^\s#]+:latest\b/gim, filePath),
      fixGuidance: 'Pin images by digest or specific version tag and automate updates with scanning.',
    },
    {
      id: 'general/dockerfile-add-vs-copy',
      language: 'general',
      category: 'security',
      severity: 'low',
      title: 'Dockerfile uses ADD instead of COPY',
      description: 'ADD can fetch URLs and unpack archives; COPY is clearer and reduces accidental remote fetch.',
      cweId: 'CWE-829',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['Dockerfile', 'Dockerfile.*'],
      detect: (content, filePath) => findAllMatches(content, /^\s*ADD\s+/gim, filePath),
      fixGuidance: 'Prefer COPY for files and directories; use ADD only when you need tar extraction or URL fetch intentionally.',
    },
    {
      id: 'general/exposed-sensitive-port',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Sensitive database or cache port exposed',
      description: 'docker-compose may publish MySQL, PostgreSQL, MongoDB, or Redis ports to the host.',
      cweId: 'CWE-668',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['docker-compose*.yml', 'docker-compose*.yaml'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /["']?\d{1,5}["']?\s*:\s*["']?(3306|5432|27017|6379|1433|1521)["']?/g,
          filePath,
        ),
      fixGuidance: 'Do not publish database ports publicly; use internal Docker networks or SSH tunnels.',
    },
    {
      id: 'general/docker-privileged',
      language: 'general',
      category: 'security',
      severity: 'high',
      title: 'Privileged Docker container',
      description: 'privileged: true grants broad host capabilities and weakens isolation.',
      cweId: 'CWE-250',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['docker-compose*.yml', 'docker-compose*.yaml'],
      detect: (content, filePath) =>
        findAllMatches(content, /privileged\s*:\s*true\b/gi, filePath).concat(
          findAllMatches(content, /--privileged\b/gi, filePath),
        ),
      fixGuidance: 'Remove privileged mode; use specific capabilities (cap_add) only when required.',
    },
    {
      id: 'general/gitignore-missing-env',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: '.gitignore does not ignore .env files',
      description: 'Without .env patterns, environment files with secrets may be committed.',
      cweId: 'CWE-538',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['.gitignore'],
      detect: content => {
        const lines = normalizeGitignoreLines(content);
        const hasEnv =
          gitignoreHasPattern(lines, l => l === '.env' || l === '.env.*' || l === '*.env' || /^\.env/.test(l)) ||
          gitignoreHasPattern(lines, l => /(^|\/)\\.env/.test(l));
        if (hasEnv) return [];
        return [{ line: 1, matchedCode: '(no .env / *.env pattern in .gitignore)' }];
      },
      fixGuidance: 'Add .env, .env.local, and .env.* to .gitignore and commit a sanitized .env.example.',
    },
    {
      id: 'general/gitignore-missing-keys',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: '.gitignore does not ignore key or certificate files',
      description: 'Private keys and certificates should be listed in .gitignore to prevent accidental commits.',
      cweId: 'CWE-538',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['.gitignore'],
      detect: content => {
        const lines = normalizeGitignoreLines(content);
        const hasKeyPattern =
          gitignoreHasPattern(lines, l => /\.pem$/i.test(l) || l === '*.pem' || l === '*.key' || /\.key$/i.test(l)) ||
          gitignoreHasPattern(lines, l => /id_rsa/i.test(l) || l === '*.p12' || l === '*.pfx' || /\.jks$/i.test(l));
        if (hasKeyPattern) return [];
        return [{ line: 1, matchedCode: '(no *.pem / *.key / id_rsa pattern in .gitignore)' }];
      },
      fixGuidance: 'Add *.pem, *.key, id_rsa, *.p12, *.jks, and similar patterns to .gitignore.',
    },
    {
      id: 'general/sensitive-file-committed',
      language: 'general',
      category: 'security',
      severity: 'critical',
      title: 'Sensitive filename in repository path',
      description:
        'The path suggests a private key, certificate, or credentials file that should not live in source control.',
      cweId: 'CWE-538',
      owaspCategory: 'A05:2021 – Security Misconfiguration',
      filePatterns: ['*'],
      detect: (_content, filePath) => detectSensitiveFilePath(filePath),
      fixGuidance: 'Remove from git history (e.g. filter-repo), rotate credentials, and add patterns to .gitignore.',
    },
    {
      id: 'general/console-log-sensitive',
      language: 'general',
      category: 'security',
      severity: 'medium',
      title: 'Logging may include sensitive fields',
      description:
        'console.log / System.out / print statements that mention password, secret, or token risk leaking data.',
      cweId: 'CWE-532',
      owaspCategory: 'A09:2021 – Security Logging and Monitoring Failures',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.rb', '*.go', '*.java', '*.kt', '*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bconsole\.(?:log|debug|info|warn)\s*\([^)]*\b(?:password|secret|token|apikey|api_key)\b[^)]*\)/gi,
          filePath,
        ).concat(
          findAllMatches(
            content,
            /\bSystem\.out\.print(?:ln)?\s*\([^)]*\b(?:password|secret|token)\b[^)]*\)/gi,
            filePath,
          ),
          findAllMatches(
            content,
            /\bprint\s*\([^)]*\b(?:password|secret|token)\b[^)]*\)/gi,
            filePath,
          ),
        ),
      fixGuidance: 'Log event IDs and categories only; never log secrets. Use structured logging with redaction.',
    },
    {
      id: 'general/fixme-in-production',
      language: 'general',
      category: 'quality',
      severity: 'info',
      title: 'FIXME or HACK comment',
      description: 'FIXME/HACK markers indicate incomplete work that may affect maintainability or behavior.',
      filePatterns: ['*'],
      detect: (content, filePath) =>
        findAllMatches(content, /\/\/[^\n]*\b(?:FIXME|HACK)\b[^\n]*/gi, filePath).concat(
          findAllMatches(content, /#(?:[^\n]*)\b(?:FIXME|HACK)\b[^\n]*/gi, filePath),
          findMultilineMatches(content, /\/\*[\s\S]*?\b(?:FIXME|HACK)\b[\s\S]*?\*\//gi),
        ),
      fixGuidance: 'Convert to tracked issues or resolve before shipping critical paths.',
    },
    {
      id: 'general/large-file-warning',
      language: 'general',
      category: 'quality',
      severity: 'info',
      title: 'Very large source file',
      description: 'Files over 2000 lines are harder to review and more likely to hide defects.',
      filePatterns: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.py', '*.go', '*.java', '*.kt', '*.php'],
      detect: content => {
        const n = content.split('\n').length;
        if (n <= 2000) return [];
        return [
          {
            line: 1,
            endLine: n,
            matchedCode: `${n} lines`,
            metadata: { lineCount: n },
          },
        ];
      },
      fixGuidance: 'Split into modules, extract shared logic, and add tests around boundaries.',
    },
  ];
}
