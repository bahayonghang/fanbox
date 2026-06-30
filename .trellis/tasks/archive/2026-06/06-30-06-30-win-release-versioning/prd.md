# Windows release versioning strategy

> 父任务：`06-29-win-longterm` ｜ C6-L3 ｜ 从长期路线容器拆出的可执行子任务

## Goal

定义并落地 Windows 二进制 release 的版本策略，使 `v2.3.3-win.1` 这类 tag 能清楚对应上游 `v2.3.3`，且 FanBox 的发版向导、Windows 产物命名、更新检查比较逻辑对该策略一致。

## Background

- C5 已拆分上游源码更新与 Windows 包更新，但明确把 release 版本号命名规范留给 C6。
- C1 已确定 Windows 产物为 `nsis` + `zip`，命名包含 `${version}-win-${arch}`。
- 当前 `electron/platform/update.js` 的 `cmpVer()` 只比较前三段数字；`v2.3.3-win.1` 与 `2.3.3` 会被判定相等，Windows 用户不会收到包更新提示。
- 当前发版向导只展示一个版本号输入，并且打包命令/Release 附件仍偏向 macOS `.dmg`。

## Requirements

- **R1 版本格式**：Windows 包 tag 采用 `v<upstream-version>-win.<n>`，例如 `v2.3.3-win.1`；`<upstream-version>` 必须是 `x.y.z`，`n` 为正整数。
- **R2 版本关系**：同一上游版本下，`2.3.3-win.2` > `2.3.3-win.1` > `2.3.3`；不同上游版本仍以 `x.y.z` 为主序。
- **R3 更新检查**：Windows release channel 必须把 `v2.3.3-win.1` 识别为比当前 `2.3.3` 更新；相同 tag 不重复提醒。
- **R4 发版向导**：项目支持 `dist:win` 时，发版向导允许选择 Windows 包版本，建议下一个 `-win.N`，打包命令使用 `npm run dist:win`，GitHub Release 附件使用 `.exe` / `.zip`。
- **R5 兼容性**：macOS/source release 现有 `x.y.z` 流程不回归；不引入新依赖，不改变 `electron-builder` 的 macOS 配置。

## Acceptance Criteria

- [ ] AC1：`cmpVer('v2.3.3-win.1', '2.3.3') > 0`，`cmpVer('v2.3.3-win.2', '2.3.3-win.1') > 0`，`cmpVer('v2.3.4', '2.3.3-win.9') > 0`。
- [ ] AC2：`npm run test:platform` 覆盖 Windows release suffix 比较和 primary update 选择。
- [ ] AC3：发版向导检测到 `dist:win` 后能选择 Windows 包版本，并生成 `npm run dist:win` + `gh release create vX-win.N ... dist/*X-win-*.exe dist/*X-win-*.zip`。
- [ ] AC4：普通 `x.y.z` 发版仍使用原有 macOS `npm run dist` 与 `.dmg` 附件路径。
- [ ] AC5：`node --check`、`just check`、`just test` 通过。

## Out of Scope

- 代码签名 / SmartScreen 信誉。
- 自动下载或安装更新包。
- ConPTY 深度稳定性测试。
- 上游 PR 提交流程。
