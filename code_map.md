# Repository Code Map

Use this map for navigation and search routing. Behavioral rules live in `AGENTS.md`.

## Top-Level Routing

- `server.js` - local HTTP backend, file operations, config persistence, API routes, static asset serving.
- `server-platform.js` - cross-platform OS helpers used by the backend and Electron shell.
- `electron/` - Electron main process, preload IPC bridge, platform adapters, update checks, embedded terminal lifecycle, WeChat bridge. See `electron/code_map.md`.
- `public/` - vanilla browser UI, styles, i18n, agent launcher registry, terminal/file-management frontend. See `public/code_map.md`.
- `scripts/` - Node-based test, native rebuild, and packaging helper scripts.
- `.github/workflows/windows-build.yml` - Windows CI/build/release workflow; runs `just ci`.
- `.trellis/spec/` - project-specific coding guidelines. Use backend or frontend indexes before editing those layers.
- `.agents/skills/` - repo-local Trellis skills used by agent workflows.
- `.codex/` - Codex project config, hooks, and optional Trellis sub-agent definitions.
- `src-vendor/` - source entries for bundled vendor assets generated into `public/vendor/`.
- `docs/agents/` - issue-tracker, triage-label, and domain-doc configuration for engineering skills.

## Generated, Vendored, and Output Paths

- `node_modules/`, `dist/`, `build/`, `coverage/`, and package-manager caches are not guidance targets.
- `public/vendor/` contains checked-in browser vendor bundles. Only edit when regenerating or patching vendor assets intentionally.
- `.trellis/workspace/` and `.trellis/tasks/archive/` are workflow state/history; do not rewrite casually.

## Command Index

- Install: `npm install`
- Desktop app: `just dev` or `npm run app`
- Lightweight check: `just check`
- Platform tests: `just test` or `npm run test:platform`
- Current-platform build: `just build`
- Full local/CI gate: `just ci`
- Native PTY rebuild: `npm run rebuild`
- Windows package only: `npm run dist:win`

## Search Anchors

- Agent launcher UI: `AGENT_REGISTRY`, `AGENT_DEFAULTS`, `agentLaunchCommands`
- Terminal IPC: `pty:spawn`, `pty:input`, `terminalCwd`, `node-pty`
- Update flow: `update:available`, `update:download`, `platformUpdate.checkUpdates`
- Shell/env helpers: `spawnCommand`, `whichBin`, `fullEnv`, `defaultPtyShell`
- Config persistence: `CONFIG_FILE`, `updateConfig`, `~/.fanbox`
- Release flow: `/api/release/inspect`, `/api/release/prepare`, `test-release-wizard`
- Windows build contract: `windows-build.yml`, `dist:win`, `test-windows-workflow`

## Verification Routing

- Backend/API or platform helper change: run the relevant `node scripts/test-*.js`; for broad impact run `just test`.
- Frontend UI change: run `node --check public/app.js` and test the affected Electron/browser flow manually.
- Electron IPC or terminal change: run `npm run rebuild` when native PTY compatibility is involved, then `npm run test:platform`.
- Packaging or release change: run `just check`, the affected packaging script test, and, when practical, `just build`.
