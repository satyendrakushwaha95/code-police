import { ScanRule } from '../scan-types';
import { findAllMatches, findMultilineMatches } from './rule-registry';

export function getAngularRules(): ScanRule[] {
  return [

    // ── XSS Rules (1-8) ──────────────────────────────────────────────────────

    {
      id: 'angular/xss-bypass-trust-html',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'Bypass Security Trust HTML',
      description:
        'bypassSecurityTrustHtml() disables Angular\'s built-in XSS sanitization for HTML content. ' +
        'If the input contains user-controlled data, an attacker can inject arbitrary HTML and scripts.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /bypassSecurityTrustHtml\s*\(/g, filePath),
      fixGuidance:
        'Avoid bypassSecurityTrustHtml. Use Angular\'s built-in sanitization or the DomSanitizer.sanitize() method with SecurityContext.HTML. ' +
        'If bypass is absolutely necessary, validate and sanitize the input with a strict allowlist before passing it.',
    },

    {
      id: 'angular/xss-bypass-trust-script',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'Bypass Security Trust Script',
      description:
        'bypassSecurityTrustScript() completely disables Angular\'s script sanitization. ' +
        'This is the most dangerous bypass and can lead to direct code execution.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /bypassSecurityTrustScript\s*\(/g, filePath),
      fixGuidance:
        'Never use bypassSecurityTrustScript with user-supplied data. Refactor to avoid dynamic script evaluation entirely. ' +
        'If third-party script loading is required, use a Content Security Policy and load scripts via approved mechanisms.',
    },

    {
      id: 'angular/xss-bypass-trust-style',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Bypass Security Trust Style',
      description:
        'bypassSecurityTrustStyle() disables CSS sanitization. Malicious CSS can exfiltrate data via url() ' +
        'or exploit browser-specific CSS expression features.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /bypassSecurityTrustStyle\s*\(/g, filePath),
      fixGuidance:
        'Prefer Angular\'s built-in style binding [style.property]="value" which is automatically sanitized. ' +
        'If dynamic styles are required, validate against a strict allowlist of CSS properties and values.',
    },

    {
      id: 'angular/xss-bypass-trust-url',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Bypass Security Trust URL',
      description:
        'bypassSecurityTrustUrl() disables URL sanitization. An attacker can inject javascript: or data: URLs ' +
        'leading to XSS.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /bypassSecurityTrustUrl\s*\(/g, filePath),
      fixGuidance:
        'Let Angular\'s built-in URL sanitization handle href/src bindings. If bypass is needed, ' +
        'validate URLs against a strict allowlist of protocols (https:, mailto:) and domains.',
    },

    {
      id: 'angular/xss-bypass-trust-resource-url',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Bypass Security Trust Resource URL',
      description:
        'bypassSecurityTrustResourceUrl() bypasses sanitization for resource URLs (iframe src, script src, etc.). ' +
        'This can allow loading content from attacker-controlled origins.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /bypassSecurityTrustResourceUrl\s*\(/g, filePath),
      fixGuidance:
        'Validate resource URLs against a strict allowlist of trusted domains. ' +
        'Consider using Content Security Policy frame-src/script-src directives as an additional layer of defense.',
    },

    {
      id: 'angular/xss-innerhtml-binding',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'innerHTML Binding in Template',
      description:
        '[innerHTML] binding renders raw HTML in the template. While Angular sanitizes by default, ' +
        'combining this with bypassSecurityTrust* or unsanitized server data can cause XSS.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.html'],
      detect: (content, filePath) =>
        findAllMatches(content, /\[innerHTML\]\s*=/g, filePath),
      fixGuidance:
        'Prefer text interpolation {{ }} over [innerHTML]. If HTML rendering is necessary, ensure the value ' +
        'is never combined with bypassSecurityTrustHtml. Use DomSanitizer.sanitize() explicitly when processing server data.',
    },

    {
      id: 'angular/xss-dom-manipulation',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Direct DOM Manipulation via ElementRef',
      description:
        'Using ElementRef.nativeElement to directly manipulate the DOM bypasses Angular\'s template security. ' +
        'Setting innerHTML, outerHTML, or insertAdjacentHTML on nativeElement is equivalent to unsanitized HTML injection.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /nativeElement\s*\.\s*(innerHTML|outerHTML|insertAdjacentHTML|document\.write)/g, filePath),
      fixGuidance:
        'Use Angular Renderer2 instead of direct DOM access. For dynamic content, use Angular\'s template binding ' +
        'with proper sanitization. Avoid ElementRef.nativeElement whenever possible.',
    },

    {
      id: 'angular/xss-document-write',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'document.write / document.writeln Usage',
      description:
        'document.write() and document.writeln() inject raw HTML into the document, bypassing Angular\'s ' +
        'sanitization entirely. They are also destructive to the DOM when called after page load.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /document\s*\.\s*write(ln)?\s*\(/g, filePath),
      fixGuidance:
        'Never use document.write/writeln in Angular applications. Use Angular\'s Renderer2 or template bindings ' +
        'to dynamically render content. For third-party script injection, use Angular\'s platform APIs.',
    },

    // ── Injection & Data Exposure (9-16) ─────────────────────────────────────

    {
      id: 'angular/api-key-in-environment',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'API Key / Secret in Environment File',
      description:
        'API keys, secrets, or passwords found in environment.ts files. Angular environment files are compiled ' +
        'into the client bundle and are fully visible to anyone inspecting the JavaScript.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['environment*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|private[_-]?key|auth[_-]?token|password|client[_-]?secret)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
          filePath,
        ),
      fixGuidance:
        'Never store secrets in Angular environment files — they are bundled into the client. ' +
        'Use a backend proxy to add API keys to outgoing requests, or use environment variables injected at build time for non-secret config only.',
    },

    {
      id: 'angular/api-key-in-source',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Hardcoded API Key in Source Code',
      description:
        'API keys or secrets hardcoded directly in services, components, or other TypeScript source files. ' +
        'These end up in the compiled JavaScript bundle and are visible to all users.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        if (/environment(\.\w+)?\.ts$/.test(filePath)) return [];
        return findAllMatches(
          content,
          /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|private[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-/.]{16,}['"]/gi,
          filePath,
        );
      },
      fixGuidance:
        'Move API keys to a backend service. The Angular frontend should call your own API, ' +
        'which adds credentials server-side before proxying to third-party services.',
    },

    {
      id: 'angular/hardcoded-auth-token',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'Hardcoded Bearer / Auth Token',
      description:
        'A hardcoded Bearer token or Authorization header value was found. Hardcoded tokens in client-side ' +
        'code are visible to all users and cannot be rotated without a new deployment.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"](?:Bearer|Basic|Token)\s+[A-Za-z0-9_\-/.+=]{20,}['"]/g,
          filePath,
        ),
      fixGuidance:
        'Retrieve auth tokens dynamically from your authentication service (e.g., OAuth2 / OIDC flow). ' +
        'Use an HttpInterceptor to attach tokens from a token service, never hardcode them.',
    },

    {
      id: 'angular/sensitive-localstorage',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Sensitive Data in localStorage',
      description:
        'Passwords, tokens, or secrets are being stored in localStorage. localStorage is accessible to all ' +
        'JavaScript on the same origin, including XSS payloads, and has no expiration.',
      cweId: 'CWE-922',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /localStorage\s*\.\s*setItem\s*\(\s*['"](?:password|token|secret|auth|credential|session|jwt|refresh[_-]?token|access[_-]?token)['"]/gi,
          filePath,
        ),
      fixGuidance:
        'Use HttpOnly cookies for session tokens — they are inaccessible to JavaScript. ' +
        'If client-side storage is required, use short-lived tokens and encrypt sensitive values. ' +
        'Consider sessionStorage for shorter lifetimes, but note it is equally vulnerable to XSS.',
    },

    {
      id: 'angular/sensitive-sessionstorage',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Sensitive Data in sessionStorage',
      description:
        'Passwords, tokens, or secrets are stored in sessionStorage. While sessionStorage is tab-scoped, ' +
        'it is still accessible to any JavaScript running on the same origin, including XSS payloads.',
      cweId: 'CWE-922',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /sessionStorage\s*\.\s*setItem\s*\(\s*['"](?:password|token|secret|auth|credential|session|jwt|refresh[_-]?token|access[_-]?token)['"]/gi,
          filePath,
        ),
      fixGuidance:
        'Use HttpOnly cookies for sensitive tokens. If sessionStorage is necessary, store only short-lived, ' +
        'non-sensitive identifiers. Never store raw passwords or long-lived tokens in browser storage.',
    },

    {
      id: 'angular/basic-auth-credentials',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'HTTP Basic Auth Credentials in Code',
      description:
        'Hardcoded HTTP Basic Authentication credentials (username:password or Base64-encoded) found in source. ' +
        'These are compiled into the client bundle and trivially extractable.',
      cweId: 'CWE-798',
      owaspCategory: 'A07:2021-Identification and Authentication Failures',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"]Basic\s+[A-Za-z0-9+/=]{10,}['"]/g,
          filePath,
        ),
      fixGuidance:
        'Never embed credentials in client-side code. Use an authentication flow (OAuth2/OIDC) that provides ' +
        'tokens dynamically. If basic auth is required, proxy requests through a backend that injects credentials.',
    },

    {
      id: 'angular/eval-usage',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'eval() Usage',
      description:
        'eval() executes arbitrary strings as JavaScript code. If any part of the evaluated string originates ' +
        'from user input, URL parameters, or external data, it enables Remote Code Execution.',
      cweId: 'CWE-95',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /\beval\s*\(/g, filePath),
      fixGuidance:
        'Remove eval() entirely. Use JSON.parse() for data deserialization, Map/object lookups for dynamic dispatch, ' +
        'or Angular\'s template engine for dynamic rendering. There is almost never a legitimate need for eval in Angular.',
    },

    {
      id: 'angular/function-constructor',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'new Function() Constructor',
      description:
        'The Function constructor creates a function from a string, which is functionally identical to eval(). ' +
        'It bypasses Angular\'s template security and CSP restrictions.',
      cweId: 'CWE-95',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /new\s+Function\s*\(/g, filePath),
      fixGuidance:
        'Replace new Function() with static code paths. Use strategy/factory patterns for dynamic behavior. ' +
        'If code generation is truly needed, perform it on the server side in a sandboxed environment.',
    },

    // ── HTTP & Communication (17-23) ─────────────────────────────────────────

    {
      id: 'angular/http-not-https',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'HTTP URL Used Instead of HTTPS',
      description:
        'An API endpoint using http:// instead of https:// was detected. Data transmitted over HTTP ' +
        'is sent in plaintext and is vulnerable to man-in-the-middle interception.',
      cweId: 'CWE-319',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^'"`\s]+['"`]/g,
          filePath,
        ),
      fixGuidance:
        'Change all API URLs from http:// to https://. Configure your backend to enforce TLS. ' +
        'Use relative URLs or environment-based configuration to avoid protocol mismatches between environments.',
    },

    {
      id: 'angular/cors-wildcard-proxy',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'CORS Wildcard in Proxy Config',
      description:
        'The proxy configuration sets Access-Control-Allow-Origin to "*", allowing any website to make ' +
        'cross-origin requests to the proxied API. This may expose APIs to CSRF or data theft.',
      cweId: 'CWE-942',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['proxy.conf.json', 'proxy.conf.js'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"]?Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]?\*['"]?/gi,
          filePath,
        ),
      fixGuidance:
        'Restrict CORS origins to specific trusted domains. In production, CORS should be configured on the ' +
        'backend API server, not in the Angular proxy. The proxy config should only be used for local development.',
    },

    {
      id: 'angular/insecure-cookie',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'Insecure Cookie Handling',
      description:
        'document.cookie is used directly without setting Secure or HttpOnly flags. Cookies set via ' +
        'JavaScript cannot have HttpOnly, making them accessible to XSS attacks.',
      cweId: 'CWE-614',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /document\s*\.\s*cookie\s*=/g, filePath),
      fixGuidance:
        'Set cookies from the server side with Secure, HttpOnly, and SameSite flags. ' +
        'If client-side cookies are necessary, always include ";Secure;SameSite=Strict" in the cookie string. ' +
        'Consider using a cookie library like ngx-cookie-service.',
    },

    {
      id: 'angular/missing-csrf-header',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'State-Changing Request Without CSRF Protection',
      description:
        'POST, PUT, or DELETE requests are made without an X-XSRF-TOKEN or X-CSRF-TOKEN header. ' +
        'Angular\'s HttpXsrfModule provides CSRF protection by default but must be configured correctly.',
      cweId: 'CWE-352',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const hasXsrfModule = /HttpClientXsrfModule|withXsrfConfiguration|XSRF|xsrfHeaderName/i.test(content);
        if (hasXsrfModule) return [];
        return findAllMatches(
          content,
          /\.(?:post|put|delete|patch)\s*\(/g,
          filePath,
        );
      },
      fixGuidance:
        'Import HttpClientXsrfModule in your AppModule and ensure the backend sets the XSRF-TOKEN cookie. ' +
        'Angular will automatically read this cookie and send it as X-XSRF-TOKEN header on mutating requests.',
    },

    {
      id: 'angular/http-error-no-handling',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'HTTP Call Without Error Handling',
      description:
        'HttpClient observable chains (.get, .post, etc.) without catchError, retry, or error callback in subscribe. ' +
        'Unhandled HTTP errors can cause silent failures and poor user experience.',
      cweId: 'CWE-754',
      owaspCategory: 'A11:2021-Next',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const findings = findMultilineMatches(
          content,
          /this\s*\.\s*http\s*\.\s*(?:get|post|put|delete|patch|head|options)\s*[<(][\s\S]*?\.subscribe\s*\(\s*(?:\(?\s*\w+\s*\)?\s*=>|{[^}]*next\s*:)[^}]*\}/g,
        );
        return findings.filter(f => {
          const block = f.matchedCode;
          return !/catchError|\.catch\s*\(|error\s*:|,\s*\(?\s*(?:err|error)\s*\)?\s*=>/i.test(block);
        });
      },
      fixGuidance:
        'Add catchError() in the pipe chain or provide an error callback in subscribe(). ' +
        'Consider a global error handler via HttpInterceptor for consistent error handling across the application.',
    },

    {
      id: 'angular/jsonp-usage',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'JSONP Usage (Cross-Site Scripting Risk)',
      description:
        'JSONP bypasses same-origin policy by injecting a <script> tag, executing the response as JavaScript. ' +
        'If the JSONP endpoint is compromised, it allows arbitrary code execution in the user\'s browser.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /\.jsonp\s*\(|HttpClientJsonpModule|JSONP_CALLBACK/g, filePath),
      fixGuidance:
        'Replace JSONP with CORS-enabled API calls using standard HttpClient. ' +
        'JSONP is a legacy technique and should not be used in modern Angular applications.',
    },

    {
      id: 'angular/websocket-unencrypted',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'Unencrypted WebSocket (ws://)',
      description:
        'Using ws:// instead of wss:// transmits WebSocket data in plaintext, vulnerable to ' +
        'man-in-the-middle attacks. This includes any authentication tokens sent over the connection.',
      cweId: 'CWE-319',
      owaspCategory: 'A02:2021-Cryptographic Failures',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /['"`]ws:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"`\s]+['"`]/g,
          filePath,
        ),
      fixGuidance:
        'Use wss:// for all WebSocket connections. Ensure the server supports TLS for WebSocket connections. ' +
        'Use environment-specific configuration to allow ws:// only in local development.',
    },

    // ── Angular-Specific Security (24-29) ────────────────────────────────────

    {
      id: 'angular/open-redirect',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Potential Open Redirect',
      description:
        'Router.navigate or navigateByUrl called with user-controlled input (query params, route params, user input). ' +
        'An attacker can craft a URL that redirects victims to a malicious site.',
      cweId: 'CWE-601',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:this\s*\.\s*router\s*\.\s*(?:navigate|navigateByUrl)|window\s*\.\s*location\s*(?:\.\s*href\s*=|\.assign|\.replace))\s*\(/g,
          filePath,
        ),
      fixGuidance:
        'Validate redirect targets against an allowlist of internal routes. Never redirect to URLs constructed ' +
        'from query parameters or user input without validation. Use Router.navigate with route arrays instead of raw URLs.',
    },

    {
      id: 'angular/route-guard-bypass',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'Route Without Auth Guard',
      description:
        'A route definition was found without canActivate, canActivateChild, or canMatch guard. ' +
        'Routes without guards may be accessible to unauthenticated or unauthorized users.',
      cweId: 'CWE-862',
      owaspCategory: 'A01:2021-Broken Access Control',
      filePatterns: ['*.ts', '*-routing.module.ts', '*.routes.ts'],
      detect: (content, filePath) => {
        if (!/(Routes|RouterModule|provideRouter)/.test(content)) return [];
        return findMultilineMatches(
          content,
          /{\s*path\s*:\s*['"][^'"]+['"]\s*,\s*(?:component|loadComponent|loadChildren)\s*:[^}]*}/g,
        ).filter(f => !/canActivate|canActivateChild|canMatch|canLoad/.test(f.matchedCode));
      },
      fixGuidance:
        'Add canActivate guards to all routes that require authentication or authorization. ' +
        'Use a centralized AuthGuard that checks authentication state. Public routes should be explicitly marked as such.',
    },

    {
      id: 'angular/missing-can-deactivate',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'Form Route Missing CanDeactivate Guard',
      description:
        'Components with form handling (FormGroup, FormBuilder, ngForm) on routes without a CanDeactivate guard. ' +
        'Users may navigate away and lose unsaved form data.',
      cweId: 'CWE-472',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const hasForm = /FormGroup|FormBuilder|FormControl|ngForm|ReactiveFormsModule/.test(content);
        const hasGuard = /CanDeactivate|canDeactivate/.test(content);
        if (!hasForm || hasGuard) return [];
        return findAllMatches(content, /(?:FormGroup|FormBuilder|new\s+FormControl)\s*[(<]/g, filePath);
      },
      fixGuidance:
        'Implement a CanDeactivate guard that prompts users before navigating away from unsaved forms. ' +
        'The guard should check the form\'s dirty state and show a confirmation dialog.',
    },

    {
      id: 'angular/unsafe-pipe',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'Pipe Bypassing Sanitization',
      description:
        'A custom pipe uses DomSanitizer.bypassSecurityTrust* to mark values as safe. ' +
        'Pipes are often used broadly across templates, amplifying the attack surface.',
      cweId: 'CWE-79',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const isPipe = /@Pipe\s*\(/.test(content);
        if (!isPipe) return [];
        return findAllMatches(content, /bypassSecurityTrust(?:Html|Script|Style|Url|ResourceUrl)\s*\(/g, filePath);
      },
      fixGuidance:
        'Avoid creating "safe" pipes that blindly bypass sanitization. If a sanitization-bypass pipe is needed, ' +
        'add strict input validation inside the pipe and document the security implications. Limit its usage scope.',
    },

    {
      id: 'angular/template-injection',
      language: 'angular',
      category: 'security',
      severity: 'critical',
      title: 'Dynamic Template Compilation',
      description:
        'Dynamic compilation of Angular templates at runtime (Compiler.compileModuleAndAllComponentsAsync, ' +
        'or creating components from dynamic template strings) can lead to template injection attacks.',
      cweId: 'CWE-94',
      owaspCategory: 'A03:2021-Injection',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:compileModuleAndAllComponents(?:Async|Sync)?|JitCompilerFactory|template\s*:\s*(?:this\.|`\$\{))/g,
          filePath,
        ),
      fixGuidance:
        'Never compile templates from user input or dynamic strings. Use Angular\'s built-in structural directives ' +
        '(*ngIf, *ngFor, *ngSwitch) and component composition for dynamic UI. Pre-compile all templates via AOT.',
    },

    {
      id: 'angular/postmessage-no-origin-check',
      language: 'angular',
      category: 'security',
      severity: 'high',
      title: 'postMessage Listener Without Origin Check',
      description:
        'window.addEventListener("message") without validating event.origin. Any website can send postMessage ' +
        'to your application, potentially injecting malicious data.',
      cweId: 'CWE-346',
      owaspCategory: 'A04:2021-Insecure Design',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const listeners = findAllMatches(
          content,
          /addEventListener\s*\(\s*['"]message['"]/g,
          filePath,
        );
        if (listeners.length === 0) return [];
        const hasOriginCheck = /event\s*\.\s*origin|\.origin\s*[!=]==?\s*['"]|MessageEvent.*origin/i.test(content);
        return hasOriginCheck ? [] : listeners;
      },
      fixGuidance:
        'Always validate event.origin against a strict allowlist of trusted origins before processing the message data. ' +
        'Example: if (event.origin !== "https://trusted.example.com") return;',
    },

    // ── Dependencies & Config (30-35) ────────────────────────────────────────

    {
      id: 'angular/sourcemaps-in-production',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'Source Maps Enabled in Production',
      description:
        'sourceMap is set to true in the production build configuration. Source maps expose the original TypeScript ' +
        'source code to anyone with browser DevTools, revealing business logic and potential vulnerabilities.',
      cweId: 'CWE-540',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['angular.json', 'workspace.json'],
      detect: (content, filePath) =>
        findMultilineMatches(
          content,
          /"production"\s*:\s*\{[^}]*"sourceMap"\s*:\s*true/g,
        ),
      fixGuidance:
        'Set "sourceMap": false in the production configuration of angular.json. ' +
        'If source maps are needed for error tracking, upload them to your error monitoring service (e.g., Sentry) ' +
        'and keep them private — do not serve them to clients.',
    },

    {
      id: 'angular/dev-tools-enabled',
      language: 'angular',
      category: 'security',
      severity: 'medium',
      title: 'Debug / DevTools Enabled in Production',
      description:
        'enableProdMode() is not called, or Angular DevTools / debug features are explicitly enabled. ' +
        'Debug mode exposes component internals, change detection cycles, and performance data to end users.',
      cweId: 'CWE-489',
      owaspCategory: 'A05:2021-Security Misconfiguration',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /(?:isDevMode\s*\(\s*\)\s*===?\s*true|enableDebugTools|ng\.probe|AngularDevTools)/g,
          filePath,
        ),
      fixGuidance:
        'Ensure enableProdMode() is called in production. Remove or conditionally disable debug tools. ' +
        'Use environment.production flag to guard any debug-only code.',
    },

    {
      id: 'angular/no-strict-mode',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'TypeScript Strict Mode Disabled',
      description:
        'TypeScript strict mode is set to false in tsconfig. Strict mode enables strictNullChecks, ' +
        'noImplicitAny, strictBindCallApply, and other checks that catch bugs at compile time.',
      filePatterns: ['tsconfig*.json'],
      detect: (content, filePath) =>
        findAllMatches(content, /"strict"\s*:\s*false/g, filePath),
      fixGuidance:
        'Set "strict": true in tsconfig.json. This enables all strict type-checking options and is the ' +
        'recommended setting for all Angular projects. Fix type errors incrementally if migrating an existing project.',
    },

    {
      id: 'angular/package-outdated-angular',
      language: 'angular',
      category: 'dependency',
      severity: 'info',
      title: 'Angular Version Tracking',
      description:
        'Records the Angular version in package.json for tracking purposes. Outdated Angular versions ' +
        'may lack security patches and performance improvements.',
      filePatterns: ['package.json'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /"@angular\/core"\s*:\s*"[^"]+"/g,
          filePath,
        ),
      fixGuidance:
        'Keep Angular updated to the latest LTS or stable version. Run "ng update" to check for available updates. ' +
        'Review the Angular update guide at https://update.angular.io/ for breaking changes.',
    },

    {
      id: 'angular/budgets-missing',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'No Build Budgets Configured',
      description:
        'The angular.json build configuration does not include budgets. Build budgets enforce size limits ' +
        'on bundles, preventing accidental size regressions that degrade performance.',
      filePatterns: ['angular.json'],
      detect: (content, filePath) => {
        if (/"budgets"/.test(content)) return [];
        return findAllMatches(content, /"build"\s*:\s*\{/g, filePath);
      },
      fixGuidance:
        'Add a "budgets" array to the build configuration in angular.json. Example: ' +
        '{ "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" }. ' +
        'This prevents accidental bundle size regressions.',
    },

    {
      id: 'angular/aot-disabled',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'AOT Compilation Disabled',
      description:
        'Ahead-of-Time compilation is explicitly disabled. AOT is faster, smaller, and catches template errors at build time. ' +
        'JIT compilation is also a security concern as it requires the template compiler in the browser.',
      filePatterns: ['angular.json'],
      detect: (content, filePath) =>
        findAllMatches(content, /"aot"\s*:\s*false/g, filePath),
      fixGuidance:
        'Set "aot": true or remove the setting (AOT is the default since Angular 9). ' +
        'AOT compilation pre-compiles templates, reducing bundle size and eliminating runtime template compilation risks.',
    },

    // ── Observable & RxJS Bug Patterns (36-43) ───────────────────────────────

    {
      id: 'angular/observable-memory-leak',
      language: 'angular',
      category: 'bug',
      severity: 'high',
      title: 'Observable Subscription Without Cleanup',
      description:
        '.subscribe() called without a corresponding unsubscribe, takeUntil, take, first, or async pipe. ' +
        'This causes memory leaks as the subscription persists beyond the component lifecycle.',
      cweId: 'CWE-401',
      filePatterns: ['*.ts'],
      excludePatterns: ['*.spec.ts', '*.test.ts'],
      detect: (content, filePath) => {
        const hasCleanup = /takeUntil|takeUntilDestroyed|unsubscribe|DestroyRef|ngOnDestroy|AsyncPipe|firstValueFrom/i.test(content);
        if (hasCleanup) return [];
        return findAllMatches(content, /\.subscribe\s*\(/g, filePath);
      },
      fixGuidance:
        'Use one of these patterns to prevent leaks: (1) takeUntilDestroyed() from @angular/core in inject context, ' +
        '(2) takeUntil(destroy$) with a Subject completed in ngOnDestroy, (3) the async pipe in templates, ' +
        '(4) .pipe(first()) or .pipe(take(1)) for one-shot subscriptions.',
    },

    {
      id: 'angular/multiple-subscriptions',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'Multiple Subscriptions to Same Observable',
      description:
        'Multiple .subscribe() calls in the same file can indicate redundant subscriptions to the same stream, ' +
        'causing duplicate side effects, duplicate HTTP requests, or race conditions.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /\.subscribe\s*\(/g, filePath);
        return matches.length >= 3 ? matches : [];
      },
      fixGuidance:
        'Consolidate subscriptions using combineLatest, forkJoin, or merge operators. ' +
        'Use shareReplay to avoid duplicate HTTP requests. Prefer the async pipe in templates to reduce manual subscriptions.',
    },

    {
      id: 'angular/unhandled-promise',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'Promise Without Error Handling',
      description:
        'A Promise chain without .catch() or a try/catch block around await. Unhandled promise rejections ' +
        'can crash the application or cause silent failures.',
      cweId: 'CWE-754',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const findings = findAllMatches(content, /\.then\s*\([^)]*\)\s*(?!\.catch|\.finally)/g, filePath);
        return findings.filter(f => {
          const lines = content.split('\n');
          const lineIdx = f.line - 1;
          const surroundingLines = lines.slice(Math.max(0, lineIdx - 2), Math.min(lines.length, lineIdx + 3)).join('\n');
          return !/\.catch\s*\(|try\s*\{/.test(surroundingLines);
        });
      },
      fixGuidance:
        'Add .catch() to all Promise chains, or use try/catch with async/await. ' +
        'Consider a global error handler with ErrorHandler to catch unhandled rejections centrally.',
    },

    {
      id: 'angular/switchmap-in-effects',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'switchMap in NgRx Save/Delete Effect (Race Condition)',
      description:
        'Using switchMap in NgRx effects for save, update, or delete actions can cancel in-flight requests ' +
        'if the user triggers the action multiple times, potentially losing data.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        if (!/createEffect|@Effect/i.test(content)) return [];
        return findMultilineMatches(
          content,
          /(?:save|update|delete|remove|create|submit|post|put|patch)\w*\s*[=,][\s\S]{0,200}?switchMap/gi,
        );
      },
      fixGuidance:
        'Use concatMap (preserves order, processes sequentially) or mergeMap (processes in parallel) instead of ' +
        'switchMap for save/delete effects. Reserve switchMap for read operations where only the latest result matters.',
    },

    {
      id: 'angular/nested-subscribe',
      language: 'angular',
      category: 'quality',
      severity: 'medium',
      title: 'Nested .subscribe() Calls',
      description:
        'A .subscribe() callback contains another .subscribe(), creating nested subscriptions. This is an anti-pattern ' +
        'that leads to callback hell, memory leaks, and makes error handling difficult.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findMultilineMatches(
          content,
          /\.subscribe\s*\([^)]*(?:=>|function)\s*[{(][\s\S]*?\.subscribe\s*\(/g,
        ),
      fixGuidance:
        'Replace nested subscribes with RxJS operators: switchMap, mergeMap, concatMap, or exhaustMap. ' +
        'Chain operations in a single pipe() and subscribe only once at the end.',
    },

    {
      id: 'angular/share-replay-missing',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'HTTP Call Without shareReplay',
      description:
        'An HttpClient call is used in a service without shareReplay. If multiple components subscribe to the same ' +
        'method, each subscription triggers a separate HTTP request.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const isService = /@Injectable/.test(content);
        if (!isService) return [];
        const httpCalls = findAllMatches(
          content,
          /this\s*\.\s*http\s*\.\s*(?:get|post|put|delete|patch)\s*[<(]/g,
          filePath,
        );
        return httpCalls.filter(f => {
          const lineContent = content.split('\n')[f.line - 1] || '';
          const nextLines = content.split('\n').slice(f.line - 1, f.line + 4).join('\n');
          return !/shareReplay|share\(\)/.test(lineContent + nextLines);
        });
      },
      fixGuidance:
        'Add .pipe(shareReplay({ bufferSize: 1, refCount: true })) to cacheable HTTP calls. ' +
        'Use refCount: true to unsubscribe from the source when all subscribers disconnect.',
    },

    {
      id: 'angular/first-or-take',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'Missing take(1) or first() on One-Shot Observable',
      description:
        'Subscribing to Router events, ActivatedRoute params, or store selects without take(1)/first() ' +
        'when only the current value is needed can cause unnecessary processing and memory usage.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) => {
        const oneShots = findAllMatches(
          content,
          /(?:this\s*\.\s*(?:route|activatedRoute)\s*\.\s*(?:params|queryParams|data|fragment)|this\s*\.\s*store\s*\.\s*(?:select|pipe))\s*[.(]/g,
          filePath,
        );
        return oneShots.filter(f => {
          const restOfLine = content.split('\n').slice(f.line - 1, f.line + 3).join('\n');
          return !/take\s*\(\s*1\s*\)|first\s*\(\)|firstValueFrom/.test(restOfLine);
        });
      },
      fixGuidance:
        'Add .pipe(take(1)) or .pipe(first()) when only the initial/current value is needed. ' +
        'For async/await patterns, use firstValueFrom() from rxjs.',
    },

    {
      id: 'angular/subject-exposed',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'Public Subject / BehaviorSubject',
      description:
        'A Subject or BehaviorSubject is declared as public, allowing external code to call .next(), .error(), ' +
        'or .complete() on it. Subjects should be private with a public Observable exposed via .asObservable().',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /public\s+\w+\s*(?::\s*|\s*=\s*new\s+)(?:Subject|BehaviorSubject|ReplaySubject|AsyncSubject)/g,
          filePath,
        ),
      fixGuidance:
        'Make the Subject private and expose it as a readonly Observable: ' +
        'private _data$ = new BehaviorSubject<T>(initial); ' +
        'readonly data$ = this._data$.asObservable();',
    },

    // ── Template & Component Bugs (44-50) ────────────────────────────────────

    {
      id: 'angular/template-heavy-computation',
      language: 'angular',
      category: 'quality',
      severity: 'medium',
      title: 'Method Call in Template Expression',
      description:
        'Method calls in template expressions (e.g., {{ getTotal() }}) are re-evaluated on every change detection cycle. ' +
        'This causes performance issues, especially with default change detection strategy.',
      filePatterns: ['*.html'],
      detect: (content, filePath) =>
        findAllMatches(
          content,
          /\{\{\s*\w+\s*\([^)]*\)\s*\}\}/g,
          filePath,
        ),
      fixGuidance:
        'Replace method calls in templates with: (1) pure pipes that Angular caches automatically, ' +
        '(2) computed properties stored in component fields, (3) Angular signals with computed(), ' +
        'or (4) pre-calculated values updated in ngOnChanges or via RxJS.',
    },

    {
      id: 'angular/ngfor-missing-trackby',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: '*ngFor Without trackBy',
      description:
        '*ngFor without trackBy causes Angular to destroy and recreate all DOM elements when the array changes, ' +
        'even if most items are unchanged. This is expensive for large lists.',
      filePatterns: ['*.html'],
      detect: (content, filePath) => {
        const ngForMatches = findAllMatches(content, /\*ngFor\s*=\s*"/g, filePath);
        return ngForMatches.filter(f => {
          const line = content.split('\n')[f.line - 1] || '';
          return !/trackBy\s*:/.test(line);
        });
      },
      fixGuidance:
        'Add trackBy to *ngFor: *ngFor="let item of items; trackBy: trackById". ' +
        'Implement a trackBy function that returns a unique identifier (e.g., item.id). ' +
        'For @for blocks (Angular 17+), use the required track expression.',
    },

    {
      id: 'angular/circular-dependency',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'Potential Circular Dependency',
      description:
        'forwardRef() usage or specific injection patterns that indicate circular dependencies between services or modules. ' +
        'Circular dependencies can cause runtime errors and make the codebase hard to maintain.',
      filePatterns: ['*.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /forwardRef\s*\(\s*\(\)\s*=>/g, filePath),
      fixGuidance:
        'Refactor to break the circular dependency. Common approaches: (1) extract shared logic into a third service, ' +
        '(2) use an event bus or mediator pattern, (3) restructure module boundaries, ' +
        '(4) inject via tokens instead of concrete types.',
    },

    {
      id: 'angular/missing-onpush',
      language: 'angular',
      category: 'quality',
      severity: 'info',
      title: 'Component Without OnPush Change Detection',
      description:
        'A component uses the default change detection strategy. OnPush change detection significantly improves performance ' +
        'by only checking the component when its inputs change or an event occurs.',
      filePatterns: ['*.ts'],
      excludePatterns: ['*.spec.ts', '*.test.ts', 'app.component.ts'],
      detect: (content, filePath) => {
        const componentMatches = findMultilineMatches(
          content,
          /@Component\s*\(\s*\{[^}]*\}\s*\)/g,
        );
        return componentMatches.filter(f => !/changeDetection\s*:\s*ChangeDetectionStrategy\.OnPush/.test(f.matchedCode));
      },
      fixGuidance:
        'Add changeDetection: ChangeDetectionStrategy.OnPush to the @Component decorator. ' +
        'This requires using immutable data patterns and the async pipe for observables in templates. ' +
        'For Angular 17+, consider using signals which work naturally with OnPush.',
    },

    {
      id: 'angular/banana-in-box',
      language: 'angular',
      category: 'bug',
      severity: 'medium',
      title: 'Incorrect Two-Way Binding Syntax',
      description:
        '([ngModel]) instead of the correct [(ngModel)] syntax. The "banana-in-a-box" mnemonic: [( )] — ' +
        'square brackets outside, parentheses inside. The reversed syntax silently fails.',
      filePatterns: ['*.html'],
      detect: (content, filePath) =>
        findAllMatches(content, /\(\[\s*\w+\s*\]\)/g, filePath),
      fixGuidance:
        'Change ([ngModel]) to [(ngModel)]. The correct two-way binding syntax is "banana-in-a-box": [(expression)]. ' +
        'Square brackets on the outside, parentheses on the inside.',
    },

    {
      id: 'angular/unsafe-any-type',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'Excessive "any" Type Usage',
      description:
        'Using the "any" type bypasses TypeScript\'s type system, losing compile-time type checking ' +
        'and enabling bugs that would otherwise be caught at build time.',
      filePatterns: ['*.ts'],
      excludePatterns: ['*.spec.ts', '*.test.ts', '*.d.ts'],
      detect: (content, filePath) => {
        const matches = findAllMatches(content, /:\s*any\b(?!\w)/g, filePath);
        return matches.length >= 3 ? matches : [];
      },
      fixGuidance:
        'Replace "any" with specific types, interfaces, or generics. Use "unknown" when the type is truly not known ' +
        'and narrow it with type guards. Enable the "noImplicitAny" compiler option to catch future occurrences.',
    },

    {
      id: 'angular/console-log-left',
      language: 'angular',
      category: 'quality',
      severity: 'low',
      title: 'console.log Left in Code',
      description:
        'console.log, console.warn, or console.error statements left in production code. These can leak ' +
        'sensitive information and clutter the browser console.',
      filePatterns: ['*.ts'],
      excludePatterns: ['*.spec.ts', '*.test.ts'],
      detect: (content, filePath) =>
        findAllMatches(content, /\bconsole\s*\.\s*(?:log|warn|error|debug|info|trace)\s*\(/g, filePath),
      fixGuidance:
        'Remove console statements or replace them with a proper logging service that can be disabled in production. ' +
        'Consider using a custom ESLint rule (no-console) to prevent future occurrences.',
    },

  ];
}
