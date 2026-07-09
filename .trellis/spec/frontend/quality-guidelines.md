# Quality Guidelines

> 前端质量靠**贴合既有 vanilla JS 惯例**维持，没有 lint/test 框架强制。改动要能让 `node --check` 与浏览器实际运行通过，且不显得「换了一套范式」。

---

## Overview

`app.js` 是单体 vanilla JS。无 ESLint 配置文件、无 Prettier 配置、无单元测试框架、无 CI lint/test。质量约定：

1. 不引框架/构建器/类型系统。
2. 渲染走 `innerHTML` + `escapeHtml`，事件走委托 + `data-*`。
3. 与后端通信用 `api`/`apiPost`，与主进程通信用 `window.fanbox*` IPC。

**子代理改代码后必须能跑**：在浏览器或 Electron 中实测改动功能；引入对 `server.js` 的 fetch 改动时配 `node --check server.js`。不引新依赖、不动 `package.json`（除非 vendor 构建确有必要）。

---

## Forbidden Patterns

- ❌ 引入 React/Vue/Svelte/JSX/Preact 等任何前端框架。
- ❌ 引入 TS / 类型库（见 type-safety.md）。
- ❌ 引入打包器处理 `app.js`（vite/webpack/rollup）——`app.js` 直接 `<script>` 加载，esbuild 只服务 `src-vendor/` 的 vendor 预打包。
- ❌ 拼接动态文本入 HTML 不 `escapeHtml`——XSS。
- ❌ 引入给每个 API 响应包 schema、引入状态管理库（Redux/Zustand）。
- ❌ 手动调翻译函数——i18n 走 MutationObserver 自动翻译（`i18n.js` 顶部注释明示），直接写中文原文。
- ❌ 修改 `public/vendor/xterm/` 等已构建产物而不更新对应 `src-vendor/` 入口与 `package.json` 构建脚本——`xterm.js` 本身被 patch 过（见 `package.json` `check:vendor-patch` 校验 `20===e.keyCode||229===e.keyCode`），动它要过这个校验。

---

## Required Patterns

- ✅ 渲染：`arr.map(renderXxx).join('')` → `innerHTML`，动态文本必 `escapeHtml`。
- ✅ 事件：委托挂在稳定容器上，靠 `ev.target.closest('.item').dataset` 取回数据。
- ✅ 后端通信走 `api()`/`apiPost()`；桌面能力走 `window.fanbox*` 返回的 Promise/`on/off`。
- ✅ 新增 IPC 订阅：`on` 必须返回 unsubscribe 函数（仿 `preload.js` 全部 `on`）。
- ✅ 新增可见 UI 文本：直接写中文原文，`title`/`placeholder` 会被 i18n 自动翻译——无需改 `i18n-dict.js`（除非要让 EN 翻译与中文不同，再去改词典）。
- ✅ CSS 加到 `style.css`，类名 `kebab-case`，主题色走 CSS 变量。
- ✅ `'use strict';` 顶部保留（`public/app.js:2`、`i18n.js`、`preload.js`）。

## Scenario: Agent Launcher Terminal Tab Identity Contract

### 1. Scope / Trigger

- Trigger: changes to `AGENT_REGISTRY`, `AGENT_DEFAULTS`, `agentIconHtml()`, `renderAgentButtons()`, `term.launchAgent()`, terminal session state, or terminal tab rendering.
- This is a renderer state/rendering contract. Keep it in vanilla `public/app.js` and `public/style.css`; do not add a framework, type system, or frontend build step.

### 2. Signatures

- `term.launchAgent(agentOrCommand)`: accepts either an Agent object with `{ id, label, cmd }` or the legacy command string.
- Terminal sessions may carry launcher-owned metadata: `sess.agentId` and `sess.agentLabel`.
- `term.tabAgentIconHtml(sess) -> string`: returns a fixed-slot Agent icon/fallback for sessions with `agentId`, or `''` for plain shells.

### 3. Contracts

