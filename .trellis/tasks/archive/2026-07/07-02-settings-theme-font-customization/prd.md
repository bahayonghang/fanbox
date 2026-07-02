# Settings UI theme and font customization

## Goal

Add an Appearance settings surface to FanBox so users can choose built-in themes, including Catppuccin light and dark variants, and customize the font families used by the main UI, display text, monospace editors, terminal, and file names.

The feature should feel native to the existing cockpit UI: compact, repeat-use friendly, and consistent with FanBox's current vanilla JavaScript and CSS variable theme system.

## Confirmed Facts

- FanBox frontend is a vanilla single page app served from `public/`, with no React, TypeScript, Tailwind, Vite, or frontend module bundling.
- Existing theme state lives in `public/app.js` as `state.theme`, initialized from `localStorage['fb_theme']`.
- Existing theme application is centralized in `applyTheme(skin, rerender)`, which sets `document.documentElement.dataset.theme`, persists `fb_theme`, swaps highlight.js CSS, rethemes xterm and Monaco, and rerenders file icons.
- Existing CSS theme tokens live in `public/style.css` under `[data-theme="terminal"]`, `[data-theme="warm"]`, and `[data-theme="editorial"]`.
- Existing font tokens live in `:root` as `--font-ui`, `--font-display`, `--font-mono`, `--font-term`, and `--font-fname`.
- Monaco reads `--font-mono` when creating editor instances.
- xterm reads `--font-term` when creating terminal instances and has separate ANSI theme objects in `term.themes`.
- Markdown rich editing via Crepe consumes CSS font variables through `--crepe-font-default`, `--crepe-font-title`, and `--crepe-font-code`.
- The current sidebar has a compact theme switch in `public/index.html` with three built-in skins.
- Agent launcher settings already use an anchored popover, but this request needs broader app settings than that local control.
- User-facing strings should be written directly in Chinese and translated by the existing i18n MutationObserver when possible.
- The requested design skills apply as design guidance, but `design-taste-frontend` explicitly does not target dense product UI. For this task, only its brief inference, anti-default discipline, contrast, shape, and audit rules apply.

## Design Read

Reading this as a dense desktop developer-tool settings UI for repeat use, with a quiet native-control language, leaning toward the existing vanilla CSS variable system.

Design dials:

- DESIGN_VARIANCE: 4, because this is an app settings panel, not a marketing page.
- MOTION_INTENSITY: 2, because settings should feel stable and fast, with only interruptible hover, press, and modal transitions.
- VISUAL_DENSITY: 7, because this is a cockpit UI where users need scanability without oversized presentation.

## Requirements

- Add an app-level settings entry that opens a settings interface without relying on browser prompts or external dependencies.
- Move or duplicate theme configuration into the settings interface so users can select all supported themes from one place.
- Add Catppuccin-related light and dark themes. The minimum accepted set is one light and one dark Catppuccin theme.
- Keep existing themes available unless explicitly removed later.
- Persist selected theme across reloads.
- Add user-customizable font family inputs for:
  - UI font, backed by `--font-ui`
  - Display font, backed by `--font-display`
  - Monospace editor font, backed by `--font-mono`
  - Terminal font, backed by `--font-term`
  - File name font, backed by `--font-fname`
- Persist font preferences across reloads.
- Provide a reset path for font settings.
- Font family inputs must apply immediately as the user types and save automatically.
- Font settings must include a visible `恢复默认` action that clears custom font preferences.
- Apply font changes immediately to normal UI and newly created Monaco or xterm instances.
- Retheme active Monaco and xterm sessions when the selected theme changes.
- Keep the implementation inside the existing `public/index.html`, `public/style.css`, and `public/app.js` architecture.
- Do not add React, TypeScript, Tailwind, a design system package, or a new state management dependency.
- Preserve accessibility basics: keyboard close for the settings surface, focusable controls, visible focus state, readable contrast, and hit areas of at least 40 px for primary interactive controls.
- Avoid `transition: all`; settings interactions should specify the exact properties they animate.
- Avoid em-dashes in visible copy.

## Acceptance Criteria

- [ ] A visible settings entry opens a settings panel or modal.
- [ ] The settings UI includes theme controls and font controls in one coherent Appearance area.
- [ ] Selecting any existing theme still works.
- [ ] Selecting Catppuccin light and Catppuccin dark themes updates the whole app surface, file icons, markdown/code highlighting, Monaco theme, and xterm ANSI colors consistently.
- [ ] Theme selection persists after reload.
- [ ] Changing a font family updates CSS variables immediately and persists after reload.
- [ ] Font changes auto-save without a separate save button.
- [ ] Clicking `恢复默认` clears custom font preferences and restores the built-in defaults immediately.
- [ ] Font inputs are escaped and stored as plain CSS font-family strings, with no HTML injection path.
- [ ] Existing quick workflows such as file browsing, preview, Monaco editing, and terminal launch still work after settings changes.
- [ ] `node --check public/app.js` passes.
- [ ] `node --check server.js` passes if server code changes.
- [ ] `npm run check:vendor-patch` still passes.
- [ ] Manual browser or Electron verification covers: open settings, switch themes, set fonts, reset fonts, reload, open editor, open terminal.

## Notes

- Planning assumption: include all four official Catppuccin flavors if scope permits: Latte, Frappe, Macchiato, and Mocha. At minimum ship Latte and Mocha.
- Planning assumption: font preferences can remain renderer-local in `localStorage`, matching existing theme persistence. Persisting them into `~/.fanbox/config.json` is not required unless cross-browser or Electron menu access becomes a requirement.
