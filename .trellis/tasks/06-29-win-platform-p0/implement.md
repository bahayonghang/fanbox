# 执行计划：C2 Windows 平台层与 P0 agent 修复

## 启动前门禁

- 显式启动本子任务：`python ./.trellis/scripts/task.py start 06-29-win-platform-p0`。不要依赖 `task.py current`，当前 session fallback 可能指向 `06-29-win-longterm`。
- 启动后先运行 `trellis-before-dev`，读取 `electron/`、根脚本、测试相关 spec。
- 先检查 C1 是否已经改动 `package.json`/`justfile`/CI。若已有 `just ci` 约定，C2 测试接入该约定；若没有，只新增最小 npm/script，不抢 C1 打包范围。

## 成功标准

- Windows 不再用 PowerShell 执行 `-lc`。
- Claude/Codex agent 通过 `spawn(bin, args, { shell: false })` 启动，prompt 走 stdin，persona/中文/引号不需要 shell 转义。
- GUI 启动环境中 PATH/proxy/home/credentials 变量保留，`whichBin()` 能定位 `claude`、`codex`、`git`、`gh`。
- `server.js` 的 agent CLI 检测不再依赖 `/bin/zsh -lc command -v` 或 `/bin/sh -lc command -v gh`。
- macOS 的 shell env dump、系统代理、PTY login shell 行为不回归。

## 实施清单

### 1. 建立平台 shell adapter

改动：

- 新增 `electron/platform/shell.js`。
- 实现 `spawnCommand()`、`whichBin()`、PATH/PATHEXT 遍历、home cwd 兜底。
- 导出小型纯函数以便测试 Windows PATH key 合并和候选路径生成。

验证：

- `node scripts/test-platform-shell.js`
- 覆盖 stdout/stderr、stdin、idle timeout、max timeout、`whichBin('node')`。
- Windows 上覆盖 `.cmd`/`.exe` 搜索；macOS 上覆盖登录 shell `command -v` 兜底。

### 2. 建立平台 env adapter

改动：

- 新增 `electron/platform/env.js`。
- 从 `electron/wechat/env.js` 迁移现有 macOS `dumpShellEnv()`/`sysProxyEnv()`/`fullEnv()` 语义。
- Windows 分支实现 process env 底座、PATH key 合并、用户级 npm/node 路径补充、WinINET/WinHTTP proxy fallback、UTF-8 兜底。
- `electron/wechat/env.js` 改为 `module.exports = require('../platform/env')`。

验证：

- `node scripts/test-platform-env.js`
- Windows：检查 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA` 不被覆盖；检查 `Path/PATH` 合并后 `whichBin()` 可用；已有 proxy env 不被注册表覆盖。
- macOS：手动或脚本确认 `dumpShellEnv()` 仍走 `$SHELL -ilc env`，代理仍可从 `scutil --proxy` 兜底。

### 3. 改造 wechat driver 为 argv 直传

改动：

- `electron/wechat/driver.js` 删除 `spawn` 直接依赖、`loginShell()`、`shq()`。
- `run(cmd, ...)` 改成 `run(bin, args, stdinText, cwd, opts, onLine)`，内部调用 `spawnCommand()`。
- `runClaude()` 构造 Claude argv 数组，persona 作为独立 argv 元素。
- `runCodex()` 构造 Codex argv 数组，首轮 persona 继续前置 stdin。
- `which(bin)` 改为 `whichBin(bin).then(Boolean)`。
- 保留现有 JSONL 解析、retry、timeout、session resume fallback、progress note 逻辑。

验证：

- `node scripts/test-platform-shell.js` 中增加 argv 引号/换行/中文测试。
- Windows 实机：`claude -p --output-format stream-json ...` 起进程并抓到 result。
- Windows 实机：`codex exec --json ...` 起进程并抓到最终文本/thread id。
- macOS：同一 driver path 不经 shell 后仍可跑 Claude/Codex；若缺少 CLI，至少确认 `which()` 行为正确且错误信息可读。

### 4. 替换 server.js 的 agent CLI 检测点

改动：

- 在 `server.js` 引入 `electron/platform/shell.js` 的 `whichBin`。
- `findAgentBin(name)` 改为 `return whichBin(name)`，保留返回绝对路径或 `null` 的契约。
- `releaseInspect()` 的 `gh` 检测改为 `!!(await whichBin('gh'))` 或局部 helper，移除 `/bin/sh -lc command -v gh`。
- 不迁移 `du`、`mdfind`、`sips`、`lsof` 等 C3/C4 命令。

验证：

- `node -e "require('./server.js')"` 若当前项目支持无副作用加载则执行；若会启动 server，则改用现有检查命令。
- 针对 `findAgentBin()` 路径通过脚本或 UI 冒烟验证 `claude`/`codex` 可定位。
- `rg -n \"command -v|/bin/zsh|/bin/sh\" electron/wechat electron/platform server.js`：C2 范围内不应再有 driver/findAgentBin/gh 检测旧模型；C3/C4 遗留命令可留但需在 review 摘要中标注归属。

