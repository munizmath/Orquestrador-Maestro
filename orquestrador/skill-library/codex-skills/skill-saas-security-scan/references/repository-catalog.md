# Repository Catalog: Local SaaS Security Scans

Selection date: 2026-05-12.

Use these tools because they are broadly adopted, actively maintained, and useful for SaaS codebases. Re-check release activity before upgrading a pinned CI version.

| Tool | Repository | Purpose | Why selected |
| --- | --- | --- | --- |
| Semgrep | https://github.com/semgrep/semgrep | SAST for application code | Semgrep Community Edition lists 300+ releases and 13k+ GitHub stars. Good fit for TypeScript, Python, API handlers, auth, and framework patterns. |
| Gitleaks | https://github.com/gitleaks/gitleaks | Secret scanning | Widely adopted secret scanner with frequent releases. Use for commits, history, CI logs, and config files. |
| Trivy | https://github.com/aquasecurity/trivy | Filesystem, dependency, container, IaC scanning | Broad scanner for vulnerabilities, misconfiguration, secrets, and containers. Pin actions/releases carefully because scanner supply chain is part of the threat model. |
| OSV-Scanner | https://github.com/google/osv-scanner | Open-source vulnerability matching | Uses OSV data and supports lockfiles and container images. GitHub shows active releases. |
| OWASP Dependency-Check | https://github.com/dependency-check/DependencyCheck | SCA using NVD and ecosystem data | Mature OWASP SCA option, useful as a second opinion for Java/JVM and mixed repos. |

## Invocation preference

1. Prefer local binaries already installed by the project or developer machine.
2. Prefer Docker only when the image is pinned by digest or a trusted project-maintained image is required.
3. Avoid `curl | sh` installers in hooks.
4. In GitHub Actions, pin actions by SHA when possible.
5. Keep commands read-only unless the user separately approves remediation.

## Suggested severity gates

- Local pre-commit: block confirmed secrets.
- Local pre-push: block confirmed high/critical secrets and reproducible high/critical SAST findings.
- Pull request CI: block critical/high findings; allow documented false positives or formal risk acceptance.
- Nightly CI: scan more broadly and create issues instead of blocking emergency work.

## Report fields

Include these fields in final summaries:

- Tool and rule ID.
- Severity using critical/high/medium/low/info.
- Affected file, package, or config.
- Evidence path under `security-reports/`.
- Exploitability or tenant-impact note.
- Recommended fix and whether the gate blocks.
