# Quality Guidelines

> 零运行时依赖、单文件后端、本机回环。质量靠「最小、可审计、贴合既有惯例」三件事，而不是靠测试矩阵。

---

## Overview

`package.json` `dependencies` 只有运行时刚需（`@xterm/*`、`node-pty`、`qrcode`）——**后端 (`server.js`) 零依赖**，只用 Node 内置模块。质量标准围绕这一前提：

1. 能用内置模块就不加依赖。
2. 单文件结构，不拆分（见 directory-structure.md）。
3. 行为贴合既有惯例（错误兜底、原子写 config、预览端口隔离）。

**没有 lint 配置文件、没有测试框架、没有 CI 跑 lint/test**——目前未引入。子代理改代码**必须保持语法能跑**（`node -c server.js` / `node --check`），不引入新依赖、不动 `package.json` 依赖清单。

---

## Forbidden Patterns

- ❌ 引入运行时依赖到后端（`npm i ...`）——后端保持零依赖。新能力优先用内置（`http`/`fs/promises`/`crypto`/`child_process`）。
- ❌ 拆 `server.js` 成多文件，或引入 routes/services 分层——有意单文件。
- ❌ 绕过 `updateConfig` 直接写 `config.json`（见 database-guidelines.md）。
- ❌ 静默吞写 config 失败（见 error-handling.md）。
- ❌ 给本机回环服务加 CORS 中间件框架——本项目手写 `hostAllowed`/`originAllowed` 两个守卫（`server.js:1973`），不引框架。
- ❌ 让 `/api` 路由进 `previewServer`——预览服务刻意只放 `/fs/`，`/api` 是危险面（删文件、开应用），严禁泄漏到预览端口（`server.js:2156` 注释）。

---

## Required Patterns

- ✅ 新路由走顶层 try/catch 兜底，业务函数 `throw` 中文 `Error`。
- ✅ 写配置走 `updateConfig(mutator)` 原子写。
- ✅ 新静态资源端点考虑是否该放 `previewServer` 而非主 server（看是否是用户内容预览）。
- ✅ 文件路径入口走 `resolvePath(p)`（`server.js:92`）——它做 `~`/绝对化/`\0` 拒绝，新入口别绕过它直接拼路径。
- ✅ `'use strict';` 在每个 JS 文件顶部（`server.js:8`、`electron/preload.js:4` 上半部、`public/app.js:2`）——沿用。
- ✅ 中英文混排注释：注释是中文口语（人话），代码标识符是英文，二者间留空格。

## Scenario: Windows Packaging And CI Command Contract

### 1. Scope / Trigger

- Trigger: packaging or CI work that changes `package.json`, `justfile`, `.github/workflows/*`, or tracked build resources.
- Keep this as command orchestration only. Do not add backend runtime dependencies or split `server.js` for build convenience.

### 2. Signatures

- `npm run check:vendor-patch`: Node-based check for the patched xterm IME key path. It must run on both Windows and macOS.
- `npm run predist` and `npm run predist:win`: both delegate to `npm run check:vendor-patch`.
- `npm run dist`: macOS package entry, remains `electron-builder --mac`.
- `npm run dist:win`: Windows package entry, remains `electron-builder --win`.
- `npm run rebuild`: wrapper around `@electron/rebuild` for `node-pty`; on Windows it may retry only `MSB8040` Spectre-library failures with an explicit MSBuild `/p:SpectreMitigation=false` fallback.
- `just check`, `just test`, `just build`, `just build-mac`, `just build-win`, `just ci`: repo-level cross-platform gates.

### 3. Contracts

- `build.win.icon` points to tracked `build/icon.ico`; `.gitignore` must explicitly allow it.
- `build.win.target` produces both `nsis` and `zip` artifacts.
- `just build-win` runs `npm run rebuild` before `npm run dist:win` so `node-pty` is rebuilt for Electron.
- Windows CI calls `npm ci` and then `just ci`; CI must not duplicate a separate hand-written build sequence.
- `package.json` overrides Electron rebuild's bundled `@electron/node-gyp` with upstream `node-gyp@12.2.0` so Visual Studio 2026 / VS 18 is recognized while keeping `@electron/rebuild` 3.x and Node 20 CI compatibility.
- The rebuild wrapper must first try upstream `electron-rebuild`. It may use the non-Spectre MSBuild fallback only for Windows `MSB8040` when the selected VS instance has no `VC/Tools/MSVC/*/lib/spectre` directory.

