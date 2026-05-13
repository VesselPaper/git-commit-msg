# gcmsg

> Smart git commit message generator — works out of the box, no API key required.

```bash
# Generate a commit message from your staged changes
git add .
npx gcmsg

# Or install globally
npm install -g gcmsg
gcmsg
```

## Features

- **Zero config** — no API key, no setup, no AI dependency
- **Smart analysis** — detects change type, scope, and key symbols from your diff
- **Conventional commits** — generates `type(scope): subject` format
- **Interactive workflow** — review before committing
- **Emoji support** — `gcmsg --emoji`
- **PR descriptions** — `gcmsg --pr`

## Usage

```bash
# Stage your changes first
git add <files>

# Generate commit message (interactive)
gcmsg

# Print without prompting
gcmsg --no-edit

# Commit directly
gcmsg --commit

# Add emoji
gcmsg --emoji

# Generate PR description
gcmsg --pr

# Chinese output
gcmsg --lang zh

# See what's being analyzed
gcmsg --diff
```

## Example

```bash
$ gcmsg
3 files · +120 -30
Detected: feat (api)

Generated message:
feat(api): add user authentication endpoint

  ~ src/api/auth.ts (+85 -10)
  ~ src/api/middleware.ts (+25 -12)
  ~ src/types/user.ts (+10 -8)

Use this message to commit? (Y/n)
```

## How It Works

Instead of calling an AI API, gcmsg analyzes your git diff using smart heuristics:

1. **Parses `git diff --cached`** to extract changed files, additions, deletions
2. **Detects commit type** from keywords, file paths, and patterns (feat, fix, refactor, etc.)
3. **Infers scope** from the directory structure
4. **Extracts symbols** (functions, classes, interfaces) from your code
5. **Generates a body** with per-file change summaries

This means it works instantly in any project with zero configuration.

## Output Formats

### Conventional commit (default)
```
feat(api): add user authentication
  ~ src/api/auth.ts (+85 -10)
```

### With emoji
```
✨ feat(api): add user authentication
```

### PR description
```
feat(api): add user authentication

## Summary
3 files changed, +120/-30 lines

## Changes
  ~ src/api/auth.ts (+85 -10)
  ~ src/api/middleware.ts (+25 -12)

## Checklist
- [ ] Tests pass
- [ ] Docs updated (if needed)
```

## Install

```bash
# Run without installing
npx gcmsg

# Global install
npm install -g gcmsg
```

## Requirements

- **Git** — any recent version
- **Node.js** 18+

## License

MIT
