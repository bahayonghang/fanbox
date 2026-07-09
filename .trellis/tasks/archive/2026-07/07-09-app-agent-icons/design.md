# Design: App And Agent Tab Icons

## Boundaries

- Electron native window identity lives in `electron/main.js`.
- Windows packaging icon configuration already lives in `package.json` and uses `build/icon.ico`.
- Agent launcher metadata, icon asset loading, terminal session state, and tab rendering live in `public/app.js`.
- Tab styling lives in `public/style.css`.
- The smoke contract for agent launch behavior lives in `scripts/test-conpty-smoke.js`.

## Window Icon Approach

Add a small main-process helper that resolves the best app icon path for the current platform:

- `win32`: `build/icon.ico`
- `linux`: `build/icon.png`
- `darwin`: keep the existing `app.dock.setIcon(build/icon.png)` behavior; the window option is not needed for native macOS title bars.

Use the helper when constructing `BrowserWindow` so the window has an explicit `icon` value on Windows. Set `app.setAppUserModelId('com.huashu.fanbox')` on Windows before creating the window so the taskbar/app identity is stable and aligned with `package.json`'s `appId`.

The installed app must not assume `build/` exists inside `app.asar`. Copy the runtime icon files through electron-builder `extraResources`, then let the helper probe both development paths and `process.resourcesPath`.

If an icon file is missing during development, fall back silently rather than preventing app startup.

## Agent Tab Identity Approach

The Agent launcher already has a single source of truth: `AGENT_REGISTRY`, `agentCatalog()`, `activeAgents()`, and `agentIconHtml(id)`. Reuse that instead of adding a second registry.

Change the launch path from command-only to Agent-aware:

1. `renderAgentButtons()` passes the Agent object to `term.launchAgent(a)` rather than only `a.cmd`.
2. `term.launchAgent(agent)` normalizes `id`, `label`, and `cmd`, then finds/reuses/creates the target session exactly as it does today.
3. After a session is available and before/after writing the command, store session metadata such as `agentId` and `agentLabel`.
4. Re-render tabs immediately so the user sees the brand icon at launch time.

Manual shell tabs keep `agentId` empty. `respawn(sess)` should clear Agent metadata because pressing Enter after a dead process starts a plain shell, not the previous Agent command.

## Rendering And Styling

`renderTabs()` remains synchronous. Add a small tab-icon helper:

- if `s.agentId` has a cached icon in `agentIconCache`, render it inside a fixed-size `.tab-agent-ic` wrapper;
- if `s.agentId` is known but the icon is not cached yet, render the fallback abbreviation and kick off `agentIconHtml(s.agentId).then(() => this.renderTabs())`;
- if there is no `agentId`, keep the current colored terminal glyph.

The wrapper should have stable dimensions so async icon hydration does not resize the tab. SVG and PNG icons should share the same CSS sizing. Fallback text should use the existing `.agent-abbr` visual language but be scaled for terminal tabs.

Tab tooltip text can include the Agent label, but the visible tab title should remain the project/cwd title so multi-project scanning still works.

## Compatibility Notes

- This design does not infer Agent identity from process names or terminal output; it only records identity from the launcher click, matching the reported defect.
- Custom Agent ids are already validated by `cleanAgentId`, and command text is already normalized by `cleanAgentCommand`; keep using those helpers.
- Do not add React/TypeScript/state libraries. This is a small extension of existing vanilla JS state.