### 4. Validation & Error Matrix

- xterm patch missing -> `npm run check:vendor-patch` fails before packaging.
- Invalid `package.json` -> `just check` fails during JSON parse.
- Missing or ignored `build/icon.ico` -> Windows package config is incomplete; fix `.gitignore` and the icon asset before CI.
- `npm run rebuild` fails with `unknown version "undefined"` on VS 2026 -> the npm override is missing or stale; refresh `package-lock.json` and confirm `node_modules/@electron/node-gyp` resolves to upstream `node-gyp@12.2.0`.
- `npm run rebuild` fails with `MSB8040` and no fallback -> the wrapper failed to detect the Spectre-library case or `node-pty` did not generate `build/binding.sln`; inspect `scripts/rebuild-node-pty.js` before changing upstream native module files.
- macOS `dist` no longer equals `electron-builder --mac` -> packaging regression.

### 5. Good/Base/Bad Cases

- Good: `just ci` is the single CI entry and dispatches to the platform build recipe.
- Base: `just check` and `just test` pass even while no formal test framework exists.
- Bad: CI runs `npm run dist:win` directly without `npm run rebuild`, or removes the native build override without proving VS 18 support still works.

### 6. Tests Required

- `just --list` shows all expected recipes.
- `just check` and `just test` pass on the current platform.
- `just --dry-run build` shows the platform-specific build sequence.
- A Node config probe confirms `dist`, `dist:win`, `build.mac`, `build.dmg`, and `build.win`.
- `git check-ignore -v build/icon.ico` confirms the icon is whitelisted.
- GitHub Actions on `windows-2022` must upload `dist/*.exe` and `dist/*.zip` for final Windows artifact proof.

### 7. Wrong vs Correct

#### Wrong

```json
"check:vendor-patch": "grep -q '20===e.keyCode||229===e.keyCode' public/vendor/xterm/xterm.js"
```

`grep` is not a stable Windows command in this repo's npm scripts.

#### Correct

```json
"check:vendor-patch": "node -e \"const fs=require('fs');const s=fs.readFileSync('public/vendor/xterm/xterm.js','utf8');if(!s.includes('20===e.keyCode||229===e.keyCode')){console.error('xterm vendor patch missing');process.exit(1)}\""
```

Use Node for cross-platform npm script checks, and let `just` orchestrate platform-specific build steps.

---

## Scenario: Windows Agent Platform Shell/Env Contract

### 1. Scope / Trigger

- Trigger: changes to agent process launch, CLI discovery, GUI-started environment rebuilding, or proxy/home variables in `electron/platform/*`, `electron/wechat/driver.js`, or agent CLI checks in `server.js`.
- This is an infra boundary. Keep it zero-runtime-dependency and Node-built-in only.
- Do not expand this scenario into unrelated OS command migrations such as disk usage, archive, thumbnails, Spotlight, or update channels.

### 2. Signatures

- `spawnCommand(bin, args, options) -> Promise<Result>` launches a command with argv, stdin, env, cwd, idle timeout, max timeout, and optional stdout line callback.
- `whichBin(bin, options) -> Promise<string|null>` returns an absolute launch path or `null`.
- `defaultPtyShell(env, platform) -> { shellPath, shellArgs }` returns the node-pty login-shell choice for embedded terminal sessions.
- `fullEnv() -> Promise<NodeJS.ProcessEnv>` returns the merged child environment used by agent processes.
- `electron/wechat/driver.js` keeps `which(bin) -> Promise<boolean>`, `runClaude(...)`, and `runCodex(...)` as the public driver surface.

### 3. Contracts

