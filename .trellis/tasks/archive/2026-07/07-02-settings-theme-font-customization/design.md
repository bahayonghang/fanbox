# Settings UI Theme and Font Customization Design

## Scope

Add an app-level settings surface focused on Appearance. The first release covers theme selection, Catppuccin themes, and custom font family settings. It does not introduce a general settings framework, remote sync, font file upload, or OS font enumeration.

## UI Model

Use a modal settings panel rather than another small anchored popover.

Rationale:

- Theme and font controls exceed the current sidebar segmented switch capacity.
- A modal allows a two-column layout: setting groups on the left, live preview or detail controls on the right.
- The existing app already has modal infrastructure patterns via `.input-overlay` and `.input-dialog`.
- The design remains within vanilla JS and CSS variables.

The settings entry should live near the current sidebar bottom controls. The existing compact theme switch should be replaced or converted into an Appearance settings entry to avoid duplicated theme controls.

Recommended modal structure:

- Header: `设置`
- Left rail or section list: initially one section, `外观`
- Theme picker: grouped theme tiles with name, light/dark label, and color swatches.
- Font editor: five labeled inputs plus reset/apply behavior.
- Footer: restore defaults and close.

Controls should use actual `<button>`, `<label>`, and `<input>` elements. Dynamic text entering HTML must be escaped with `escapeHtml`.

## Theme Model

Replace scattered theme literals with shared metadata:

```js
const THEMES = [
  { id: 'warm', label: '档案', tone: 'light', hljs: 'github', monaco: 'fb-paper' },
  { id: 'terminal', label: '终端', tone: 'dark', hljs: 'github-dark', monaco: 'fb-dark' },
  { id: 'editorial', label: '索引', tone: 'light', hljs: 'github', monaco: 'fb-editorial' },
  { id: 'catppuccin-latte', label: 'Latte', family: 'Catppuccin', tone: 'light', hljs: 'github', monaco: 'fb-catppuccin-latte' },
  { id: 'catppuccin-frappe', label: 'Frappe', family: 'Catppuccin', tone: 'dark', hljs: 'github-dark', monaco: 'fb-catppuccin-frappe' },
  { id: 'catppuccin-macchiato', label: 'Macchiato', family: 'Catppuccin', tone: 'dark', hljs: 'github-dark', monaco: 'fb-catppuccin-macchiato' },
  { id: 'catppuccin-mocha', label: 'Mocha', family: 'Catppuccin', tone: 'dark', hljs: 'github-dark', monaco: 'fb-catppuccin-mocha' },
];
```

`applyTheme` should validate against this metadata rather than hard-coded arrays. The selected ID still maps to `document.documentElement.dataset.theme`.

## CSS Tokens

Each new Catppuccin theme gets a `[data-theme="..."]` block in `public/style.css` that sets the existing semantic tokens:

- `--bg`
- `--bg-2`
- `--bg-3`
- `--panel`
- `--border`
- `--rule`
- `--text`
- `--text-dim`
- `--text-faint`
- `--accent`
- `--accent-soft`
- `--accent-ink`
- `--green`
- `--yellow`
- `--radius`
- `--shadow`
- optional font overrides

Catppuccin tokens should be mapped semantically, not copied as raw palette names through the UI. Suggested mapping:

- Accent: mauve for the Catppuccin family.
- Success green: green.
- Warning yellow: yellow.
- Surfaces: base, mantle, crust, surface0 or overlay0 depending on contrast.
- Text: text, subtext1, subtext0 or overlay1.

## Font Model

Keep built-in default font variables in CSS. Add runtime overrides in JS by setting inline style properties on `document.documentElement`:

```js
document.documentElement.style.setProperty('--font-ui', value);
```

Persist user font values in `localStorage['fb_fonts']` as JSON:

```json
{
  "ui": "...",
  "display": "...",
  "mono": "...",
  "term": "...",
  "fname": "..."
}
```

Validation:

- Accept strings up to a conservative length, for example 180 characters.
- Trim whitespace.
- Strip line breaks and semicolons to prevent malformed CSS declarations.
- Do not insert user font strings into HTML except escaped input values.
- Empty value means fall back to the CSS default for that token.

When font settings change:

- Apply CSS variables immediately as the user types.
- Save sanitized font preferences automatically after every input change.
- For Monaco: existing editor instances need `updateOptions({ fontFamily: currentMono })` if available.
- For xterm: existing sessions need `xterm.options.fontFamily = currentTerm` and then fit refresh if practical.
- New Monaco and xterm instances will pick up variables during creation.

The font section must include a visible `恢复默认` button. Activating it clears `localStorage['fb_fonts']`, removes runtime overrides from `document.documentElement.style`, updates active Monaco/xterm sessions, and refreshes the input fields.

## Monaco and Highlight.js

Monaco needs new theme definitions for Catppuccin. Extend `mona.themeFor` and `mona.defineThemes`.

Highlight.js can continue to use the existing bundled `github.min.css` for light themes and `github-dark.min.css` for dark themes. A custom Catppuccin highlight.js stylesheet is out of scope unless visual mismatch is unacceptable during validation.

## xterm

Extend `term.themes` with Catppuccin ANSI palettes. Use the theme selected at spawn time as before, and keep `term.retheme()` for active sessions.

Terminal recording already stores theme IDs. Export/replay should keep working if `term.themes[themeId]` exists.

## Design Quality Notes

Applied `design-taste-frontend` selectively:

- This is product UI, not a landing page. Avoid hero, bento, animated marketing patterns.
- Use one visual language, one radius rule, and theme-aware semantic variables.
- Avoid decorative gradients and fake screenshots.

Applied `make-interfaces-feel-better`:

- Use concentric radius for modal shell and nested surfaces.
- Use explicit transition properties only.
- Add `scale: 0.96` press feedback to settings buttons where it does not distract.
- Keep modal entry and exit subtle.
- Use `text-wrap: balance` for short settings headings and `text-wrap: pretty` for helper copy.
- Use tabular numbers only for numeric values if any are added later.
- Ensure controls have at least 40 px hit area.
- Use explicit button press feedback for `恢复默认` and `关闭`, with `scale: 0.96`.

## Compatibility

- Existing `fb_theme` values must continue to load.
- Unknown theme values should fall back to `terminal`, matching current defensive behavior.
- Existing CSS selectors for `terminal`, `warm`, and `editorial` must remain valid.
- No vendor files should be modified.

## Out of Scope

- Uploading or bundling custom font files.
- Enumerating installed system fonts.
- Per-project theme or font settings.
- Syncing settings between browsers or machines.
- Adding a full settings backend API unless a later requirement needs shared persistence.
