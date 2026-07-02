# Settings UI Theme and Font Customization Implementation Plan

## Pre-Implementation Context

Before editing code, load `trellis-before-dev` for the frontend layer. This task touches `public/index.html`, `public/style.css`, and `public/app.js`.

## Checklist

1. Prepare theme metadata in `public/app.js`.
   - Add a `THEMES` array and helpers such as `themeById`, `themeIds`, and `currentThemeMeta`.
   - Replace hard-coded `['terminal', 'warm', 'editorial']` validation in `applyTheme`.
   - Preserve existing fallback behavior for unknown theme IDs.

2. Add Catppuccin CSS theme token blocks in `public/style.css`.
   - Add `catppuccin-latte`, `catppuccin-frappe`, `catppuccin-macchiato`, and `catppuccin-mocha` if scope permits.
   - Keep token names aligned with existing CSS variables.
   - Add any theme-specific body texture override only if it improves readability.

3. Add Monaco Catppuccin themes in `public/app.js`.
   - Extend `mona.themeFor`.
   - Add `defineTheme` calls with Catppuccin editor backgrounds, foregrounds, cursor, selection, and line number colors.

4. Add xterm Catppuccin ANSI themes in `public/app.js`.
   - Extend `term.themes`.
   - Confirm terminal replay uses the same IDs.

5. Add runtime font settings model in `public/app.js`.
   - Add default font token map.
   - Add localStorage parsing for `fb_fonts`.
   - Add sanitization for CSS font-family strings.
   - Add `applyFontPrefs`, `saveFontPrefs`, and `resetFontPrefs`.
   - Update active Monaco and xterm sessions after font changes.
   - Save font preferences automatically from input events after sanitization.

6. Replace the sidebar theme switch with a settings entry in `public/index.html`.
   - Avoid duplicate theme selectors.
   - Keep the entry compact and reachable.

7. Add settings modal rendering and events in `public/app.js`.
   - Render theme tiles from `THEMES`.
   - Render font inputs from the font token map.
   - Add immediate apply and auto-save on font input.
   - Add visible `恢复默认` font reset action.
   - Add Escape and overlay click close behavior.
   - Keep controls semantic and keyboard reachable.

8. Add settings styles in `public/style.css`.
   - Modal shell, section rail, theme tiles, swatches, font rows, footer actions.
   - Use exact transition properties, no `transition: all`.
   - Ensure 40 px minimum hit areas.
   - Use concentric radii for nested surfaces.
   - Add `text-wrap: balance` and `text-wrap: pretty` where useful.

9. Remove or adapt old theme switch event binding.
   - `bindEvents` currently binds `#theme-switch .theme-seg button`.
   - Replace with settings entry binding.
   - Make `applyTheme` still update any quick-switch buttons if future markup exists.

10. Verification.
   - Run `node --check public/app.js`.
   - Run `node --check server.js` if server code changed.
   - Run `npm run check:vendor-patch`.
   - Start the app with `node server.js` or `npm run app`.
   - Manually verify settings open, theme switch, Catppuccin themes, font apply, reset, reload persistence, Monaco editor, xterm session, terminal replay if practical.
   - Verify font input auto-save by typing a font stack, reloading, and checking the value and rendered font remain.

## Rollback Points

- If settings modal introduces regressions, revert only `index.html`, `style.css`, and the new settings/theme/font sections in `app.js`.
- If Catppuccin Monaco colors look poor, keep CSS/xterm themes and temporarily map Monaco to `fb-paper` or `fb-dark` by tone.
- If live font mutation breaks active xterm layout, persist the setting and show a toast that active terminals update on next tab.

## Approval Gate

Do not run `task.py start` or edit production files until the user approves the planning artifacts or explicitly asks to implement.

## Implementation Status

- Completed theme metadata and validation in `public/app.js`.
- Added Catppuccin Latte, Frappe, Macchiato, and Mocha CSS theme token blocks in `public/style.css`.
- Added Catppuccin Monaco and xterm theme mappings.
- Added localStorage-backed font preferences with immediate CSS variable updates and runtime Monaco/xterm refresh.
- Replaced the sidebar skin switch with an app-level Appearance settings entry.
- Added the settings modal with theme tiles, five font inputs, auto-save input behavior, Escape and overlay close, and a visible `恢复默认` action.
- Updated `恢复默认` to reset both appearance theme and custom font overrides.

## Validation Results

- `node --check public/app.js` passed.
- `node --check server.js` passed.
- `npm run check:vendor-patch` passed.
- `git diff --check -- public/app.js public/index.html public/style.css` passed.
- Browser automation against `http://127.0.0.1:4567` verified:
  - Settings entry opens the modal.
  - The modal renders 7 themes and 5 font inputs.
  - Selecting Catppuccin Mocha updates `documentElement.dataset.theme` and `localStorage.fb_theme`.
  - Font input changes immediately update CSS variables and `localStorage.fb_fonts`.
  - Reload restores selected theme, input values, and runtime CSS variables.
  - `恢复默认` resets theme to `warm`, clears `fb_fonts`, clears inline font overrides, and clears inputs.
  - Escape closes the modal.
- Desktop screenshot evidence saved at `settings-modal-desktop.png` in this task directory.