- Agent prompts go through stdin, not command strings.
- Claude/Codex options are argv array entries. Persona text with quotes, newlines, or Chinese must be passed as one argv value or stdin content, never shell-quoted into a command string.
- Windows child env must preserve `USERPROFILE`, `HOME`, `APPDATA`, `LOCALAPPDATA`, and a working `Path`/`PATH` value so Claude/Codex credentials and user-level npm shims remain discoverable.
- `fullEnv()` may supplement proxy variables from OS settings only when no proxy env is already present; explicit env values win.
- `whichBin()` must prefer direct PATH/PATHEXT search on Windows and may use `where.exe` only as fallback. On macOS, the login-shell `command -v` fallback is allowed to preserve Finder/Dock startup behavior.
- `defaultPtyShell()` owns the embedded-terminal shell switch: Windows gets `powershell.exe` with no login args; macOS/Linux use `$SHELL` or `/bin/zsh` with `['-l']`.
- `electron/main.js` must call `defaultPtyShell()` for node-pty spawn and should not inline `/bin/zsh`, PowerShell, or login-shell args.
- Windows `.cmd` and `.bat` shims are not spawned directly. They must be launched through `cmd.exe /d /s /c` with `windowsVerbatimArguments: true`.

### 4. Validation & Error Matrix

- Windows `.cmd` shim spawned directly with `shell:false` -> `EINVAL` or missing launch; wrap it with `cmd.exe /d /s /c`.
- Prompt/persona shell-quoted into one command string -> broken quotes/newlines or injection risk; pass argv plus stdin.
- GUI PATH lacks user npm/global shim dirs -> `whichBin('claude'/'codex')` returns `null`; merge Windows PATH keys and add known user-level dirs.
- Existing `http_proxy`/`https_proxy` overwritten by OS proxy fallback -> user-selected proxy is lost; only fill proxy vars when none are set.
- Missing home/app data vars -> Claude/Codex cannot find credentials; normalize `USERPROFILE`/`HOME` without deleting `APPDATA`/`LOCALAPPDATA`.
- Timeout kills only the shell wrapper on Windows -> child agent survives; use process-tree kill for timed out Windows commands.

### 5. Good/Base/Bad Cases

- Good: `runClaude()` passes `['-p', '--output-format', 'stream-json', '--append-system-prompt', persona]` and writes the user prompt to stdin.
- Good: `whichBin('codex')` returns an absolute `.exe`, `.cmd`, `.bat`, or `.com` path from the merged GUI-safe env.
- Base: macOS still uses shell env dump and `scutil --proxy`; only CLI discovery may fall back to `command -v` in a login shell.
- Bad: `spawn(loginShell(), ['-lc', cmd])` for agent work, PowerShell `-lc`, or POSIX `shq()` escaping inside the agent driver.

### 6. Tests Required

- Syntax: `node --check electron/platform/env.js electron/platform/shell.js electron/wechat/driver.js server.js`.
- Unit-style platform scripts: `npm run test:platform`.
- Repo gates: `just check` and `just test`.
- Review grep: `rg -n "spawn\\(loginShell|\\['-lc'|shq\\(|command -v|/bin/zsh|/bin/sh" electron\wechat electron\platform server.js`.
- Windows smoke: `whichBin('node')`, `whichBin('claude')`, `whichBin('codex')`, `whichBin('git')`, and `whichBin('gh')` in the GUI-style env.
- Agent smoke: `spawnCommand('claude', ['--version'])`, `spawnCommand('codex', ['--version'])`, and at least one real `codex exec`/Claude stream-json request when local credentials and network allow it.

### 7. Wrong vs Correct

#### Wrong

```js
const cmd = `claude -p --append-system-prompt ${shq(persona)}`;
spawn(loginShell(), ['-lc', cmd], { shell: false });
```

This assumes a POSIX shell and breaks on Windows, especially under PowerShell.

#### Correct

```js
const args = ['-p', '--append-system-prompt', persona];
await spawnCommand('claude', args, { stdinText: userPrompt, env: await fullEnv() });
```

Use argv and stdin for agent execution. If `whichBin()` resolves a Windows `.cmd` or `.bat` shim, `spawnCommand()` must internally launch:

```js
spawn('cmd.exe', ['/d', '/s', '/c', '""C:\\path\\tool.cmd" "arg with spaces""'], {
  shell: false,
  windowsVerbatimArguments: true,
});
```

---

## Scenario: Windows ConPTY Smoke Test Contract

### 1. Scope / Trigger

