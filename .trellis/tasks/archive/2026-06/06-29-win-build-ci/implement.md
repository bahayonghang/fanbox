# 执行计划：C1 Windows 打包与 CI

本任务进入 `task.py start` 后按下列顺序实施。目标是先拿到可验证的 Windows 发布产物和 CI artifact，再让 C2 使用该产物打通 Windows agent P0。

## 0. 启动前 review gate

- [ ] `prd.md` 已收敛，范围只覆盖 R1/R9/D2/D3。
- [ ] `design.md` 已说明 C1/C2 边界、打包方案、跨平台 justfile、CI、fork 治理和回滚点。
- [ ] 本文件已列出实施顺序、验证命令和风险文件。
- [ ] 用户审阅同意后，运行 `python ./.trellis/scripts/task.py start 06-29-win-build-ci`。

当前为 Codex inline 模式：跳过 `implement.jsonl` / `check.jsonl` curated context gate，Phase 2 通过 `trellis-before-dev` 读取任务与 spec。

## 1. 预检

1. 记录当前状态：
   ```bash
   git status --short
   git branch --show-current
   git remote -v
   git config --get rerere.enabled
   ```
2. 确认构建基线：
   ```bash
   npm run check:vendor-patch
   node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
   ```
3. 确认图标来源：
   ```bash
   Get-ChildItem build
   git check-ignore -v build/icon.ico
   ```
4. 确认 justfile 现状：
   ```bash
   Test-Path justfile
   Test-Path Justfile
   ```

## 2. Windows 打包配置

修改文件：

- `package.json`

操作：

- 新增脚本 `"dist:win": "electron-builder --win"`。
- 在 `build` 下新增 `win` 配置：
  - `icon: "build/icon.ico"`
  - `target: ["nsis", "zip"]` 或等价对象形式。
  - `artifactName` 显式区分版本、平台、架构和扩展名。
- 保持现有 `dist`, `predist`, `mac`, `dmg`, `asarUnpack`, `npmRebuild` 不变。

验证：

```bash
node -e "const p=require('./package.json'); if(!p.scripts['dist:win']) process.exit(1); if(!p.build.win) process.exit(1); console.log(p.scripts.dist, p.scripts['dist:win'])"
npm run check:vendor-patch
```

## 3. 跨平台 justfile

新增文件：

- `justfile`

操作：

