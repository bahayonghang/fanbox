# 执行计划：FanBox Windows 移植（父任务总编排）

父任务不直接实现；本文件编排 6 个子任务的顺序、提交粒度与跨子门禁。各子任务的细化 `implement.md` 在其启动前单独编写。

## 子任务执行顺序

```text
C1 打包与 CI            ─┐ (可并行)
C2 平台层 + P0(env/shell)─┴─→ C3 系统命令适配 ──→ C4 macOS 能力 ──→ C5 更新通道 ──→ C6 长期演进
```

- **C1 与 C2 可并行**：C1 是构建/CI/分支治理，C2 是运行时平台层；互不阻塞。
- **C2 是 C3/C4 的前置**：C3/C4 复用 C2 建立的 `platform/` 目录与 adapter 契约（见父 `design.md` §1）。
- **C5/C6 靠后**：依赖 C1 的 release 产物形态。

## 提交顺序（对齐 ref/windows_port.md §4.2，最小补丁队列）

```text
1. build: add Windows electron-builder target (dist:win, win.target, icon.ico)   [C1]
2. build: add cross-platform justfile (check/test/build/ci)                      [C1]
3. chore: add upstream remote + enable rerere (分支治理，文档化)                    [C1]
3. platform: introduce env/shell adapters skeleton                               [C2]
4. platform: route wechat/env.js through platform/env (Windows PATH/proxy)       [C2]
5. platform: route wechat/driver.js to spawnCommand (kill -lc model)             [C2]
6. platform: whichBin replaces command -v (driver.js, server.js findAgentBin)    [C2]
7. ci: add windows build workflow (npm ci / just ci; pin windows-2022 for node-gyp) [C1]
8. platform: route disk/archive/thumb/openInOS/terminalCwd/search via adapter    [C3]
9. platform: power/clipboard/screenshot Windows or graceful degrade              [C4]
10. feat: split update channel (upstream source vs windows release)              [C5]
11. docs: document Windows known limitations                                     [各子]
```

每条提交对应"新增 adapter 文件 + 原文件薄调用点替换"，使后续 `git rebase upstream/master` 冲突收敛。

## 分支治理一次性落地（C1 内）

```bash
git remote add upstream https://github.com/alchaincyf/fanbox.git
git fetch upstream
git config rerere.enabled true
# 继续在 win 分支推进；日常：git fetch upstream && git rebase upstream/master
```

## 验证命令（贯穿各子任务）

```bash
npm ci
just ci                  # C1 引入后；本地/CI 统一入口
npm run rebuild           # electron-rebuild -f -w node-pty（Windows runner 上需通过）
npm run dist:win          # C1 引入后；产出 .exe/.zip
npm run check:vendor-patch  # 既有 predist 校验，勿破坏
```

Windows 实机/CI 冒烟（C2 关键）：从开始菜单启动 → 微信链路触发 `claude -p`/`codex exec` → 确认起进程并取到输出、代理不丢。

## 风险文件与回滚点

- `electron/wechat/driver.js`、`electron/wechat/env.js`：P0 改动热点；保留 darwin 原路径，Windows 走新分支，可单独 revert。
- `server.js`（2000+ 行）、`electron/main.js`：只做薄调用点替换，禁止顺手重构（CLAUDE.md §3 surgical changes）。
- `package.json` build 段：新增 `win`/`dist:win`，**不动** `mac`/`dist`（mac 回归红线）。
- `justfile`：只做跨平台命令编排；不迁移业务逻辑，不绕过 npm 脚本。

## Per-child 启动门（Phase 1.4 review gate）

每个子任务 `task.py start` 前：
1. 该子 `prd.md` 完成 + 复杂子补 `design.md`/`implement.md`（基线引用父 `design.md`）。
2. 子任务若走 sub-agent dispatch：`implement.jsonl`/`check.jsonl` 各至少一条真实 spec/research 条目（非 `_example` 种子）。
3. 用户审阅该子规划 → 同意 → `task.py start`。

## 完成判据（父任务集成评审）

父任务在所有阶段一/二子任务 finish 后做集成评审，核对父 `prd.md` 的 PAC1–PAC4（adapter 收敛、darwin 零回归、P0 清零、rebase 演练）。C6 为长期路线，不阻塞父任务"MVP 可用"里程碑。
