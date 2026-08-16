# Council Protocol

Use external agents for bounded, cheap, or repetitive work. Codex keeps final architecture, safety, and integration judgment.

## Delegation Packet

```md
TASK:
One sentence only.

CONTEXT:
Only relevant snippets, summaries, paths, symbols, and constraints.

CONSTRAINTS:
- Do not modify unrelated files.
- Do not invent APIs.
- Prefer minimal diff.
- State assumptions explicitly.
- Return only actionable output.

OUTPUT REQUIRED:
1. Summary
2. Files changed
3. Patch/diff or commands
4. Tests run
5. Risks/uncertainties
6. Confidence score from 0 to 1
```

## Verification

Before using delegated output, verify it solves the actual task, follows project conventions, avoids unrelated files, avoids invented APIs, includes appropriate tests, and does not create security or data risks.
