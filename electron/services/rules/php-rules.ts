import { ScanRule, RawFinding } from '../scan-types';
import { findAllMatches, findMultilineMatches } from './rule-registry';

export function getPhpRules(): ScanRule[] {
  return [

    // ── SQL Injection ───────────────────────────────────────────────────────

    {
      id: 'php/sql-injection-raw-input',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Raw Superglobal in SQL Query',
      description:
        'Direct use of $_GET, $_POST, $_REQUEST, or $_COOKIE in SQL query functions allows attackers to inject arbitrary SQL and read, modify, or delete database contents.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(query|execute|mysql_query|mysqli_query|pg_query|sqlite_query|db_query)\s*\([^)]*\$_(GET|POST|REQUEST|COOKIE)\b/i,
          filePath,
        ),
      fixGuidance:
        'Use prepared statements with parameterized queries (PDO::prepare or mysqli::prepare). Never pass superglobals directly into query functions.',
    },

    {
      id: 'php/sql-injection-interpolation',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Variable Interpolation in SQL String',
      description:
        'PHP variable interpolation inside double-quoted SQL strings bypasses prepared-statement protections and allows SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: RawFinding[] = [];
        const sqlRe = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|FROM|JOIN|SET|VALUES)\b/i;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (sqlRe.test(line) && /"[^"]*\$[a-zA-Z_]/.test(line)) {
            const m = /"[^"]*\$[a-zA-Z_][^"]*"/.exec(line);
            findings.push({
              line: i + 1,
              column: m ? m.index + 1 : 1,
              matchedCode: m ? m[0] : line.trim(),
            });
          }
        }
        return findings;
      },
      fixGuidance:
        'Replace variable interpolation with prepared-statement placeholders. Use $pdo->prepare("SELECT * FROM users WHERE id = ?") with execute([$id]).',
    },

    {
      id: 'php/sql-injection-concat',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'String Concatenation in SQL Query',
      description:
        'Building SQL queries via string concatenation (. $var .) is vulnerable to SQL injection when the variable originates from user input.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|FROM|JOIN)\b[^;]*\.\s*\$\w+/i,
          filePath,
        ),
      fixGuidance:
        'Replace concatenation with parameterized queries. Use PDO::prepare() or mysqli::prepare() with bound parameters instead of building SQL strings.',
    },

    {
      id: 'php/sql-injection-no-prepared',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Query Function Without Prepared Statement',
      description:
        'Using mysql_query() or mysqli_query() with variable arguments instead of prepared statements enables SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(mysql_query|mysqli_query)\s*\([^)]*\$\w+/,
          filePath,
        ),
      fixGuidance:
        'Migrate to PDO or mysqli prepared statements. Use $stmt = $pdo->prepare("SELECT ... WHERE id = ?"); $stmt->execute([$id]);',
    },

    {
      id: 'php/sql-injection-pdo-no-bind',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'PDO Query Without Parameter Binding',
      description:
        'Using PDO::query() with interpolated or concatenated variables defeats the purpose of PDO and allows SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /->\s*query\s*\(\s*["'][^"']*\$\w+/,
          filePath,
        ),
      fixGuidance:
        'Use PDO::prepare() with bindValue()/bindParam() or pass parameters to execute(). Never interpolate variables into PDO::query().',
    },

    {
      id: 'php/sql-injection-wpdb',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'WordPress $wpdb->query() Without prepare()',
      description:
        'Using $wpdb->query() without wrapping the query in $wpdb->prepare() is vulnerable to SQL injection in WordPress applications.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\$wpdb\s*->\s*query\s*\(/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return !/\$wpdb\s*->\s*prepare\s*\(/.test(line);
        });
      },
      fixGuidance:
        'Always wrap queries with $wpdb->prepare(): $wpdb->query($wpdb->prepare("SELECT * FROM %i WHERE id = %d", $table, $id));',
    },

    // ── Command Injection ────────────────────────────────────────────────────

    {
      id: 'php/command-injection-exec',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Command Injection via exec()',
      description:
        'Passing user-controlled data to exec() allows arbitrary OS command execution on the server.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bexec\s*\(\s*[^)]*\$/, filePath),
      fixGuidance:
        'Use escapeshellarg() for each argument and escapeshellcmd() for the command. Prefer PHP native functions (e.g. copy(), rename()) over shell commands.',
    },

    {
      id: 'php/command-injection-system',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Command Injection via system()',
      description:
        'The system() function executes a command and outputs the result. Variable arguments allow arbitrary command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bsystem\s*\(\s*[^)]*\$/, filePath),
      fixGuidance:
        'Sanitize all arguments with escapeshellarg(). Consider replacing shell commands with equivalent PHP functions.',
    },

    {
      id: 'php/command-injection-passthru',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Command Injection via passthru()',
      description:
        'passthru() executes a command and passes raw output directly to the browser. Variable arguments enable command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bpassthru\s*\(\s*[^)]*\$/, filePath),
      fixGuidance:
        'Sanitize inputs with escapeshellarg() and escapeshellcmd(). Avoid passing user input to passthru() entirely if possible.',
    },

    {
      id: 'php/command-injection-shell-exec',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Command Injection via shell_exec() or Backtick Operator',
      description:
        'shell_exec() and the backtick operator (`) execute shell commands. Unsanitized variables allow arbitrary command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /\bshell_exec\s*\(/, filePath),
        ...findAllMatches(content, /`[^`]*\$\w+[^`]*`/, filePath),
      ],
      fixGuidance:
        'Replace shell_exec() / backtick usage with PHP native functions. If unavoidable, sanitize every argument with escapeshellarg().',
    },

    {
      id: 'php/command-injection-popen',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Command Injection via popen()',
      description:
        'popen() opens a process for reading/writing. Unsanitized variables in the command string allow OS command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bpopen\s*\(\s*[^)]*\$/, filePath),
      fixGuidance:
        'Sanitize the command with escapeshellcmd() and every argument with escapeshellarg(). Prefer proc_open() with explicit argument arrays.',
    },

    // ── Code Injection ──────────────────────────────────────────────────────

    {
      id: 'php/code-injection-eval',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Dangerous eval() Usage',
      description:
        'eval() executes arbitrary PHP code from a string. Any user-controlled data reaching eval() results in remote code execution.',
      cweId: 'CWE-94',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\beval\s*\(/, filePath),
      fixGuidance:
        'Remove eval() entirely. Replace with structured alternatives such as configuration arrays, strategy patterns, or template engines.',
    },

    {
      id: 'php/code-injection-preg-e',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'preg_replace() with /e Modifier',
      description:
        'The /e modifier in preg_replace() evaluates the replacement string as PHP code. It was removed in PHP 7.0 due to security risks.',
      cweId: 'CWE-94',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /preg_replace\s*\(\s*['"][^'"]*\/[a-z]*e[a-z]*['"]/,
          filePath,
        ),
      fixGuidance:
        'Replace preg_replace() /e with preg_replace_callback(). The callback approach is both safer and compatible with PHP 7+.',
    },

    {
      id: 'php/code-injection-assert',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'assert() with String Argument',
      description:
        'assert() with a string argument evaluates it as PHP code (prior to PHP 8.0). This can lead to code injection if the string is user-controlled.',
      cweId: 'CWE-94',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bassert\s*\(\s*['"]/, filePath),
      fixGuidance:
        'Pass boolean expressions to assert() instead of strings. In PHP 8.0+ string assertions throw a compile error.',
    },

    {
      id: 'php/file-inclusion-dynamic',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Dynamic File Inclusion',
      description:
        'Using include/require with a variable-controlled path allows attackers to include arbitrary files, potentially achieving remote code execution.',
      cweId: 'CWE-98',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(include|require|include_once|require_once)\s*[\(]?\s*\$\w+/,
          filePath,
        ),
      fixGuidance:
        'Use a whitelist of allowed file paths. Map user input to an array key and include the corresponding value: $allowed = ["home" => "home.php"]; include $allowed[$page] ?? "404.php";',
    },

    // ── XSS ─────────────────────────────────────────────────────────────────

    {
      id: 'php/xss-reflected-echo',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Reflected XSS via echo/print',
      description:
        'Directly echoing or printing $_GET, $_POST, $_REQUEST, or $_COOKIE values without sanitization leads to reflected cross-site scripting.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(echo|print)\b\s+.*\$_(GET|POST|REQUEST|COOKIE)\s*\[/,
          filePath,
        ),
      fixGuidance:
        'Always escape output with htmlspecialchars($value, ENT_QUOTES, "UTF-8") before echoing user input into HTML.',
    },

    {
      id: 'php/xss-output-no-escape',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Unescaped Variable in Output',
      description:
        'Echoing or printing a PHP variable without htmlspecialchars() or htmlentities() risks XSS if the variable contains untrusted data.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: RawFinding[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*(\/\/|#|\*|\/\*)/.test(line)) continue;
          const m = /\b(echo|print)\s+\$(?!this\b)(\w+)/.exec(line);
          if (
            m &&
            !/(htmlspecialchars|htmlentities|esc_html|esc_attr|wp_kses|sanitize_|intval|floatval|absint)/.test(
              line,
            )
          ) {
            findings.push({
              line: i + 1,
              column: m.index + 1,
              matchedCode: m[0],
            });
          }
        }
        return findings;
      },
      fixGuidance:
        'Wrap output with htmlspecialchars($var, ENT_QUOTES, "UTF-8"). For WordPress, use esc_html() or esc_attr() depending on context.',
    },

    {
      id: 'php/xss-blade-unescaped',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Blade Unescaped Output {!! !!}',
      description:
        'Blade {!! !!} outputs raw HTML without escaping. If the variable contains user input, this enables stored or reflected XSS.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.blade.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\{!!\s*.+?\s*!!\}/, filePath),
      fixGuidance:
        'Use {{ }} for automatic escaping. Only use {!! !!} for trusted, pre-sanitized HTML. If raw output is necessary, sanitize with e() or strip_tags() first.',
    },

    {
      id: 'php/xss-twig-raw',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Twig |raw Filter Disables Escaping',
      description:
        'The Twig |raw filter outputs content without HTML escaping, enabling XSS if the value contains untrusted data.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.twig'],
      detect: (content, filePath) =>
        findAllMatches(content, /\|\s*raw\b/, filePath),
      fixGuidance:
        'Remove the |raw filter and let Twig auto-escape the output. If raw HTML is required, sanitize with |striptags or a custom sanitizer first.',
    },

    {
      id: 'php/xss-header-injection',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'HTTP Header Injection',
      description:
        'Passing user input to header() without filtering CRLF characters allows HTTP response splitting and header injection.',
      cweId: 'CWE-113',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bheader\s*\(\s*[^)]*\$_(GET|POST|REQUEST|COOKIE)/,
          filePath,
        ),
      fixGuidance:
        'Filter CRLF characters (\\r\\n) from user input before passing to header(). Use a URL-validation library for Location headers.',
    },

    // ── File & Upload ───────────────────────────────────────────────────────

    {
      id: 'php/unrestricted-upload',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Unrestricted File Upload',
      description:
        'Using move_uploaded_file() without validating MIME type or file extension allows uploading executable files such as PHP webshells.',
      cweId: 'CWE-434',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\bmove_uploaded_file\s*\(/, filePath);
        const joined = content.toLowerCase();
        if (
          /(mime_content_type|finfo_file|finfo_open|getimagesize|pathinfo\s*\(.*PATHINFO_EXTENSION|in_array\s*\(.*allowed|check.*extension|validate.*type)/i.test(
            joined,
          )
        ) {
          return [];
        }
        return matches;
      },
      fixGuidance:
        'Validate file MIME type with finfo_file(), restrict extensions via an allow-list, generate random filenames, and store uploads outside the web root.',
    },

    {
      id: 'php/path-traversal',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Path Traversal via User Input',
      description:
        'User input ($_GET/$_POST/$_REQUEST) in file-path operations enables directory traversal attacks to read or overwrite arbitrary files.',
      cweId: 'CWE-22',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(fopen|file_get_contents|readfile|file_put_contents|fread|fwrite|copy|rename|unlink|is_file|is_dir|file_exists)\s*\([^)]*\$_(GET|POST|REQUEST|COOKIE)/,
          filePath,
        ),
      fixGuidance:
        'Use basename() to strip directory components, resolve with realpath() and verify the result starts with the expected base directory. Never pass raw user input to file functions.',
    },

    {
      id: 'php/chmod-777',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'chmod 0777 Permissions',
      description:
        'Setting file permissions to 0777 makes the file world-readable, writable, and executable, violating the principle of least privilege.',
      cweId: 'CWE-732',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bchmod\s*\([^)]*,\s*0?777\s*\)/, filePath),
      fixGuidance:
        'Use the most restrictive permissions needed. Directories typically need 0755; files 0644; sensitive configs 0600.',
    },

    {
      id: 'php/temp-file-predictable',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'Predictable Temporary File Name',
      description:
        'tempnam() with a predictable or empty prefix can lead to symlink attacks if the temp directory is shared.',
      cweId: 'CWE-377',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\btempnam\s*\(\s*[^,]*,\s*['"][a-zA-Z]{0,3}['"]/, filePath),
      fixGuidance:
        'Use a cryptographically random prefix with bin2hex(random_bytes(8)), or use sys_get_temp_dir() combined with a unique token.',
    },

    {
      id: 'php/file-delete-unvalidated',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Unvalidated File Deletion',
      description:
        'Calling unlink() with a path derived from user input allows attackers to delete arbitrary files via directory traversal.',
      cweId: 'CWE-22',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bunlink\s*\([^)]*\$_(GET|POST|REQUEST|COOKIE)/,
          filePath,
        ),
      fixGuidance:
        'Validate the path with realpath() against an allowed base directory. Use basename() to strip traversal sequences and verify file ownership.',
    },

    // ── Authentication & Session ─────────────────────────────────────────────

    {
      id: 'php/weak-password-hash-md5',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'MD5 Used for Password Hashing',
      description:
        'MD5 is cryptographically broken and computationally cheap, making password hashes trivially crackable with rainbow tables or brute force.',
      cweId: 'CWE-328',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\bmd5\s*\(/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return /pass(word)?|pwd|secret|credential|auth/i.test(line);
        });
      },
      fixGuidance:
        'Use password_hash($password, PASSWORD_DEFAULT) for hashing and password_verify() for verification. Migrate existing MD5 hashes on next login.',
    },

    {
      id: 'php/weak-password-hash-sha1',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'SHA1 Used for Password Hashing',
      description:
        'SHA1 is fast and has known collision attacks, making it unsuitable for password storage. Passwords hashed with SHA1 can be brute-forced quickly.',
      cweId: 'CWE-328',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\bsha1\s*\(/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return /pass(word)?|pwd|secret|credential|auth/i.test(line);
        });
      },
      fixGuidance:
        'Use password_hash($password, PASSWORD_DEFAULT) instead of sha1(). This uses bcrypt/argon2 with automatic salting.',
    },

    {
      id: 'php/timing-attack-comparison',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Timing-Vulnerable Hash Comparison',
      description:
        'Using == or === instead of hash_equals() for comparing hashes or tokens leaks information through timing side-channels.',
      cweId: 'CWE-208',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /[^!=<>]==[^=]/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return /hash|token|hmac|digest|signature|nonce|csrf|api_key|secret/i.test(line);
        });
      },
      fixGuidance:
        'Use hash_equals($knownHash, $userHash) for constant-time comparison of hashes, tokens, and HMAC values.',
    },

    {
      id: 'php/session-fixation',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'Missing session_regenerate_id() After Login',
      description:
        'Setting session variables after authentication without calling session_regenerate_id(true) allows session fixation attacks.',
      cweId: 'CWE-384',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: RawFinding[] = [];
        const sessionSetRe =
          /\$_SESSION\s*\[\s*['"](?:user|logged_in|authenticated|auth|login|user_id|userid|is_admin|role)\s*['"]\s*\]\s*=/i;

        for (let i = 0; i < lines.length; i++) {
          if (sessionSetRe.test(lines[i])) {
            const start = Math.max(0, i - 15);
            const end = Math.min(lines.length, i + 15);
            const ctx = lines.slice(start, end).join('\n');
            if (!/session_regenerate_id/.test(ctx)) {
              findings.push({
                line: i + 1,
                matchedCode: lines[i].trim(),
              });
            }
          }
        }
        return findings;
      },
      fixGuidance:
        'Call session_regenerate_id(true) immediately after successful authentication and before setting session variables.',
    },

    {
      id: 'php/session-cookie-insecure',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'Insecure Session Cookie Flags',
      description:
        'Session cookies without HttpOnly or Secure flags are vulnerable to XSS theft and man-in-the-middle interception.',
      cweId: 'CWE-614',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.php', '*.ini', 'php.ini'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /session\.cookie_httponly\s*=\s*(Off|0|false)/i, filePath),
        ...findAllMatches(content, /session\.cookie_secure\s*=\s*(Off|0|false)/i, filePath),
        ...findAllMatches(
          content,
          /ini_set\s*\(\s*['"]session\.cookie_httponly['"]\s*,\s*['"]?(0|false|off)['"]?\s*\)/i,
          filePath,
        ),
        ...findAllMatches(
          content,
          /ini_set\s*\(\s*['"]session\.cookie_secure['"]\s*,\s*['"]?(0|false|off)['"]?\s*\)/i,
          filePath,
        ),
      ],
      fixGuidance:
        'Set session.cookie_httponly = On and session.cookie_secure = On in php.ini, or call ini_set() with true values. Add SameSite=Lax or Strict.',
    },

    {
      id: 'php/missing-password-hash',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Password Stored Without password_hash()',
      description:
        'Storing passwords from user input without hashing via password_hash() means credentials are kept in plaintext or with inadequate protection.',
      cweId: 'CWE-916',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: RawFinding[] = [];
        const assignRe =
          /['"]password['"]\s*(?:=>|=)\s*\$_(POST|GET|REQUEST)|password\s*=\s*\$_(POST|GET|REQUEST)/i;

        for (let i = 0; i < lines.length; i++) {
          if (assignRe.test(lines[i])) {
            const start = Math.max(0, i - 5);
            const end = Math.min(lines.length, i + 5);
            const ctx = lines.slice(start, end).join('\n');
            if (!/password_hash/.test(ctx)) {
              findings.push({
                line: i + 1,
                matchedCode: lines[i].trim(),
              });
            }
          }
        }
        return findings;
      },
      fixGuidance:
        'Always hash passwords before storage: $hash = password_hash($_POST["password"], PASSWORD_DEFAULT); Verify with password_verify().',
    },

    // ── Deserialization & Crypto ─────────────────────────────────────────────

    {
      id: 'php/unsafe-unserialize',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Unsafe unserialize() Usage',
      description:
        'unserialize() on untrusted data can trigger arbitrary object instantiation, leading to remote code execution via PHP object injection.',
      cweId: 'CWE-502',
      owaspCategory: 'A08:2021-Software and Data Integrity Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bunserialize\s*\(/, filePath),
      fixGuidance:
        'Use json_decode() instead of unserialize(). If unserialize() is unavoidable, use the allowed_classes option: unserialize($data, ["allowed_classes" => false]).',
    },

    {
      id: 'php/weak-encryption-mcrypt',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Deprecated mcrypt Extension Usage',
      description:
        'The mcrypt extension was deprecated in PHP 7.1 and removed in PHP 7.2. It uses outdated algorithms and has known security weaknesses.',
      cweId: 'CWE-327',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bmcrypt_\w+\s*\(/, filePath),
      fixGuidance:
        'Migrate to openssl_encrypt()/openssl_decrypt() or the sodium extension (sodium_crypto_secretbox). Use AES-256-GCM for authenticated encryption.',
    },

    {
      id: 'php/ecb-mode',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'ECB Encryption Mode',
      description:
        'ECB mode encrypts identical plaintext blocks to identical ciphertext, leaking data patterns. It should never be used for multi-block data.',
      cweId: 'CWE-327',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"][\w-]*ecb[\w-]*['"]|OPENSSL_\w*ECB|MCRYPT_MODE_ECB/i,
          filePath,
        ),
      fixGuidance:
        'Use AES-256-GCM or AES-256-CBC with HMAC for authenticated encryption. Never use ECB mode.',
    },

    {
      id: 'php/hardcoded-encryption-key',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded Encryption Key',
      description:
        'Encryption keys embedded as string literals in source code can be extracted by anyone with access to the codebase.',
      cweId: 'CWE-321',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => [
        ...findAllMatches(
          content,
          /(encryption_key|encrypt_key|secret_key|cipher_key|aes_key|crypto_key|ENCRYPTION_KEY|SECRET_KEY)\s*=\s*['"][^'"]{8,}['"]/,
          filePath,
        ),
        ...findAllMatches(
          content,
          /define\s*\(\s*['"](?:ENCRYPTION_KEY|SECRET_KEY|CIPHER_KEY|AES_KEY)['"]\s*,\s*['"][^'"]{8,}['"]/i,
          filePath,
        ),
      ],
      fixGuidance:
        'Store encryption keys in environment variables or a secrets manager. Load with getenv("ENCRYPTION_KEY") or Laravel\'s config() helper.',
    },

    {
      id: 'php/insecure-random',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Insecure Pseudo-Random Generator',
      description:
        'rand() and mt_rand() are not cryptographically secure. Using them for tokens, passwords, nonces, or keys produces predictable values.',
      cweId: 'CWE-330',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\b(rand|mt_rand)\s*\(/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return /token|secret|password|key|nonce|salt|hash|csrf|otp|code|verify|session|captcha|random|generate|unique/i.test(
            line,
          );
        });
      },
      fixGuidance:
        'Use random_int() for integers and random_bytes() or bin2hex(random_bytes(32)) for tokens. These use the OS CSPRNG.',
    },

    // ── Laravel-Specific ────────────────────────────────────────────────────

    {
      id: 'php/laravel-mass-assignment',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Eloquent Model Without $fillable or $guarded',
      description:
        'An Eloquent model without $fillable or $guarded is vulnerable to mass assignment — attackers can set any column (e.g. is_admin) via request data.',
      cweId: 'CWE-915',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        if (!/extends\s+(Model|Authenticatable|Pivot)\b/.test(content)) return [];
        if (/\$(fillable|guarded)\s*=/.test(content)) return [];
        return findAllMatches(
          content,
          /class\s+\w+\s+extends\s+(Model|Authenticatable|Pivot)\b/,
          filePath,
        );
      },
      fixGuidance:
        'Add a $fillable array listing allowed fields, or set $guarded = [] only after careful review. Prefer $fillable for explicit control.',
    },

    {
      id: 'php/laravel-raw-query',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'Laravel DB::raw() Without Bindings',
      description:
        'Using DB::raw(), DB::select(), or DB::statement() with variable interpolation bypasses Eloquent query-builder protections.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /DB\s*::\s*(raw|select|statement|insert|update|delete)\s*\([^)]*\$\w+/,
          filePath,
        ),
      fixGuidance:
        'Pass bindings as the second argument: DB::select("SELECT * FROM users WHERE id = ?", [$id]). For DB::raw(), use it only with static strings.',
    },

    {
      id: 'php/laravel-debug-enabled',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'APP_DEBUG Enabled in Environment',
      description:
        'APP_DEBUG=true in production exposes stack traces, environment variables, database credentials, and internal paths to end users.',
      cweId: 'CWE-489',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['.env', '.env.*'],
      detect: (content, filePath) =>
        findAllMatches(content, /^APP_DEBUG\s*=\s*true\s*$/im, filePath),
      fixGuidance:
        'Set APP_DEBUG=false in production .env files. Use Laravel Telescope or a logging service for debugging in production.',
    },

    {
      id: 'php/laravel-csrf-missing',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Route CSRF Protection Excluded',
      description:
        'Explicitly disabling CSRF middleware on state-changing routes allows cross-site request forgery attacks.',
      cweId: 'CWE-352',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.php'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /withoutMiddleware\s*\([^)]*csrf/i, filePath),
        ...findAllMatches(
          content,
          /\$except\s*=\s*\[\s*['"][^'"]+['"]/,
          filePath,
        ),
      ],
      fixGuidance:
        'Remove CSRF exceptions unless the route is genuinely stateless (e.g. webhook). Use @csrf in Blade forms and X-CSRF-TOKEN headers for AJAX.',
    },

    {
      id: 'php/laravel-env-exposed',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: '.env File Exposure Risk',
      description:
        'Code that reads or serves the .env file can expose database credentials, API keys, and application secrets to attackers.',
      cweId: 'CWE-538',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(readfile|file_get_contents|include|require|fopen|show_source|highlight_file)\s*\([^)]*\.env\b/,
          filePath,
        ),
      fixGuidance:
        'Never serve .env files. Block access in your web server config. Ensure .env is in .gitignore and outside the public directory.',
    },

    {
      id: 'php/laravel-log-sensitive',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'Sensitive Data in Log Output',
      description:
        'Logging passwords, tokens, API keys, or credit card numbers creates a secondary exposure vector if log files are compromised.',
      cweId: 'CWE-532',
      owaspCategory: 'A09:2021-Security Logging and Monitoring Failures',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(Log|logger)\s*::\s*(info|debug|notice|warning|error|critical)\s*\([^)]*\b(password|secret|token|api_key|apiKey|credit_card|creditCard|ssn|cvv|authorization)\b/i,
          filePath,
        ),
      fixGuidance:
        'Redact sensitive fields before logging. Use Laravel\'s Log::channel() with appropriate masking, or a middleware that strips sensitive keys.',
    },

    {
      id: 'php/laravel-eloquent-raw',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'Eloquent Raw Expression Without Bindings',
      description:
        'whereRaw(), selectRaw(), orderByRaw(), etc. with interpolated variables bypass Eloquent escaping and allow SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(whereRaw|selectRaw|orderByRaw|havingRaw|groupByRaw)\s*\([^)]*\$\w+/,
          filePath,
        ),
      fixGuidance:
        'Pass bindings as the second argument: ->whereRaw("price > ?", [$minPrice]). Never interpolate variables into raw expressions.',
    },

    {
      id: 'php/laravel-blade-js-injection',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'JavaScript Injection in Blade Template',
      description:
        'Embedding PHP variables or Blade expressions inside <script> tags without @json or JSON encoding enables XSS through JavaScript context injection.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.blade.php'],
      detect: (content) =>
        findMultilineMatches(
          content,
          /<script[^>]*>[\s\S]*?\{!!\s*\$[\w>-]+\s*!!\}[\s\S]*?<\/script>/gi,
        ),
      fixGuidance:
        'Use @json($variable) or {{ Js::from($variable) }} to safely embed PHP data in JavaScript. Never use {!! !!} inside <script> tags.',
    },

    // ── Configuration ───────────────────────────────────────────────────────

    {
      id: 'php/display-errors-on',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'display_errors Enabled',
      description:
        'display_errors = On shows detailed error messages (including file paths, SQL queries, and stack traces) to end users.',
      cweId: 'CWE-209',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.php', '*.ini', 'php.ini'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /^\s*display_errors\s*=\s*(On|1|true)\b/im, filePath),
        ...findAllMatches(
          content,
          /ini_set\s*\(\s*['"]display_errors['"]\s*,\s*['"]?(1|On|true)['"]?\s*\)/i,
          filePath,
        ),
      ],
      fixGuidance:
        'Set display_errors = Off in php.ini for production. Use log_errors = On to capture errors in server logs instead.',
    },

    {
      id: 'php/register-globals',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'register_globals Enabled',
      description:
        'register_globals imports request variables as global PHP variables, enabling trivial variable injection and authentication bypass.',
      cweId: 'CWE-621',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ini', 'php.ini'],
      detect: (content, filePath) =>
        findAllMatches(content, /^\s*register_globals\s*=\s*(On|1|true)\b/im, filePath),
      fixGuidance:
        'Set register_globals = Off. This directive was removed in PHP 5.4. If your code depends on it, refactor to use $_GET/$_POST explicitly.',
    },

    {
      id: 'php/allow-url-include',
      language: 'php',
      category: 'security',
      severity: 'critical',
      title: 'allow_url_include Enabled',
      description:
        'allow_url_include = On permits including remote PHP files via URLs, enabling remote file inclusion (RFI) attacks.',
      cweId: 'CWE-98',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ini', 'php.ini', '*.php'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /^\s*allow_url_include\s*=\s*(On|1|true)\b/im, filePath),
        ...findAllMatches(
          content,
          /ini_set\s*\(\s*['"]allow_url_include['"]\s*,\s*['"]?(1|On|true)['"]?\s*\)/i,
          filePath,
        ),
      ],
      fixGuidance:
        'Set allow_url_include = Off in php.ini. No modern application should need to include remote URLs.',
    },

    {
      id: 'php/expose-php',
      language: 'php',
      category: 'security',
      severity: 'low',
      title: 'PHP Version Exposed',
      description:
        'expose_php = On appends the PHP version to HTTP headers, helping attackers fingerprint the server and find version-specific exploits.',
      cweId: 'CWE-200',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ini', 'php.ini'],
      detect: (content, filePath) =>
        findAllMatches(content, /^\s*expose_php\s*=\s*(On|1|true)\b/im, filePath),
      fixGuidance:
        'Set expose_php = Off in php.ini to remove the X-Powered-By header.',
    },

    {
      id: 'php/error-reporting-off',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'Error Reporting Disabled',
      description:
        'Calling error_reporting(0) suppresses all errors, hiding bugs and security issues that should be logged for monitoring.',
      cweId: 'CWE-209',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\berror_reporting\s*\(\s*0\s*\)/, filePath),
      fixGuidance:
        'Use error_reporting(E_ALL) with display_errors = Off and log_errors = On. Monitor the error log for issues.',
    },

    {
      id: 'php/open-basedir-missing',
      language: 'php',
      category: 'security',
      severity: 'medium',
      title: 'open_basedir Not Configured',
      description:
        'Without open_basedir, PHP scripts can access any file the web server user can read, increasing the impact of path-traversal or file-inclusion bugs.',
      cweId: 'CWE-552',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ini', 'php.ini'],
      detect: (content, filePath) => [
        ...findAllMatches(content, /^\s*;+\s*open_basedir\s*=/m, filePath),
        ...findAllMatches(content, /^\s*open_basedir\s*=\s*$/m, filePath),
      ],
      fixGuidance:
        'Set open_basedir to the application root and /tmp: open_basedir = /var/www/myapp:/tmp',
    },

    // ── Bug Patterns ────────────────────────────────────────────────────────

    {
      id: 'php/type-juggling',
      language: 'php',
      category: 'bug',
      severity: 'high',
      title: 'Loose Comparison on Security-Sensitive Value',
      description:
        'PHP loose comparison (==) performs type juggling, e.g. "0e123" == "0e456" is true. This causes authentication bypasses when comparing hashes or tokens.',
      cweId: 'CWE-1024',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /[^!=<>]==[^=]/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return /password|pass|hash|token|secret|admin|role|auth|session|key|nonce|otp|api_key|apiKey/i.test(
            line,
          );
        });
      },
      fixGuidance:
        'Use strict comparison (===) for all security-sensitive checks. Use hash_equals() for comparing cryptographic values.',
    },

    {
      id: 'php/undefined-variable',
      language: 'php',
      category: 'bug',
      severity: 'medium',
      title: 'Variable Variables ($$) Usage',
      description:
        'Variable variables ($$var) make code unpredictable and are a frequent source of undefined-variable bugs and security issues.',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const findings = findAllMatches(content, /\$\$\w+/, filePath);
        const lines = content.split('\n');
        return findings.filter((f) => {
          const line = lines[f.line - 1] || '';
          return !/^\s*(\/\/|#|\*|\/\*)/.test(line);
        });
      },
      fixGuidance:
        'Replace variable variables with associative arrays: use $data[$key] instead of $$key.',
    },

    {
      id: 'php/array-key-no-check',
      language: 'php',
      category: 'bug',
      severity: 'medium',
      title: 'Superglobal Array Access Without isset()',
      description:
        'Accessing $_GET, $_POST, or $_REQUEST keys without isset() or the null coalescing operator triggers E_NOTICE on missing keys and may cause unexpected behavior.',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(
          content,
          /\$_(GET|POST|REQUEST|COOKIE|SERVER)\s*\[\s*['"][^'"]+['"]\s*\]/,
          filePath,
        );
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return !/isset|array_key_exists|empty|\?\?|!empty|in_array/.test(line);
        });
      },
      fixGuidance:
        'Use the null coalescing operator: $value = $_GET["key"] ?? "default"; Or wrap with isset(): if (isset($_GET["key"])) { ... }',
    },

    {
      id: 'php/missing-return-type',
      language: 'php',
      category: 'quality',
      severity: 'low',
      title: 'Function Missing Return Type Declaration',
      description:
        'Functions without explicit return type declarations reduce code clarity and prevent the engine from catching type errors.',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: RawFinding[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const m = /\bfunction\s+(\w+)\s*\([^)]*\)\s*\{/.exec(line);
          if (
            m &&
            !/\)\s*:\s*/.test(line) &&
            !/__construct|__destruct|__clone|__wakeup|setUp|tearDown/.test(m[1])
          ) {
            findings.push({
              line: i + 1,
              column: (m.index || 0) + 1,
              matchedCode: m[0],
            });
          }
        }
        return findings;
      },
      fixGuidance:
        'Add return type declarations to functions: function getName(): string { ... }. Use ?Type for nullable and void for side-effect-only functions.',
    },

    {
      id: 'php/empty-catch',
      language: 'php',
      category: 'bug',
      severity: 'low',
      title: 'Empty catch Block',
      description:
        'Catching an exception without handling or logging it silently swallows errors, making debugging difficult and hiding potential failures.',
      cweId: 'CWE-390',
      filePatterns: ['*.php'],
      detect: (content) =>
        findMultilineMatches(content, /catch\s*\([^)]*\)\s*\{\s*\}/g),
      fixGuidance:
        'At minimum, log the exception: catch (\\Exception $e) { Log::error($e->getMessage()); }. Re-throw if the error cannot be handled at this level.',
    },

    {
      id: 'php/deprecated-function',
      language: 'php',
      category: 'quality',
      severity: 'medium',
      title: 'Deprecated PHP Function',
      description:
        'Using functions removed or deprecated in modern PHP versions (mysql_*, ereg, split, create_function, etc.) causes fatal errors on upgrade.',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\b(mysql_connect|mysql_query|mysql_fetch_array|mysql_fetch_assoc|mysql_fetch_row|mysql_num_rows|mysql_select_db|mysql_close|mysql_real_escape_string|ereg|eregi|split|spliti|session_register|set_magic_quotes_runtime|create_function|each)\s*\(/,
          filePath,
        ),
      fixGuidance:
        'Replace mysql_* with PDO or mysqli. Replace ereg/split with preg_match/explode. Replace create_function with anonymous functions.',
    },

    {
      id: 'php/mixed-html-php',
      language: 'php',
      category: 'quality',
      severity: 'low',
      title: 'Inline PHP Mixed with HTML',
      description:
        'Mixing PHP logic and HTML output in the same file violates separation of concerns, complicates testing, and increases XSS risk.',
      filePatterns: ['*.php'],
      excludePatterns: ['*.blade.php', '*.twig'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\?>\s*<(div|span|p|table|tr|td|th|form|input|select|ul|ol|li|a|h[1-6]|body|html|head|section|article|nav|main|footer|header)\b/i,
          filePath,
        ),
      fixGuidance:
        'Separate logic from presentation. Use a template engine (Blade, Twig) or extract HTML into dedicated view files.',
    },

    {
      id: 'php/global-variable',
      language: 'php',
      category: 'quality',
      severity: 'low',
      title: '$GLOBALS or global Keyword Usage',
      description:
        'Global variables create hidden dependencies between functions, make code hard to test, and increase the risk of unexpected state mutations.',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(content, /\b(global\s+\$\w+|\$GLOBALS\s*\[)/, filePath),
      fixGuidance:
        'Pass dependencies as function parameters or use dependency injection. For configuration, use a config/container pattern.',
    },

    {
      id: 'php/error-suppression',
      language: 'php',
      category: 'bug',
      severity: 'low',
      title: 'Error Suppression Operator (@)',
      description:
        'The @ operator silences errors for an expression, hiding bugs and making failures invisible. It also incurs a performance penalty.',
      filePatterns: ['*.php'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /@\w+\s*\(/, filePath);
        const lines = content.split('\n');
        return matches.filter((f) => {
          const line = lines[f.line - 1] || '';
          return !/^\s*(\/\/|#|\*|\/\*)/.test(line);
        });
      },
      fixGuidance:
        'Handle errors explicitly with try/catch or conditional checks (e.g. is_readable() before fopen()). Never suppress errors in production code.',
    },

    {
      id: 'php/extract-usage',
      language: 'php',
      category: 'security',
      severity: 'high',
      title: 'extract() on User Input',
      description:
        'Calling extract() on superglobals ($_GET, $_POST, $_REQUEST) imports request parameters as local variables, enabling variable injection.',
      cweId: 'CWE-621',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.php'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\bextract\s*\(\s*\$_(GET|POST|REQUEST|COOKIE|SERVER)\b/,
          filePath,
        ),
      fixGuidance:
        'Access superglobals directly or use a whitelist: $name = $_POST["name"] ?? "". If extract() is needed, use EXTR_IF_EXISTS with a known-safe array.',
    },
  ];
}