- 提供 recipe：`check`、`test`、`build`、`build-mac`、`build-win`、`ci`。
- `check` 至少运行：
  - `npm run check:vendor-patch`
  - `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
- `test` 在当前无测试框架时调用 `check` 或等价轻量 gate；不要引入空跑失败的 `npm test`。
- `build-mac` 调用 `npm run dist`。
- `build-win` 调用 `npm run rebuild` 后 `npm run dist:win`。
- `build` 根据 OS 分派到 `build-mac` 或 `build-win`。
- `ci` 运行 `check`、`test`、`build`，保证本地与 CI 同入口。

验证：

```bash
just --list
just check
```

Windows 完整验证：

```bash
just ci
Get-ChildItem dist -Filter *.exe
Get-ChildItem dist -Filter *.zip
```

macOS 完整验证：

```bash
just ci
```

## 4. Windows icon.ico

修改文件：

- `.gitignore`
- `build/icon.ico`

操作：

- 从现有 `build/icon-1024.png` 或 `build/icon.png` 生成 multi-size ICO。
- 在 `.gitignore` 中加入 `!build/icon.ico`。
- 不把临时转换脚本、缓存或下载工具入库。

验证：

```bash
Test-Path build/icon.ico
git check-ignore -v build/icon.ico
```

期望：`Test-Path` 为 true；`git check-ignore` 不再把 `build/icon.ico` 标为忽略。

## 5. Windows CI workflow

新增文件：

- `.github/workflows/windows-build.yml`

操作：

- 使用 `windows-2022`，避免 `windows-latest` 当前默认 VS 2026 导致 `@electron/node-gyp` 无法识别 native build 工具链。
- 使用 Node 20。
- 安装 `just`（例如 `extractions/setup-just` 或等价稳定 action）。
- 执行 `npm ci`。
- 执行 `just ci`。
- 上传 `dist/*.exe` 与 `dist/*.zip`。
- 触发 `push` / `pull_request` 到 `win`，并保留 `workflow_dispatch`。

验证：

```bash
Get-Content .github/workflows/windows-build.yml
```

本地无法完全等价验证 GitHub runner；最终验收以 GitHub Actions 绿灯和 artifact 为准。

## 6. fork 维护配置与文档

修改/执行：

- 本地 git config / remote。
- `README.md`。

操作：

- 若无 `upstream`：
  ```bash
  git remote add upstream https://github.com/alchaincyf/fanbox.git
  ```
- 然后：
  ```bash
  git fetch upstream
  git config rerere.enabled true
  ```
- 在 README 开发模式附近新增 Windows fork 构建和同步流程：
  - `just check`
  - `just ci`
  - `npm run rebuild`
  - `npm run dist:win`
  - `git fetch upstream && git rebase upstream/master`
  - 继续在 `win` 分支推进。

验证：

```bash
git remote -v
git config --get rerere.enabled
rg -n "just ci|dist:win|upstream|rerere|rebase upstream/master" README.md
```

## 7. 集成验证

优先在 Windows 本机执行：

```bash
npm ci
just ci
Get-ChildItem dist -Filter *.exe
Get-ChildItem dist -Filter *.zip
```

通用静态检查：

```bash
just --list
just check
npm run check:vendor-patch
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
git status --short
```

macOS 回归边界检查：

```bash
node -e "const p=require('./package.json'); if(p.scripts.dist!=='electron-builder --mac') process.exit(1); if(!p.build.mac || !p.build.dmg) process.exit(1); console.log('mac build config retained')"
```

## 8. 风险文件与回滚

- `package.json`：只新增 Windows 并行配置；如果 macOS 配置 diff 变大，立即回退重做。
- `justfile`：只做命令编排，不把业务逻辑迁入 just；如跨平台语法不稳，优先拆成平台 recipe。
- `.gitignore`：只增加 `!build/icon.ico`。
- `README.md`：只补 justfile、Windows fork build / sync，不改官方下载承诺。
- `.github/workflows/windows-build.yml`：新文件，可单独 revert。
- git remote/config：如配置错误，使用 `git remote remove upstream` 或 `git remote set-url upstream <url>`，`git config --unset rerere.enabled`。

## 9. 交给 C2 的完成条件

C1 完成后必须能提供：

- Windows `.exe` / `.zip` 构建产物或 CI artifact。
- 明确的跨平台 `just ci` / `just build` / `just build-win` 命令。
- 已就位的 `upstream` remote 与 rerere。

随后 C2 立即进入 Windows agent P0：建立 `electron/platform/{env,shell}.js`，修复 Claude/Codex 启动模型、PATH/代理、`which`、凭据路径和基础 Windows 冒烟。

## 10. 执行记录（2026-06-29）

已完成：

- `package.json` 新增 Windows packaging：`dist:win`、`predist:win`、`build.win.icon`、`build.win.target=[nsis, zip]`、Windows artifact 命名。
- `check:vendor-patch` 从 `grep` 改为 Node inline check，保证 Windows npm scripts 可运行。
- 新增跨平台 `justfile`：`check`、`test`、`build`、`build-mac`、`build-win`、`ci`。
- 从现有 PNG 资源生成 `build/icon.ico`，并在 `.gitignore` 白名单允许入库。
- 新增 `.github/workflows/windows-build.yml`，Windows runner pin `windows-2022`，执行 `npm ci` 后统一调用 `just ci`，上传 `dist/*.exe` 与 `dist/*.zip`。
- README 补充 Windows fork build/sync/rerere 维护流程。
- 本地 git 已配置 `upstream=https://github.com/alchaincyf/fanbox.git` 与 `rerere.enabled=true`。
- `.trellis/spec/backend/quality-guidelines.md` 记录 Windows packaging / CI 命令契约与 VS 2026 rebuild 限制。

已验证通过：

- `python ./.trellis/scripts/task.py validate 06-29-win-build-ci`
- `npm ci`
- `npm run predist:win`
- `just --list`
- `just check`
- `just test`
- `just --dry-run build`（Windows 下展开为 `npm run rebuild` + `npm run dist:win`）
- Node 配置探针：确认 `dist` 仍为 `electron-builder --mac`，`dist:win`、`predist:win`、`build.mac`、`build.dmg`、`build.win` 均存在且符合预期。
- `git check-ignore -v build/icon.ico` 显示 `.gitignore` 白名单命中。
- `git remote -v` 显示 `origin` 与 `upstream`，`git config --get rerere.enabled` 输出 `true`。
- `git diff --check` 仅有 CRLF 归一化提示，无 whitespace error。

本机未完成项：

- `npm run rebuild` 在当前机器失败于工具链识别：`@electron/node-gyp` 10.x 发现 Visual Studio 2026 / VS 18 后报 `unknown version "undefined"`，且没有可用 VS 2022 Build Tools。该失败发生在 native rebuild 工具链探测阶段，不是 C1 仓库配置失败。
- 因此本机 `just ci` / `npm run dist:win` 的完整产物验证需在 GitHub Actions `windows-2022` runner 或安装 VS 2022 Build Tools 的 Windows 本机完成。
