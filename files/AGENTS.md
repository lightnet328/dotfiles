# Workspace Instructions

- If `CMUX_WORKSPACE_ID` is set, rename the current cmux workspace near the start of the task.
- Derive the workspace name from the current repository root. Use the repository basename by default, and append the branch name only when it is not `main`, `master`, or `trunk`.
- Use the cmux CLI directly, for example: `cmux rename-workspace --workspace "$CMUX_WORKSPACE_ID" "<name>"`.
- Run the rename again after moving to a different repository root or when the work context clearly shifts to another project.
- Skip it silently if cmux is unavailable or the rename fails.

# Tooling Preferences

- For ad-hoc helper scripts and small one-off checks, prefer `bun` with TypeScript over `python3` when feasible.
- Use `python3` only when the repository/tooling already depends on Python or Bun is not suitable.
