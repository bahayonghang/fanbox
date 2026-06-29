# 执行计划：C3 系统命令适配

## 启动前门禁

- 显式启动本子任务：`python ./.trellis/scripts/task.py start 06-29-win-syscmd-adapter`。
- 启动后先运行 `trellis-before-dev`，读取 backend spec 与本任务 `prd.md` / `design.md` / `implement.md`。
- 当前为 Codex inline 模式：跳过 `implement.jsonl` / `check.jsonl` curated context gate。
- 不依赖 `task.py current`，当前 session fallback 可能指向 `06-29-win-longterm`。

## 成功标准

- `server.js` 的磁盘占用、压缩包列表、缩略图 / HEIC、系统打开、内容搜索经 `server-platform.js`。
- `electron/main.js` 的 pty cwd 查询经 `server-platform.js`。
- Windows 上 disk / zip / grep 搜索可用；thumbnail / HEIC / terminal cwd 明确降级且 UI 不崩。
- macOS 的 `du` / `unzip` / `tar` / `gzip` / `sips` / `qlmanage` / `mdfind` / `open` / `lsof` 行为不回归。
- 不新增第三方运行时依赖。

## 实施清单

### 1. 建立 `server-platform.js`

改动：

- 新增根级 `server-platform.js`。
- 迁移 `zipNames()` / GBK 解码、`diskUsage()`、archive system command runner、thumbnail command runner、open command builder、`decodeLsofPath()` / terminal cwd 查询、`mdfind` 内容搜索。
- 暴露测试用纯函数时保持命名私有化或 `__test` 聚合，避免业务 API 膨胀。

验证：

- `node --check server-platform.js`
- `node scripts/test-server-platform.js` 覆盖可纯测路径。

### 2. 替换 `server.js` 薄调用点

改动：

- 引入 `server-platform.js`。
- 删除或改薄本地 `mdfind()` / `contentSearch()` / `diskUsage()` / `archiveList()` / `generateThumb()` / `openInOS()` / `openDefault()` 的平台细节。
- `serveThumb()` 和 `serveHeicAsJpeg()` 继续负责 HTTP 缓存和响应，只调用 adapter 生成文件。
- `/api/content`、`/api/open`、`/api/archive`、`/api/du` 返回 shape 不变。

验证：

- `rg -n "du -sk|execFile\\('mdfind'|execFile\\('sips'|execFile\\('qlmanage'|execFile\\('unzip'|lsof -a" server.js`
- 预期这些系统命令不再直接出现在 `server.js`；可在 `server-platform.js` 出现。

### 3. 替换 `electron/main.js` 终端 cwd 查询

改动：

- 引入 `terminalCwd`。
- `termCwdByPid(pid)` 改为薄调用 adapter。
- IPC `pty:cwd` 返回契约保持 `{ ok: true, cwd }` / `{ ok: false }`。
- 不改 `pty:spawn`、ConPTY shell、recording、power guard。

验证：

- `rg -n "lsof -a|decodeLsofPath" electron/main.js`
- 预期 `electron/main.js` 不再直接拼 lsof；macOS 解码逻辑在 adapter。

### 4. 增加 C3 测试

改动：

- 新增 `scripts/test-server-platform.js`，只依赖 Node 内置模块。
- 若现有 `npm run test:platform` 是平台 adapter 测试入口，则追加 `&& node scripts/test-server-platform.js`。

测试重点：

- 临时目录 diskUsage 结果包含文件和子目录。
- zip 中文名：用脚本临时构造一个普通 zip 中央目录，验证 `archiveList()` 返回中文文件名。
- 非 darwin contentSearch 直接走注入的 `grepFiles()`。
- win32 terminalCwd 分支返回 `null`。
- 非 darwin thumbnail 失败可被上层捕获。

验证：

- `npm run test:platform`
- `just test`

### 5. 全量检查

运行：

```powershell
node --check server-platform.js server.js electron\main.js
npm run test:platform
just check
npm run check:vendor-patch
git diff --check
```

人工 / 环境相关记录：

- Windows：目录磁盘占用能返回，zip 预览中文名不乱码，内容搜索返回 grep 结果。
- Windows：缩略图失败时前端回退图标；`pty:cwd` 失败时 UI 不崩。
- macOS：`mdfind` / `sips` / `qlmanage` / `lsof` 未改语义，若本机不可测则明确标注待 macOS 回归。

## Review gate 检查清单

```powershell
rg -n "du -sk|execFile\\('mdfind'|execFile\\('sips'|execFile\\('qlmanage'|execFile\\('unzip'|lsof -a" server.js electron\main.js
rg -n "du -sk|mdfind|sips|qlmanage|unzip|lsof -a" server-platform.js
npm run test:platform
just check
```

预期：

- 第一条 grep 不再命中 `server.js` / `electron/main.js` 的 C3 系统命令直拼。
- 第二条 grep 命中集中在 `server-platform.js`。
- 测试通过；Windows / macOS 环境缺口在最终报告中单独列明。

## 实施验证记录（2026-06-29）

已通过：

- `node --check server-platform.js server.js electron\main.js scripts\test-server-platform.js`
- `npm run test:platform`
- `just check`
- `just test`
- `npm run check:vendor-patch`
- `git diff --check`：退出码 0；仅有 CRLF 规范化 warning。
- review grep：`server.js` / `electron/main.js` 不再直接命中 `du -sk`、`mdfind`、`sips`、`qlmanage`、`unzip`、`lsof -a`。
- adapter grep：上述系统命令集中在 `server-platform.js`。
- 本地 HTTP 冒烟（临时 `FANBOX_PORT=47657`）：
  - `/api/du` 返回目录占用结果。
  - `/api/archive` 返回 zip 条目，GBK 中文名为 `中文.txt`。
  - `/api/content` 在 Windows 返回 `engine: "grep"`。
  - `/api/thumb` 对不可缩略文本返回 415，前端可走既有图标回退。

待环境补测：

- macOS 实机验证 `mdfind` / `sips` / `qlmanage` / `lsof` 迁移后零回归。

## 回滚点

- `server-platform.js` 是新增文件，可单独删除。
- `server.js` 的 C3 改动应集中在 import、adapter wrapper、`serveThumb()` / `serveHeicAsJpeg()` 调用处。
- `electron/main.js` 只替换 pty cwd helper。
- `package.json` 只允许接入 C3 测试，不改 build / dist 配置。
