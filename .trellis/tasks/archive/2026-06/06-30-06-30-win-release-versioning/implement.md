# 执行计划：Windows release 版本策略

## 0. 启动前 gate

- [ ] C6 本体保持路线追踪，本任务作为 C6-L3 子任务单独实施。
- [ ] `prd.md` / `design.md` 已定义版本格式、比较规则、发版向导边界。
- [ ] 运行 `python ./.trellis/scripts/task.py start 06-30-06-30-win-release-versioning`。

## 1. 预检

```bash
git status --short
node --check electron/platform/update.js server.js public/app.js scripts/test-platform-update.js
npm run test:platform
```

## 2. 更新 update adapter

- 将 `versionParts()` 替换为能解析 `x.y.z-win.N` 的内部 helper。
- `cmpVer()` 在 base 相同时比较 Windows package revision。
- 保持 `_test.versionParts` 或补充测试导出，避免破坏现有脚本。

## 3. 更新发版向导后端

- `releaseInspect()` 返回 `hasWinDist`、`nextSourceVersion`、`nextWinVersion`。
- `releasePrepare()` 接受 `channel`：
  - `source`：只接受 `x.y.z`。
  - `win`：只接受 `x.y.z-win.N`，且项目必须有 `dist:win`。
- channel 决定 build 命令与 GitHub Release asset glob。

## 4. 更新发版向导前端

- `hasWinDist` 时显示 source/win select。
- 切换 channel 自动填建议版本号。
- 打包 checkbox 与 GitHub Release 文案跟随 channel 变化。
- 维持原有 toast / terminal run 行为。

## 5. 测试

```bash
node --check electron/platform/update.js server.js public/app.js scripts/test-platform-update.js
npm run test:platform
just check
just test
python ./.trellis/scripts/task.py validate 06-30-06-30-win-release-versioning
git diff --check
```

重点断言：

- `v2.3.3-win.1` > `2.3.3`。
- `v2.3.3-win.2` > `2.3.3-win.1`。
- `v2.3.4` > `2.3.3-win.9`。
- Windows release primary 可由 `-win.N` tag 触发。
- source release 命令仍附 `.dmg`，win release 命令附 `.exe` / `.zip`。

## 6. 完成记录

实施后在本文件追加执行记录，再进入 Trellis check / finish-work / commit。

## 7. 执行记录（2026-06-30）

已完成：

- `electron/platform/update.js` 的版本比较支持 `vX.Y.Z-win.N`，同 base 下 Windows 包修订高于纯 base，且 `N` 数字递增。
- `scripts/test-platform-update.js` 覆盖 `v2.3.3-win.1 > 2.3.3`、`win.2 > win.1`、高 base 优先，以及 Windows release primary 选择。
- `server.js` 的发版向导新增 source / win channel：source 仍要求 `x.y.z`，win 要求 `x.y.z-win.N` 且项目必须有 `dist:win`。
- Windows 发版命令生成 `npm run dist:win`、`gh release create vX-win.N`、`.exe` / `.zip` asset globs；source/macOS 发版保留 `npm run dist` 和 `.dmg`。
- `public/app.js` 在项目支持 `dist:win` 时显示类型选择，并自动填 `nextSourceVersion` / `nextWinVersion`。
- `scripts/test-release-wizard.js` 用临时项目和临时端口验证 release inspect / prepare API，不修改当前仓库版本。
- `.trellis/spec/backend/quality-guidelines.md` 固化 Windows release suffix 规则和测试门禁。

已验证通过：

- `node --check electron/platform/update.js server.js public/app.js scripts/test-platform-update.js scripts/test-release-wizard.js`
- `npm run test:platform`
