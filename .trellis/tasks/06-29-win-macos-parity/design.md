# 设计：C4 macOS 专属能力 Windows 化

## 1. 范围与目标

C4 只处理 Electron 主进程里绑定 macOS API 的体验型能力：

- 防休眠 / 离开不待机：`electron/main.js:249-354`、`electron/main.js:769-789`。
- 文件剪贴板：`electron/main.js:518-525` 和前端复制文案 `public/app.js:752-780`。
- 截图直通车：`electron/main.js:113-151`、`electron/preload.js:49-53`。
- 能力不可用返回：当前 `wechat:setStayAwake` 在非 darwin 返回 `{ ok:false, error:'macOS only' }`。

目标是让 Windows 有等价实现或明确降级，不再把 macOS 细节暴露给上层 UI；macOS 行为保持原语义。

不做：C3 已完成的 server 系统命令适配；C5 更新通道；C6 的高保真 ConPTY / 签名 / upstream PR；Windows `CF_HDROP` 真文件剪贴板；Windows 截图目录策略。

## 2. 当前证据

- `electron/platform/` 目前只有 `env.js` / `shell.js`，C4 所需的 `power.js` / `clipboard.js` / `screenshot.js` 尚不存在。
- `electron/main.js:268-302` 直接调用 `/usr/bin/sudo pmset`、`visudo`、`osascript` 安装 macOS sudoers 规则；非 darwin 的 `trySetDisableSleep()` / `ensurePmsetRule()` 直接返回 false。
- `electron/main.js:771` 对 Windows 裸返回 `"macOS only"`，但 `public/app.js:2252-2254` 又直接隐藏非 macOS 按钮，导致能力状态没有结构化原因。
- `electron/main.js:524` 复制文件到剪贴板只调用 AppleScript；Windows 会失败。
- `public/app.js:753,780` 文案固定为"访达里可粘贴"，Windows 上不准确。
- `startShotWatch()` 已经在非 darwin 直接 return，不会崩，但没有统一能力描述。

## 3. Adapter 边界

新增 Electron 主进程平台 adapter：

```text
electron/platform/power.js
  setStayAwake(on, context) -> Promise<{ok,on,active,connected?,unsupported?,reason?,error?}>
  powerState(context) -> {ok,stayAwake,active,platform,supported,mode,reason?}
  refreshPowerGuard(context) -> {active, changed?}
  cleanupPowerGuard() -> void

electron/platform/clipboard.js
  copyImage(path, deps) -> {ok,error?}
  copyFile(path, deps) -> Promise<{ok,mode?,unsupported?,error?}>
  fileCopyLabel(platform) -> {actionTitle, successText}

electron/platform/screenshot.js
  startShotWatch(context) -> {ok,supported,watching,reason?}
  screenshotState() -> {supported,watching,platform,reason?}
```

`context` 只传 C4 必需依赖，避免 adapter 反向依赖整个主进程：

- `power.js`：`platform`、`powerSaveBlocker`、`dialog`、`winProvider`、`readConfig`、`writeConfig`、`terminalsSize`、`wechatConnected`、`buildMenu`、`sendPower`、`localize`。
- `clipboard.js`：`nativeImage`、`clipboard`。
- `screenshot.js`：`fs`、`path`、`os`、`execSync`、`winProvider`。

业务文件保留状态变量所有权，adapter 只集中平台实现和返回 shape。这样 C4 的 main.js 改动保持薄调用点替换，符合父任务 adapter 契约。

## 4. 防休眠设计

### 4.1 macOS

macOS 分支保留现有 `pmset disablesleep` + sudoers + AppleScript 管理员确认流程：

- `trySetDisableSleep(on)` 仍执行 `/usr/bin/sudo -n pmset -a disablesleep 0|1`。
- `installSudoers()` 仍创建 `/etc/sudoers.d/fanbox-pmset` 并用 `visudo -cf` 校验。
- 菜单的"合盖后继续运行"和 WeChat 的"离开不待机"继续 OR 结算：`lidIntent && terminals.size > 0` 或 `wechatStayAwake && wechatConnected`。

迁移时不改变用户确认文案和取消错误码：`cancelled` / `setup-cancelled`。

### 4.2 Windows / Linux

Windows MVP 使用 Electron 内置 `powerSaveBlocker.start('prevent-display-sleep')`：

