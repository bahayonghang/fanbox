# macOS 专属能力 Windows 化(电源-剪贴板-截图)

> 父任务：`06-29-windows-port` ｜ 阶段二 ｜ 覆盖 R7 ｜ 前置：C2 平台层骨架

## Goal

把绑定 macOS 系统 API 的体验型能力（防休眠、剪贴板文件复制、截图直通车）做 Windows 等价实现或明确降级，消除非 darwin 平台的裸错/"macOS only"返回，让前端能优雅灰显不可用能力。

## Background（已核实，file:line）

- **防休眠** `main.js:249-302`：`/usr/bin/sudo pmset -a disablesleep`，首次开启装 `/etc/sudoers.d/fanbox-pmset` 免密规则（`visudo` 校验 + `osascript` 管理员框）；非 darwin 直接 `return false`（`:265,302`）。
- **剪贴板文件复制** `main.js:523`：`osascript` `set the clipboard to (POSIX file …)`。
- **截图监听** `main.js:123`：`if (platform !== 'darwin' || shotWatcher) return`——仅 darwin 启动监听。
- **能力裸返回** `main.js:792` `wechat:lid` 非 darwin 返回 `{ok:false,error:'macOS only'}`；`:810` `wechat:powerState` 暴露 `stayAwake/active/platform`。

## Requirements

- **R7.1** 防休眠 Windows 实现：`SetThreadExecutionState`（原生/ffi）或 `powercfg`/presentation 方案；默认关闭，开关语义对齐 `wechat:powerState`；无需提权（对比 macOS 的 sudoers）。
- **R7.2** 剪贴板文件复制：Windows MVP 降级为"复制路径文本"；`CF_HDROP` 真文件复制列为后续。
- **R7.3** 截图：Windows 不启动 macOS 目录监听不报错；截图目录策略后补（MVP 可不实现，标 unsupported）。
- **R7.4** 统一"能力不可用"返回结构（替换 `'macOS only'` 裸串），前端据此灰显而非弹错。
- **R7.5** 经 `electron/platform/{power,clipboard}.js` adapter，darwin 逐字保留现实现（父 design.md §5）。

## Acceptance Criteria

- [ ] AC4.1 Windows 开启防休眠后长任务不被系统休眠中断，关闭后恢复默认；无管理员弹框。
- [ ] AC4.2 Windows "复制文件"至少能复制路径文本，Explorer 可粘贴路径；不崩。
- [ ] AC4.3 Windows 启动不因截图监听缺失报错。
- [ ] AC4.4 前端对 Windows 不支持的能力灰显，不出现 "macOS only" 裸错弹窗。
- [ ] AC4.5 macOS 端防休眠/剪贴板/截图零回归。

## Out of Scope

- 高保真截图直通车完整体验（阶段三）。
- `CF_HDROP` 真文件剪贴板（后续迭代）。

## Notes（排序）

依赖 C2 平台层。与 C3 无强依赖，可并行。R7.1 需验证 Windows 电源 API 的实现方式（ffi 依赖 vs `powercfg` 子进程）。
