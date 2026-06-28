# Directory Structure

> 本项目没有传统意义的「后端」分层。后端就是 `server.js` 一个文件，纯 Node 内置模块、零运行时依赖。

---

## Overview

FanBox 的「后端」是一个本地单进程 HTTP 服务，全部实现在仓库根目录的 `server.js`（约 2100 行）。它只绑定 `127.0.0.1`，浏览器界面是唯一入口。**没有 `src/`、没有 `routes/services/utils` 分层、没有 ORM、没有数据库**——配置和状态都落在用户主目录的文件里。

文件内还有第二条「服务器」`previewServer`（同文件），预览专用端口（`PORT + 1`），只出 `/fs/` 静态文件，刻意不暴露 `/api`。

### 顶层布局

```
server.js            后端全部：HTTP 服务 + 业务函数 + 路由分发 + 静态资源
electron/
  main.js            Electron 主进程：窗口、IPC handler、node-pty、剪贴板、微信桥接
  preload.js         contextBridge：把 IPC 暴露成 window.fanbox* 命名空间
  wechat/            微信 ClawBot 桥接实现
public/              前端静态资源（见 frontend/directory-structure.md）
src-vendor/          第三方库的 esbuild 入口（milkdown / hljs），构建产物进 public/vendor/
build/               electron-builder 资源（图标、entitlements）
ref/, 素材/, design-demos/, experiments/   参考与实验，非运行时代码
```

---

## Module Organization

`server.js` 内部用扁平的 `// ---------- 业务逻辑 ----------` 注释分块组织。**不要拆成多文件**——这是有意的单文件设计（零依赖、易审计、易随代码库整体阅读）。新增功能：

1. 业务函数定义在 `// ---------- 业务逻辑 ----------` 区域，保持 `async function name(args)` 的扁平风格。
2. 路由分发在文件末尾的 `http.createServer(async (req, res) => { ... })` 里追加 `if (p === '/api/xxx')` 分支。
3. 顶层常量（如 `IGNORE_DIRS`、`IMAGE_EXT`、`CONFIG_DIR`）集中定义在文件头部的常量区，使用 `SCREAMING_SNAKE_CASE`。
4. 请求侧的整段分发被一个顶层 `try { ... } catch (err) { sendJSON(res, 500, { error: err.message }); }` 兜住（`server.js:1979`–`2142`）——新路由会自动获得兜底，无需手写 try/catch。

---

## Naming Conventions

- 业务函数：`async function listDir(dirPath)` / `function kindOf(name, isDir)` —— `camelCase`，动词开头，参数用 `dirPath`/`filePath` 而非缩写。
- 路由：`/api/<动词>` 或 `/api/<资源>/<动词>`（`/api/list`, `/api/git-file`, `/api/skills/refresh`）；只在本机回环，路径即语义。
- 单文件常量：`SCREAMING_SNAKE_CASE`（`IGNORE_DIRS`, `IMAGE_EXT`, `CONFIG_FILE`）。
- 不引入框架（Express 等）、不引入目录分层——历史决策，沿用。

---

## Examples

- 路由分发主结构：`server.js:1972`（`http.createServer`）起，逐条 `if (p === '/api/...')` 分发。
- 业务函数分区：`server.js:136` `// ---------- 业务逻辑 ----------`。
- 预览服务隔离：`server.js:2168`（`previewServer`）+ `server.js:2156` 注释解释为何独立端口。
- 常量集中定义：`server.js` 头部 `IGNORE_DIRS`、`CONFIG_DIR` 等（`server.js:20`–`40` 一带）。