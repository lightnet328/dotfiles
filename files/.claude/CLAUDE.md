# General Instructions

## Language
- Always respond in Japanese.
- Write code comments in English.

## Tech Stack
- Language: TypeScript
- Framework: React
- Package manager: bun. Do not use npm or yarn.
- Formatter/Linter: Biome. Use `biome check --write` for formatting and linting.
- Shell: fish

## Coding Style
- Prefer functional components with hooks.
- Use `const` arrow functions for component definitions.
- Prefer named exports over default exports.
- Use strict TypeScript (`strict: true`) and avoid `any`.

## Git
- Commit messages follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`.
- Write commit messages in English.
- Do not commit unless asked.

## Tool Usage
- Prefer Codex MCP (`mcp__codex-cli__codex`) by default.
- For file generation, editing, search, and codebase investigation, consider using Codex first.
- Prefer Codex for large file writes and edits because direct Claude Code writes can stall on streaming timeouts.
- Use direct Read/Write/Edit/Grep-style tools only when Codex is unavailable or clearly not a good fit.

## cmux Workspace
- If `CMUX_WORKSPACE_ID` is set, rename the current cmux workspace near the start of the task.
- Derive the name from the current repository root. Use the repository basename by default, and append the branch name only when it is not `main`, `master`, or `trunk`.
- Use the cmux CLI directly, for example: `cmux rename-workspace --workspace "$CMUX_WORKSPACE_ID" "<name>"`.
- Run the rename again after moving to a different repository root.
- Skip it silently if cmux is unavailable or the rename fails.

## Workflow
- Run `biome check --write` before committing if Biome is configured in the project.
- Run a type check such as `bunx tsc --noEmit` or the project-specific command to verify changes.
- Prefer small, focused changes over large refactors.
