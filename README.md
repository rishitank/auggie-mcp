# Auggie MCP

An MCP server that wraps the Auggie CLI for agentic code assistance. It exposes safe, agent-friendly tools for discovery, code search, git insight, and guarded Auggie orchestration.

[![ESLint](https://img.shields.io/badge/code%20style-ESLint%20%2B%20Prettier-blue)](https://eslint.org/)

## Installation

- Requires Node >= 24.5.0
- Install Auggie CLI (optional, to enable Auggie tools):
  - `npm install -g @augmentcode/auggie`

## Scripts

- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm start`

## Environment

- To enable Auggie execution via MCP tools, set:
  - `export AUGGIE_MCP_ALLOW_EXEC=true`

## Tools (MCP)

- echo(text)
- auggie_version
- auggie_help
- auggie_call(args[]) [guarded]
- project_list_md
- project_search_md(query, maxResults?)
- project_search_text(query, globs?, maxResults?)
- project_read_file(path, start?, end?)
- git_status
- git_diff(refA?, refB?, path?)
- auggie_print(instruction, quiet?, compact?, rulesFile?, mcpConfig?)
- auggie_continue(quiet?, compact?)
- auggie_run_file(path, quiet?, compact?)
- auggie_auth(action)
- auggie_plan(goal, paths?, constraints?, includeContents?, inputCapBytes?, quiet?, compact?, rulesFile?, mcpConfig?)
- auggie_review(title?, paths?, diff?, quiet?, compact?)

## Prompts

- hello
- strategy_of_attack
- commit_message(summary, details?, scope?)
- pr_description(title, changes)

## Resources

- app://version
- app://capabilities

## Examples

- Check CLI: `auggie_version`
- Help: `auggie_help`
- One-shot: `auggie_print { instruction: "Summarize staged changes" }`
- Continue: `auggie_continue { quiet: true }`
- Run file: `auggie_run_file { path: "docs/context/README.md" }`
- Auth: `auggie_auth { action: "print-token" }`
- Plan: `auggie_plan { goal: "Upgrade dependency X and fix breakages", paths: ["src/"], includeContents: true }`
- Review: `auggie_review { title: "PR Review", paths: ["src/server.ts"] }`

## Safety

- Auggie execution is disabled by default. Opt-in via `AUGGIE_MCP_ALLOW_EXEC=true`.

## HTTP Streaming (optional)

- Enable with env: `export AUGGIE_MCP_HTTP_PORT=5050`
- POST `/stream`
  - Body: `{ "args": ["--print", "hello", "--compact"], "stdinText": "optional" }`
  - Streamed events: `stdout`, `stderr`, `error`, `end`
- GET `/health` -> `{ ok: true }`

Example:

## Code Style

- Modern JavaScript/TypeScript with ES modules
- Arrow functions only (no `function` keyword)
- ESLint enforces style; Prettier verifies formatting
- Pre-commit runs lint-staged to auto-fix staged changes

Scripts:

- Lint: `npm run lint`
- Check format: `npm run format`
- Format write: `npm run format:fix`

```bash
AUGGIE_MCP_ALLOW_EXEC=true AUGGIE_MCP_HTTP_PORT=5050 npm start &
AUGGIE_MCP_HTTP_PORT=5050 npm run stream:client
```

- File access is sandboxed to repo root.
- Long calls are time-bounded.
