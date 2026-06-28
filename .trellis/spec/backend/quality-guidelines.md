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

---

## Testing Requirements

**目前没有自动化测试。** `package.json` 没有 `test` 脚本、未引入 jest/vitest。子代理不要凭空捏造「运行 xxx 测试」的验收步——真实可用的人工验收是：

- `node --check server.js`（语法）。
- `node server.js` 启动，浏览器访问 `http://localhost:4567` 验证改动功能。
- Electron：`npm run app`。

如未来引入测试框架，才在该文件补 Testing 章节，不要先写跑测试的占位。

---

## Code Review Checklist

- [ ] 改动是否新增了运行时依赖？后端不该有。
- [ ] 新路由是否落入顶层 try/catch？写 config 是否走 `updateConfig`？
- [ ] 路径入口是否走 `resolvePath`？危险 `/api` 是否误泄到 `previewServer`？
- [ ] 错误消息是否中文人话、是否在关键写路径上静默吞错？
- [ ] 是否保持单文件结构、未拆分、未引入分层？
- [ ] 是否保持中英文间空格、`'use strict'`？