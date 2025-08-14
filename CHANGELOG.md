# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2025-08-14

### Added
- Initial MCP server with:
  - Tools: echo, auggie_version, auggie_help, auggie_call, project_* helpers, auggie_* orchestration (print/continue/run_file/auth/plan/review)
  - HTTP streaming (SSE) with health endpoint and mock mode
  - Safety: repo-root sandboxing, exec gate, validation
- CI workflow (build, lint, format, test)
- Tests: compose helpers, SSE positive/negative, search/read safety
- ESLint (flat) + Prettier + Husky + lint-staged

### Changed
- Refactored to modern JS (arrow functions, ES modules)

### Fixed
- SSE heartbeat interval cleanup and duplicate logic removal
- Path sanitization for auggie_print options

[0.1.0]: https://github.com/rishitank/auggie-mcp/releases/tag/v0.1.0