- Trigger: changes to Windows embedded terminal smoke tests, `node-pty` / ConPTY validation, or automated checks for agent launch commands in `scripts/*`.
- This is a quality/testing boundary. Keep automated checks deterministic and local; do not start real Claude/Codex TUI sessions from a platform test.

### 2. Signatures

- `node scripts/test-conpty-smoke.js` runs the Windows PTY smoke matrix.
- `npm run test:platform` includes the ConPTY smoke script after the pure adapter tests.

### 3. Contracts

- Non-Windows platforms print a clear skip message and exit 0.
- Windows requires `node-pty`; if the native module is unavailable, fail with a message telling the user to run `npm run rebuild`.
- PowerShell and cmd are required shell cases. Git Bash is optional: verify it when discoverable, otherwise print skipped.
- Each PTY shell case writes a lightweight command, validates both `process.cwd()` and a unique marker, then sends `exit`.
- Agent launch coverage is a static UI contract check against `public/app.js` snippets such as `term.launchAgent('claude --dangerously-skip-permissions')` and `term.launchAgent('codex')`. Do not write real agent commands into a PTY in automated tests.
- On Windows ConPTY, successful tests may still leave internal `node-pty` handles alive. After all assertions pass, the smoke script may call `process.exit(0)` to keep the platform test from hanging.

### 4. Validation & Error Matrix

- `node-pty` missing or not rebuilt -> fail the smoke script; embedded terminal would also be unavailable.
- PowerShell or cmd missing -> fail; these are required Windows terminal baselines.
- Git Bash missing -> skip, because Git Bash is optional user environment.
- UI launch command snippet changed -> fail, because the static contract no longer matches the launcher behavior being guarded.
- Calling `pty.kill()` on the success path -> may fork `conpty_console_list_agent` and print `AttachConsole failed` on Windows; avoid it unless handling timeout/failure cleanup.
- Waiting only for `onExit` -> may hang the Node test process; assert on output and keep an explicit successful process exit path.

### 5. Good/Base/Bad Cases

- Good: the smoke writes `Write-Output (Get-Location).Path`, `echo FANBOX_CONPTY_CMD_OK`, or `pwd -W`, validates output, sends `exit`, and ends with `process.exit(0)` after all cases pass.
- Base: timeout/failure paths may still call `pty.kill()` to avoid orphaning a failed case.
- Bad: a test writes `claude`, `codex`, or `claude --dangerously-skip-permissions` into a live PTY; that can start interactive agents, spawn MCP helpers, or hang on credentials/network.

### 6. Tests Required

- Syntax: `node --check scripts/test-conpty-smoke.js`.
- Smoke: `node scripts/test-conpty-smoke.js` on Windows shows PowerShell, cmd, optional Git Bash, and agent launch contract results.
- Platform gate: `npm run test:platform`.
- Repo gates: `just check` and `just test`.
- Residual process check when debugging hangs: search for `scripts\test-conpty-smoke.js` processes before rerunning.

### 7. Wrong vs Correct

#### Wrong

```js
term.write('codex\r');
term.kill();
```

This can start a real TUI agent and trigger `node-pty` ConPTY cleanup noise on Windows.

#### Correct

```js
term.write('echo FANBOX_CONPTY_CMD_OK\r\nexit\r\n');
// After all smoke cases and static UI contract checks pass:
process.exit(0);
```

Keep the PTY smoke focused on shell I/O, and verify agent launcher command text without executing the agent.

---

## Scenario: Server System Command Adapter Contract

### 1. Scope / Trigger

- Trigger: changes to disk usage, archive preview, thumbnails, HEIC transcoding, file opening, terminal cwd lookup, backend command detection, or Spotlight / content search.
- These OS-specific backend capabilities belong in `server-platform.js`, not directly in `server.js` or `electron/main.js`.
- Keep the adapter zero-runtime-dependency and Node-built-in/system-command only.

### 2. Signatures

