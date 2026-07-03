## Scope

This file governs `electron/**`. Root guidance in `../AGENTS.md` still applies.

Before broad search in this subtree, read `./code_map.md`. For repo-wide routing, read `../code_map.md`.

## Local Rules

- Keep Electron main-process behavior in `main.js`; keep renderer exposure in `preload.js`; keep OS-specific logic in `platform/` helpers when it can be tested without launching Electron.
- Preserve `contextIsolation: true` and avoid exposing raw Node primitives to the renderer through preload.
- When adding or changing IPC channels, update both the `ipcMain` handler and the matching preload bridge, then check every renderer call site.
- Keep update behavior platform-aware: Windows package releases and upstream/source releases are separate flows.
- Embedded terminal changes must respect `node-pty` availability and the degraded path where the app still opens without PTY support.
- WeChat bridge code can talk to external services and local credentials; do not log secrets or rewrite persisted account/session data unless the task explicitly covers it.

## Verification

- Platform adapter changes: run the matching `node scripts/test-platform-*.js` file.
- Update flow changes: run `node scripts/test-platform-update.js`.
- Terminal/shell/env changes: run `npm run test:platform`; run `npm run rebuild` first if native PTY compatibility is relevant.
