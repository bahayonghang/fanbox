# 执行计划：C5 更新通道拆分

## 0. 启动前 gate

- [ ] `prd.md` 已收敛到 R8 / AC5。
- [ ] `design.md` 定义 adapter、payload、macOS/Windows 分流和降级。
- [ ] 用户已要求继续实施；Codex inline 模式跳过 JSONL curated context gate。
- [ ] 运行 `python ./.trellis/scripts/task.py start 06-29-win-update-channel`。

## 1. 预检

```bash
git status --short
node --check electron/main.js electron/preload.js public/app.js
npm run test:platform
```

## 2. 新增 update adapter

新增 `electron/platform/update.js`：

- 抽出 `cmpVer()`。
- 实现 repo 解析、GitHub latest API 查询、`releases/latest` redirect fallback。
- `checkRelease()` 只在 API 返回 `.exe` / `.zip` asset 时返回安装包下载 URL。
- 导出 `_test` 小函数，供平台测试验证 asset 筛选和 env repo 行为。

## 3. 替换 main.js 更新检查

修改 `electron/main.js`：

- 引入 `platformUpdate`。
- 删除本地 `cmpVer()` / `fetchLatestRelease()` / `REL_PAGE`。
- `checkUpdate()` 调 `platformUpdate.checkUpdates({ net, platform: process.platform, currentVersion: app.getVersion(), env: process.env })`。
- `pendingUpdate` 保存 `primary` payload，自动推送只推 primary。
- 手动对话框按 `kind` 切文案和按钮动作。
- 保留自动失败重试与 `update:open` GitHub allowlist。

## 4. 更新前端 pill

修改 `public/app.js`：

- `bindUpdateNotice()` 接受扩展 payload。
- 按 `kind` 显示 Windows 包 / 上游源码文案。
- skip key 带上 `kind`，避免跳过源码提示也误跳过 Windows 包提示。
- 动态文本继续用 `escapeHtml`。

## 5. 测试

新增或扩展平台测试：

```bash
node --check electron/platform/update.js electron/main.js electron/preload.js public/app.js
npm run test:platform
just check
just test
```

重点断言：

- `.exe` 优先于 `.zip`，`.dmg` 不会成为 Windows 下载入口。
- `FANBOX_RELEASE_REPO=""` 时 release 通道关闭。
- macOS `checkUpdates()` primary 只来自 upstream。
- Windows release 不可用时 primary 可退回 upstream。

## 6. 完成记录

实施后在本文件追加执行记录，并运行：

```bash
python ./.trellis/scripts/task.py validate 06-29-win-update-channel
```

若验证通过，再进入 Trellis check / finish-work 流程。

## 7. 执行记录（2026-06-30）

已完成：

- 新增 `electron/platform/update.js`，集中处理 `FANBOX_UPSTREAM_REPO` / `FANBOX_RELEASE_REPO`、GitHub latest API、upstream redirect fallback、版本比较与 Windows asset 筛选。
- `electron/main.js` 的更新检查改为调用 `platformUpdate.checkUpdates()`；Windows 优先 Windows package，macOS 仍只看 upstream；手动检查对话框按 `release` / `source` 区分文案和按钮。
- `public/app.js` 的 update pill 支持 `kind`、`action`、`secondary`，Windows 包提示与上游源码提示分离；skip key 改为 `<kind>:<version>`，避免跨通道误跳过。
- `public/style.css` 为 secondary update action 增加轻量样式。
- 新增 `scripts/test-platform-update.js` 并接入 `npm run test:platform`。
- `.trellis/spec/backend/quality-guidelines.md` 新增 Electron Update Channel Adapter Contract，固化 repo/env、payload、asset 过滤和测试门禁。

已验证通过：

- `node --check electron/platform/update.js electron/main.js electron/preload.js public/app.js scripts/test-platform-update.js`
- `npm run test:platform`
- `just check`
- `just test`
- `python ./.trellis/scripts/task.py validate 06-29-win-update-channel`
- `git diff --check`（仅 CRLF 工作区提示，无 whitespace error）
- `rg -n "fetchLatestRelease|REL_PAGE|api\\.github\\.com/repos/alchaincyf/fanbox" electron public scripts package.json -S`：旧单通道硬编码只剩 update adapter 测试中的默认 repo fixture。
