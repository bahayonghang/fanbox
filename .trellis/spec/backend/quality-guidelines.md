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
- `just check`, `just test`, `just build`, `just build-mac`, `just build-win`, `just ci`: repo-level cross-platform gates.

### 3. Contracts

- `build.win.icon` points to tracked `build/icon.ico`; `.gitignore` must explicitly allow it.
- `build.win.target` produces both `nsis` and `zip` artifacts.
- `just build-win` runs `npm run rebuild` before `npm run dist:win` so `node-pty` is rebuilt for Electron.
- Windows CI calls `npm ci` and then `just ci`; CI must not duplicate a separate hand-written build sequence.
- Pin Windows CI to `windows-2022` while the current Electron/node-gyp toolchain rejects Visual Studio 2026 / VS 18.

### 4. Validation & Error Matrix

- xterm patch missing -> `npm run check:vendor-patch` fails before packaging.
- Invalid `package.json` -> `just check` fails during JSON parse.
- Missing or ignored `build/icon.ico` -> Windows package config is incomplete; fix `.gitignore` and the icon asset before CI.
- `npm run rebuild` fails on VS 2026 with `unknown version "undefined"` -> use `windows-2022` CI or install VS 2022 Build Tools locally; do not paper over this by changing runtime code.
- macOS `dist` no longer equals `electron-builder --mac` -> packaging regression.

### 5. Good/Base/Bad Cases

- Good: `just ci` is the single CI entry and dispatches to the platform build recipe.
- Base: `just check` and `just test` pass even while no formal test framework exists.
- Bad: CI runs `npm run dist:win` directly without `npm run rebuild`, or uses `windows-latest` before the native rebuild toolchain supports VS 18.

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
- `fullEnv() -> Promise<NodeJS.ProcessEnv>` returns the merged child environment used by agent processes.
- `electron/wechat/driver.js` keeps `which(bin) -> Promise<boolean>`, `runClaude(...)`, and `runCodex(...)` as the public driver surface.

### 3. Contracts

- Agent prompts go through stdin, not command strings.
- Claude/Codex options are argv array entries. Persona text with quotes, newlines, or Chinese must be passed as one argv value or stdin content, never shell-quoted into a command string.
- Windows child env must preserve `USERPROFILE`, `HOME`, `APPDATA`, `LOCALAPPDATA`, and a working `Path`/`PATH` value so Claude/Codex credentials and user-level npm shims remain discoverable.
- `fullEnv()` may supplement proxy variables from OS settings only when no proxy env is already present; explicit env values win.
- `whichBin()` must prefer direct PATH/PATHEXT search on Windows and may use `where.exe` only as fallback. On macOS, the login-shell `command -v` fallback is allowed to preserve Finder/Dock startup behavior.
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
