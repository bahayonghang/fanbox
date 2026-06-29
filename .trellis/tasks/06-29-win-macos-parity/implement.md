# 执行计划：C4 macOS 专属能力 Windows 化

## 启动前门禁

- 当前只补规划文件，不启动任务。
- Review 通过后再运行：`python ./.trellis/scripts/task.py start 06-29-win-macos-parity`。
- 启动后先运行 `trellis-before-dev`，读取 backend/frontend spec 与本任务 `prd.md` / `design.md` / `implement.md`。
- 当前为 Codex inline 模式：跳过 `implement.jsonl` / `check.jsonl` curated context gate。

## 成功标准

- Windows 上 `wechat:setStayAwake` 不再返回 `"macOS only"`，而是可用的 `powerSaveBlocker` 实现或结构化 unsupported。
- Windows 文件复制至少复制路径文本，不因 AppleScript 缺失失败。
- Windows 启动不因截图能力缺失报错，截图能力明确 unsupported。
- 前端不显示 macOS 专属裸文案；unsupported 能力灰显或隐藏。
- macOS 的 pmset、Finder 文件复制、截图监听保持原语义。

## 实施清单

### 1. 建立 `electron/platform/power.js`

改动：

- 新增 `power.js`，集中：
  - macOS `trySetDisableSleep()` / `installSudoers()` / `ensurePmsetRule()`。
  - Windows `powerSaveBlocker.start('prevent-display-sleep')` / `stop(id)`。
  - `computeWant()`：`(lidIntent && terminalsSize > 0) || (wechatStayAwake && wechatConnected)`。
  - `powerState()` 统一返回 `supported`、`mode`、`reason`。
- 将 macOS sudoers 命令、AppleScript 管理员框和错误码从 `main.js` 平移进 adapter。
- Linux 先返回 `unsupported-platform`。

验证：

```powershell
node --check electron\platform\power.js
node scripts\test-platform-power.js
```

### 2. 替换 `electron/main.js` 电源薄调用点

改动：

- 引入 `electron/platform/power.js`。
- `refreshLidGuard()` 改为调用 adapter，保留 `lidIntent` / `wechatStayAwake` / `wechatConnected` 状态变量在 `main.js`。
- `setLidIntent(on)` 保留菜单确认入口，但平台实现委托 adapter。
- `wechat:setStayAwake`：
  - darwin 仍弹原确认和安装 sudoers。
  - win32 不弹管理员框，更新 `wechatStayAwake`，调用 adapter 开关。
  - unsupported 平台返回结构化 unsupported。
- app 启动和退出时清理 power blocker / pmset 状态。

验证：

```powershell
rg -n "macOS only|pmset|osascript|visudo|powerSaveBlocker" electron\main.js electron\platform\power.js
```

预期：`pmset` / `visudo` / sudoers AppleScript 集中在 `power.js`；`main.js` 不再返回 `"macOS only"`。

### 3. 建立 `electron/platform/clipboard.js`

改动：

- 新增 `clipboard.js`：
  - `copyImage(path, deps)` 保留现有 nativeImage 行为。
  - `copyFile(path, deps)` darwin 走 AppleScript argv；win32/linux 写路径文本。
  - 返回 `mode:'file-object'` 或 `mode:'path-text'`。
- `clip:image` / `clip:file` IPC 改为薄调用 adapter。

验证：

```powershell
node --check electron\platform\clipboard.js
node scripts\test-platform-clipboard.js
```

### 4. 建立 `electron/platform/screenshot.js`

改动：

- 新增 `screenshot.js`，迁移 `screenshotDir()` / `startShotWatch()`。
- darwin 保留当前截图命名匹配和文件大小稳定轮询。
- win32/linux 返回 unsupported 状态，不抛错。
- `main.js` app ready 仍调用 `startShotWatch()`，但无需平台判断散落在业务文件。

验证：

```powershell
node --check electron\platform\screenshot.js
```

### 5. 前端能力文案与灰显

改动：

- `public/app.js` 中 `syncAwake()` 从 `platform === 'darwin'` 改为 `powerState().supported`。
- macOS 按钮文案保留"离开不待机"；Windows 使用"保持唤醒"类文案，避免承诺合盖。
- `copyFile()` 按返回 `mode` 显示成功 toast：
  - `file-object`：文件已复制，可在访达/文件管理器粘贴。
  - `path-text`：文件路径已复制。
- 预览工具栏 tooltip 从固定"访达里可粘贴"改为平台相关。

验证：

```powershell
node --check public\app.js
rg -n "访达|macOS only|离开不待机|保持唤醒" public\app.js electron\main.js
```

预期：macOS 专属文案只保留在 darwin 分支或平台判断之后。

### 6. 接入测试入口并跑全量检查

改动：

- 将 `scripts/test-platform-power.js` 和 `scripts/test-platform-clipboard.js` 接入 `npm run test:platform`。
- 不改 build / dist 配置。

验证：

```powershell
node --check electron\platform\power.js electron\platform\clipboard.js electron\platform\screenshot.js electron\main.js public\app.js scripts\test-platform-power.js scripts\test-platform-clipboard.js
npm run test:platform
just check
just test
npm run check:vendor-patch
git diff --check
```

## Review gate 检查清单

```powershell
rg -n "macOS only" electron public
rg -n "pmset|visudo|fanbox-pmset|osascript" electron\main.js electron\platform
rg -n "powerSaveBlocker|prevent-display-sleep|path-text|unsupported-platform" electron public scripts
npm run test:platform
just check
```

预期：

- `"macOS only"` 不再作为用户可见错误从 C4 IPC 返回。
- macOS `pmset` / sudoers 逻辑集中在 `electron/platform/power.js`。
- Windows 防休眠使用 `powerSaveBlocker`，复制文件降级为路径文本。
- 测试通过；macOS 实机验证若不可用，在最终报告中列为待补测。

## 风险文件与回滚点

- `electron/main.js`：只做 C4 相关薄调用点替换；不改 pty、update、recording、wechat bridge。
- `public/app.js`：只改能力显示和文案；不重构 WeChat 面板。
- `electron/platform/power.js`：新增文件，是主要回滚点。
- `electron/platform/clipboard.js`：新增文件，可独立回滚。
- `electron/platform/screenshot.js`：新增文件，可独立回滚。
- `package.json`：只允许追加 C4 测试到 `test:platform`。

