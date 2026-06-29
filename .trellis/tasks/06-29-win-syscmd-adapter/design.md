# 设计：C3 系统命令适配

## 1. 范围与目标

C3 只处理 `server.js` / `electron/main.js` 中与文件系统辅助能力相关的系统命令适配：

- 新增根级 `server-platform.js`，承接父任务定义的后端 adapter 契约。
- 将 `server.js` 的磁盘占用、压缩包列表、缩略图 / HEIC 转码、系统打开、内容搜索、命令检测调用收敛到 adapter。
- 将 `electron/main.js` 的终端 cwd 查询收敛到同一个 adapter。
- Windows 分支提供等价实现或明确降级；macOS 分支保留现有行为。

不做：防休眠、剪贴板、截图监听、`wechat:lid` 等 macOS 专属能力（C4）；更新通道（C5）；签名 / SmartScreen / ConPTY 深水区（C6）。

## 2. 当前证据

- `server.js:315-374`：`grepFiles()` 与 `contentSearch()` 当前先走 `mdfind`，无命中或失败后走 grep 回退。
- `server.js:781-802`：`diskUsage()` 对目录批量调用 `du -sk`。
- `server.js:806-892`：`archiveList()` 自读 zip 中央目录后回退 `unzip` / `tar` / `gzip`。
- `server.js:1078-1128`：`openInOS()` / `openDefault()` 在 Windows 已用 `start` / `explorer`，但仍留在业务文件。
- `server.js:1169-1262`：`generateThumb()` / `serveHeicAsJpeg()` 依赖 `sips` / `qlmanage`。
- `electron/main.js:704-733`：`termCwdByPid()` 依赖 `lsof` 查询 pty 子进程 cwd。
- C2 已落地 `electron/platform/{env,shell}.js`，`server.js` 已引入 `whichBin` / `fullEnv`。

## 3. Adapter 边界

新增 `server-platform.js`：

```js
diskUsage(dir, deps) -> Promise<{ok, dir?, total?, items?, more?, partial?, error?}>
archiveList(file, deps) -> Promise<{ok, entries?, truncated?, unsupported?, error?}>
generateThumb(src, meta, size, cacheFile, isImg, deps) -> Promise<void>
transcodeHeic(src, cacheFile, deps) -> Promise<void>
openInOS(target, withApp, deps) -> Promise<{ok, with?, error?}>
commandExists(bin, deps) -> Promise<boolean>
terminalCwd(pid, deps) -> Promise<string|null>
contentSearch(query, rootPath, deps) -> Promise<{results, truncated?, engine?}>
```

`deps` 只用于把 `server.js` 里已有的安全边界和工具函数注入 adapter，避免 `server-platform.js` 反向依赖整个 server：

- `resolvePath`
- `grepFiles`
- `walk`
- `kindOf`
- `ext`
- `thumbDir`
- 可选 `home`

原则：

- adapter 内部按 `process.platform` 分支。
- macOS 分支搬运当前命令语义，不改变 API 返回 shape。
- Windows 分支优先 Node 内置模块和系统自带命令，不新增运行时依赖。
- 降级要可预期：返回 `unsupported`、`null`、或抛给上层现有 415 / fallback 图标逻辑，不能让 UI 崩溃。

## 4. 各能力设计

### 4.1 diskUsage

macOS / Linux：

- 保留目录批量 `du -sk` 语义。
- 文件仍走 `lstat().size`。

Windows：

- 用 Node 递归遍历目录累加文件大小。
- 对每个顶层子目录设置单项时间预算；总体超时后返回已算出的部分结果，并标记 `partial: true`。
- 遇到权限错误或 symlink 循环跳过，不让单个子树拖垮 UI。

返回仍按 size 降序，最多 60 项。

### 4.2 archiveList

所有平台：

- 保留自读 zip 中央目录逻辑，确保中文文件名按 UTF-8 / GBK 解码。

macOS / Linux：

- zip64 / 异常 zip 回退 `unzip -l`。
- tar / tgz / tbz / txz 走 `tar -tf`。
- gzip 走 `gzip -l`。

