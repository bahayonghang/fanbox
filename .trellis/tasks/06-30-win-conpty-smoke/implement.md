# 执行计划：Windows ConPTY 冒烟验证矩阵

## Checklist

1. 新增 `scripts/test-conpty-smoke.js`
   - 非 Windows skip。
   - Windows 必测 PowerShell / cmd。
   - Git Bash 可发现则测，不存在则 skipped。
   - Claude / Codex 只做 UI 命令契约静态检查，不执行交互式 agent。
   - 所有 PTY 设置 max timeout，并确保结束时 kill。

2. 接入平台测试入口
   - 在 `package.json` 的 `test:platform` 末尾追加 `node scripts/test-conpty-smoke.js`。
   - 不改 `justfile`，因为 `just test` 已经走 `npm run test:platform`。

3. 验证
   - `node --check scripts/test-conpty-smoke.js`
   - `node scripts/test-conpty-smoke.js`
   - `npm run test:platform`
   - `just check`
   - `just test`
   - `git diff --check`

## Risk Files

- `package.json`：只追加测试脚本调用，避免改动 build/release 配置。
- `scripts/test-conpty-smoke.js`：新增文件，可独立回滚。

## Out of Scope

- 不实现真实前台进程 cwd 追踪。
- 不修改 `electron/main.js` 的 PTY shell 选择。
- 不做打包后开始菜单 GUI 人工实测。
- 不要求 Claude / Codex 联网请求成功。