- 不新增 ffi/native 依赖，不要求管理员权限，不碰全局 `powercfg`。
- 与 macOS 不同，Electron assertion 不能保证"合盖继续跑"语义；因此 Windows `mode` 标为 `powerSaveBlocker`，UI 文案不能承诺合盖。
- 触发条件沿用原 OR 结算，但 Windows 上 `wechat:setStayAwake(true)` 可直接开启 blocker，不弹管理员框。
- 关闭、断开微信、终端退出或 app quit 时调用 `powerSaveBlocker.stop(id)`。

Linux 暂按 unsupported 返回，不新增桌面环境差异适配。

统一返回结构：

```js
{ ok: true, on, active, supported: true, mode: 'pmset' | 'powerSaveBlocker', platform }
{ ok: false, on, active, supported: false, unsupported: true, reason: 'unsupported-platform', platform }
```

## 5. 剪贴板设计

`clip:image` 保留 Electron `nativeImage` + `clipboard.writeImage()`，跨平台可用。

`clip:file`：

- macOS：保留 AppleScript `set the clipboard to (POSIX file ...)`，Finder 可粘贴文件。
- Windows：MVP 降级为 `clipboard.writeText(path)`，返回 `{ ok:true, mode:'path-text' }`；这满足"至少可复制路径文本，不崩"。
- Linux：同样降级为路径文本。

前端文案按返回 `mode` 或平台调整：

- macOS 成功："已复制文件，可在访达里粘贴"。
- Windows / Linux 路径降级："已复制文件路径"。
- tooltip 从固定"访达里可粘贴"改为平台相关；Windows 不声称 Explorer 可以粘贴成文件。

`CF_HDROP` 真文件剪贴板不在 C4 实施，留给后续。

## 6. 截图设计

macOS 保留现有 `defaults read com.apple.screencapture location` + `fs.watch` + 稳定文件大小轮询。

Windows / Linux：

- `startShotWatch()` 返回 `{ ok:true, supported:false, watching:false, reason:'unsupported-platform' }`，启动不报错。
- `fanboxShot.onNew` preload API 保持存在，前端无事件即可。
- 不引入 Windows 截图目录策略，不监听 Pictures/Screenshots。

## 7. 前端能力呈现

C4 只做必要前端适配：

- WeChat `wx-awake` 按钮从"仅 macOS 显示"改为基于 `powerState().supported` 显示/隐藏。
- Windows 上按钮文案改成不承诺合盖，例如"保持唤醒"；macOS 继续"离开不待机"。
- unsupported 时隐藏或禁用，不弹 `"macOS only"` 裸错。
- 复制文件文案按 `copyFile()` 返回 `mode` 选择。

不改整体布局，不做视觉重构。

## 8. 测试与验证

新增 Node 内置测试，避免引入测试框架：

- `scripts/test-platform-power.js`
  - 模拟 darwin，验证 unsupported 不会出现在 macOS happy path 的状态 shape。
  - 模拟 win32 + fake `powerSaveBlocker`，验证 start/stop 幂等、无需管理员确认、返回 `mode:'powerSaveBlocker'`。
  - 模拟 linux，验证 unsupported shape。
- `scripts/test-platform-clipboard.js`
  - 模拟 win32，`copyFile()` 写入路径文本并返回 `mode:'path-text'`。
  - 模拟 darwin，验证会调用 `osascript` argv 传参，不拼接路径字面量。

验证命令：

```powershell
node --check electron\platform\power.js electron\platform\clipboard.js electron\platform\screenshot.js electron\main.js public\app.js
npm run test:platform
just check
just test
npm run check:vendor-patch
git diff --check
```

人工验证：

- Windows：WeChat 面板出现可用的保持唤醒开关；开启后无管理员弹框，关闭后恢复；复制文件返回路径文本；启动无截图监听错误。
- macOS：pmset / sudoers 流程、Finder 文件粘贴、截图直通车保持原行为。

## 9. 风险与回滚

- `electron/main.js` 是高风险文件，C4 只抽出平台函数，不重排 pty、update、recording、wechat bridge。
- Windows `powerSaveBlocker` 不能保证合盖行为，文案必须避免过度承诺；真正 `SetThreadExecutionState` / `powercfg` 方案留后续。
- macOS sudoers 逻辑迁移时要逐字保留命令和错误码，避免破坏既有用户流程。
- 回滚点：删除新增 adapter 文件，把 `main.js` 的 C4 调用点恢复为原函数体；前端文案改动可单独 revert。

