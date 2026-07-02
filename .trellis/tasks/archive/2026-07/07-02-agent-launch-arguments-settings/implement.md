# Implementation Plan

## Checklist

- [x] Update the sidebar settings entry copy in `public/index.html`.
- [x] Refactor `openSettings()` in `public/app.js` into a page-aware settings modal.
- [x] Move existing appearance content into a reusable render path and keep existing theme/font handlers working.
- [x] Add an `Agents 启动参数设置` page:
  - [x] render enabled checkboxes for built-in one-click agents;
  - [x] render launch command inputs for CLI agents;
  - [x] support reset-to-default per row;
  - [x] persist command edits through `/api/agents`.
- [x] Update agent state and command resolution:
  - [x] add `agentState.launchCommands`;
  - [x] merge launch command overrides into `activeAgents()`;
  - [x] change Codex default command to `codex --dangerously-bypass-approvals-and-sandbox`;
  - [x] preserve `config.agents[]` custom override/addition behavior.
- [x] Extend `/api/agents` in `server.js`:
  - [x] return normalized `launchCommands`;
  - [x] accept old `{ enabled }` POST bodies;
  - [x] accept new `{ launchCommands }` POST bodies;
  - [x] write through `updateConfig(...)`.
- [x] Update `scripts/test-conpty-smoke.js` static snippets to match the new Codex default.
- [x] Adjust `public/style.css` for agent command rows and two-page modal polish.
- [x] Smoke the running app with DOM checks and `/api/agents` save/read/restore.

## Validation Commands

Run syntax checks for changed JavaScript files:

```bash
node --check public/app.js
node --check server.js
node --check scripts/test-conpty-smoke.js
```

Run existing repo gates:

```bash
npm run test:platform
just check
just test
```

Manual smoke:

```bash
npm run app
```

Manual checks in Electron:

- Lower-left entry reads `设置`.
- Settings modal opens and the left rail switches between `外观设置` and `Agents 启动参数设置`.
- Appearance theme/font changes still apply immediately.
- Codex row shows `codex --dangerously-bypass-approvals-and-sandbox` by default.
- Editing Codex command persists after closing/reopening settings.
- Clicking the Codex terminal button launches the edited command.
- Resetting Codex returns to YOLO mode.

## Risk Points

- `public/app.js` is a large single file; keep edits localized around the existing settings and agent sections.
- The i18n observer expects visible Chinese copy directly in HTML; do not introduce a manual translation function.
- The command input must never insert raw dynamic text into `innerHTML` without `escapeHtml`.
- Changing Codex default will intentionally break the existing static smoke snippet until `scripts/test-conpty-smoke.js` is updated.
- Do not call `task.py start` until these planning artifacts are reviewed and implementation is approved.
