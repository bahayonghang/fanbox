# 设计：C2 Windows 平台层与 P0 agent 修复

## 1. 范围与目标

C2 只打通 Windows agent P0，不扩展到系统命令适配或打包发布。实施范围：

- 新增 `electron/platform/env.js` 与 `electron/platform/shell.js`。
- `electron/wechat/env.js` 改为薄转发平台 env adapter。
- `electron/wechat/driver.js` 从 shell 字符串模型改为 `spawn(bin, args, { shell: false })`。
- `server.js` 中与 agent 启动直接相关的 CLI 检测点改用 `whichBin`。
- Windows env/PATH/proxy、Claude/Codex argv 直传、credentials 路径、ConPTY/基础 agent 冒烟纳入验收。

不做：`diskUsage`、archive/thumbnail、`openInOS`、`terminalCwd`、Spotlight/grep、power/clipboard/screenshot、更新通道。这些分别属于 C3/C4/C5。`electron/main.js:478-483` 的 PTY shell 选择已经有 win32 分支，C2 只做冒烟验证，不改主逻辑。

## 2. 当前证据

- `electron/wechat/driver.js:7,22`：win32 选择 `powershell.exe`，但 `run()` 仍执行 `spawn(loginShell(), ['-lc', cmd])`。PowerShell 不支持 POSIX `-lc`。
- `electron/wechat/driver.js:75-77`：`which()` 通过 `command -v` 检测 CLI，Windows 不可用。
- `electron/wechat/driver.js:83-88,126-130`：Claude/Codex 命令当前是字符串拼接；Claude persona 依赖 `shq()`，Codex persona 已走 stdin。
- `electron/wechat/driver.js:16-42`：已有 idle/max 超时、stdout 按行回调、stderr 计活、stdin 写 prompt 的行为，必须迁移保留。
- `electron/wechat/env.js:15-31`：macOS 用 `$SHELL -ilc env` 抓登录 shell 环境；`win32` 直接返回 `{}`。
- `electron/wechat/env.js:35-49`：系统代理只支持 macOS `scutil --proxy`。
- `electron/wechat/env.js:52-57`：`fullEnv()` 语义是 `process.env` 打底、shell env 覆盖、代理兜底、UTF-8 兜底。
- `server.js:511-519`：`findAgentBin()` 用 `/bin/zsh -lc command -v`。
- `server.js:589-602`：发版向导用 `/bin/sh -lc command -v gh` 检测 `gh`。
- `electron/main.js:475-495`：内嵌终端通过 node-pty 启动，Windows shell args 为空；C2 验证这个路径能基本启动即可。

## 3. 平台边界

新增 `electron/platform/shell.js`：

```js
spawnCommand(bin, args, options) -> Promise<Result>
whichBin(bin, options) -> Promise<string|null>
normalizeHomeEnv(env) -> env
```

`Result` 沿用 driver 当前 shape：

```js
{
  ok: boolean,
  code?: number,
  out: string,
  err: string,
  timedOut?: boolean,
  timeoutReason?: 'idle'|'max',
  ms: number
}
```

`spawnCommand()` 负责：

- 直接 `spawn(bin, args, { shell: false })`。
- 保留 idle/max 超时、stdout 行缓冲 `onLine`、stderr 计活、stdin 写入。
- `cwd` 兜底用完整 env 的 home：Windows 先 `USERPROFILE`，再 `HOME`；macOS 保持 `HOME`。
- Windows 下确保 `USERPROFILE`、`APPDATA`、`LOCALAPPDATA`、`Path/PATH` 不被错误大小写覆盖；这关系到 `~/.claude/.credentials.json` 与 Codex 配置目录定位。

新增 `electron/platform/env.js`：

```js
fullEnv() -> Promise<NodeJS.ProcessEnv>
resetEnvCache() -> void              // 仅测试/冒烟脚本使用
sysProxyEnv() -> Promise<object>     // 可导出给测试
dumpShellEnv() -> Promise<object>    // 可导出给测试
```

`electron/wechat/env.js` 只保留兼容导出：

```js
module.exports = require('../platform/env');
```

这样 `driver.js` 的现有 `require('./env')` 不需要大范围重排，也给后续 C3/C4 复用 `electron/platform/` 留出边界。

## 4. Windows env/PATH/proxy 设计

Windows 的最小可行策略：

1. `process.env` 仍是底座。Windows Electron 从开始菜单启动通常能拿到用户环境，先不引入复杂 shell dump。
2. PATH 合并要处理大小写：Windows env 可能同时出现 `PATH` 和 `Path`。adapter 输出中保留原有 key，同时保证子进程能看到有效 PATH；若两者都存在，合并去重。
3. CLI 额外搜索常见用户级 npm 安装目录，避免 GUI PATH 未刷新时找不到全局 `claude`/`codex`：
   - `%APPDATA%\npm`
   - `%LOCALAPPDATA%\Programs`
   - `%ProgramFiles%\nodejs`
   - `%ProgramFiles(x86)%\nodejs`
