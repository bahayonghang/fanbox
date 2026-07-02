# Design

## Architecture

This task should extend the existing frontend settings and agent-launch surfaces instead of adding a parallel settings system.

Primary files:

- `public/index.html`
  - Rename the lower-left `#settings-entry` copy.
  - Keep the same button/entry location.
- `public/app.js`
  - Refactor the current appearance-only settings modal into a page-driven settings modal.
  - Extend agent state loading/saving and effective command resolution.
  - Route `#agent-config` to the agent settings page or otherwise make the new page the canonical place for launch-parameter edits.
- `public/style.css`
  - Reuse and extend existing `.settings-*` styles for the two-page settings layout.
  - Add only scoped classes needed for agent command rows/inputs.
- `server.js`
  - Extend `/api/agents` GET/POST to include UI-managed launch command overrides.
- `scripts/test-conpty-smoke.js`
  - Update static launch command expectations.

## Settings Modal Shape

Introduce a settings page model in `app.js`, for example:

```js
const SETTINGS_PAGES = [
  { id: 'appearance', label: '外观设置' },
  { id: 'agents', label: 'Agents 启动参数设置' },
];
```

`openSettings(pageId = 'appearance')` should:

- close any existing settings overlay;
- render the modal shell once;
- render the left rail from `SETTINGS_PAGES`;
- render content from a page-specific function;
- update active rail state and title when switching pages;
- keep Escape/overlay click/close button behavior.

The existing appearance markup should move behind a `renderAppearanceSettings()` style function. The current theme/font event handlers can stay in the modal-level delegated listeners, guarded by selectors.

## Agent Launch Data Model

Existing config:

- `enabledAgents: string[]`
- `agents: Array<{ id, label?, cmd }>` for advanced manual custom agents

Add a UI-managed config field:

```json
{
  "agentLaunchCommands": {
    "codex": "codex --dangerously-bypass-approvals-and-sandbox"
  }
}
```

Rules:

- Missing `agentLaunchCommands` means use existing defaults.
- Empty or whitespace-only values are not stored and mean "reset to default".
- Values are single-line commands, trimmed and length-capped.
- Valid ids reuse the existing `/^[\w-]{1,32}$/` pattern.
- Effective command precedence:
  1. UI-managed `agentLaunchCommands[id]`
  2. matching `config.agents[]` custom command
  3. built-in registry default
- Existing `config.agents[]` remains supported for manually adding new custom agents.

This intentionally stores the final launch command rather than only args. FanBox currently launches agents by writing a shell command string into the embedded PTY, and custom agents already use full `cmd` strings. Storing the full editable launch value minimizes parsing and preserves compatibility.

## Default Commands

Update Codex in `AGENT_REGISTRY`:

```js
{ id: 'codex', label: 'Codex', cmd: 'codex --dangerously-bypass-approvals-and-sandbox', ... }
```

Claude's existing default remains:

```js
claude --dangerously-skip-permissions
```

Reset behavior should derive from the registry/custom baseline, so Codex reset returns to the YOLO command.

## API Contract

Extend `/api/agents`:

GET response:

```json
{
  "enabled": ["claude", "codex"],
  "custom": [],
  "launchCommands": {
    "codex": "codex --dangerously-bypass-approvals-and-sandbox"
  }
}
```

POST body may include:

```json
{
  "enabled": ["claude", "codex"],
  "launchCommands": {
    "codex": "codex --dangerously-bypass-approvals-and-sandbox"
  }
}
```

Implementation notes:

- Keep accepting the old POST shape `{ enabled }`.
- Only update `enabledAgents` when an `enabled` array is present.
- Only update `agentLaunchCommands` when a commands object is present.
- Use `updateConfig(...)` for writes.
- Return the normalized saved values.

## UI Behavior

Agent settings page should show:

- enabled checkbox for built-in agents, preserving current selection behavior;
- label/icon/install status where practical from existing `agentsPop` logic;
- editable launch command input for CLI agents;
- reset control per command row;
- save/apply behavior that is explicit or immediate, but must make persistence state clear.

Recommended MVP:

- keep checkbox changes immediate, matching existing behavior;
- save command input on blur/Enter or with a visible `保存` action in the page footer;
- reset button clears the override and updates the input to the default command preview.

Use a single modal page rather than nested cards. Inputs should be stable width, single line, and not resize layout while typing.

## Compatibility And Risks

- Old `config.json` without `agentLaunchCommands` must keep working.
- User-provided commands are local trusted configuration, but they still must be escaped in HTML.
- Do not shell-quote or parse command strings in the backend. The current execution model is user command text written into an interactive PTY.
- `scripts/test-conpty-smoke.js` currently searches literal snippets, so update its expectations with the new Codex command.
- Because there is no frontend test framework, final verification relies on syntax checks, platform tests, and Electron/browser smoke.
