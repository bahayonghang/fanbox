# Electron Code Map

Use this map for `electron/**` navigation. Behavioral rules live in `electron/AGENTS.md`.

## Routing

- `main.js` - Electron app lifecycle, window creation, menus, power guards, update prompts, IPC handlers, embedded terminal lifecycle, recording/export, file watching, WeChat IPC.
- `preload.js` - safe renderer bridge for terminal, update, clipboard, window, recording, and WeChat APIs.
- `platform/shell.js` - executable lookup, command spawning, default PTY shell selection.
- `platform/env.js` - login-shell/user environment construction and PATH normalization.
- `platform/power.js` - stay-awake and lid-close behavior.
- `platform/clipboard.js` - platform clipboard/file-copy behavior.
- `platform/screenshot.js` - screenshot watcher.
- `platform/update.js` - release/source update detection and asset selection.
- `wechat/bridge.js` - WeChat integration orchestration and local state.
- `wechat/driver.js` - bridge between terminal/file context and WeChat operations.
- `wechat/ilink.js` - network API client for iLink endpoints.
- `wechat/memory.js` - local WeChat memory persistence.
- `wechat/test-server.js` - local test helper server for WeChat bridge behavior.

## Search Anchors

- IPC handlers: `ipcMain.handle(`, `ipcMain.on(`
- Renderer bridge: `contextBridge.exposeInMainWorld`
- Terminal lifecycle: `pty:spawn`, `terminals`, `recEvent`, `terminalCwd`
- Updates: `checkUpdate`, `updatePayload`, `platformUpdate.checkUpdates`, `update:download`
- Power guard: `refreshLidGuard`, `powerSaveBlocker`, `wechatStayAwake`
- WeChat integration: `ensureWechat`, `wechatBridge`, `ilink`

## Downstream Links

- Renderer callers are mostly in `../public/app.js`.
- Backend helpers shared with Electron live in `../server-platform.js`.
- Tests for this subtree live in `../scripts/test-platform-*.js`, `../scripts/test-conpty-smoke.js`, and `../scripts/test-windows-workflow.js`.
