# 设计：Windows ConPTY 冒烟验证矩阵

## Scope

本任务新增一个 Node 脚本和对应 npm 测试入口，用 `node-pty` 直接复现 Electron 内嵌终端的关键路径：

- shell 经 PTY 启动；
- 测试命令经 PTY stdin 写入；
- stdout 被收集并匹配 cwd / 唯一标记；
- agent 启动按钮对应的命令文本契约保持可审计。

不改 Electron 主进程、renderer 终端交互、录制、power guard 或 `pty:cwd` 行为。

## Verification Script

新增 `scripts/test-conpty-smoke.js`。

脚本结构：

1. 非 Windows：打印 skip 并退出 0。
2. Windows：`require('node-pty')`，如果 native 模块不可用则失败并提示运行 `npm run rebuild`。
3. 通过现有 `electron/platform/shell.js` 的 `whichBin()` 查找：
   - 必测：`powershell.exe` / `powershell`，`cmd.exe` / `cmd`；
   - 可选：Git Bash 的常见路径或 `bash.exe`；
4. 对每个 shell 调用 `pty.spawn()`，写入轻量命令，等待输出包含：
   - `process.cwd()`；
   - shell 专属唯一标记。
5. 每个 PTY 都在测试完成后写入退出命令，并在超时路径 kill，避免残留子进程。
6. 读取 `public/app.js`，验证 `term.launchAgent()` 仍使用 `claude --dangerously-skip-permissions` 与 `codex`。

## Command Contracts

PowerShell:

```powershell
Write-Output (Get-Location).Path
Write-Output FANBOX_CONPTY_POWERSHELL_OK
```

cmd:

```bat
cd
echo FANBOX_CONPTY_CMD_OK
```

Git Bash:

```bash
pwd
echo FANBOX_CONPTY_BASH_OK
```

Agent injection smoke:

- 不在 PTY 中写入真实 agent 命令，因为部分 shell / agent 会在不完整输入场景下仍触发交互式启动。
- 通过静态契约检查确认 UI 仍向 PTY 写入 `claude --dangerously-skip-permissions` / `codex`。
- 后续如需真实 Claude / Codex PTY 稳定性，应拆独立手动/交互子任务。

## Compatibility

- `npm run test:platform` 已是跨平台门禁；新脚本在非 Windows skip，避免影响 macOS 发布路径。
- Windows 下如果 `node-pty` native 模块未 rebuild，测试失败是正确结果，因为 FanBox 内嵌终端也不可用。
- Git Bash 是可选环境能力，缺失时不失败。

## Rollback

回滚只需移除 `scripts/test-conpty-smoke.js`，并从 `package.json` 的 `test:platform` 中删除该脚本调用。
