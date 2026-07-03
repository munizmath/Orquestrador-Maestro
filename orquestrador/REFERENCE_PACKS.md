# Reference Packs

Status: opcional
Local sugerido: `{{USER_HOME}}/.orquestrador/private-packs/`

Use reference packs for local-only libraries such as Drive exports, PDFs, private playbooks, internal docs, or study material that should never be shipped in the public snapshot.

## Rules

1. Start from an index, not from a whole folder dump.
2. Read only the pack index first, then only task-relevant files.
3. Do not bulk-load a private library into context.
4. Do not publish pack contents in this repository.
5. Treat client, employer, or copyrighted material as local-only unless the user explicitly confirms redistribution is allowed.

## Suggested Layout

```text
{{USER_HOME}}/.orquestrador/private-packs/
  INDEX.md
  <pack-name>/
    README.md
    sources/
```

## Agent Behavior

- If the user explicitly mentions a private library, Drive export, PDF bundle, or study pack, open `INDEX.md` first.
- If project `DEV/RESEARCH/` or another project doc points to a pack, read that pack index before opening source files.
- Summarize what was used. Do not assume the rest of the pack is relevant.