- `diskUsage(dir, deps) -> Promise<{ ok, dir?, total?, items?, more?, partial?, error? }>`
- `archiveList(file, deps) -> Promise<{ ok, entries?, truncated?, unsupported?, error? }>`
- `generateThumb(src, ext, size, cacheFile, isImg, deps) -> Promise<void>`
- `transcodeHeic(src, cacheFile, deps) -> Promise<void>`
- `openInOS(target, withApp, deps) -> Promise<{ ok, with?, error? }>`
- `commandExists(bin, deps) -> Promise<boolean>`
- `terminalCwd(pid, deps) -> Promise<string|null>`
- `contentSearch(query, rootPath, deps) -> Promise<{ results, truncated?, engine? }>`
- `findByName(name, deps) -> Promise<string[]>`
- `trashPath(path, deps) -> Promise<{ ok, error? }>`
- `curlSystemProxyLine(deps) -> Promise<string>`

`deps` is the boundary for server-owned helpers such as `resolvePath`, `grepFiles`, and `kindOf`; do not import `server.js` from the adapter.

### 3. Contracts

- `server.js` owns HTTP routing, `resolvePath` entry validation, thumbnail cache response streaming, and API response shape.
- `server-platform.js` owns platform switches and direct system command calls (`du`, `unzip`, `tar`, `gzip`, `sips`, `qlmanage`, `mdfind`, `lsof`, `open`, `start`, `xdg-open`, trash commands, and macOS `scutil` proxy probing for curl).
- macOS branches preserve the existing system-command behavior when moved into the adapter.
- Windows branches must either provide an equivalent Node/system implementation or return a clear degraded result (`unsupported`, `null`, or a thrown thumbnail/transcode error that the existing caller maps to 415).
- Zip preview must keep the central-directory reader and UTF-8/GBK filename decoding before any system fallback.
- `server.js` may keep thin wrappers such as `trashPath()` and `openInOS()`, but those wrappers must delegate to `serverPlatform`.

### 4. Validation & Error Matrix

- Windows large directory traversal exceeds budget -> return partial results with `partial: true`, not a hung request.
- Unsupported archive format on Windows -> `{ ok:false, unsupported:true, error:"Windows 暂不支持预览该压缩格式" }`.
- Thumbnail or HEIC generation unsupported -> throw a Chinese user-facing error; `serveThumb` / `serveHeicAsJpeg` converts it to the existing 415 response.
- Windows terminal cwd unavailable -> `terminalCwd()` returns `null`; IPC callers return `{ ok:false }` and UI falls back.
- `mdfind` unavailable or empty on macOS -> call `grepFiles()` and return `engine:"grep"`.
- Trash target missing -> `{ ok:false, error:"文件不存在" }`; invalid path -> `{ ok:false, error:"非法路径" }`.
- macOS curl proxy fallback reads system proxy only when proxy env vars are absent; Windows/Linux return an empty curl config line.

### 5. Good/Base/Bad Cases

- Good: `server.js` has a thin `contentSearch()` wrapper that calls `serverPlatform.contentSearch(query, root, { resolvePath, grepFiles, kindOf })`.
- Good: `server.js` has a thin `trashPath()` wrapper that calls `serverPlatform.trashPath(path, { resolvePath })`.
- Good: `electron/main.js` calls `terminalCwd(pid)` and keeps the existing `{ ok:true,cwd }` / `{ ok:false }` IPC shape.
- Base: `server-platform.js` may contain direct system commands; review grep should find them there.
- Bad: `server.js` directly calls `execFile('sips')`, `execFile('mdfind')`, `execFile('unzip')`, `execFile('du')`, calls `scutil`, embeds trash commands, or embeds `lsof -a` logic again.

### 6. Tests Required

- Syntax: `node --check server-platform.js server.js electron/main.js`.
- Unit-style platform tests: `npm run test:platform` must include `scripts/test-server-platform.js`.
- Repo gates: `just check` and `just test`.
- Review grep: `rg -n "du -sk|execFile\\('mdfind'|execFile\\('sips'|execFile\\('qlmanage'|execFile\\('unzip'|lsof -a" server.js electron\main.js` should not match.
- PAC grep: direct OS command strings in business files (`server.js`, `electron/main.js`, `electron/wechat/*`) should be absent except comments/user-facing labels; adapter files and tests may contain the platform commands they own.
- Smoke when possible: hit `/api/du`, `/api/archive`, `/api/content`, and `/api/thumb` on a temporary local server.

### 7. Wrong vs Correct

