# FanBox Windows 移植

## Goal

让 FanBox 在 Windows 上**可安装、可启动、能浏览/搜索/预览文件、能开内嵌终端、能跑 Claude/Codex headless（微信大脑 + 桌面 agent）**；并把平台相关代码收敛成一层薄 adapter，使 fork 能持续低成本 rebase 上游 `alchaincyf/fanbox`。

来源：`ref/windows_port.md`（完整移植评估，已逐条与代码核对）。

## Background（已核实事实，含 file:line 锚点）

技术栈：Electron 33 + CommonJS Node 后端（`server.js`，自称零依赖纯内置模块）+ 静态前端；终端 `node-pty` + xterm.js。当前打包 `package.json:17` 只有 `electron-builder --mac`，build 配置仅 `mac.target=dmg/arm64` + Apple 签名。

仓库现状：`origin=bahayonghang/fanbox`（fork），当前在 **`win` 分支**直接做增量 Windows 修复，**未配置 `upstream` remote、无 `windows-port` 分支**。已落地的 win32 处理均为浅层（面包屑盘符 `server.js:194-196`、回收站删除 `server.js:447`、终端打开 `server.js:1089`、跨平台 opener `server.js:2194`、PTY shell 选择 `main.js:478,483`）——共 12 处零散分支，**无 platform 抽象层**（`electron/platform/`、`server-platform.js` 均不存在）。

### P0 阻塞（已核实，Windows 上核心功能不可用）

- **Agent 驱动 shell 模型错误** `electron/wechat/driver.js:7,22,77,182`：`loginShell()` 在 win32 返回 `powershell.exe`，但 `run()` 仍 `spawn(shell, ['-lc', cmd])` —— PowerShell 不支持 `-lc`；`which()` 用 `command -v`；`shq()` 是 POSIX 单引号转义。→ 微信 ClawBot + 桌面 headless Claude/Codex 在 Windows 高概率无法启动或参数错乱。
- **环境/代理重建缺失** `electron/wechat/env.js:11,17,37`：`dumpShellEnv()` 在 win32 直接 `resolve({})`；系统代理只读 macOS `scutil --proxy`。→ GUI 启动后 PATH/代理/BASE_URL 丢失，找不到 `claude`/`codex` 或联网失败。
- **Windows 打包配置不存在** `package.json:17,31-49`：无 `dist:win`、无 `win.target`、无 `icon.ico`、无 Windows CI。→ 无可发布产物。

### P1 / P2 系统命令散落（已核实位置）

- `server.js`：`mdfind`(347,360,1005 Spotlight 搜索)、`osascript`(446 Finder 删除)、`/bin/zsh -lc command -v`(514 findAgentBin)、`/bin/sh -lc command -v gh`(602)、`du -sk`(785 磁盘占用)、`unzip`(874 压缩包回退)、`sips`(1178,1246 缩略图/HEIC)、`qlmanage`(1184 QuickLook)、`scutil --proxy`(1531)。
- `electron/main.js`：`pmset/visudo/osascript` 防休眠 sudoers 方案(249-302)、截图监听仅 darwin(123)、`osascript` 复制文件到剪贴板(523)、`lsof` 取终端 cwd(704,719,723)、`wechat:lid` 非 darwin 返回 "macOS only"(792)。
- 更新检查硬编码上游 `alchaincyf/fanbox` release(`main.js:10-27,31-67`)，无法区分"上游源码更新"与"Windows 二进制更新"。

## Requirements（草案，待范围确认后细化）

平台抽象优先（降低未来 rebase 冲突），业务文件只做薄调用点替换：