- Agent launcher buttons must pass the full Agent object (`term.launchAgent(a)`), not only `a.cmd`, so tab rendering can preserve Agent identity.
- `term.launchAgent()` must normalize `cmd`, `id`, and `label` with the existing `cleanAgentCommand()`, `cleanAgentId()`, and `cleanAgentLabel()` helpers before launching or storing metadata.
- Only sessions launched through Agent buttons get `agentId`. Plain terminals, `runInDir()`, and legacy string launches keep the generic terminal glyph.
- Reusing an idle shell and opening a new terminal tab must both apply the Agent metadata before the launch command is written.
- A dead Agent tab may keep its Agent icon while dead, but `respawn(sess)` starts a plain shell and must clear `agentId` / `agentLabel`.
- Tab icons must reuse the existing `agentIconHtml()` / `agentIconCache` path and `public/assets/agents/` assets. Missing or custom icons fall back to escaped two-character text in the same fixed-size slot.

### 4. Validation & Error Matrix

- Empty Agent command -> show a toast and do not launch.
- Missing built-in/custom icon asset -> show the compact abbreviation fallback; do not break tab rendering.
- Icon not cached at first render -> show fallback immediately, load through `agentIconHtml()`, then re-render only if the session still exists.
- Active terminal is busy -> open a new tab instead of writing the Agent command into a running foreground program.
- Dead tab respawned by pressing Enter -> clear Agent metadata so the new shell is not mislabeled.

### 5. Good/Base/Bad Cases

- Good: `renderAgentButtons()` calls `term.launchAgent(a)`, `term.launchAgent()` stores `sess.agentId`, and `renderTabs()` calls `tabAgentIconHtml(s)` before falling back to the generic terminal icon.
- Base: `term.launchAgent('codex')` still launches a command for legacy callers, but it does not assign an Agent icon because there is no trusted Agent id.
- Bad: `term.launchAgent(a.cmd)` drops the Agent identity; detecting Agent identity by terminal process name or user-typed text is also out of scope and can mislabel plain shells.

### 6. Tests Required

- Syntax: `node --check public/app.js`.
- Static launcher contract: `node scripts/test-conpty-smoke.js` must assert the Agent object launch path, `sess.agentId` assignment, and `tabAgentIconHtml(s)`.
- Repo gates: `just check` and `just test` after Agent launcher or terminal tab changes.
- Manual Electron smoke for UI changes: start `just dev`, click Codex and Claude launcher buttons, confirm their tabs show brand icons while a plain terminal tab keeps the generic terminal glyph.

### 7. Wrong vs Correct

#### Wrong

```js
b.onclick = () => term.launchAgent(a.cmd);
```

This launches the command but loses the Agent id before a terminal session can store it.

#### Correct

```js
b.onclick = () => term.launchAgent(a);
// launchAgent normalizes cmd/id/label, stores sess.agentId, then renderTabs()
```

Keep `AGENT_REGISTRY` as the source of truth and let tab rendering consume explicit launcher metadata.

---

## Testing Requirements

**目前没有自动化前端测试。** 无 vitest/jest/Playwright。真实可用的人工验收：

- `node server.js` 后浏览器开 `http://localhost:4567` 实操改动点。
- Electron：`npm run app` 实测桌面分支（终端、剪贴板、微信桥接）。
- vendor 改动后跑 `npm run build:milkdown` / `build:hljs` 重新生成，并 `npm run check:vendor-patch` 验证 xterm patch。

不要在未引入测试框架时凭空写「运行 `npm test`」验收——`package.json` 无 `test` 脚本。

---

## Code Review Checklist

- [ ] 是否引入框架/TS/打包器/状态库/校验库？都该是「否」。
- [ ] 动态入 HTML 的文本是否都 `escapeHtml`？
- [ ] 新事件是否走委托，且靠 `data-*` 取回数据？
- [ ] 后端通信是否走 `api`/`apiPost`，桌面能力是否走 `window.fanbox*`？
- [ ] 新增 IPC `on` 是否返回 unsubscribe？
- [ ] 文本是否直接写中文原文（未手调翻译函数）？
- [ ] vendor 改动是否同步了 `src-vendor/` 入口 + 构建脚本 + `check:vendor-patch`？
