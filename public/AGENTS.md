## Scope

This file governs `public/**`. Root guidance in `../AGENTS.md` still applies.

Before broad search in this subtree, read `./code_map.md`. For repo-wide routing, read `../code_map.md`.

## Local Rules

- App code is vanilla JavaScript, HTML, and CSS. Do not introduce React, Vue, TypeScript, Vite, webpack, or a new frontend build step unless the task explicitly calls for an architecture change.
- `app.js` uses top-level state, render functions, delegated events, `api`/`apiPost`, and Electron bridge objects exposed by `electron/preload.js`.
- Escape dynamic HTML with the existing helpers before inserting strings into `innerHTML`.
- Keep i18n compatible with `public/i18n.js` and `public/i18n-dict.js`; do not add a separate translation framework.
- `public/vendor/` contains checked-in vendor bundles. Do not edit it by hand unless regenerating or intentionally patching vendor assets.
- Agent launcher changes must keep `AGENT_REGISTRY`, `AGENT_DEFAULTS`, assets under `public/assets/agents/`, settings persistence, and ConPTY smoke expectations aligned.

## Verification

- Syntax check changed JS with `node --check public/app.js` and, when relevant, `node --check public/i18n.js`.
- Agent launcher or terminal UI changes should also run `node scripts/test-conpty-smoke.js`.
- For UI behavior changes, test the affected flow in the Electron app with `just dev`.
