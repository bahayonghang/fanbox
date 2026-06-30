# Windows ConPTY 冒烟验证矩阵

> 父任务：`06-29-win-longterm` ｜ C6-L1 ConPTY 专项子任务

## Goal

把 C2 里临时做过的 Windows node-pty / ConPTY 基础冒烟固化成可重复运行的本地验证入口，覆盖 FanBox 内嵌终端最关键的 shell 启动、输入、cwd 与 agent 命令注入风险点。该子任务的价值是让后续 ConPTY 深挖前先有稳定基线，而不是继续依赖一次性手动记录。

## Background

- C6 路线项 L1 要求 PowerShell、cmd、Git Bash、Claude、Codex 在 Windows 终端基本交互稳定。
- C2 归档记录已验证 `node-pty` 启动 PowerShell 后能输出当前 cwd 和 `FANBOX_C2_CONPTY_OK`，但该验证没有固化到脚本中。
- C3 已明确把真实 ConPTY 前台 cwd 追踪留给 C6；本子任务只建立冒烟矩阵，不实现深层进程 cwd 追踪。

## Requirements

- **R1 shell 矩阵**：新增可重复运行的 Windows PTY 冒烟脚本，至少覆盖 PowerShell、cmd；若 Git Bash 可发现，也覆盖 Git Bash，否则记录 skipped 而不是失败。
- **R2 基础交互**：每个被测 shell 必须通过 node-pty 启动，写入命令，验证 stdout 中包含启动目录与唯一标记。
- **R3 agent 启动命令契约**：脚本验证 FanBox 前端仍通过 `term.launchAgent()` 写入 `claude --dangerously-skip-permissions` 与 `codex`，但不在测试中执行真实 agent，避免发起认证、联网或长时间 TUI 会话。
- **R4 跨平台门禁**：该脚本可纳入 `npm run test:platform`，在非 Windows 平台应明确 skip，不能破坏 macOS/Linux 现有检查。
- **R5 最小改动**：不修改 `electron/main.js` 的 PTY 运行时逻辑，不改 `public/app.js` 的终端交互行为；本任务只增加验证工具和 npm 测试入口。

## Acceptance Criteria

- [ ] AC1：`npm run test:platform` 在本机通过，并包含新的 ConPTY 冒烟脚本。
- [ ] AC2：Windows 上脚本验证 PowerShell 与 cmd 能通过 node-pty 输出 cwd 和唯一标记。
- [ ] AC3：Windows 上 Git Bash 存在时被验证；不存在时输出 skipped，不导致失败。
- [ ] AC4：脚本验证 `public/app.js` 的 Claude / Codex 启动命令契约；测试不会启动真实 Claude / Codex 进程。
- [ ] AC5：`electron/main.js` / `public/app.js` 无业务逻辑改动。

## Notes

- 真实 GUI 启动、开始菜单环境继承、长时间 TUI 稳定性和前台进程 cwd 追踪继续留给后续 C6 子任务。
