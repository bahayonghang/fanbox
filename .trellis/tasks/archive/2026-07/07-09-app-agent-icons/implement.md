# Implementation Plan

## Checklist

1. Update `electron/main.js`.
   - Add a helper for resolving existing FanBox icon assets.
   - Set `app.setAppUserModelId('com.huashu.fanbox')` on Windows.
   - Pass the resolved icon path into `BrowserWindow` for Windows/Linux without changing the macOS dock override.
   - Ensure Windows packaged resources include the runtime icon file that `BrowserWindow` probes.

2. Update `public/app.js` Agent launch metadata.
   - Pass the full Agent object from `renderAgentButtons()` into `term.launchAgent`.
   - Normalize `id`, `label`, and `cmd` inside `term.launchAgent`.
   - Store `agentId` and `agentLabel` on the reused or newly created terminal session once the launch is issued.
   - Clear Agent metadata in `respawn(sess)`.

3. Update `public/app.js` tab rendering.
   - Add a small helper for synchronous tab icon HTML with async hydration through the existing `agentIconHtml()` cache.
   - Render Agent icons for sessions with `agentId`.
   - Preserve the existing generic terminal glyph for sessions without `agentId`.

4. Update `public/style.css`.
   - Add fixed sizing for `.term-tab .tab-agent-ic`.
   - Size nested SVG/PNG and fallback abbreviation so compact tabs do not shift or overlap.

5. Update smoke expectations in `scripts/test-conpty-smoke.js`.
   - Keep the launch command contract assertions.
   - Add assertions that the launcher passes Agent metadata and tab rendering consumes `agentId`.

## Validation

- `node --check electron/main.js`
- `node --check public/app.js`
- `node scripts/test-conpty-smoke.js`
- Manual Electron smoke with `just dev`: click Codex and Claude launchers, verify the tab icons and the top-left window icon.
- If packaging verification is needed before release: `npm run dist:win` and inspect the installed/packaged app icon.

## Risk And Rollback

- Risk: packaged Windows icon paths can differ from development paths. Mitigation: use existing assets and fall back when missing; do not block app startup on icon lookup.
- Risk: async icon hydration could cause tab layout jitter. Mitigation: fixed-size tab icon wrapper and fallback rendered immediately.
- Risk: stale Agent identity after process exit. Mitigation: keep the icon while the dead Agent tab is visible, then clear metadata on plain-shell respawn.

Rollback is localized: revert changes in `electron/main.js`, `public/app.js`, `public/style.css`, and `scripts/test-conpty-smoke.js`.
