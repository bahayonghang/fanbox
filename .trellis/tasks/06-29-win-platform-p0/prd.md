# 平台抽象层与 P0 修复(env-shell-driver)

> 父任务：`06-29-windows-port` ｜ 阶段一 ｜ 覆盖 R2, R3, R4, R5 ｜ **整棵树最关键子任务**

## Goal

建立平台抽象层骨架（`electron/platform/{env,shell}.js`），并修复两个让 Windows agent 不可用的 P0：①agent 执行用 PowerShell 跑 `-lc` 的错误模型；②GUI 启动时环境/代理/PATH 丢失。目标是 Windows 上 `claude -p`/`codex exec` 能起进程并取到输出，微信大脑回路打通。

## Background（已核实，file:line）

- **P0-shell** `electron/wechat/driver.js`：
  - `:7` `loginShell()` win32 返回 `powershell.exe`；`:22` 仍 `spawn(loginShell(), ['-lc', cmd], …)`——PowerShell 不支持 `-lc`。
  - `:77` `which()` 用 `command -v`；`:182` `shq()` POSIX 单引号转义；`:86` persona 经 `shq` 拼进 `--append-system-prompt`。
  - prompt 已走 stdin（`:40`），codex persona 已前置 stdin（`:130`）——这两点保留。
- **P0-env** `electron/wechat/env.js`：
  - `:17` `dumpShellEnv()` win32 直接 `resolve({})`；`:37` `sysProxyEnv()` 仅 darwin `scutil --proxy`。
  - `:54-56` `build()`：process.env 打底 + shell 覆盖 + 代理兜底 + UTF-8——语义需在 Windows 保留。
- `server.js:514` `findAgentBin` 用 `/bin/zsh -lc command -v`；`:602` `gh` 检测用 `/bin/sh -lc command -v gh`——同属 CLI 检测，纳入 whichBin。
- PTY 交互终端（`main.js:478,483`）已正确处理 win32，不在本子任务范围。

## Requirements

- **R2** 新增 `electron/platform/env.js`、`electron/platform/shell.js`，对外签名跨平台一致，darwin 分支逐字保留现实现（见父 design.md §1-3）。
- **R3** `driver.js` 改为经 `platform/shell.spawnCommand(bin, args, {shell:false})`，`runClaude/runCodex` 构造 argv 数组；persona 作为独立 argv（或 system-prompt 文件），废弃 `shq` 拼接路径。保留现有 idle/max 超时、onLine 逐行、重试隔离语义。
- **R4** `platform/env.js` 接管 `fullEnv()`：Windows 取环境（优先验证 `process.env` 是否已够，避免过度复杂）、注册表/WinINET 代理兜底、UTF-8 代码页、失败退回 `process.env`（不再返回 `{}`）。
- **R5** 新增 `whichBin(bin)`（Windows `where`/Node），替换 `driver.js:77` 与 `server.js:514,602` 的 `command -v`/`/bin/zsh -lc`。

## Acceptance Criteria

- [ ] AC2.1 Windows 从开始菜单启动后，触发微信链路或桌面 agent，`claude -p --output-format stream-json …` 能起进程并解析出 result（不再因 `-lc` 失败）。
- [ ] AC2.2 `codex exec` 同样能起进程取到输出。
- [ ] AC2.3 GUI 启动后 `whichBin('claude'/'codex'/'git'/'gh')` 在 Windows 命中。
- [ ] AC2.4 代理/ANTHROPIC_BASE_URL 在 Windows 不丢（实测设了代理时子进程能用）。
- [ ] AC2.5 macOS 端 driver/env 行为零回归（darwin 走原路径）。
- [ ] AC2.6 persona 含引号/换行/中文时不再因转义出错（`shell:false` 直传 argv）。

## Out of Scope

- 系统命令（disk/archive/thumb/terminal）→ C3。
- 终端 PTY → 已有，不动。

## Notes（排序与验证）

C3/C4 的前置（建立 `platform/` 目录与契约）。需在 **真实 Windows 环境**冒烟验证（含 Claude 凭据路径 `~/.claude/.credentials.json`、Codex Windows 稳定性——父 design.md §8）。