4. 代理只补空缺不覆盖已有变量，沿用现有 build 语义。Windows 读取顺序：
   - 环境变量里已有 `http_proxy`/`https_proxy`/`all_proxy`：直接保留。
   - WinINET 注册表：`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 `ProxyEnable`/`ProxyServer`。
   - WinHTTP 作为弱兜底，可通过 `netsh winhttp show proxy` 解析；失败返回 `{}`。
5. UTF-8：若 `LC_ALL`/`LC_CTYPE`/`LANG` 都不是 UTF-8，设置 `LANG=en_US.UTF-8`。不在 C2 强行执行 `chcp 65001`，因为 agent 是直 spawn，不经控制台 shell。

macOS 设计：

- `dumpShellEnv()` 继续使用 `$SHELL -ilc env` 的 marker 方案。
- `sysProxyEnv()` 继续使用 `scutil --proxy`。
- `fullEnv()` 的合并顺序不变：`process.env` -> shell env -> proxy fallback -> UTF-8。

## 5. Agent spawn 与 argv 设计

`driver.js` 不再构造完整命令字符串。改为：

```js
run(bin, args, stdinText, cwd, opts, onLine)
```

内部调用 `spawnCommand(bin, args, { stdinText, cwd, env: await fullEnv(), idleMs, maxMs, onLine })`。

Claude argv：

```js
[
  '-p',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  ...(persona ? ['--append-system-prompt', persona] : []),
  ...(sessionId ? ['--resume', sid] : ['--session-id', sid])
]
```

Codex argv：

首轮：

```js
['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox']
```

续话：

```js
['exec', 'resume', sessionId, '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-']
```

Codex 首轮 persona 继续前置到 stdin；续话不重复 persona。这个设计保持现有上下文语义，不依赖 Codex 新增 system prompt 支持。

`shq()` 与 `loginShell()` 在 driver 中删除。需要 shell 的场景只留在内嵌 PTY，不属于 agent runner。

## 6. whichBin 设计

`whichBin(bin)` 返回绝对路径或 `null`，不返回布尔值。调用方需要布尔时自行 `!!path`。

实现顺序：

- Windows：
  1. 如果 `bin` 已是绝对路径且可执行/存在，直接返回。
  2. 用 Node 遍历 PATH，按 `PATHEXT` 补 `.EXE;.CMD;.BAT;.COM`。
  3. 再调用 `where.exe bin` 兜底。
- macOS/Linux：
  1. 如果 `bin` 已是绝对路径且可执行/存在，直接返回。
  2. Node 遍历 PATH。
  3. darwin 保留原登录 shell 语义兜底：`$SHELL -ilc 'command -v <bin>'`，避免 Finder/Dock 启动时 `process.env.PATH` 不完整。

`driver.which(bin)` 保持现有导出名与布尔语义：

```js
function which(bin) {
  return whichBin(bin).then(Boolean);
}
```

`server.js` 的 `findAgentBin()` 改为使用同一个 `whichBin()`，但只替换 `findAgentBin()` 与 `gh` 检测两个点，避免把 C3 的系统命令适配提前扩大。

## 7. Credentials 与 home 路径

C2 不迁移任何凭据文件，只确保子进程继承正确 home/env：

- Claude Code Windows 凭据按 CLI 自己的规则读取，验收时重点检查 `USERPROFILE\.claude\.credentials.json` 或 CLI 实际使用路径可被进程看到。
- Codex Windows 配置通常依赖 `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`。adapter 不覆盖这些变量。
- `cwd` 为空时 Windows 兜底到 `USERPROFILE`，macOS 兜底到 `HOME`，避免 agent 在无效目录启动。

## 8. 测试与冒烟策略

计划增加轻量 Node 测试脚本，不引入测试框架：

- `scripts/test-platform-shell.js`：验证 `whichBin('node')`、`spawnCommand(process.execPath, ['-e', ...])`、stdin、idle/max 超时、persona/引号/中文 argv。
- `scripts/test-platform-env.js`：验证 `fullEnv()` 保留 PATH/home，代理变量不覆盖，UTF-8 兜底，Windows PATH key 合并。

若 C1 的 `just ci` 已存在，挂进 `just ci`；否则 C2 至少提供可直接运行的 npm/script 命令，并在 implement 里列明。当前仓库已有 `justfile` 与 `package.json`，下一轮实施前先读取实际脚本，避免和 C1 并行改动冲突。

真实 Windows 冒烟：

- 从开始菜单或打包后 GUI 启动，触发微信链路 `claude -p`，确认能解析 stream-json result。
- 同样触发 `codex exec`，确认能拿到最终文本与 thread id。
- 在 GUI 环境里检查 `whichBin('claude')`、`whichBin('codex')`、`whichBin('git')`、`whichBin('gh')`。
- 设置 WinINET 代理或已有 proxy env，确认 child env 中代理不丢。
- 内嵌终端打开 PowerShell，执行基础命令，确认 ConPTY/node-pty 未被 C2 改动破坏。

macOS 回归：

- `fullEnv()` 仍能通过登录 shell 拿到 PATH。
- `runClaude`/`runCodex` 在 darwin 不再经 shell，但 argv 与 stdin 语义等价；persona 含引号、换行、中文时应比原先更稳。
- 原有 PTY `-l` login shell 行为不变。

## 9. 风险与回滚

- 最大风险是 `driver.js` 从字符串命令改为 argv 后，Claude/Codex 某些 flag 顺序或 stdin 约定变化。回滚点是 `driver.run()` 与两个 argv builder，保留原解析逻辑可降低风险。
- env adapter 风险是 Windows PATH 大小写合并错误导致覆盖。实现必须用小函数隔离并测试。
- server.js 是大文件，C2 只改 `findAgentBin()` 和 `releaseInspect()` 的 `gh` 检测，不做其它命令迁移。
- macOS 不回归的关键是把现有 `dumpShellEnv()` 与 `sysProxyEnv()` 行为搬入 adapter，而不是重写成全新逻辑。
