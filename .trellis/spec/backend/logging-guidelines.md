# Logging Guidelines

> 本项目**没有 log 框架、没结构化日志、没 log 级别**。这是本地 CLI/桌面工具，日志等于 `console.*`。

---

## Overview

FanBox 是本机个人工具，进程要么在前台终端跑（看 stdout/stderr），要么在 Electron 主进程跑（开发者看 DevTools / 控制台）。**没有 winston / pino / bunyan，没接入文件日志轮转**。日志=在终端打的几行 `console.error`。

---

## Log Levels → 实际只有三档

| 调用 | 用途 | 例子 |
|------|------|------|
| `console.log` | 启动横幅、正常信息 | 启动时打端口提示 |
| `console.error` | 致命错误 / 需要用户看见的故障 | `server.js:2147` 端口被占用那段人话提示 |
| 静默（`catch {}` 无输出） | 常态副作用失败（无权限、文件不存在） | 见 error-handling.md |

**没有 `warn`/`info`/`debug` 分级**——日志都是面向用户的输出，而不是给日志系统消费的机器记录。

---

## Structured Logging → 格式约定

- 致命错误用多行人话 + 缩进引导，给人看的（`server.js:2147` 起）：
  ```js
  console.error(`\n  ⚠️  端口 ${PORT} 已被占用——FanBox 很可能已经在运行了。`);
  console.error(`      直接打开浏览器访问  http://localhost:${PORT}  就行；`);
  console.error(`      想另开一个，换端口：FANBOX_PORT=8080 node server.js\n`);
  ```
- 紧急致命错误 `process.exit(1)`（`server.js:2153`）——启动失败直接退，不假装继续。
- 消息中文、口语化、带 emoji 引导符（⚠️）与对齐空格——沿用此风格。

---

## What to Log

- 启动端口与监听地址。
- 致命启动失败（端口占用、主进程崩溃）。
- 微信桥接的连接/掉线状态（`electron/main.js` wechat 区，面向开发者排障）。

## What NOT to Log

- **本机文件内容、用户配置明文**（含 `config.json` 里的路径偏好）——这是个人工具，日志可能被复制粘贴，别外泄隐私。
- **正常副作用失败**（无权限读目录等）——用 `catch {}` 吞，不打。
- **不打结构化 debug 行**——没有分级消费方，徒增噪音；真要排障用 DevTools 断点。

---

## Common Mistakes

- ❌ 引入日志库（winston/pino）——违背零依赖最小化。
- ❌ 给每个 catch 都加 `console.error`——常态失败不是日志事件。
- ❌ 把 config 内容打进日志——隐私。