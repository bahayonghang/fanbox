# Directory Structure

> 本项目前端是**纯 vanilla JavaScript**，无框架、无 TS、无打包器（前端本体不经 esbuild）。一个超大 `app.js` + 一个超大 `style.css` + vendor 库。

---

## Overview

`public/` 是后端 `server.js` 直接伺服的静态资源目录。所有前端代码都是手写 JS + HTML + CSS，**没有 React/Vue/Svelte、没有 TS、没有 webpack/vite**（esbuild 只用于把 `src-vendor/` 里的 milkdown/hljs 预打包成 vendor bundle，不参与 `app.js` 本身的构建）。

### 布局

```
public/
├── index.html        单页面入口（18KB，挂载点 + 静态结构）
├── app.js            几乎所有前端逻辑（单体 ~275KB），无模块化拆分
├── style.css         全部样式（单体 ~95KB），无 CSS 模块化
├── i18n.js           翻译运行时：MutationObserver 在微任务时机翻译 DOM（不是显式 t() 调用）
├── i18n-dict.js      翻译词典（中文原文为键）
└── vendor/           第三方预打包库
    ├── xterm/        终端（含被 patch 过的 vendor 文件）
    ├── monaco/       代码编辑器
    ├── hljs/         代码高亮
    ├── marked/       Markdown 渲染
    └── milkdown/     富文本编辑器
```

`src-vendor/` 是 vendor 的 esbuild 入口源（`milkdown-entry.js`、`hljs-entry.js`），构建脚本在 `package.json` `build:milkdown` / `build:hljs`，产物进 `public/vendor/`。

---

## Module Organization

`app.js` 是单体脚本，靠 `// ---------- xxx ----------` 注释分区组织（与 `server.js` 同风格）。**不要拆成多文件、不要引入 ES 模块 import**——script 在 `index.html` 里用 `<script>` 直接加载，所有顶层 `const`/`function` 共享全局作用域。

新增前端功能：

1. 在 `app.js` 找到对应注释分区，就近加函数。无对应分区就加一个 `// ---------- xxx ----------` 分隔。
2. 涉及第三方库，加到 `public/vendor/<lib>/` 并在 `index.html` `<script>` 引入；新增 vendor 需要构建的，仿 `build:hljs` 在 `package.json` 加脚本。
3. 样式加到 `style.css`，按既有 BEM-ish 风格命名（`.file-area`, `.nav-empty`, `.sb-l-...`）。

**Electron 桌面分支**：渲染进程通过 `window.fanbox*`（`preload.js` 暴露）调主进程；浏览器分支走 `api()`/`apiPost()` 打 `127.0.0.1`。判断分支：`window.fanboxEnv?.isDesktopApp`。

---

## Naming Conventions

- 文件：`kebab-case` 或单词（`app.js`, `i18n-dict.js`）。
- CSS 类：`kebab-case`，块名前缀语义（`.file-area`, `.wx-loading`, `.fn-term`）。
- JS 顶层 helper：极简短名（`$`, `api`, `apiPost`, `escapeHtml`, `fmtSize`, `fmtClock`）——沿用，别改成冗长命名。
- 函数：`camelCase`，`renderXxx`/`fmtXxx`/`updateXxx`。
- 中文注释贴合业务语境，中英文之间留空格。

---

## Examples

- 顶层 helper 三件套：`public/app.js:4` `$` / `app.js:5` `api` / `app.js:6` `apiPost`。
- 分区风格：`public/app.js:8` `// ---------- SVG 图标系统 ----------`。
- 渲染模式：`innerHTML = \`...${escapeHtml(x)}...\`` 模板字符串（见 `app.js:4404`, `4363`）。
- Vendor 构建脚本：`package.json` `build:milkdown` / `build:hljs`。