# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

FanBox 是一个**本地个人工具**：纯 Node 内置模块、零运行时依赖的单文件 HTTP 服务（`server.js`，~2100 行），只绑 `127.0.0.1`，浏览器是唯一入口。**没有数据库/ORM、没有框架、没有 `src/` 分层**——配置落在 `~/.fanbox/config.json`。流式验收靠 `node --check` + 浏览器实操，无 lint/test 框架。

填这些 spec 的依据是 `server.js` 真实代码，不是假设；下方每张表都标了对应真实文件行号。子代理改后端前请先读本目录全部 5 篇。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 单文件后端、`// ---------- //` 分区、路由分发 | Filled |
| [Database Guidelines](./database-guidelines.md) | 无 ORM——`~/.fanbox/config.json` + `updateConfig` 原子写 | Filled |
| [Error Handling](./error-handling.md) | 顶层 try/catch 兜底、`throw` 中文 Error、写必冒泡 | Filled |
| [Quality Guidelines](./quality-guidelines.md) | 零依赖、禁引框架/分层、`node --check` 验收 | Filled |
| [Logging Guidelines](./logging-guidelines.md) | 仅 `console.*`，无 log 框架/级别，致命才 `process.exit(1)` | Filled |

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
