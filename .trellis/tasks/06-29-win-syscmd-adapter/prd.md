# 系统命令适配(disk-archive-thumb-terminal)

> 父任务：`06-29-windows-port` ｜ 阶段二 ｜ 覆盖 R6 ｜ 前置：C2 平台层骨架

## Goal

把散落在 `server.js`/`main.js` 的 macOS/POSIX 系统命令收敛进 `server-platform.js` adapter，Windows 提供等价实现或明确降级回退，使文件浏览/搜索/预览/磁盘占用/终端定位在 Windows 可用或优雅降级。业务文件只做薄调用点替换。

## Background（已核实，file:line）

- `server.js:785` 磁盘占用 `du -sk`。
- `server.js:810-874` 压缩包：自读中央目录 + `unzip`/bsdtar 回退。
- `server.js:1178,1246` 缩略图/HEIC `sips`；`:1184` `qlmanage` QuickLook 抽帧。
- `server.js:347,360,1005` 内容/名称搜索 `mdfind`（**已有 grep 回退** `:362`）。
- `server.js:446` 删除走 `osascript` Finder（Windows 回收站分支 `:447` 已存在）。
- `server.js:2194` opener（`open`/`start`/`xdg-open` 已跨平台）。
- `main.js:704,719,723` 终端当前目录用 `lsof` 查 pty 子进程 cwd。

## Requirements

- **R6.1** 新增 `server-platform.js`，提供 `diskUsage`、`archiveList`、`thumbnail`、`openInOS`、`commandExists`、`terminalCwd`、`contentSearch`；签名跨平台一致，darwin 逐字保留现命令（父 design.md §4）。
- **R6.2** `diskUsage` Windows：`powershell` 递归求和或 Node 遍历，超时返回部分结果。
- **R6.3** `archiveList` Windows：保留自读 zip（中文名 GBK/UTF-8 正确解），其他格式用 Win10+ 自带 `tar`/bsdtar 或标 unsupported。
- **R6.4** `thumbnail` Windows：MVP 允许回退图标；Shell thumbnail / 阶段二可选 Sharp/ffmpeg。
- **R6.5** `terminalCwd` Windows：ConPTY/进程查询实现或返回 null（UI 退回启动 cwd）。
- **R6.6** `contentSearch` Windows：直接复用现有 `grepFiles` 回退（`mdfind` 仅 darwin）。
- **R6.7** 维持 `server.js` 零第三方依赖原则；重依赖列为可选。

## Acceptance Criteria

- [ ] AC3.1 Windows 上目录磁盘占用能返回（大目录不阻塞 UI，可部分结果）。
- [ ] AC3.2 zip 预览在 Windows 列出条目，中文文件名不乱码。
- [ ] AC3.3 图片缩略图失败时回退图标，不报错崩 UI。
- [ ] AC3.4 终端标签定位在 Windows 不崩（命中真实 cwd 或回退启动 cwd）。
- [ ] AC3.5 内容搜索在 Windows 走 grep 回退可用。
- [ ] AC3.6 业务文件（server.js/main.js）不再直接拼 `du`/`lsof`/`sips`/`qlmanage`/`mdfind`，全部经 adapter；macOS 零回归。

## Out of Scope

- 防休眠/剪贴板/截图（→ C4）。
- 高保真视频/PDF 缩略图（阶段二可选，非验收必需）。

## Notes（排序）

依赖 C2 的 `platform/` 契约。可在 C2 完成后启动；与 C4 无强依赖。
