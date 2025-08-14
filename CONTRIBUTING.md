# Contributing to Auggie MCP

Thanks for your interest in contributing! This project uses modern JS/TS, strong linting, and automated tests.

## Ground rules

- Node 24+
- ES modules only
- Arrow functions only (no `function` keyword)
- Keep code safe-by-default; respect env gates (e.g., `AUGGIE_MCP_ALLOW_EXEC`)
- Sandbox file access under repo root

## Development

- Install deps: `npm ci`
- Build: `npm run build`
- Lint: `npm run lint`
- Format check: `npm run format`
- Tests: `npm test`

Pre-commit runs lint-staged to auto-fix staged changes.

## Commit style

- Conventional commits preferred (feat:, fix:, docs:, chore:, refactor:, test:)
- Keep PRs small and focused; include tests

## Pull requests

- Ensure CI is green (build, lint, tests, formatting)
- Update README/docs when changing behavior

## Security

- Never execute external tools unless `AUGGIE_MCP_ALLOW_EXEC=true`
- Validate inputs on network endpoints (e.g., `/stream`)
- Clear intervals/timeouts; avoid leaks

