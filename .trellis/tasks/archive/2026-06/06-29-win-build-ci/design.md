# 设计：C1 Windows 打包与 CI

本文件细化父任务 `06-29-windows-port` 的阶段一交付。C1 只负责 Windows 发布产物、Windows CI、以及 fork 分支治理；不改 agent 运行时、平台 adapter、命令查找、env/proxy 或 ConPTY 行为，这些由 C2 起承接。

## 1. 边界

### C1 负责

- `package.json` 增加 Windows 打包入口：`dist:win` 与 `build.win`。
- 新增 repo-root `justfile`，统一 macOS/Windows 的 `check`、`test`、`build`、`ci` 等入口。
- 从现有 `build/icon.png` / `build/icon-1024.png` 生成 `build/icon.ico`，并让 `.gitignore` 允许它入库。
- 新增 `.github/workflows/windows-build.yml`，在 Windows runner 上构建 `.exe` 和 `.zip`。
- 配置本地 fork 维护基础设施：`upstream=https://github.com/alchaincyf/fanbox.git` 与 `rerere.enabled=true`。
- 在 `README.md` 记录 Windows fork 的构建/同步流程。

### C1 不负责

- 不修复 Claude/Codex agent 在 Windows 的启动、PATH、代理、引号或 stdin 行为；C2 负责。
- 不引入 `electron/platform/` 或 `server-platform.js`。
- 不处理代码签名、SmartScreen、release tag、自动更新通道或 Windows 专属版本号策略；后续 C5/C6 负责。
- 不改变现有 macOS `dist` 行为、签名身份、entitlements、`dmg` 配置或 `predist` vendor patch gate。

## 2. 打包配置

`package.json` 现有 `dist` 保持 `electron-builder --mac`。C1 只新增并行入口：

```json
"dist:win": "electron-builder --win"
```

`build.win` 采用两个目标：

- `nsis`：安装包，满足常规 Windows 安装体验。
- `zip`：免安装包，便于 CI artifact 直接下载和冒烟。

Windows 图标使用 `build/icon.ico`，来源是现有入库图标资产，不新增设计资产。产物命名建议使用 electron-builder `artifactName` 显式包含产品名、版本、平台和架构，例如 `FanBox-${version}-${os}-${arch}.${ext}`，避免 CI 上传时不同目标重名。

`npmRebuild=false` 与 `asarUnpack=["**/node_modules/node-pty/**"]` 继续保留。Windows CI 在打包前显式运行 `npm run rebuild`，让 node-pty 按 Electron 33 在 `windows-2022` 上重建。

## 3. 图标策略

当前 `build/` 已有：

- `build/icon.png`
- `build/icon-1024.png`
- `build/icon.icns`
- `build/entitlements.mac.plist`

`.gitignore` 当前忽略 `build/*`，只白名单上述文件。C1 实施时必须加入 `!build/icon.ico`，否则生成的 Windows 图标不会入库。

生成方式优先使用现有 PNG 资产转换成 multi-size ICO。若本机缺 ImageMagick，实施时可用临时 Node 工具或 PowerShell/.NET 生成；不要把转换工具作为运行时依赖加入 `dependencies`。如需新增 dev dependency，必须先证明本地工具不可用且只为构建资产服务。

## 4. Windows CI

新增 `.github/workflows/windows-build.yml`，触发范围保守：

- `push` / `pull_request` 作用于 `win` 分支。
- `workflow_dispatch` 允许手动重跑。

CI runner 暂时 pin `windows-2022`。原因：GitHub 已将 `windows-latest` / `windows-2025` 迁移到 VS 2026，而当前 `@electron/node-gyp` 10.x 的 Visual Studio finder 只支持到 VS 2022；node-pty native rebuild 在 VS 2026 环境会先失败于工具链识别。等 Electron/node-gyp 支持 VS 18 后再恢复浮动 runner。

CI 主流程：

```text
checkout -> setup-node 20 -> setup-just -> npm ci -> just ci -> upload-artifact
```

artifact 上传范围限定为 Windows 发布产物：

- `dist/*.exe`
- `dist/*.zip`

不要上传 `dist/` 整目录，避免把临时 builder 中间物、日志或平台无关缓存混进 artifact。

## 5. fork 分支治理

C1 在本地执行一次：

```bash
git remote add upstream https://github.com/alchaincyf/fanbox.git
git fetch upstream
git config rerere.enabled true
```

若 `upstream` 已存在，则校验 URL；URL 不同才停下来处理，避免覆盖用户配置。日常同步流程写入 README：

```bash
git fetch upstream
git rebase upstream/master
```

继续在当前 `win` 分支推进，不新建 `windows-port` 或 `windows-release` 分支。理由沿用父任务 D2：减少分支拓扑变化，把长期冲突治理集中到平台边界收敛和 `rerere`。

## 6. 验证与回滚

验证分三层：

- 配置静态验证：`just check`（内部跑 vendor patch + `package.json` JSON 解析）。
- Windows 构建验证：`just ci` 产出 `.exe` 与 `.zip`。
- macOS 回归边界：确认 `npm run dist` 仍指向 `electron-builder --mac`，且 mac build 配置未被重写。

回滚点保持清晰：

- Windows packaging 可通过回滚 `package.json`、`build/icon.ico`、`.gitignore` 恢复。
- CI 可通过删除 `.github/workflows/windows-build.yml` 恢复。
- fork 治理可通过 `git remote remove upstream` 与 `git config --unset rerere.enabled` 恢复，不影响代码树。

## 7. justfile 跨平台命令契约

`justfile` 是 C1 的命令编排层，不替代 `package.json`。npm 脚本仍承载实际 Node/Electron 命令，just recipe 负责把本地与 CI 的调用入口稳定下来。

最低 recipe 集合：

```text
check       # 快速静态检查：vendor patch + package.json 可解析
test        # 当前无测试框架时先作为 check 的别名/聚合；未来接入 node --test
build       # 按当前 OS 分派：macOS -> build-mac，Windows -> build-win
build-mac   # npm run dist
build-win   # npm run rebuild && npm run dist:win
ci          # check + test + 当前平台构建；Windows CI 需产出 .exe/.zip
```

跨平台原则：

- recipe 名称在 macOS 和 Windows 一致。
- Windows 下使用 PowerShell 可执行的语法；macOS 下使用 sh/zsh 可执行的语法。若需要平台分支，优先用 Just 的 `[windows]` / `[macos]` recipe 或 `os()` 条件，而不是在 npm 脚本里塞复杂 shell。
- `test` 目前不引入不存在的测试框架；它应当是可运行的稳定占位，避免 `just ci` 因空测试命令失败。若后续新增 `node --test`，再扩展此 recipe。
- CI workflow 调用 `just ci`，而不是手写一套与本地不同的 npm 命令序列。

## 8. 交付给 C2 的前置状态

C1 完成后，C2 可以假设：

- Windows CI 至少能执行打包链路并暴露 node-pty rebuild / electron-builder 问题。
- Windows 安装包或 zip artifact 可供 C2 做 agent P0 实机冒烟。
- `just ci` 是本地与 Windows CI 的统一入口；C2 如新增运行时检查，应接入 justfile 而不是旁路新增命令。
- `upstream` 与 rerere 已就位，后续 adapter 改动可持续 rebase 上游。

C2 仍必须自行验证 agent P0：Claude/Codex 可执行发现、PATH/代理、`spawn` 参数模型、凭据路径、ConPTY 基础交互都不是 C1 的验收范围。
