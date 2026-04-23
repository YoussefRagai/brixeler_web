# Security Scanning

This repo is wired for practical vulnerability checks.

## 1) Dependency + build safety checks

```bash
npm run security:all
```

Runs:
- `npm audit --audit-level=high`
- `npm run lint`
- `npm run build`

## 2) Shannon web/API pentest (staging only)

Shannon is a source-aware web pentesting agent.

Run:

```bash
ANTHROPIC_API_KEY=YOUR_KEY \
TARGET_URL=https://your-staging-admin.example.com \
npm run security:shannon
```

Optional env vars:
- `SCAN_SOURCE_DIR` (default: this repo)
- `OUTPUT_DIR` (default: `security/reports/shannon`)
- `SHANNON_REPO_DIR` (default: `.tools/shannon`)
- `SHANNON_DOCKER_IMAGE` (default: `shannon-local`)

## Notes

- Never run active security scans against production without explicit approval.
- Shannon is best for web/admin/API attack paths.
- For native mobile-specific risks, use the mobile repo security checks in `/Users/youssefragai/Documents/MCP/brixeler-mobile/SECURITY_SCANNING.md`.
