# 设计：FanBox Windows 移植——平台抽象层架构契约

本文件是**所有子任务的共同基线**。核心命题（来自 `ref/windows_port.md` §3.2）：**这不是 Electron 架构问题，而是 platform boundary 问题。** 业务代码当前直接调用 `/bin/zsh`、`du`、`lsof`、`sips`、`qlmanage`、`osascript`、`pmset`、`scutil`，散布在 `server.js`、`electron/main.js`、`electron/wechat/{env,driver}.js`。目标是把这些收敛进一层薄 adapter，业务文件只做调用点替换。

## 1. 边界与目录

```text
electron/platform/          # Electron 主进程侧（桌面 app + 微信链路）
  env.js        # fullEnv(): macOS/Windows/Linux 完整环境（PATH/代理/UTF-8）
  shell.js      # spawnCommand(bin,args,opts) / whichBin(bin) / runViaShell(...)（仅交互式终端用）
  power.js      # stayAwake(on|off) / powerState()
  clipboard.js  # copyFileToClipboard(path)
  update.js     # checkUpstream() / checkRelease()  —— 双通道
server-platform.js          # server.js 侧（纯 Node 后端，零第三方依赖原则保留）
  diskUsage(dir)
  archiveList(file)
  thumbnail(src, size, opts)
  openInOS(path)
  commandExists(bin)        # = whichBin 的后端侧封装
  terminalCwd(pid)
  contentSearch(query, root)  # mdfind → grep 跨平台回退
```

**契约原则**：
- 每个 adapter 函数对外签名跨平台一致；平台差异只在函数体内 `switch(process.platform)`。
- **macOS 分支必须保留原实现**（逐字搬运现有命令），保证 darwin 零回归（PAC2）。
- Windows 分支：能等价就等价，不能就**降级 + 明确返回 unsupported/回退值**，绝不抛裸错或返回 `{}`/`"macOS only"` 让上层崩。
- `server-platform.js` 维持 `server.js` 的"零第三方依赖"原则：优先 Node 内置 + 系统自带命令（`where`、`powershell -NoProfile -Command`），重依赖（Sharp/ffmpeg）列为阶段二可选。

## 2. 最关键契约：Agent 执行模型（P0，C2）

**问题根因**：`driver.js:22` `spawn(loginShell(), ['-lc', cmd], …)`——把 POSIX shell 的 `-lc` 长命令模型当统一执行层；Windows 选了 `powershell.exe` 却仍传 `-lc`，必坏。

**目标模型**：直接 `spawn(bin, args, { shell: false })`，**不经 shell 拼命令**。
- prompt 已走 stdin（`driver.js:40`，保留）。
- persona/system-prompt 不再用 `shq()` 单引号拼进命令行：
  - claude：`--append-system-prompt` 的值作为**独立 argv 元素**传入（`shell:false` 下无需转义），或走临时文件/`--system-prompt-file`（需验证 CLI 支持）。
  - codex：persona 已前置进 stdin（`driver.js:130`），天然规避。
- `which(bin)`（`driver.js:77` `command -v`）→ `platform/shell.whichBin(bin)`。
- `loginShell()` 仅在**确需交互式终端**处保留（PTY 已在 `main.js:478` 正确处理，不动）。

**契约签名**：
```js
// platform/shell.js
spawnCommand(bin, args, { cwd, env, onLine, idleMs, maxMs }) -> Promise<{ok,code,out,err,timedOut,timeoutReason,ms}>
whichBin(bin) -> Promise<string|null>   // 命中返回绝对路径，否则 null
```
`spawnCommand` 把 `driver.js:run()` 现有的 idle/max 超时、逐行 onLine、重试隔离语义**原样保留**，只替换"经 shell"为"直 spawn"。driver 的 `runClaude/runCodex` 改为构造 `args` 数组传入。

## 3. 环境/代理契约（P0，C2）

**问题根因**：`env.js:17` win32 `resolve({})`；`env.js:37` 代理只读 macOS `scutil`。

