# 修复 Windows 应用图标和 Agent 终端标签图标

## Goal

Make FanBox's visual identity consistent in the installed Windows desktop app and in the embedded terminal tabs:

- the native window title bar / taskbar should show the FanBox app icon, not Electron/default artwork;
- terminal tabs created through the top-right Agent launcher should show the launched Agent's brand icon, not the generic terminal glyph.

## Background And Evidence

- The user reported two UI defects from a Windows screenshot: the installed app's top-left title-bar icon is wrong, and tabs launched from the Codex/Agent toolbar still show the generic terminal icon.
- `package.json:47-54` already declares the Windows package icon as `build/icon.ico`, but `electron/main.js:49-61` creates the `BrowserWindow` without an explicit `icon` option. Only macOS gets a dev-time dock icon override at `electron/main.js:86-90`.
- Agent launcher metadata and icon loading already exist in `public/app.js:2832-2866`; toolbar buttons use those icons at `public/app.js:2937-2947`.
- `term.launchAgent` currently receives only a command string at `public/app.js:2947` and `public/app.js:3776-3786`, so the terminal session loses the Agent identity.
- New terminal sessions store title/status/cwd but no Agent metadata at `public/app.js:3919-3968`.
- `renderTabs` always renders `ic('term', ...)` at `public/app.js:4338-4351`, which explains why launched Codex/Claude sessions keep the terminal icon.

## Requirements

- R1. Windows native app identity: when FanBox starts in development or from a Windows package, the visible native window icon and taskbar identity must resolve to the FanBox icon asset.
- R2. Existing macOS behavior must remain intact: keep the dock icon override and do not regress packaging icon configuration.
- R3. One-click Agent launch identity: when a user clicks a built-in or configured Agent button, the target terminal session must record that Agent's id and label.
- R4. Terminal tab rendering: sessions launched through an Agent button must display that Agent's existing icon asset in the tab, with a stable fallback abbreviation for custom Agents or missing assets.
- R5. Generic shell behavior remains unchanged: manually opened terminals and commands launched outside the Agent toolbar keep the generic terminal icon.
- R6. Existing tab affordances must remain: status dot, unread state, file-follow eye, tab title, close button, double-click locate, and current terminal layout must continue to work without overlap.
- R7. No new frontend framework, build step, or dependency may be introduced.

## Acceptance Criteria

- [ ] `electron/main.js` explicitly selects the FanBox app icon for Windows/Linux window creation and sets a stable Windows AppUserModelID when appropriate.
- [ ] Clicking the Codex launcher opens/reuses a terminal tab whose tab icon displays the Codex icon from `public/assets/agents/codex.svg`.
- [ ] Clicking the Claude launcher opens/reuses a terminal tab whose tab icon displays the Claude icon from `public/assets/agents/claude.svg`.
- [ ] Custom or missing-icon Agents show a compact text fallback in the same fixed icon slot.
- [ ] Plain terminal tabs still show the generic terminal glyph.
- [ ] Reusing an idle shell for an Agent launch and opening a new tab for an Agent launch both apply the Agent icon.
- [ ] Respawning a dead tab as a plain shell does not leave a stale Agent icon.
- [ ] Visual tab layout remains stable at the compact tab sizes shown in the screenshot; no icon/text/close-button overlap.
- [ ] `node --check electron/main.js`, `node --check public/app.js`, and `node scripts/test-conpty-smoke.js` pass after implementation.

## Out Of Scope

- Redesigning the FanBox app icon artwork itself.
- Auto-detecting Agents that the user manually typed into a plain shell.
- Release publishing, tag pushing, or uploading Windows release assets.