### 5. 增加最小测试/检查命令

改动：

- 优先读取现有 `package.json` 与 `justfile`。
- 若无现成 test 槽位，新增：
  - `npm run test:platform`
  - 或 `just test-platform`
- 测试脚本放 `scripts/`，只依赖 Node 内置模块。

验证：

- `npm run test:platform`
- 若 `just ci` 存在并适合接入，再跑 `just ci`。
- `npm run check:vendor-patch` 不应被破坏。

### 6. Windows 实机冒烟

必须记录结果：

- GUI/开始菜单启动后，`whichBin('claude')`、`whichBin('codex')`、`whichBin('git')`、`whichBin('gh')`。
- Claude agent：含中文、引号、换行 persona 的一轮请求，确认 stream-json result。
- Codex agent：一轮 `codex exec`，确认输出和 session/thread id。
- 代理：有 proxy env 时不覆盖；无 proxy env 但 WinINET 开启时能补 `http_proxy`/`https_proxy`。
- Credentials：确认 child env 能看到正确 `USERPROFILE`/home，Claude/Codex 能使用既有登录态。
- ConPTY 基础：内嵌终端 PowerShell 能启动、输入命令、cwd 正常。

## Review gate 检查清单

代码完成后提交 review 前运行：

```powershell
rg -n "spawn\\(loginShell|\\['-lc'|shq\\(|command -v|/bin/zsh|/bin/sh" electron\wechat electron\platform server.js
npm run test:platform
npm run check:vendor-patch
```

预期：

- `electron/wechat/driver.js` 不再出现 `loginShell`、`['-lc']`、`shq()` 或 `command -v`。
- `electron/platform/env.js` / `electron/platform/shell.js` 的 darwin 分支可保留 `-ilc env`、`command -v` 与 `scutil --proxy` 作为 macOS 兼容兜底。
- `server.js` 不再在 `findAgentBin` 和 `gh` 检测中调用 `/bin/zsh`/`/bin/sh command -v`；其它 C3/C4 遗留命令不在 C2 清除。
- 测试通过；若 Windows 实机不可用，必须明确标注哪些 AC 仍待人工实测，不能宣称 C2 完成。

## 实施验证记录（2026-06-29）

已通过：

- `node --check electron\platform\env.js electron\platform\shell.js electron\wechat\driver.js server.js`
- `npm run test:platform`
- `just check`
- `just test`
- `npm run check:vendor-patch`
- `git diff --check`：退出码 0；仅有 CRLF 规范化 warning。
- review grep：只剩 `electron/platform/{env,shell}.js` 的 darwin `/bin/zsh` / `command -v` 兜底，符合设计；`electron/wechat/driver.js` 和 `server.js` 的 agent 检测点无旧模型残留。
- `whichBin()` Windows 探针命中：
  - `node` -> `D:\GreenSoftware\node\node.exe`
  - `codex` -> `C:\home\lyh\.npm-global\codex.cmd`
  - `claude` -> `C:\Users\lyh\.local\bin\claude.exe`
  - `git` -> `C:\Program Files\Git\cmd\git.exe`
  - `gh` -> `C:\Users\lyh\scoop\shims\gh.exe`
- `spawnCommand('codex', ['--version'])` 通过：`codex-cli 0.142.4`。
- `spawnCommand('claude', ['--version'])` 通过：`2.1.195 (Claude Code)`。
- `driver.runCodex('Reply with exactly: FANBOX_C2_OK', ...)` 通过：返回 `FANBOX_C2_OK`，有 session/thread id，未超时。
- ConPTY 基础：`node-pty` 启动 PowerShell，输入命令后输出当前 cwd `D:\Documents\Code\Agents\fanbox` 与 `FANBOX_C2_CONPTY_OK`。

部分通过 / 待环境解除后复测：

- Claude stream-json 直 spawn 已能启动并输出 JSONL `api_retry` 事件；含中文、引号、换行 persona 的 argv 传递未触发 shell/转义错误。
- 该 Claude 请求在 150 秒内未拿到 result，stdout 显示 `error_status:429` / `rate_limit` 重试，stderr 只有本机 auth/connectors 提示。因此 AC2.1 的“取到 result”仍受当前 Claude 账号/API 限流影响，不能宣称完整通过。
- 未做打包后或开始菜单 GUI 启动的人工实测；当前验证覆盖本机 Windows 进程环境下的 `fullEnv()` / `whichBin()` / spawn / ConPTY。
- WinINET 真实代理开关未人工切换；已由 `scripts/test-platform-env.js` 覆盖解析与“已有 proxy env 不覆盖”的代码路径。

## 回滚点

- `electron/platform/shell.js` 与 `electron/platform/env.js` 是新增文件，可独立移除。
- `electron/wechat/env.js` 是薄转发，回滚简单。
- `electron/wechat/driver.js` 是高风险文件；若 CLI argv 兼容性异常，优先回滚 `run()` 和 argv builder，不动 JSONL 解析逻辑。
- `server.js` 只改两个 CLI 检测点；不要在同一提交混入 C3 系统命令迁移。
