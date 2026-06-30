# 更新通道拆分(上游源码 vs Windows 包)

> 父任务：`06-29-windows-port` ｜ 阶段二 ｜ 覆盖 R8 ｜ 依赖：C1 release 产物形态

## Goal

把当前硬编码到上游 `alchaincyf/fanbox` 的单一更新检查，拆成"上游源码更新"与"Windows 二进制包更新"两个通道，并在 UI 区分提示，避免 Windows 用户被导向 macOS `.dmg`。

## Background（已核实，file:line）

- `main.js:10-27,31-67` 更新检查固定请求 `api.github.com/repos/alchaincyf/fanbox/releases/latest` 与上游 release page。
- 当前只有一个概念，无法区分"上游发了新源码版本"与"Windows fork 发了新安装包"。
- C1 已确定 Windows release 产物形态：`package.json` `build.win.target=["nsis","zip"]`，`artifactName="${productName}-${version}-win-${arch}.${ext}"`，所以 Windows 下载候选只认 GitHub release asset 中的 `.exe` / `.zip`。
- `electron/preload.js` 已有 `window.fanboxUpdate` IPC：`onAvailable` / `get` / `open`；`public/app.js` 只渲染单一 `.update-pill`，当前文案为"新版本 vX 已发布 / 去下载"。

## Requirements

- **R8.1** 引入两个可配置源：`FANBOX_UPSTREAM_REPO=alchaincyf/fanbox`（源码版本）、`FANBOX_RELEASE_REPO=bahayonghang/fanbox`（或独立 `fanbox-windows`，Windows 包版本）。
- **R8.2** 更新检查逻辑经 `electron/platform/update.js`：`checkUpstream()` / `checkRelease()` 双查询。
- **R8.3** UI 区分两类提示：上游源码新版 → "建议同步源码"；Windows 包新版 → "建议下载安装包"。
- **R8.4** Windows 用户的下载入口指向 Windows 产物，绝不指向 macOS `.dmg`。
- **R8.5** macOS 行为保持：仍可只检查上游（darwin 不引入 Windows release 噪声）。
- **R8.6** GitHub API 失败时保留 `releases/latest` 重定向兜底；Windows release 通道若没有 `.exe`/`.zip` asset，不推送"下载安装包"提示。

## Acceptance Criteria

- [ ] AC5.1 Windows 上"检查更新"命中 `FANBOX_RELEASE_REPO` 的 Windows 包版本，提示文案正确、下载链接指向 `.exe`/`.zip`。
- [ ] AC5.2 上游源码有新版时单独提示"同步源码"，与二进制更新不混淆。
- [ ] AC5.3 未配置 `FANBOX_RELEASE_REPO` 时安全降级（不报错、退回仅上游提示）。
- [ ] AC5.4 macOS 更新检查不回归。
- [ ] AC5.5 `node --check electron/platform/update.js electron/main.js electron/preload.js public/app.js` 与 `npm run test:platform` 通过。

## Out of Scope

- 自动下载/自动安装（仅做检查 + 提示）。
- release 版本号命名规范（`v2.3.3-win.1` 等 → C6）。

## Notes（排序）

依赖 C1 确定 release 产物与仓库形态后再定稿。小而独立。