#### Wrong

```js
async function contentSearch(query, rootPath) {
  const paths = await mdfind(['-onlyin', rootPath, query]);
  return paths.length ? { results: paths } : grepFiles(query, rootPath);
}
```

This keeps a macOS-only command in `server.js` and makes future Windows work scatter across the business file.

#### Correct

```js
async function contentSearch(query, rootPath) {
  return serverPlatform.contentSearch(query, rootPath, {
    platform: process.platform,
    resolvePath,
    grepFiles,
    kindOf,
  });
}
```

Keep HTTP/API ownership in `server.js`, but put platform branching and system commands in `server-platform.js`.

---

## Scenario: Electron macOS-Exclusive Capability Adapter Contract

### 1. Scope / Trigger

- Trigger: changes to Electron desktop capabilities that were originally macOS-only: power/lid wake behavior, file clipboard, screenshot watching, or the IPC payloads consumed by `public/app.js`.
- These platform branches belong in `electron/platform/{power,clipboard,screenshot}.js`, not inline in `electron/main.js`.
- Keep the adapter zero-runtime-dependency. Prefer Electron built-ins or existing system commands; do not add ffi/native packages for an MVP fallback.

### 2. Signatures

- `platformPower.refreshPowerGuard(ctx) -> { ok, supported, platform, mode?, active, want?, unsupported?, reason? }`
- `platformPower.powerState(ctx) -> { ok, supported, platform, mode?, stayAwake, active, unsupported?, reason? }`
- `platformPower.cleanupPowerGuard(ctx) -> boolean`
- `platformClipboard.copyImage(filePath, deps) -> { ok, error? }`
- `platformClipboard.copyFile(filePath, deps) -> Promise<{ ok, mode?, error? }>`
- `platformScreenshot.startShotWatch(ctx) -> { ok, supported, watching, platform, reason? }`
- IPC keeps `wechat:setStayAwake({ on })`, `wechat:powerState()`, `clip:file({ path })`, and the existing `shot:new` event.

### 3. Contracts

- `electron/main.js` owns user intent (`lidIntent`, `wechatStayAwake`), connection state (`wechatConnected`), config persistence, menu rebuilds, and IPC response composition.
- `electron/platform/power.js` owns native power behavior:
  - macOS uses the existing `pmset disablesleep` + sudoers + AppleScript admin prompt flow.
  - Windows uses Electron `powerSaveBlocker.start('prevent-display-sleep')` with `mode:"powerSaveBlocker"` and no admin prompt.
  - Unsupported platforms return `supported:false`, `unsupported:true`, and `reason:"unsupported-platform"`; never return a bare `"macOS only"` string.
- `clip:file` returns `mode:"file-object"` on macOS and `mode:"path-text"` for Windows/Linux path-text fallback.
- `screenshot.startShotWatch()` returns structured unsupported/no-op on non-macOS and must not throw during app startup.
- Frontend consumers must only update capability support from a boolean `supported` field. A caught IPC failure such as `{}` must not make a hidden/unsupported button visible.

### 4. Validation & Error Matrix

- Windows WeChat stay-awake enabled -> start `powerSaveBlocker`; no sudoers, `pmset`, `osascript`, or admin prompt.
- Windows WeChat disconnected while intent is on -> keep user intent but report `active:false`; reconnect can activate without another prompt.
- Linux/unsupported platform -> `{ ok:false, supported:false, unsupported:true, reason:"unsupported-platform" }`; UI hides or disables the control and may toast the unsupported reason.
- macOS first enable without sudoers -> show the existing admin prompt; user cancel returns `cancelled` or `setup-cancelled`.
- `clip:file` on Windows/Linux -> write the path text and return `mode:"path-text"`; do not claim real file-object clipboard support.
- `clip:file` on macOS -> pass the path through AppleScript argv, not by string interpolation.
- Non-macOS screenshot startup -> return `{ ok:true, supported:false, watching:false }`; no watcher and no startup error.

### 5. Good/Base/Bad Cases

