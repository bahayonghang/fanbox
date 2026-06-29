# Windows 打包与 CI

> 父任务：`06-29-windows-port` ｜ 阶段一 ｜ 覆盖 R1, R9, D2, D3

## Goal

让 FanBox 能在 Windows 上产出可安装/可运行的发布产物，并由 CI 在 Windows runner 自动构建；同时新增跨平台 `justfile` 统一本地/CI 的 check、test、build 入口，并一次性落地轻量分支治理（upstream remote + rerere），使 fork 能持续 rebase 上游。不破坏现有 macOS 构建。

## Background（file:line 锚点）

- `package.json:17` `"dist": "electron-builder --mac"`——只打 macOS。
- `package.json:31-49` build 仅 `mac.target=dmg/arm64` + Apple identity/hardenedRuntime/entitlements；无 `win` 段、无 `icon.ico`。
- `package.json:12` `"rebuild": "electron-rebuild -f -w node-pty"`、`package.json:28-30` `asarUnpack node-pty`——node-pty 原生模块需在 Windows runner 重建。
- `package.json:16` `predist` 跑 `check:vendor-patch`（xterm 补丁校验），勿破坏。
- 仓库当前无 `justfile`；跨平台本地/CI 命令入口尚未统一。
- 仓库无 `.github/workflows` Windows 构建（待建）。
- 2026-06 GitHub 已将 `windows-latest` / `windows-2025` 迁移到 VS 2026；当前 `@electron/node-gyp` 10.x 只识别到 VS 2022，需先 pin `windows-2022` 跑 node-pty rebuild。
- 现状：`origin=bahayonghang/fanbox`，在 `win` 分支，无 `upstream` remote。

## Requirements

- **R1.1** 新增 `package.json` `build.win`：`target=[nsis, zip]`，`icon: build/icon.ico`，Windows artifact 命名。
- **R1.2** 新增 `dist:win` 脚本（`electron-builder --win`）；保留 `dist`(mac) 不变。
- **R1.3** 提供 `build/icon.ico`（由现有 icon 资源转换）。
- **R1.4** node-pty 在 Windows 上 `electron-rebuild` 通过；asarUnpack 保留。
- **R1.5** 新增跨平台 `justfile`，至少提供 `check`、`test`、`build`、`build-mac`、`build-win`、`ci`；Windows 与 macOS 均可使用同一套 recipe 名称。
- **R9.1** 新增 `.github/workflows/windows-build.yml`：`windows-2022` 跑 `npm ci` → `just ci`（内部覆盖 `check`、`test`、Windows build/rebuild）并上传 `.exe`/`.zip` artifact；等 Electron/node-gyp 支持 VS 2026 后再评估恢复 `windows-latest`。
- **D2.1** 配置 `upstream=alchaincyf/fanbox` remote + `git config rerere.enabled true`；在 README/docs 记录"继续在 `win` 分支、日常 rebase upstream/master"的同步流程。

## Acceptance Criteria

- [ ] AC1.1 `npm run dist:win` 在 Windows 本地/CI 产出 `.exe`(nsis) 与 `.zip`。
- [ ] AC1.2 安装/解压后能启动并显示 UI（基础冒烟，不含 agent）。
- [ ] AC1.3 `npm run dist`(mac) 行为不变，`predist`/`check:vendor-patch` 仍通过。
- [ ] AC1.4 `just --list` 显示 `check`、`test`、`build`、`build-mac`、`build-win`、`ci`；`just check` 可在当前平台通过。
- [ ] AC1.5 GitHub Actions `windows-build.yml` 通过 `just ci` 绿灯并产出可下载 artifact。
- [ ] AC1.6 `git remote -v` 含 upstream；rerere 开启；同步流程已文档化。

## Out of Scope

- 代码签名 / SmartScreen（→ C6）。
- release tag / 版本号通道（→ C5/C6）。
- 任何 agent 运行时修复（→ C2）。

## Dependencies / Ordering

C1 不依赖其他子任务，可与 C2 并行。C1 完成后需为 C2 提供可安装或可解压运行的 Windows 产物，用于 Windows agent P0 实机冒烟。