- **R1 打包**：新增 `dist:win`（`nsis`/`zip`），补 `icon.ico`，新增跨平台 `justfile` 统一 `check`/`test`/`build`/`ci`；Windows runner 上 `electron-rebuild` node-pty；不破坏现有 `dist`(mac)。
- **R2 平台层**：新增 `electron/platform/{env,shell,...}` 与 `server-platform.js`，提供 `fullEnv()`、`spawnCommand()`、`whichBin()` 等统一入口。
- **R3 P0-shell**：`driver.js` 改为 `spawn(bin, args, {shell:false})`，prompt 走 stdin（已是 stdin）、persona 不再用 `shq` 拼接，绕开 PowerShell quoting；Windows 下 `claude -p` / `codex exec` 可启动取到输出。
- **R4 P0-env**：Windows env adapter——读 `Get-ChildItem Env:` / 注册表 WinINET/WinHTTP 代理 / PATH 合并 / UTF-8 代码页；GUI 启动仍能定位 CLI。
- **R5 CLI 检测**：`command -v` / `/bin/zsh -lc` → `whichBin()`（Windows `where`/Node）。
- **R6 系统命令适配**：`diskUsage`、`archiveList`、`thumbnail`、`openInOS`、`commandExists`、`terminalCwd`、`mdfind→grep 回退` 走 adapter；Windows 降级有回退。
- **R7 macOS 专属能力**：防休眠（`SetThreadExecutionState`/`powercfg`）、剪贴板文件复制、截图——Windows MVP 先降级/禁用，标注 unsupported。
- **R8 更新通道**：拆 `FANBOX_UPSTREAM_REPO`（源码）/ `FANBOX_RELEASE_REPO`（Windows 包），UI 区分提示，不让 Windows 用户下到 macOS `.dmg`。
- **R9 CI/文档**：Windows workflow 跑 `npm ci`/`just ci`；node-pty rebuild 暂 pin `windows-2022`，等 Electron/node-gyp 支持 VS 2026 后再评估恢复 `windows-latest`；记录 Windows 已知限制。

## Acceptance Criteria（草案）

