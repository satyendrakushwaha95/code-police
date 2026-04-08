import { ScanRule } from '../scan-types';
import { findAllMatches, findMultilineMatches } from './rule-registry';

export function getJavaRules(): ScanRule[] {
  return [

    // ── Injection (10 rules) ──────────────────────────────────────────────────

    {
      id: 'java/sql-injection-jdbc',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection via JDBC Statement',
      description:
        'String concatenation used in Statement.execute/executeQuery/executeUpdate allows SQL injection. Use PreparedStatement with parameterized queries instead.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\.(execute|executeQuery|executeUpdate)\s*\(\s*("[^"]*"\s*\+|[a-zA-Z_]\w*\s*\+\s*"|\+\s*[a-zA-Z_]\w*)/gi,
          filePath,
        ),
      fixGuidance:
        'Replace Statement with PreparedStatement and use parameter placeholders (?). Example: preparedStatement.setString(1, userInput).',
    },

    {
      id: 'java/sql-injection-jpa',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection via JPA/JPQL Query',
      description:
        'String concatenation in JPA createQuery enables JPQL injection. Use named or positional parameters instead.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /createQuery\s*\(\s*("[^"]*"\s*\+|[a-zA-Z_]\w*\s*\+\s*"|\+\s*[a-zA-Z_]\w*)/gi,
          filePath,
        ),
      fixGuidance:
        'Use JPQL named parameters: createQuery("SELECT u FROM User u WHERE u.name = :name").setParameter("name", input).',
    },

    {
      id: 'java/sql-injection-mybatis',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection via MyBatis ${} Interpolation',
      description:
        'MyBatis ${} performs raw string interpolation, enabling SQL injection. Use #{} for parameterized binding.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.xml'],
      detect: (content, filePath) =>
        findAllMatches(content, /\$\{[^}]+\}/g, filePath),
      fixGuidance:
        'Replace ${param} with #{param} in MyBatis mapper XML. Use ${} only for identifiers that cannot be parameterized (table/column names), and whitelist those values.',
    },

    {
      id: 'java/sql-injection-hibernate',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection via Hibernate HQL',
      description:
        'String concatenation in Hibernate createQuery/createSQLQuery enables HQL/SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:session|entityManager)\s*\.\s*create(?:SQL)?Query\s*\(\s*("[^"]*"\s*\+|[a-zA-Z_]\w*\s*\+\s*"|\+\s*[a-zA-Z_]\w*)/gi,
          filePath,
        ),
      fixGuidance:
        'Use named parameters: session.createQuery("FROM User WHERE name = :name").setParameter("name", input).',
    },

    {
      id: 'java/command-injection-runtime',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'OS Command Injection via Runtime.exec',
      description:
        'Runtime.getRuntime().exec() with variable arguments allows OS command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(\s*(?!\s*new\s+String\s*\[)(?:[a-zA-Z_]\w*|\+|"[^"]*"\s*\+)/gi,
          filePath,
        ),
      fixGuidance:
        'Avoid Runtime.exec with user input. If needed, use ProcessBuilder with an explicit argument list (not a single shell string) and validate/whitelist all inputs.',
    },

    {
      id: 'java/command-injection-processbuilder',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Potential Command Injection via ProcessBuilder',
      description:
        'ProcessBuilder constructed with unsanitized arguments may allow command injection.',
      cweId: 'CWE-78',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /new\s+ProcessBuilder\s*\(\s*(?:Arrays\.asList\s*\()?(?:.*\+\s*[a-zA-Z_]\w*|[a-zA-Z_]\w*\s*\+)/gi,
          filePath,
        ),
      fixGuidance:
        'Validate and whitelist all arguments passed to ProcessBuilder. Never pass user-controlled strings directly as command arguments.',
    },

    {
      id: 'java/ldap-injection',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'LDAP Injection via String Concatenation',
      description:
        'LDAP search filters built with string concatenation allow LDAP injection attacks.',
      cweId: 'CWE-90',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:search|newSearchControls|DirContext)\s*.*\(\s*"[^"]*(?:\(\w+=)"\s*\+\s*[a-zA-Z_]\w*/gi,
          filePath,
        ),
      fixGuidance:
        'Use a proper LDAP escaping utility (e.g., Spring LdapEncoder.filterEncode) or parameterized LDAP queries.',
    },

    {
      id: 'java/xpath-injection',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'XPath Injection',
      description:
        'XPath expressions built with string concatenation can be manipulated by attackers to bypass access controls or extract data.',
      cweId: 'CWE-643',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\.(?:evaluate|compile)\s*\(\s*("[^"]*"\s*\+\s*[a-zA-Z_]\w*|[a-zA-Z_]\w*\s*\+\s*")/gi,
          filePath,
        ),
      fixGuidance:
        'Use parameterized XPath queries via XPathVariableResolver instead of string concatenation.',
    },

    {
      id: 'java/el-injection',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Expression Language (EL) Injection',
      description:
        'User-controlled input passed into EL evaluation can lead to remote code execution.',
      cweId: 'CWE-917',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java', '*.jsp'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:ExpressionFactory|ValueExpression|ELProcessor)\s*.*\.\s*(?:createValueExpression|eval|setValue)\s*\(\s*(?:"[^"]*"\s*\+|[a-zA-Z_]\w*\s*\+)/gi,
          filePath,
        ),
      fixGuidance:
        'Never pass user input into EL expressions. Sanitize inputs and use a strict allowlist of permitted expressions.',
    },

    {
      id: 'java/log-injection',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Log Injection',
      description:
        'User input logged directly without sanitization can lead to log forging, CRLF injection in logs, and log tampering.',
      cweId: 'CWE-117',
      owaspCategory: 'A09:2021-Security Logging and Monitoring Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:log|logger|LOG|LOGGER)\s*\.\s*(?:info|debug|warn|error|trace|fatal)\s*\(\s*(?:"[^"]*"\s*\+\s*(?:request|req|param|input|header|cookie|getParameter|getHeader))/gi,
          filePath,
        ),
      fixGuidance:
        'Use parameterized logging: logger.info("User input: {}", sanitize(input)). Sanitize newlines/CRLF from user input before logging.',
    },

    // ── Authentication & Session (7 rules) ────────────────────────────────────

    {
      id: 'java/hardcoded-credentials',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded Credentials',
      description:
        'Hardcoded usernames or passwords in source code can be extracted by attackers. Use environment variables, vaults, or configuration management.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.java'],
      excludePatterns: ['*Test.java', '*Tests.java', '*test*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:password|passwd|pwd|secret|apiKey|api_key|token)\s*=\s*"[^"]{4,}"/gi,
          filePath,
        ),
      fixGuidance:
        'Move credentials to environment variables, a secrets vault (e.g., HashiCorp Vault, AWS Secrets Manager), or encrypted configuration files.',
    },

    {
      id: 'java/hardcoded-jwt-secret',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded JWT Signing Key',
      description:
        'JWT signing keys as string literals can be extracted to forge tokens. Store keys securely and rotate them periodically.',
      cweId: 'CWE-798',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:signWith|setSigningKey|Keys\.hmacShaKeyFor)\s*\(\s*"[^"]{8,}"/gi,
          filePath,
        ),
      fixGuidance:
        'Load JWT signing keys from environment variables or a secure key store. Never hardcode secret keys in source code.',
    },

    {
      id: 'java/weak-password-hash',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Weak Password Hashing Algorithm',
      description:
        'MD5 and SHA-1 are cryptographically broken for password hashing. Use bcrypt, scrypt, Argon2, or PBKDF2 instead.',
      cweId: 'CWE-327',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /MessageDigest\s*\.\s*getInstance\s*\(\s*"(?:MD5|SHA-?1|SHA1)"\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Use BCryptPasswordEncoder (Spring Security), Argon2PasswordEncoder, or PBKDF2 for password hashing. Never use raw MD5/SHA-1.',
    },

    {
      id: 'java/csrf-disabled',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'CSRF Protection Disabled',
      description:
        'Disabling CSRF protection in Spring Security exposes the application to cross-site request forgery attacks.',
      cweId: 'CWE-352',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\.csrf\s*\(\s*\)\s*\.\s*disable\s*\(\s*\)|\.csrf\s*\(\s*(?:csrf|c)\s*->\s*(?:csrf|c)\s*\.\s*disable\s*\(\s*\)\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Only disable CSRF for stateless APIs using token-based auth (JWT). For session-based apps, keep CSRF enabled and use Spring\'s CsrfToken.',
    },

    {
      id: 'java/permissive-security-config',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Overly Permissive Security Configuration',
      description:
        'Using permitAll() on sensitive paths like /admin or /api bypasses authentication and authorization controls.',
      cweId: 'CWE-862',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:antMatchers|requestMatchers|mvcMatchers)\s*\(\s*"[^"]*(?:\/admin|\/api|\/manage|\/config|\/actuator)[^"]*"\s*\)\s*\.\s*permitAll\s*\(\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Restrict sensitive endpoints to authenticated users with proper roles: .requestMatchers("/admin/**").hasRole("ADMIN").',
    },

    {
      id: 'java/session-fixation',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Potential Session Fixation',
      description:
        'Creating or setting session attributes without invalidating the prior session allows session fixation attacks.',
      cweId: 'CWE-384',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:getSession\s*\(\s*true\s*\)|\.setAttribute\s*\(\s*"[^"]*(?:user|auth|login|role))/gi,
          filePath,
        ),
      fixGuidance:
        'Call request.getSession().invalidate() before creating a new session after authentication. In Spring Security, configure sessionFixation().migrateSession() or .newSession().',
    },

    {
      id: 'java/missing-session-timeout',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Missing Session Timeout Configuration',
      description:
        'Sessions without a timeout remain valid indefinitely, increasing the window for session hijacking.',
      cweId: 'CWE-613',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.xml', '*.java', '*.properties'],
      detect: (content, filePath) => {
        if (filePath.endsWith('.xml') && content.includes('<session-config>')) {
          if (!content.includes('<session-timeout>')) {
            return findAllMatches(content, /<session-config>/g, filePath);
          }
        }
        if (filePath.endsWith('.properties') && content.includes('server.servlet.session')) {
          if (!content.includes('server.servlet.session.timeout')) {
            return findAllMatches(content, /server\.servlet\.session/g, filePath);
          }
        }
        return [];
      },
      fixGuidance:
        'Configure session timeout: In web.xml set <session-timeout>30</session-timeout>. In Spring Boot, set server.servlet.session.timeout=30m.',
    },

    // ── Cryptography (6 rules) ────────────────────────────────────────────────

    {
      id: 'java/insecure-random',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Insecure Random Number Generator',
      description:
        'java.util.Random is predictable and must not be used for security-sensitive purposes such as token generation, nonces, or cryptographic keys.',
      cweId: 'CWE-330',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /new\s+Random\s*\(\s*\)|java\.util\.Random/g,
          filePath,
        ),
      fixGuidance:
        'Use java.security.SecureRandom for any security-sensitive random number generation.',
    },

    {
      id: 'java/ecb-mode',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'ECB Encryption Mode Used',
      description:
        'ECB mode does not provide semantic security—identical plaintext blocks produce identical ciphertext. Use CBC, GCM, or CTR mode.',
      cweId: 'CWE-327',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /Cipher\s*\.\s*getInstance\s*\(\s*"[^"]*\/ECB\/[^"]*"/gi,
          filePath,
        ),
      fixGuidance:
        'Use AES/GCM/NoPadding or AES/CBC/PKCS5Padding with a random IV instead of ECB mode.',
    },

    {
      id: 'java/hardcoded-crypto-key',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded Cryptographic Key',
      description:
        'Encryption keys embedded as byte arrays or string literals in source code can be extracted by reverse engineering.',
      cweId: 'CWE-321',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /new\s+SecretKeySpec\s*\(\s*(?:"[^"]+"\s*\.getBytes|new\s+byte\s*\[\s*\]\s*\{)/gi,
          filePath,
        ),
      fixGuidance:
        'Load encryption keys from a secure key store (JCEKS, PKCS12) or a secrets management service. Never hardcode key material.',
    },

    {
      id: 'java/disabled-cert-validation',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Disabled Certificate Validation',
      description:
        'Trust managers that accept all certificates disable TLS verification, making the application vulnerable to man-in-the-middle attacks.',
      cweId: 'CWE-295',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const single = findAllMatches(
          content,
          /(?:TrustAll|AllTrust|NullTrustManager|DummyTrustManager|InsecureTrustManager|X509TrustManager\s*\(\s*\)\s*\{)/gi,
          filePath,
        );
        const empty = findAllMatches(
          content,
          /checkServerTrusted\s*\([^)]*\)\s*\{[\s\n]*\}/gi,
          filePath,
        );
        return [...single, ...empty];
      },
      fixGuidance:
        'Use the default TrustManagerFactory with proper CA certificates. Never implement a TrustManager that blindly accepts all certificates.',
    },

    {
      id: 'java/insecure-tls',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Insecure TLS Protocol Version',
      description:
        'TLSv1.0 and TLSv1.1 have known vulnerabilities and are deprecated. Use TLSv1.2 or TLSv1.3.',
      cweId: 'CWE-326',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /SSLContext\s*\.\s*getInstance\s*\(\s*"(?:TLSv1\.0|TLSv1\.1|TLSv1|SSLv3|SSLv2)"\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Use SSLContext.getInstance("TLSv1.2") or SSLContext.getInstance("TLSv1.3"). Remove support for deprecated protocols.',
    },

    {
      id: 'java/weak-cipher-suite',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Weak Cipher Suite (DES/RC4)',
      description:
        'DES and RC4 ciphers are cryptographically broken and must not be used.',
      cweId: 'CWE-327',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /Cipher\s*\.\s*getInstance\s*\(\s*"(?:DES|DESede|RC4|RC2|Blowfish)(?:\/[^"]*)?"\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Use AES-256 with GCM mode: Cipher.getInstance("AES/GCM/NoPadding"). Remove all DES/RC4 cipher usage.',
    },

    // ── Data Exposure (5 rules) ───────────────────────────────────────────────

    {
      id: 'java/sensitive-data-log',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Sensitive Data in Log Output',
      description:
        'Logging passwords, tokens, secrets, or API keys exposes sensitive data in log files that may be accessible to unauthorized users.',
      cweId: 'CWE-532',
      owaspCategory: 'A09:2021-Security Logging and Monitoring Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:log|logger|LOG)\s*\.\s*(?:info|debug|warn|error|trace)\s*\([^)]*(?:password|token|secret|apiKey|api_key|credential|ssn|creditCard)/gi,
          filePath,
        ),
      fixGuidance:
        'Never log sensitive data. Mask or redact sensitive fields before logging. Use a logging filter to prevent accidental exposure.',
    },

    {
      id: 'java/stacktrace-exposure',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Stack Trace Exposed to Users',
      description:
        'Calling printStackTrace() can leak internal implementation details, file paths, and library versions to end users.',
      cweId: 'CWE-209',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.java'],
      excludePatterns: ['*Test.java', '*Tests.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\.printStackTrace\s*\(\s*\)/g,
          filePath,
        ),
      fixGuidance:
        'Use a logging framework (SLF4J/Log4j) instead: logger.error("Error occurred", exception). Configure a global exception handler to return generic error messages.',
    },

    {
      id: 'java/verbose-error-response',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Verbose Error in REST Response',
      description:
        'Returning exception messages or stack traces directly in API responses exposes internal details to attackers.',
      cweId: 'CWE-209',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:ResponseEntity|ResponseBody|response\.getWriter)\s*.*(?:\.getMessage\s*\(\s*\)|\.toString\s*\(\s*\)|\.getStackTrace)/gi,
          filePath,
        ),
      fixGuidance:
        'Return generic error messages to clients. Log the full exception server-side. Use a @ControllerAdvice to handle exceptions uniformly.',
    },

    {
      id: 'java/pii-in-url',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'PII or Sensitive Data in URL Path',
      description:
        'Sensitive information in URL paths or query parameters is logged in browser history, proxy logs, and server access logs.',
      cweId: 'CWE-598',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@(?:GetMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?"[^"]*(?:\{(?:password|ssn|token|secret|creditCard|cardNumber|socialSecurity)[^}]*\})/gi,
          filePath,
        ),
      fixGuidance:
        'Never include sensitive data in URL paths. Use POST request bodies or headers for sensitive parameters.',
    },

    {
      id: 'java/missing-json-ignore',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Sensitive Entity Field Without @JsonIgnore',
      description:
        'Entity fields named password/secret/token without @JsonIgnore will be serialized in API responses, leaking sensitive data.',
      cweId: 'CWE-200',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const lines = content.split('\n');
        const findings: import('../scan-types').RawFinding[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/(?:private|protected)\s+\w+\s+(?:password|secret|token|apiKey|secretKey|privateKey)\s*[;=]/i.test(line)) {
            const prevLines = lines.slice(Math.max(0, i - 3), i).join('\n');
            if (!/@JsonIgnore|@JsonProperty\s*\(\s*access\s*=\s*Access\.WRITE_ONLY\s*\)/.test(prevLines)) {
              findings.push({
                line: i + 1,
                column: 1,
                matchedCode: line.trim(),
                context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n'),
              });
            }
          }
        }
        return findings;
      },
      fixGuidance:
        'Add @JsonIgnore to sensitive fields, or use @JsonProperty(access = Access.WRITE_ONLY) to accept input but never serialize the value.',
    },

    // ── XXE & Deserialization (4 rules) ───────────────────────────────────────

    {
      id: 'java/xxe-document-builder',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'XXE via DocumentBuilderFactory',
      description:
        'DocumentBuilderFactory without disabled external entities allows XXE attacks that can read local files or perform SSRF.',
      cweId: 'CWE-611',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        if (!/DocumentBuilderFactory/.test(content)) return [];
        const hasDisableExternal =
          /setFeature\s*\(\s*"http:\/\/apache\.org\/xml\/features\/disallow-doctype-decl"\s*,\s*true\s*\)/g.test(content) ||
          /setFeature\s*\(\s*"http:\/\/xml\.org\/sax\/features\/external-general-entities"\s*,\s*false\s*\)/g.test(content);
        if (hasDisableExternal) return [];
        return findAllMatches(content, /DocumentBuilderFactory\s*\.\s*newInstance\s*\(\s*\)/g, filePath);
      },
      fixGuidance:
        'Disable external entities: factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) and factory.setFeature("http://xml.org/sax/features/external-general-entities", false).',
    },

    {
      id: 'java/xxe-sax-parser',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'XXE via SAXParserFactory',
      description:
        'SAXParserFactory without secure processing features is vulnerable to XXE attacks.',
      cweId: 'CWE-611',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        if (!/SAXParserFactory/.test(content)) return [];
        const hasSecureProcessing =
          /setFeature\s*\(\s*XMLConstants\.FEATURE_SECURE_PROCESSING/g.test(content) ||
          /setFeature\s*\(\s*"http:\/\/apache\.org\/xml\/features\/disallow-doctype-decl"\s*,\s*true\s*\)/g.test(content);
        if (hasSecureProcessing) return [];
        return findAllMatches(content, /SAXParserFactory\s*\.\s*newInstance\s*\(\s*\)/g, filePath);
      },
      fixGuidance:
        'Enable secure processing: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true) and disable external entities.',
    },

    {
      id: 'java/unsafe-deserialization',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Unsafe Java Object Deserialization',
      description:
        'ObjectInputStream.readObject() without type filtering can execute arbitrary code via gadget chains.',
      cweId: 'CWE-502',
      owaspCategory: 'A08:2021-Software and Data Integrity Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        if (!/ObjectInputStream/.test(content)) return [];
        const hasFilter = /setObjectInputFilter|ObjectInputFilter|ValidatingObjectInputStream/g.test(content);
        if (hasFilter) return [];
        return findAllMatches(content, /new\s+ObjectInputStream\s*\(/g, filePath);
      },
      fixGuidance:
        'Use ObjectInputFilter (Java 9+) to restrict deserializable types, or use ValidatingObjectInputStream from Apache Commons IO. Prefer JSON/Protobuf over Java serialization.',
    },

    {
      id: 'java/unsafe-json-typing',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'Unsafe Jackson Default Typing',
      description:
        'Jackson enableDefaultTyping() allows arbitrary class instantiation during deserialization, leading to remote code execution.',
      cweId: 'CWE-502',
      owaspCategory: 'A08:2021-Software and Data Integrity Failures',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:enableDefaultTyping|activateDefaultTyping)\s*\(/gi,
          filePath,
        ),
      fixGuidance:
        'Remove enableDefaultTyping(). Use @JsonTypeInfo with explicit subtypes or a PolymorphicTypeValidator that restricts allowed base types.',
    },

    // ── File & Path (3 rules) ─────────────────────────────────────────────────

    {
      id: 'java/path-traversal',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Path Traversal Risk',
      description:
        'Constructing file paths with user input without canonicalization enables directory traversal attacks (../).',
      cweId: 'CWE-22',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /new\s+File\s*\(\s*(?:[a-zA-Z_]\w*\s*\+\s*(?:request|param|input|getParameter|getHeader)|(?:request|param|input)\s*[+,])/gi,
          filePath,
        ),
      fixGuidance:
        'Canonicalize the path with file.getCanonicalPath() and verify it starts with the intended base directory. Use Path.resolve().normalize() and validate the result.',
    },

    {
      id: 'java/unrestricted-upload',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Unrestricted File Upload',
      description:
        'Accepting file uploads without validating file extension, MIME type, or content can lead to remote code execution.',
      cweId: 'CWE-434',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        if (!/MultipartFile|@RequestParam.*file|Part\s+\w+/i.test(content)) return [];
        const hasValidation = /getContentType|getOriginalFilename.*\.(endsWith|contains|matches)|FilenameUtils\.getExtension/gi.test(content);
        if (hasValidation) return [];
        return findAllMatches(content, /(?:MultipartFile|@RequestParam\s*.*(?:file|upload|attachment))/gi, filePath);
      },
      fixGuidance:
        'Validate file extension against an allowlist, verify MIME type matches content, limit file size, and store uploads outside the web root with randomized names.',
    },

    {
      id: 'java/temp-file-insecure',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Insecure Temporary File Creation',
      description:
        'File.createTempFile creates files with default permissions that may be readable by other users on the system.',
      cweId: 'CWE-377',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /File\s*\.\s*createTempFile\s*\(/g,
          filePath,
        ),
      fixGuidance:
        'Use Files.createTempFile() from java.nio.file which creates files with restrictive permissions, or explicitly set file permissions after creation.',
    },

    // ── Spring-Specific (8 rules) ─────────────────────────────────────────────

    {
      id: 'java/spring-request-no-method',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: '@RequestMapping Without HTTP Method Restriction',
      description:
        '@RequestMapping without a method attribute accepts all HTTP methods, which may expose unintended functionality.',
      cweId: 'CWE-749',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@RequestMapping\s*\(\s*(?:value\s*=\s*)?"[^"]*"\s*\)(?!\s*\n\s*.*method)/gi,
          filePath,
        ),
      fixGuidance:
        'Specify the HTTP method explicitly: @RequestMapping(value = "/path", method = RequestMethod.GET) or use @GetMapping, @PostMapping, etc.',
    },

    {
      id: 'java/spring-missing-validation',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Missing Input Validation on Controller Parameter',
      description:
        'Controller request body parameters without @Valid or @Validated skip bean validation, allowing invalid data.',
      cweId: 'CWE-20',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@(?:PostMapping|PutMapping|PatchMapping)[\s\S]*?@RequestBody\s+(?!@Valid\b|@Validated\b)\w+/gi,
          filePath,
        ),
      fixGuidance:
        'Add @Valid or @Validated before the @RequestBody parameter and define validation constraints on the DTO class.',
    },

    {
      id: 'java/spring-cors-wildcard',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Wildcard CORS Origin',
      description:
        'Allowing all origins (*) in CORS configuration permits any website to make authenticated requests to your API.',
      cweId: 'CWE-942',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@CrossOrigin\s*\(\s*(?:origins\s*=\s*)?"?\*"?\s*\)|allowedOrigins\s*\(\s*"\*"\s*\)|\.allowedOrigins\s*\(\s*"\*"\s*\)/gi,
          filePath,
        ),
      fixGuidance:
        'Specify explicit allowed origins instead of "*". If credentials are needed, wildcards are already rejected by browsers—use explicit domains.',
    },

    {
      id: 'java/spring-actuator-exposed',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Spring Actuator Endpoints Exposed',
      description:
        'Exposing all actuator endpoints without authentication leaks application internals, environment variables, and health data.',
      cweId: 'CWE-200',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.properties', '*.yml', '*.yaml'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /management\.endpoints\.web\.exposure\.include\s*[=:]\s*\*/g,
          filePath,
        ),
      fixGuidance:
        'Expose only necessary endpoints: management.endpoints.web.exposure.include=health,info. Secure actuator endpoints with Spring Security.',
    },

    {
      id: 'java/spring-debug-enabled',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Debug/Verbose Mode Enabled in Configuration',
      description:
        'Debug settings like spring.jpa.show-sql=true or debug=true in production expose query details and internal state.',
      cweId: 'CWE-489',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.properties', '*.yml', '*.yaml'],
      excludePatterns: ['*-dev.*', '*-local.*', '*-test.*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:spring\.jpa\.show-sql\s*[=:]\s*true|debug\s*[=:]\s*true|logging\.level\.root\s*[=:]\s*(?:DEBUG|TRACE))/gi,
          filePath,
        ),
      fixGuidance:
        'Set spring.jpa.show-sql=false and debug=false in production profiles. Use profile-specific configuration files.',
    },

    {
      id: 'java/spring-h2-console-enabled',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'H2 Database Console Enabled',
      description:
        'The H2 console provides a web-based database administration interface. If exposed in production, it allows full database access.',
      cweId: 'CWE-489',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.properties', '*.yml', '*.yaml'],
      excludePatterns: ['*-dev.*', '*-local.*', '*-test.*'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /spring\.h2\.console\.enabled\s*[=:]\s*true/gi,
          filePath,
        ),
      fixGuidance:
        'Disable the H2 console in production: spring.h2.console.enabled=false. Use it only in development profiles.',
    },

    {
      id: 'java/spring-open-redirect',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Open Redirect via Spring Controller',
      description:
        'Redirecting to a user-controlled URL allows phishing attacks by redirecting victims to malicious sites.',
      cweId: 'CWE-601',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:return\s+"redirect:"\s*\+\s*(?:request|param|input|url|redirect|target|next|returnUrl|getParameter)|response\s*\.\s*sendRedirect\s*\(\s*(?:request\s*\.\s*getParameter|url|redirect|target|next|returnUrl))/gi,
          filePath,
        ),
      fixGuidance:
        'Validate redirect URLs against an allowlist of permitted domains/paths. Never redirect to a fully user-controlled URL.',
    },

    {
      id: 'java/spring-sql-native-query',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'SQL Injection in Spring @Query (Native)',
      description:
        'Using string concatenation in @Query with nativeQuery=true bypasses JPA parameterization and enables SQL injection.',
      cweId: 'CWE-89',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@Query\s*\(\s*(?:value\s*=\s*)?(?:"[^"]*"\s*\+|[a-zA-Z_]\w*\s*\+)[^)]*nativeQuery\s*=\s*true/gi,
          filePath,
        ),
      fixGuidance:
        'Use named parameters in native queries: @Query(value = "SELECT * FROM users WHERE name = :name", nativeQuery = true). Never concatenate strings.',
    },

    // ── Bug Patterns (12 rules) ───────────────────────────────────────────────

    {
      id: 'java/null-pointer-risk',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'Potential Null Pointer Dereference',
      description:
        'Method call on a return value that may be null without a null check risks NullPointerException at runtime.',
      cweId: 'CWE-476',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:\.get\s*\(\s*[^)]*\)\s*\.\w+|\.find\w*\s*\(\s*[^)]*\)\s*\.(?!isPresent|orElse|ifPresent|map|flatMap))/g,
          filePath,
        ),
      fixGuidance:
        'Check for null before dereferencing, or use Optional: optional.map(...).orElse(default). Use @Nullable annotations to document nullability.',
    },

    {
      id: 'java/resource-leak',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'Resource Leak (Missing try-with-resources)',
      description:
        'AutoCloseable resources (streams, connections, result sets) opened without try-with-resources may leak if an exception occurs.',
      cweId: 'CWE-772',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const findings: import('../scan-types').RawFinding[] = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/(?:new\s+(?:FileInputStream|FileOutputStream|BufferedReader|FileReader|FileWriter|Socket|ServerSocket|DataInputStream|DataOutputStream)\s*\(|\.getConnection\s*\(|\.openStream\s*\()/i.test(line)) {
            const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
            if (!/try\s*\(/.test(context)) {
              findings.push({
                line: i + 1,
                column: 1,
                matchedCode: line.trim(),
                context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n'),
              });
            }
          }
        }
        return findings;
      },
      fixGuidance:
        'Use try-with-resources: try (var stream = new FileInputStream(file)) { ... }. This ensures the resource is closed even if an exception is thrown.',
    },

    {
      id: 'java/synchronization-issue',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'Non-Atomic Check-Then-Act on Shared State',
      description:
        'Reading and then writing to a shared field outside a synchronized block creates a race condition (TOCTOU).',
      cweId: 'CWE-362',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /if\s*\(\s*\w+\s*==\s*null\s*\)\s*\{?\s*\n?\s*\w+\s*=\s*new\s+/g,
          filePath,
        ),
      fixGuidance:
        'Use synchronized blocks, AtomicReference, or double-checked locking with volatile for lazy initialization patterns.',
    },

    {
      id: 'java/equals-without-hashcode',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'equals() Without hashCode() Override',
      description:
        'Overriding equals() without hashCode() violates the Object contract and causes incorrect behavior in hash-based collections.',
      cweId: 'CWE-581',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const hasEquals = /public\s+boolean\s+equals\s*\(\s*Object\b/.test(content);
        const hasHashCode = /public\s+int\s+hashCode\s*\(\s*\)/.test(content);
        if (hasEquals && !hasHashCode) {
          return findAllMatches(content, /public\s+boolean\s+equals\s*\(\s*Object\b/g, filePath);
        }
        return [];
      },
      fixGuidance:
        'Always override hashCode() when overriding equals(). Use Objects.hash() or IDE-generated implementations. Consider using Lombok @EqualsAndHashCode.',
    },

    {
      id: 'java/mutable-static-field',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'Public Mutable Static Field',
      description:
        'Public static non-final fields or public static final mutable objects (List, Map, array) can be modified by any code, causing unexpected shared state.',
      cweId: 'CWE-500',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const mutableStatic = findAllMatches(
          content,
          /public\s+static\s+(?!final\s)(?!void\s)(?!class\s)\w[\w<>\[\],\s]*\s+\w+\s*[;=]/g,
          filePath,
        );
        const mutableFinalCollection = findAllMatches(
          content,
          /public\s+static\s+final\s+(?:List|Map|Set|Collection|ArrayList|HashMap|HashSet)\s*</g,
          filePath,
        );
        return [...mutableStatic, ...mutableFinalCollection];
      },
      fixGuidance:
        'Make static fields private with accessor methods, or use Collections.unmodifiableList/Map/Set for final collection fields.',
    },

    {
      id: 'java/empty-catch-block',
      language: 'java',
      category: 'bug',
      severity: 'low',
      title: 'Empty Catch Block',
      description:
        'An empty catch block silently swallows exceptions, hiding errors and making debugging extremely difficult.',
      cweId: 'CWE-390',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findMultilineMatches(
          content,
          /catch\s*\([^)]+\)\s*\{\s*\}/g,
        ),
      fixGuidance:
        'At minimum, log the exception: catch (Exception e) { logger.error("Operation failed", e); }. Or rethrow as a runtime exception if it should not be silently ignored.',
    },

    {
      id: 'java/string-comparison-equals',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'String Comparison Using == Instead of .equals()',
      description:
        'Using == to compare strings checks reference identity, not value equality, and will fail for dynamically created strings.',
      cweId: 'CWE-595',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:String\s+\w+|"\w+")\s*(?:==|!=)\s*(?:"\w+"|[a-zA-Z_]\w*(?:\.\w+\(\))?)\s*(?:[;)\]{|&])/g,
          filePath,
        ),
      fixGuidance:
        'Use .equals() for string comparison: "value".equals(variable). Use Objects.equals() for null-safe comparison.',
    },

    {
      id: 'java/infinite-loop-risk',
      language: 'java',
      category: 'bug',
      severity: 'low',
      title: 'Potential Infinite Loop',
      description:
        'while(true) without an obvious break or return condition nearby may indicate an infinite loop risk.',
      cweId: 'CWE-835',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const findings: import('../scan-types').RawFinding[] = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/while\s*\(\s*true\s*\)/.test(lines[i])) {
            const window = lines.slice(i, Math.min(lines.length, i + 15)).join('\n');
            if (!/break\s*;|return\s|throw\s|System\.exit/.test(window)) {
              findings.push({
                line: i + 1,
                column: 1,
                matchedCode: lines[i].trim(),
                context: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 5)).join('\n'),
              });
            }
          }
        }
        return findings;
      },
      fixGuidance:
        'Add explicit break conditions and consider adding a maximum iteration guard or timeout to prevent infinite loops.',
    },

    {
      id: 'java/thread-sleep-in-loop',
      language: 'java',
      category: 'bug',
      severity: 'low',
      title: 'Thread.sleep() Inside Loop',
      description:
        'Thread.sleep() in a loop is a busy-wait anti-pattern that wastes CPU and can cause missed signals. Use proper synchronization primitives.',
      cweId: 'CWE-400',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const findings: import('../scan-types').RawFinding[] = [];
        const lines = content.split('\n');
        let inLoop = false;
        for (let i = 0; i < lines.length; i++) {
          if (/(?:while|for)\s*\(/.test(lines[i])) inLoop = true;
          if (inLoop && /Thread\s*\.\s*sleep\s*\(/.test(lines[i])) {
            findings.push({
              line: i + 1,
              column: 1,
              matchedCode: lines[i].trim(),
              context: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n'),
            });
          }
          if (inLoop && lines[i].trim() === '}') inLoop = false;
        }
        return findings;
      },
      fixGuidance:
        'Replace busy-wait with ScheduledExecutorService, CountDownLatch, CompletableFuture, or wait/notify for proper thread coordination.',
    },

    {
      id: 'java/system-exit',
      language: 'java',
      category: 'bug',
      severity: 'medium',
      title: 'System.exit() in Application Code',
      description:
        'System.exit() terminates the entire JVM, which is inappropriate in web applications or libraries. It prevents proper resource cleanup and container shutdown hooks.',
      cweId: 'CWE-382',
      filePatterns: ['*.java'],
      excludePatterns: ['*Main.java', '*Application.java', '*CLI.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /System\s*\.\s*exit\s*\(\s*\d*\s*\)/g,
          filePath,
        ),
      fixGuidance:
        'Throw a runtime exception or return an error code instead. In Spring Boot, use SpringApplication.exit(). In web apps, never call System.exit().',
    },

    {
      id: 'java/raw-type-usage',
      language: 'java',
      category: 'quality',
      severity: 'low',
      title: 'Raw Generic Type Usage',
      description:
        'Using raw types (e.g., List instead of List<String>) bypasses generic type safety and can cause ClassCastException at runtime.',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:(?:List|Map|Set|Collection|Iterator|Iterable|Queue|Deque|Stack|Vector|Hashtable)\s+\w+\s*[=;]|new\s+(?:ArrayList|HashMap|HashSet|LinkedList|TreeMap|TreeSet|Vector|Hashtable)\s*\(\s*\)\s*;)/g,
          filePath,
        ),
      fixGuidance:
        'Always specify type parameters: List<String> instead of List. Use diamond operator for inference: new ArrayList<>().',
    },

    {
      id: 'java/deprecated-api',
      language: 'java',
      category: 'quality',
      severity: 'info',
      title: 'Deprecated API Usage',
      description:
        'Use of deprecated APIs may break in future versions and often indicates better alternatives exist.',
      filePatterns: ['*.java'],
      excludePatterns: ['*Test.java', '*Tests.java', '*test*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /@SuppressWarnings\s*\(\s*"deprecation"\s*\)/g,
          filePath,
        ),
      fixGuidance:
        'Replace deprecated API calls with their recommended alternatives. Check the Javadoc @deprecated tag for migration guidance.',
    },

    // ── Additional Security (5 rules) ─────────────────────────────────────────

    {
      id: 'java/ssrf-risk',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Server-Side Request Forgery (SSRF) Risk',
      description:
        'URLs constructed from user input can be exploited to access internal services, metadata endpoints, or perform port scanning from the server.',
      cweId: 'CWE-918',
      owaspCategory: 'A10:2021-Server-Side Request Forgery',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /new\s+URL\s*\(\s*(?:request\s*\.\s*getParameter|param|input|url\s*\+|[a-zA-Z_]\w*\s*\+\s*"http)/gi,
          filePath,
        ),
      fixGuidance:
        'Validate and sanitize URLs against an allowlist of permitted hosts/schemes. Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x) and internal hostnames.',
    },

    {
      id: 'java/regex-dos',
      language: 'java',
      category: 'security',
      severity: 'medium',
      title: 'Regular Expression Denial of Service (ReDoS)',
      description:
        'Regex with nested quantifiers (e.g., (a+)+, (a|a)*) can cause catastrophic backtracking on crafted input, freezing the application.',
      cweId: 'CWE-1333',
      owaspCategory: 'A06:2021-Vulnerable and Outdated Components',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /Pattern\s*\.\s*compile\s*\(\s*"[^"]*(?:\([^)]*[+*]\)[+*]|\([^)]*\|[^)]*\)[+*])[^"]*"/g,
          filePath,
        ),
      fixGuidance:
        'Avoid nested quantifiers in regex. Use possessive quantifiers (a++) or atomic groups where supported. Set a timeout on Pattern matching with .matcher().region() or use a regex library that supports backtracking limits.',
    },

    {
      id: 'java/unvalidated-redirect',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'Unvalidated Redirect via sendRedirect',
      description:
        'HttpServletResponse.sendRedirect() with a user-controlled parameter allows open redirect attacks.',
      cweId: 'CWE-601',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.java'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:response|res)\s*\.\s*sendRedirect\s*\(\s*(?:request\s*\.\s*getParameter\s*\(|req\s*\.\s*getParameter\s*\(|[a-zA-Z_]*[Uu]rl|[a-zA-Z_]*[Rr]edirect|[a-zA-Z_]*[Tt]arget|[a-zA-Z_]*[Nn]ext)/g,
          filePath,
        ),
      fixGuidance:
        'Validate redirect destinations against a whitelist of allowed paths or domains. Use relative paths when possible.',
    },

    {
      id: 'java/insecure-cors-credentials',
      language: 'java',
      category: 'security',
      severity: 'critical',
      title: 'CORS Wildcard with Credentials',
      description:
        'Setting Access-Control-Allow-Origin to a user-supplied origin while allowing credentials lets any site make authenticated cross-origin requests.',
      cweId: 'CWE-942',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        const hasWildcardOrReflect =
          /setHeader\s*\(\s*"Access-Control-Allow-Origin"\s*,\s*(?:request\s*\.\s*getHeader\s*\(\s*"Origin"\s*\)|\*|origin)/gi.test(content);
        const hasCredentials =
          /(?:Access-Control-Allow-Credentials|allowCredentials)\s*[,=:]\s*(?:true|"true")/gi.test(content);
        if (hasWildcardOrReflect && hasCredentials) {
          return findAllMatches(
            content,
            /(?:Access-Control-Allow-Origin|allowedOrigins).*(?:\*|getHeader\s*\(\s*"Origin")/gi,
            filePath,
          );
        }
        return [];
      },
      fixGuidance:
        'Never reflect the Origin header blindly when credentials are allowed. Validate the Origin against an explicit allowlist of trusted domains.',
    },

    {
      id: 'java/xml-external-entity-transform',
      language: 'java',
      category: 'security',
      severity: 'high',
      title: 'XXE via TransformerFactory',
      description:
        'TransformerFactory without secure processing feature is vulnerable to XXE attacks during XSLT transformations.',
      cweId: 'CWE-611',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.java'],
      detect: (content, filePath) => {
        if (!/TransformerFactory/.test(content)) return [];
        const hasSecure =
          /setAttribute\s*\(\s*XMLConstants\.ACCESS_EXTERNAL_DTD/g.test(content) ||
          /setFeature\s*\(\s*XMLConstants\.FEATURE_SECURE_PROCESSING\s*,\s*true\s*\)/g.test(content);
        if (hasSecure) return [];
        return findAllMatches(content, /TransformerFactory\s*\.\s*newInstance\s*\(\s*\)/g, filePath);
      },
      fixGuidance:
        'Set secure processing: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true) and factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "").',
    },
  ];
}
