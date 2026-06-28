# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

FanBox 前端是**纯 vanilla JavaScript**：单体 `public/app.js`（~275KB）+ `style.css`（~95KB）+ `index.html` + vendor 预打包库（xterm/monaco/hljs/marked/milkdown）。**无 React/Vue/Svelte、无 TypeScript、无 webpack/vite 处理 `app.js`**。渲染=`innerHTML` 模板字符串 + `escapeHtml`；事件=委托 + `data-*`；后端通信用 `api`/`apiPost`；桌面分支通过 `window.fanbox*` IPC（`electron/preload.js`）。i18n 走 `MutationObserver` 自动翻译，**不调 `t()`**。无 lint/test 框架。

填这些 spec 的依据是 `public/app.js` / `electron/preload.js` 真实代码，不是假设。子代理改前端前请先读本目录全部 6 篇。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | `public/` 单体布局、`app.js` 分区、vendor 构建链 | Filled |
| [Component Guidelines](./component-guidelines.md) | 渲染函数返 HTML 字符串、委托 + `data-*`、`escapeHtml` | Filled |
| [Hook Guidelines](./hook-guidelines.md) | 无 React Hooks——`setupXxx`/IPC `on` 返 unsubscribe/i18n 陷阱 | Filled |
| [State Management](./state-management.md) | 顶层 `let` 状态、手调 `renderXxx`、服务端态按需重拉 | Filled |
| [Quality Guidelines](./quality-guidelines.md) | 禁框架/TS/打包器、`node --check`/浏览器实操验收 | Filled |
| [Type Safety](./type-safety.md) | 无 TS——边界守卫 + `|| 默认值` + 后端为数据唯一来源 | Filled |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