- Good: `electron/main.js` calls `platformPower.powerState(powerContext(...))` and only spreads a structured payload into IPC responses.
- Good: `public/app.js` branches copy-file text by `r.mode`, and power controls by `supported === true`.
- Base: Windows file clipboard copies a path string; later `CF_HDROP` work can replace only the adapter branch while preserving the IPC `mode` contract.
- Bad: `electron/main.js` directly returns `{ ok:false, error:"macOS only" }`, calls `execFile('osascript')` for all platforms, or hardcodes UI visibility from `platform === "darwin"` when the backend already exposes `supported`.

### 6. Tests Required

- Syntax: `node --check electron/platform/power.js electron/platform/clipboard.js electron/platform/screenshot.js electron/main.js public/app.js`.
- Unit-style platform tests: `npm run test:platform` must include power and clipboard adapter tests.
- Repo gates: `just check`, `just test`, and `npm run check:vendor-patch`.
- Review grep: `rg -n "macOS only" electron public` should not match user-facing IPC errors.
- Review grep: `rg -n "pmset|visudo|fanbox-pmset|osascript" electron/main.js electron/platform` should find macOS-only commands only in platform adapters.
- Manual smoke when possible: Windows stay-awake toggle has no admin prompt, Windows copy-file copies path text, macOS Finder file paste and screenshot watch still work.

### 7. Wrong vs Correct

#### Wrong

```js
ipcMain.handle('wechat:setStayAwake', async () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'macOS only' };
  execFile('osascript', ['-e', `set the clipboard to (POSIX file "${p}")`]);
});
```

This leaks macOS capability assumptions through IPC and interpolates paths into platform scripts.

#### Correct

```js
ipcMain.handle('wechat:powerState', () => powerStatePayload());
ipcMain.handle('clip:file', (e, { path: p }) =>
  platformClipboard.copyFile(p, { platform: process.platform, clipboard }));
```

The adapter owns platform branching and returns a payload with `supported`, `unsupported`, `reason`, and `mode` fields that the UI can consume without guessing.

---

## Scenario: Electron Update Channel Adapter Contract

### 1. Scope / Trigger

- Trigger: changes to update checking, release-channel environment variables, GitHub release queries, update IPC payloads, or `public/app.js` update notice rendering.
- Update logic belongs in `electron/platform/update.js`; `electron/main.js` owns scheduling, dialogs, IPC state, and GitHub URL opening policy.
- This is a cross-layer contract: GitHub release data -> platform adapter -> Electron IPC -> vanilla JS update pill.

### 2. Signatures

- `checkUpstream(opts) -> Promise<{ kind:"source", repo, tag, version, url } | null>`
- `checkRelease(opts) -> Promise<{ kind:"release", repo, tag, version, url, assetName?, pageUrl? } | null>`
- `checkUpdates(opts) -> Promise<{ checked, latestUpstream, latestRelease, upstream, release, primary }>`
- `cmpVer(a, b) -> number`
- IPC keeps `update:available`, `update:get`, and `update:open`; `window.fanboxUpdate` remains `onAvailable(cb)`, `get()`, and `open(url)`.

### 3. Contracts

- `FANBOX_UPSTREAM_REPO` defaults to `alchaincyf/fanbox` and represents source/upstream releases.
- `FANBOX_RELEASE_REPO` defaults to `bahayonghang/fanbox` and represents Windows binary package releases; setting it to an empty string disables the release channel.
- Windows binary release tags use `v<base>-win.<n>` (for example `v2.3.3-win.1`) to mean the nth Windows package for upstream/base version `v<base>`.
- Release comparison treats `x.y.z-win.N` as newer than plain `x.y.z` for the same base version, and compares `N` numerically; a higher base version still wins over any lower-base Windows revision.
- Windows `primary` update prefers `release` over `source`; macOS `primary` must only use upstream/source.
- Windows binary downloads must come from GitHub release assets ending in `.exe` or `.zip`; `.exe` wins over `.zip`; `.dmg` must never be used for Windows download prompts.
- API failures may fall back to `https://github.com/<repo>/releases/latest` redirects for upstream/source checks. Release-channel install prompts require API asset evidence; redirect-only release fallback is not enough.
- Update payloads must preserve old `version` and `url` fields and may add `kind`, `repo`, `assetName`, `title`, `action`, and `secondary`.
- `update:open` stays restricted to `https://github.com/` URLs.

