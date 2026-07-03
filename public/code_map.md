# Public Frontend Code Map

Use this map for `public/**` navigation. Behavioral rules live in `public/AGENTS.md`.

## Routing

- `app.js` - main vanilla UI application: file manager, preview/editor, terminal panel, agent launcher, release wizard, settings, snapshots, drag/drop, API calls.
- `style.css` - complete UI styling, layout, themes, terminal/editor/preview presentation.
- `index.html` - static shell and key DOM anchors used by `app.js`.
- `i18n.js` - runtime language switching and DOM translation observer.
- `i18n-dict.js` - translation dictionary and regex translations.
- `assets/agents/` - agent launcher icons keyed by registry id.
- `vendor/xterm/` - terminal UI bundles.
- `vendor/monaco/` - editor bundles.
- `vendor/hljs/`, `vendor/marked/`, `vendor/milkdown/` - preview/rendering bundles.

## Search Anchors

- API helpers: `const api =`, `const apiPost =`
- Agent launcher: `AGENT_REGISTRY`, `AGENT_DEFAULTS`, `renderAgentLaunchers`, `openAgentSettings`
- Terminal UI: `terminal-panel`, `pty:spawn`, `term.open`, `terminal-resizer`
- Update prompt: `bindUpdateNotice`, `window.fanboxUpdate`
- Release wizard: `openReleaseWizard`, `/api/release/inspect`, `/api/release/prepare`
- Preview/editor: `renderPreview`, `monaco`, `milkdown`, `highlight`
- i18n: `setLang`, `window.FANBOX_I18N_DICT`, `MutationObserver`

## Upstream/Downstream Links

- Backend routes are implemented in `../server.js`.
- Electron-only APIs are exposed by `../electron/preload.js` and handled in `../electron/main.js`.
- Agent launcher smoke tests inspect `app.js` from `../scripts/test-conpty-smoke.js`.
- Vendor bundle source entries live in `../src-vendor/`.