Windows：

- zip 正常路径优先自读中央目录。
- zip64 / 异常 zip 若存在系统 `tar`，尝试 `tar -tf`；否则返回 unsupported。
- tar 类格式若存在系统 `tar`，尝试 `tar -tf`；否则 unsupported。
- gzip 单文件列表在 Windows MVP 可 unsupported，避免引入额外依赖。

### 4.3 thumbnail / HEIC

macOS：

- 图片缩略图继续 `sips -s format ... -Z`。
- 视频 / PDF / 其它继续 `qlmanage -t`。
- HEIC / HEIF 原图预览继续 `sips` 转 jpeg。

Windows / Linux：

- MVP 不做高保真系统 thumbnail，`generateThumb()` 抛出明确错误，`serveThumb()` 保持现有 `415 no thumb`，前端 onerror 回退图标。
- HEIC / HEIF 转码无系统能力时返回失败，`serveHeicAsJpeg()` 保持现有 415，避免崩溃。
- Sharp / ffmpeg / Shell thumbnail 作为后续阶段，不在本任务引入。

### 4.4 openInOS

保留当前行为，但移入 adapter：

- macOS：`open` / `open -R` / `open -a Terminal`。
- Windows：默认 `start "" "<target>"`，reveal `explorer /select,"<target>"`，terminal `start "" cmd /K cd /d "<dir>"`。
- Linux：`xdg-open` / 常见 terminal fallback。

实现时继续用现有返回 `{ ok, with, error }`，不要改变 API。

### 4.5 commandExists

后端直接复用 C2 的 `whichBin()`：

- `commandExists(bin)` 返回布尔值。
- 只提供 adapter 契约；已有 `server.js` 的 agent CLI 检测不再扩大改动。

### 4.6 terminalCwd

macOS：

- 搬运当前 `lsof -a -p <pid> -d cwd -Fn` 行为。
- 保留 `LC_ALL=en_US.UTF-8` 和 `\xNN` 解码。

Windows：

- MVP 返回 `null`。Node 内置模块无法可靠读取任意进程 cwd；PowerShell `Get-Process` 也没有 cwd 字段。
- 上层 IPC 返回 `{ ok: false }` 后 UI 使用已有启动 cwd / 手动定位回退。
- 真实 ConPTY 前台 cwd 追踪列入 C6，不在 C3 手写 Win32 句柄查询。

### 4.7 contentSearch

macOS：

- `mdfind` 仍作为首选，失败或无命中时走 `grepFiles()`。

Windows / Linux：

- 直接调用 `grepFiles()`，返回 `engine: 'grep'`。

## 5. 测试与验证

新增或扩展 Node 内置测试，优先不引入测试框架：

- `scripts/test-server-platform.js`
  - zip 中央目录读取包含中文文件名。
  - `diskUsage()` 能计算临时目录文件与子目录大小。
  - `contentSearch()` 在非 darwin 走 grep fallback。
  - `terminalCwd()` 在 win32 模拟下返回 `null`。
  - thumbnail 在非 darwin 明确失败，上层可回退。

验证命令：

```powershell
node --check server-platform.js server.js electron\main.js
npm run test:platform
node scripts/test-server-platform.js
npm run check:vendor-patch
just check
```

若把 `test-server-platform.js` 接入 `npm run test:platform`，则 `just test` 也必须通过。

## 6. 风险与回滚

- `server.js` 是高风险大文件，实施只做函数搬迁和薄调用点替换，不重排路由和无关 helper。
- `archiveList()` 的 zip 解码是用户可见能力，必须保留 GBK / UTF-8 逻辑。
- `serveThumb()` / `serveHeicAsJpeg()` 依赖缓存文件存在后流式返回，adapter 只负责生成，不负责写 HTTP 响应。
- `electron/main.js` 只替换 `termCwdByPid()` 实现，不改 pty spawn / recording / power 行为。
- 回滚点：移除 `server-platform.js`，把 `server.js` / `electron/main.js` 的调用点恢复到原函数体。
