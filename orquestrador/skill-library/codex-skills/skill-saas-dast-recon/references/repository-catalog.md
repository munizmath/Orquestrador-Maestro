# Repository Catalog: Authorized SaaS DAST and Recon

Selection date: 2026-05-12.

Use these tools only for authorized targets. Keep production scans conservative.

| Tool | Repository | Purpose | Why selected |
| --- | --- | --- | --- |
| ZAP by Checkmarx | https://github.com/zaproxy/zaproxy | DAST baseline and passive web app scanning | ZAP describes itself as a widely used open-source web app scanner. Official Docker docs provide stable and weekly images; pin or explicitly approve images before production use. |
| Nuclei | https://github.com/projectdiscovery/nuclei | Template-based vulnerability checks | ProjectDiscovery reports broad adoption and a large contributor base. Use severity and tag filters for safe first passes. |
| Nuclei Templates | https://github.com/projectdiscovery/nuclei-templates | Detection template library | Large community template library with frequent CVE additions. Review tags before running active or intrusive templates. |
| Katana | https://github.com/projectdiscovery/katana | Crawling and endpoint discovery | ProjectDiscovery crawler designed to feed tools like Nuclei and httpx. Keep scope to the provided base URL. |
| httpx | https://github.com/projectdiscovery/httpx | HTTP probing and metadata collection | Good for headers, status, TLS, tech fingerprinting, and live-host filtering. |
| Subfinder | https://github.com/projectdiscovery/subfinder | Passive subdomain enumeration | Use only for owned domains that the user explicitly includes in scope. |

## Default DAST posture

- Use passive and baseline checks before active scans.
- Use Nuclei severity filters: `medium,high,critical` for first pass.
- Limit rate: start at 3 to 5 requests per second unless staging can handle more.
- Keep scope to the given host unless the user explicitly includes subdomains.
- Store evidence under `security-reports/dast/` and report tool versions when available.

## Do not run by default

- Brute-force login checks.
- Destructive fuzzing.
- Exploit templates that modify server state.
- Scans against third-party domains discovered through redirects.
- Production active scans without explicit approval, low rate limits, and a rollback/contact plan.
