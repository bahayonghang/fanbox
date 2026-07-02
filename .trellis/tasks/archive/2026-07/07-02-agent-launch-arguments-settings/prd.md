# Support custom agent launch arguments settings

## Goal

Make FanBox's lower-left settings entry a general settings center instead of an appearance-only shortcut, and add a first-class settings page for coding agent launch parameters. Users should be able to see and adjust the command/arguments used by one-click agent buttons without manually editing `~/.fanbox/config.json`.

## Background

- The screenshot request shows three product changes:
  - Codex should launch in YOLO mode by default, while still allowing later adjustment.
  - The lower-left sidebar entry should be named `设置`, not `外观设置`.
  - Clicking that entry should open a settings modal with a left sidebar and two pages: `外观设置` and `Agents 启动参数设置`.
- Existing lower-left UI is hard-coded as `外观设置` in `public/index.html:54-57`.
- Existing settings modal is implemented in `public/app.js:1581-1779` as an appearance-only modal. It already has a left rail, but only one `外观` page.
- Existing one-click agent support lives in `public/app.js:2740-2873`.
  - `AGENT_REGISTRY` currently defaults Claude to `claude --dangerously-skip-permissions`.
  - `AGENT_REGISTRY` currently defaults Codex to plain `codex`.
  - `term.launchAgent(a.cmd)` writes the effective command into the active/new PTY session.
  - `/api/agents` currently persists only `enabledAgents`, while `config.json` can manually provide an `agents` array for advanced command overrides.
- Local `codex --help` confirms the YOLO-style Codex flag is `--dangerously-bypass-approvals-and-sandbox`.
- `scripts/test-conpty-smoke.js:183-198` statically checks agent launch command snippets, so changing default Codex launch behavior must update this contract test.

## Requirements

- Rename the lower-left sidebar settings entry:
  - Visible label changes from `外观设置` to `设置`.
  - Subtitle/title copy should describe both appearance and agent settings, not only theme/font.
- Convert the existing settings modal into a two-page settings center:
  - The modal heading should represent global settings, not only appearance.
  - The left rail must contain `外观设置` and `Agents 启动参数设置`.
  - The appearance page must preserve all current theme, Catppuccin, and font behavior.
  - The agent page must let users inspect and edit the launch command or launch arguments for configured one-click agents.
- Codex must default to YOLO mode:
  - The effective default Codex launch command must be `codex --dangerously-bypass-approvals-and-sandbox`.
  - Users can edit that value later from the new agent settings page.
  - Resetting Codex should return to the YOLO default, not plain `codex`.
- Preserve existing agent button behavior:
  - Enabled agent selection continues to work and persists across app restarts.
  - Built-in agents still render before config-only custom agents.
  - A custom config agent can still add a new button or override a built-in label/command.
  - Clicking an agent button still uses the safe existing launch path: empty shell reuse when available, otherwise new terminal tab, then `term.launchAgent(...)`.
- Persist editable launch settings in `~/.fanbox/config.json` through existing config read/write paths.
  - Old config files with only `enabledAgents` and/or `agents` must continue to work.
  - Empty or reset launch command values should fall back to the built-in/default command instead of saving broken empty commands.
- Keep the UI implementation aligned with the repo conventions:
  - Vanilla JS only in `public/app.js`.
  - No new frontend framework, TypeScript, state library, schema library, or build step.
  - Dynamic strings inserted into `innerHTML` must use `escapeHtml`.
  - Visible Chinese copy should be written directly in templates for the existing i18n observer.

## Acceptance Criteria

- [ ] The lower-left sidebar entry visibly reads `设置`, and its supporting text no longer describes only appearance.
- [ ] Clicking the lower-left settings entry opens one modal with a left-side settings rail.
- [ ] The settings rail contains exactly two initial pages: `外观设置` and `Agents 启动参数设置`.
- [ ] The `外观设置` page preserves the current theme buttons, font inputs, reset behavior, and live theme/font application.
- [ ] The `Agents 启动参数设置` page lists one-click coding agents and exposes an editable launch command/argument value for CLI agents.
- [ ] Codex's default launch value is `codex --dangerously-bypass-approvals-and-sandbox`.
- [ ] Editing and saving an agent launch value persists to `~/.fanbox/config.json` and affects the next click on that agent's one-click button.
- [ ] Resetting an edited agent launch value falls back to that agent's current default; Codex resets to YOLO mode.
- [ ] Existing `enabledAgents` behavior still works: disabled built-ins disappear from the terminal toolbar, enabled built-ins appear, and existing user configs do not break.
- [ ] `scripts/test-conpty-smoke.js` is updated so the static agent launch contract matches the new Codex default.

## Out of Scope

- Executing agents through a new backend spawn API. This task should keep the existing PTY command-entry model.
- Adding a full agent marketplace or installer flow.
- Solving platform-specific desktop-app launch commands for app-only agents such as `open -a ...`.
- Adding a formal test framework.

## Open Questions

None blocking. The exact Codex YOLO flag was verified locally with `codex --help`.