**Windows env adapter**（`platform/env.js` 接管 `wechat/env.js` 的 `fullEnv`）：
- 取完整环境：`powershell -NoProfile -Command "Get-ChildItem Env: | ForEach-Object {...}"`（或直接信任 `process.env`，GUI 启动的 Electron 在 Windows 通常已继承用户环境——**需 C2 实测确认是否真缺**，避免无谓复杂度）。
- 代理兜底：读注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`（WinINET `ProxyEnable`/`ProxyServer`），或 WinHTTP；转成 `{http_proxy,https_proxy,...}`，**只补空缺不覆盖**（沿用现有 `build()` 语义）。
- 代码页/UTF-8：保留 `LANG=en_US.UTF-8` 兜底；Windows 侧确保子进程不因 GBK 代码页乱码（claude/codex 含中文）。
- 失败一律退回 `process.env`（不再返回 `{}`）。

**第一性原则提醒**：先用最小机制验证"Windows GUI 启动是否真的丢 PATH/代理"。若 `process.env` 已够用，env adapter 的 Windows 分支可以极薄——不要照搬 macOS 的 shell-dump 复杂度。

## 4. 系统命令契约（C3）

| 函数 | macOS（保留） | Windows | 失败/降级 |
| --- | --- | --- | --- |
| `diskUsage(dir)` | `du -sk`(`server.js:785`) | `powershell` 递归求和 / Node 遍历 | 超时返回部分结果 |
| `archiveList(file)` | 现有自读中央目录 + `unzip` 回退(`server.js:810-874`) | 自读 zip（保留）+ `tar`/bsdtar(Win10+ 自带) | 仅 zip，其他 unsupported |
| `thumbnail(src)` | `sips`/`qlmanage`(`server.js:1178-1246`) | Shell thumbnail / 阶段二 Sharp/ffmpeg | 回退图标 |
| `openInOS(path)` | `open` | `start`（已有 `server.js:2194`）| — |
| `commandExists`/`whichBin` | `command -v`(`server.js:514,602`) | `where` / Node | fallback shell（可选）|
| `terminalCwd(pid)` | `lsof`(`main.js:704-723`) | ConPTY/`Get-Process`/句柄查询 | 返回 null，UI 用启动 cwd |
| `contentSearch` | `mdfind`(`server.js:347`) | grep 回退（已有 `grepFiles`）| 原 grep 兜底 |

`mdfind` 已有 grep 回退路径（`server.js:362`），Windows 直接复用回退即可，优先级低。

## 5. macOS 专属能力契约（C4）

- **防休眠**（`main.js:249-302` `pmset`+sudoers+osascript）：Windows 用 `SetThreadExecutionState`（ffi/原生）或 `powercfg`/`presentationsettings`；默认关闭，开关语义对齐 `wechat:powerState`(`main.js:810`)。
- **剪贴板文件复制**（`main.js:523` osascript）：Windows clipboard file-drop（`CF_HDROP`）格式复杂，MVP 先降级为"复制路径文本"。
- **截图直通车**（`main.js:123` 仅 darwin 监听）：Windows 截图目录策略后补；MVP 不启动监听不报错。
- `wechat:lid` 等"macOS only"返回点（`main.js:792`）：改为统一的"能力不可用"结构，前端据此灰显而非弹裸错。

## 6. 更新通道契约（C5）

`main.js:10-67` 硬编码 `api.github.com/repos/alchaincyf/fanbox/releases/latest`。拆为：
- `FANBOX_UPSTREAM_REPO=alchaincyf/fanbox` → 提示"上游源码新版"。
- `FANBOX_RELEASE_REPO=bahayonghang/fanbox`（或独立 `fanbox-windows`）→ 提示"Windows 安装包新版"。
- UI 区分两类提示；Windows 用户不被导向 macOS `.dmg`。

## 7. 兼容性、回归与回滚

- **darwin 零回归**是硬约束：每个 adapter 的 macOS 分支 = 现有命令逐字搬运。
- **路径回归**（PAC、AC5）：`C:\`、UNC、空格、中文路径在文件浏览/预览/终端定位下回归；**不弱化** `server.js` 的 Host/Origin 校验与预览服务 HOME 边界。
- **回滚**：每个 adapter 引入时，原 macOS 调用点改为 `adapter.fn()`，darwin 走原路径——任何子任务可单独 revert 而不影响其他。
- **rebase 友好**：Windows 改动尽量是"新增 adapter 文件 + 原文件薄调用点替换"，使 `git rebase upstream/master` 冲突收敛（PAC4）。

## 8. 验证清单（来自文档 §8，分配到子任务）

- node-pty + ConPTY 实际交互质量（C6 专项；C2 冒烟先覆盖基本起进程）。
- Codex CLI Windows 稳定性（C2 实测，上游列为不可控项）。
- Claude Code Windows 凭据路径 `~/.claude/.credentials.json`（C2 实测）。
- 快捷键 Windows 化 `⌘→Ctrl`（阶段二/C4 视情况，前端 `public/app.js`）。