### 4. Validation & Error Matrix

- GitHub API returns only `.dmg` assets for the release repo -> no Windows package prompt; fall back to source if applicable.
- `FANBOX_RELEASE_REPO=""` -> no release query, no error, upstream-only behavior.
- Upstream API fails but `releases/latest` redirect exposes a tag -> source prompt still works.
- Both release and upstream are newer on Windows -> release is primary and upstream appears as a separate secondary action; do not merge the meanings.
- Latest Windows release tag is `v2.3.3-win.1` and the app version is `2.3.3` -> Windows release prompt appears; if the app version is already `2.3.3-win.1`, it does not repeat.
- No network / rate limit for every queried channel -> manual check shows the existing user-facing GitHub failure dialog; automatic check retries later.

### 5. Good/Base/Bad Cases

- Good: `electron/main.js` calls `platformUpdate.checkUpdates({ net, env: process.env, platform: process.platform, currentVersion: app.getVersion() })` and renders dialogs from the returned `primary` payload.
- Good: `public/app.js` branches update notice text by `kind` and stores skip state as `<kind>:<version>`.
- Base: macOS sees the same source-release behavior as before, with no Windows package noise.
- Bad: `electron/main.js` hardcodes `api.github.com/repos/alchaincyf/fanbox/releases/latest`, or Windows update UI opens a generic release page that might contain only `.dmg`.

### 6. Tests Required

- Syntax: `node --check electron/platform/update.js electron/main.js electron/preload.js public/app.js`.
- Platform tests: `npm run test:platform` must include `scripts/test-platform-update.js`.
- Assertions must cover `.exe` preferred over `.zip`, `.dmg` rejected, empty `FANBOX_RELEASE_REPO` disabled, macOS upstream-only primary, Windows release-first primary, and upstream redirect fallback.
- Assertions must cover Windows release suffix ordering: `v2.3.3-win.1 > 2.3.3`, `v2.3.3-win.2 > v2.3.3-win.1`, and `v2.3.4 > v2.3.3-win.9`.
- Release wizard tests must cover Windows channel command generation: `npm run dist:win`, `gh release create vX-win.N`, and `.exe` / `.zip` asset globs; source/macOS release stays on `npm run dist` and `.dmg`.
- Repo gates: `just check` and `just test`.
- Review grep: `rg -n "api\\.github\\.com/repos/alchaincyf/fanbox|REL_PAGE" electron public scripts package.json` should find hardcoded upstream API only inside update adapter tests, not in `electron/main.js`.

### 7. Wrong vs Correct

#### Wrong

```js
const res = await net.fetch('https://api.github.com/repos/alchaincyf/fanbox/releases/latest');
pendingUpdate = { version: rel.tag_name, url: rel.html_url };
```

This treats source releases and Windows packages as the same channel.

#### Correct

```js
const result = await platformUpdate.checkUpdates({
  net,
  env: process.env,
  platform: process.platform,
  currentVersion: app.getVersion(),
});
pendingUpdate = updatePayload(result.primary, result.upstream);
```

The adapter owns repo selection and asset filtering; `main.js` only schedules checks and presents the returned payload.

---

## Testing Requirements

**No formal test framework.** The project still does not use Jest/Vitest or a lint framework. Use the real repo gates that exist, not invented test commands:

- `node --check server.js`（语法）。
- `node --check <changed-js-files>` for Electron/platform scripts.
- `npm run test:platform` for the platform shell/env adapter.
- `just check` and `just test` for repo-level checks.
- `node server.js` 启动，浏览器访问 `http://localhost:4567` 验证改动功能。
- Electron：`npm run app`。

If a formal test framework is introduced later, update this section with the real command and assertion scope.

---

## Code Review Checklist

- [ ] 改动是否新增了运行时依赖？后端不该有。
- [ ] 新路由是否落入顶层 try/catch？写 config 是否走 `updateConfig`？
- [ ] 路径入口是否走 `resolvePath`？危险 `/api` 是否误泄到 `previewServer`？
- [ ] 错误消息是否中文人话、是否在关键写路径上静默吞错？
- [ ] 是否保持单文件结构、未拆分、未引入分层？
- [ ] 是否保持中英文间空格、`'use strict'`？