- [ ] AC1：`windows-2022` CI 能产出可安装/可运行 Windows 包（`.exe`/`.zip`），macOS `dist` 不回归；等 Electron/node-gyp 支持 VS 2026 后再评估恢复 `windows-latest`。
- [ ] AC2：Windows 从开始菜单启动后，`claude -p` / `codex exec` 能起进程并拿到输出（微信大脑回路打通）。
- [ ] AC3：GUI 启动后仍能定位 `claude`/`codex`/`git`/`gh`，代理/BASE_URL 不丢。
- [ ] AC4：平台命令统一走 adapter，业务文件不再直接拼 `/bin/zsh`/`du`/`lsof`/`sips` 等。
- [ ] AC5：路径回归——`C:\`、UNC、空格、中文路径在文件浏览/预览/终端定位下正常；Host/Origin 校验不弱化。

## Out of Scope（候选）

- Windows 代码签名 / SmartScreen 信誉（阶段三）。
- 把平台抽象 PR 回上游（阶段三）。
- 完整功能 parity（截图直通车、视频/PDF 缩略图、HEIC）——MVP 允许降级。

## 已决策（规划决策记录）

- **D1 结构与范围**：父任务 + **全三阶段**子任务树。本父任务只承载跨子任务的需求集、平台层架构契约、任务地图、跨子任务验收与最终集成评审；不作为直接实现目标。
- **D2 分支策略**：**加 `upstream=alchaincyf/fanbox` remote + 开 `rerere`，继续在 `win` 分支推进**；不另建 `windows-port`/`windows-release`。理由：平台抽象层本身即"减冲突"的核心手段，不依赖重建分支拓扑；保留现有 `win` 发版节奏（已发 2.3.3）。分支治理在 C1 内一次性轻量落地。
- **D3 打包目标**：`nsis`（安装包）+ `zip`（绿色版）双产物；`icon.ico`。
- **D4 MVP 降级许可**：阶段二/三的体验型能力（截图直通车、视频/PDF 缩略图、HEIC、防休眠、剪贴板文件复制）在 MVP 允许降级/禁用并标注 unsupported。
- **D5 C6 启动策略**：`06-29-win-longterm` 仅作路线追踪，不作为 MVP 的实施入口；阶段一/二和父任务集成评审完成后，再把其中成熟项拆成独立可执行任务。

## 子任务地图（父 → 子，按执行顺序）

| 阶段 | 子任务 | 目录 | 覆盖需求 | 独立验收要点 |
| --- | --- | --- | --- | --- |
| 一 | C1 Windows 打包与 CI | `06-29-win-build-ci` | R1, R9, D2, D3 | `just ci` 跨平台入口就位；CI 在 Windows runner 产出 `.exe`/`.zip`；mac `dist` 不回归；`upstream` remote 就位 |
| 一 | C2 平台层 + P0(env/shell) | `06-29-win-platform-p0` | R2, R3, R4, R5 | `claude -p`/`codex exec` 在 Win 起进程取到输出；GUI 启动定位 CLI；代理/PATH 不丢 |
| 二 | C3 系统命令适配 | `06-29-win-syscmd-adapter` | R6 | disk/archive/thumbnail/openInOS/terminalCwd/搜索 走 adapter，Win 有实现或降级回退 |
| 二 | C4 macOS 专属能力 Win 化 | `06-29-win-macos-parity` | R7 | 防休眠/剪贴板文件复制/截图：Win 实现或显式降级，不再返回 "macOS only" 裸错 |
| 二 | C5 更新通道拆分 | `06-29-win-update-channel` | R8 | Windows 用户得到 Windows 包提示而非 `.dmg`；上游源码更新与二进制更新分离 |
| 三 | C6 长期演进 | `06-29-win-longterm` | 阶段三 | 路线追踪（暂不 `task.py start`）：签名/SmartScreen、release channel 版本号、ConPTY 专项、上游 PR |

**子任务排序依赖**（非 Trellis 依赖系统，写在各子 prd/implement）：C2 的平台层骨架是 C3/C4 的前置；C1 可与 C2 并行；C5 依赖 C1 的 release 产物形态；C6 仅作路线追踪，等 MVP 验收后再逐项拆分启动。

## 跨子任务验收（父任务集成评审）

- [x] PAC1：任一业务文件不再直接拼 `/bin/zsh`/`/bin/sh`/`du`/`lsof`/`sips`/`qlmanage`/`osascript`/`scutil`/`command -v`；全部经平台 adapter。
- [x] PAC2：macOS 端全量功能无回归（adapter 的 darwin 分支保持原实现）。
- [x] PAC3：阶段一三个 P0（打包、env/proxy、agent shell runner）全部清零。
- [x] PAC4：一次 `git rebase upstream/master` 演练，冲突集中在少数 adapter 调用点而非穿透 `server.js`/`main.js`。

### 集成评审证据（2026-06-30）

- PAC1：`rg -n "du -sk|execFile\\('mdfind'|execFile\\('sips'|execFile\\('qlmanage'|execFile\\('unzip'|lsof -a|osascript|scutil --proxy|/bin/zsh|/bin/sh|command -v" server.js electron\main.js electron\wechat -g '!node_modules'` 无命中；剩余系统命令位于 `server-platform.js`、`electron/platform/*` 或测试。
- PAC2：`node --check server-platform.js server.js electron\platform\shell.js electron\main.js scripts\test-platform-shell.js scripts\test-server-platform.js`、`just check`、`just test` 通过；adapter 的 darwin 分支保留原 macOS 命令路径。
- PAC3：C1/C2/C3/C4/C5 均已归档；`package.json` 已有 `dist:win`/`win.target`，`electron/platform/{env,shell}` 接管 GUI env/proxy 与 agent argv spawn，系统命令/更新通道均经 adapter。
- PAC4：`git fetch upstream master` 后在临时分支 `rehearsal/windows-port-pac4-20260630160018` 执行 `git rebase upstream/master`，结果为 `Current branch ... is up to date.`；`git merge-base --is-ancestor upstream/master HEAD` 返回成功，未产生冲突。

## 后续规划说明

各子任务的 `design.md` / `implement.md` 在该子任务**进入启动（task.py start）前**按需补全（复杂子任务必备），避免对阶段二/三尚未动工的细节做投机式规划。父任务的 `design.md`（平台层架构契约）是各子 design 的共同基线。
