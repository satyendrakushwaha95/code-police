import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DependencyFinding, DependencyAuditResult, FindingSeverity } from './scan-types';
import { v4 as uuid } from 'uuid';

const AUDIT_TIMEOUT = 60_000;

export class DependencyAuditor {

  async auditProject(projectRoot: string, scanId: string): Promise<DependencyAuditResult[]> {
    const results: DependencyAuditResult[] = [];

    const npmResult = await this.auditNpm(projectRoot, scanId);
    if (npmResult) results.push(npmResult);

    const composerResult = await this.auditComposer(projectRoot, scanId);
    if (composerResult) results.push(composerResult);

    const mavenResult = await this.auditMaven(projectRoot, scanId);
    if (mavenResult) results.push(mavenResult);

    return results;
  }

  private async auditNpm(projectRoot: string, scanId: string): Promise<DependencyAuditResult | null> {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return null;

    const findings: DependencyFinding[] = [];
    let totalPackages = 0;
    let rawOutput = '';

    try {
      const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      totalPackages = Object.keys(pkgJson.dependencies || {}).length +
                      Object.keys(pkgJson.devDependencies || {}).length;
    } catch { /* ignore */ }

    try {
      rawOutput = execSync('npm audit --json 2>&1', {
        cwd: projectRoot,
        timeout: AUDIT_TIMEOUT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      rawOutput = err.stdout || err.stderr || '';
    }

    try {
      const audit = JSON.parse(rawOutput);

      if (audit.vulnerabilities) {
        for (const [pkg, info] of Object.entries(audit.vulnerabilities) as any[]) {
          const severity = this.normalizeSeverity(info.severity);
          const via = Array.isArray(info.via) ? info.via : [];
          const firstVia = via.find((v: any) => typeof v === 'object') || {};

          findings.push({
            id: uuid(),
            scanId,
            packageName: pkg,
            currentVersion: info.range || undefined,
            fixedVersion: info.fixAvailable?.version || undefined,
            severity,
            cveId: firstVia.cve || undefined,
            description: firstVia.title || info.title || `Known vulnerability in ${pkg}`,
            ecosystem: 'npm',
          });
        }
      } else if (audit.advisories) {
        for (const [, advisory] of Object.entries(audit.advisories) as any[]) {
          findings.push({
            id: uuid(),
            scanId,
            packageName: advisory.module_name,
            currentVersion: advisory.findings?.[0]?.version || undefined,
            fixedVersion: advisory.patched_versions || undefined,
            severity: this.normalizeSeverity(advisory.severity),
            cveId: advisory.cves?.[0] || undefined,
            description: advisory.title || advisory.overview,
            ecosystem: 'npm',
          });
        }
      }
    } catch {
      // npm audit output was not valid JSON — possibly no lockfile
    }

    return {
      ecosystem: 'npm',
      findings,
      totalPackages,
      auditCommand: 'npm audit --json',
      rawOutput: rawOutput.slice(0, 5000),
    };
  }

  private async auditComposer(projectRoot: string, scanId: string): Promise<DependencyAuditResult | null> {
    const composerJsonPath = path.join(projectRoot, 'composer.json');
    if (!fs.existsSync(composerJsonPath)) return null;

    const findings: DependencyFinding[] = [];
    let totalPackages = 0;
    let rawOutput = '';

    try {
      const composerJson = JSON.parse(fs.readFileSync(composerJsonPath, 'utf-8'));
      totalPackages = Object.keys(composerJson.require || {}).length +
                      Object.keys(composerJson['require-dev'] || {}).length;
    } catch { /* ignore */ }

    try {
      rawOutput = execSync('composer audit --format=json 2>&1', {
        cwd: projectRoot,
        timeout: AUDIT_TIMEOUT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      rawOutput = err.stdout || err.stderr || '';
    }

    try {
      const audit = JSON.parse(rawOutput);
      const advisories = audit.advisories || {};

      for (const [pkg, advList] of Object.entries(advisories) as any[]) {
        if (!Array.isArray(advList)) continue;
        for (const adv of advList) {
          findings.push({
            id: uuid(),
            scanId,
            packageName: pkg,
            currentVersion: adv.affectedVersions || undefined,
            fixedVersion: undefined,
            severity: this.normalizeSeverity(adv.severity || 'medium'),
            cveId: adv.cve || undefined,
            description: adv.title || adv.advisoryId || `Vulnerability in ${pkg}`,
            ecosystem: 'composer',
          });
        }
      }
    } catch {
      // composer audit not available or output invalid
    }

    return {
      ecosystem: 'composer',
      findings,
      totalPackages,
      auditCommand: 'composer audit --format=json',
      rawOutput: rawOutput.slice(0, 5000),
    };
  }

  private async auditMaven(projectRoot: string, scanId: string): Promise<DependencyAuditResult | null> {
    const pomPath = path.join(projectRoot, 'pom.xml');
    if (!fs.existsSync(pomPath)) return null;

    const findings: DependencyFinding[] = [];
    let totalPackages = 0;

    try {
      const pomContent = fs.readFileSync(pomPath, 'utf-8');
      const depMatches = pomContent.match(/<dependency>/g);
      totalPackages = depMatches ? depMatches.length : 0;

      const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
      let match: RegExpExecArray | null;

      while ((match = depRegex.exec(pomContent)) !== null) {
        const groupId = match[1];
        const artifactId = match[2];
        const version = match[3];
        const pkg = `${groupId}:${artifactId}`;

        const knownVuln = this.checkKnownMavenCVE(groupId, artifactId, version);
        if (knownVuln) {
          findings.push({
            id: uuid(),
            scanId,
            packageName: pkg,
            currentVersion: version,
            fixedVersion: knownVuln.fixedVersion,
            severity: knownVuln.severity,
            cveId: knownVuln.cve,
            description: knownVuln.description,
            ecosystem: 'maven',
          });
        }
      }
    } catch {
      // pom.xml parse failed
    }

    return {
      ecosystem: 'maven',
      findings,
      totalPackages,
      auditCommand: 'pom.xml static analysis',
    };
  }

  private checkKnownMavenCVE(
    groupId: string,
    artifactId: string,
    version: string
  ): { severity: FindingSeverity; cve: string; description: string; fixedVersion: string } | null {
    const key = `${groupId}:${artifactId}`;
    const entry = KNOWN_MAVEN_CVES[key];
    if (!entry) return null;

    for (const vuln of entry) {
      if (this.isVersionAffected(version, vuln.affectedBelow)) {
        return {
          severity: vuln.severity,
          cve: vuln.cve,
          description: vuln.description,
          fixedVersion: vuln.affectedBelow,
        };
      }
    }
    return null;
  }

  private isVersionAffected(current: string, fixedVersion: string): boolean {
    try {
      const currentParts = current.replace(/[^0-9.]/g, '').split('.').map(Number);
      const fixedParts = fixedVersion.replace(/[^0-9.]/g, '').split('.').map(Number);

      for (let i = 0; i < Math.max(currentParts.length, fixedParts.length); i++) {
        const c = currentParts[i] || 0;
        const f = fixedParts[i] || 0;
        if (c < f) return true;
        if (c > f) return false;
      }
      return false;
    } catch {
      return false;
    }
  }

  private normalizeSeverity(raw: string): FindingSeverity {
    const lower = (raw || '').toLowerCase();
    if (lower === 'critical') return 'critical';
    if (lower === 'high') return 'high';
    if (lower === 'moderate' || lower === 'medium') return 'medium';
    if (lower === 'low') return 'low';
    return 'info';
  }
}

const KNOWN_MAVEN_CVES: Record<string, Array<{
  cve: string;
  severity: FindingSeverity;
  description: string;
  affectedBelow: string;
}>> = {
  'org.apache.logging.log4j:log4j-core': [
    { cve: 'CVE-2021-44228', severity: 'critical', description: 'Log4Shell: Remote code execution via JNDI lookup in log messages', affectedBelow: '2.17.1' },
    { cve: 'CVE-2021-45046', severity: 'critical', description: 'Log4j DoS and RCE via Thread Context patterns', affectedBelow: '2.17.0' },
  ],
  'org.springframework:spring-web': [
    { cve: 'CVE-2022-22965', severity: 'critical', description: 'Spring4Shell: RCE via data binding on JDK 9+', affectedBelow: '5.3.18' },
  ],
  'org.springframework:spring-core': [
    { cve: 'CVE-2022-22965', severity: 'critical', description: 'Spring4Shell: RCE via ClassLoader manipulation', affectedBelow: '5.3.18' },
  ],
  'com.fasterxml.jackson.core:jackson-databind': [
    { cve: 'CVE-2020-36518', severity: 'high', description: 'Denial of Service via deeply nested JSON', affectedBelow: '2.13.2.1' },
    { cve: 'CVE-2019-14540', severity: 'critical', description: 'Polymorphic deserialization RCE via HikariCP', affectedBelow: '2.10.0' },
  ],
  'org.apache.struts:struts2-core': [
    { cve: 'CVE-2017-5638', severity: 'critical', description: 'Remote code execution via Content-Type header', affectedBelow: '2.5.11' },
  ],
  'commons-collections:commons-collections': [
    { cve: 'CVE-2015-6420', severity: 'critical', description: 'Unsafe deserialization allowing RCE via InvokerTransformer', affectedBelow: '3.2.2' },
  ],
  'org.apache.commons:commons-text': [
    { cve: 'CVE-2022-42889', severity: 'critical', description: 'Text4Shell: RCE via StringSubstitutor interpolation', affectedBelow: '1.10.0' },
  ],
  'org.springframework.security:spring-security-core': [
    { cve: 'CVE-2022-22978', severity: 'high', description: 'Authorization bypass via RegexRequestMatcher', affectedBelow: '5.6.4' },
  ],
  'com.google.guava:guava': [
    { cve: 'CVE-2020-8908', severity: 'low', description: 'Temp directory creation with default permissions', affectedBelow: '32.0.0' },
  ],
  'org.yaml:snakeyaml': [
    { cve: 'CVE-2022-1471', severity: 'critical', description: 'Unsafe deserialization via Constructor', affectedBelow: '2.0' },
  ],
  'io.netty:netty-codec-http': [
    { cve: 'CVE-2022-24823', severity: 'medium', description: 'HTTP request smuggling via abnormal Transfer-Encoding', affectedBelow: '4.1.77' },
  ],
  'org.apache.tomcat.embed:tomcat-embed-core': [
    { cve: 'CVE-2023-28708', severity: 'medium', description: 'Information disclosure via partial PUT requests', affectedBelow: '10.1.8' },
  ],
};

let instance: DependencyAuditor | null = null;
export function getDependencyAuditor(): DependencyAuditor {
  if (!instance) instance = new DependencyAuditor();
  return instance;
}
