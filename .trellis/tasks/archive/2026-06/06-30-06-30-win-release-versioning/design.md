# 设计：Windows release 版本策略

## 范围

本任务只打通 Windows release 版本命名的最小闭环：

```text
发版向导输入
  -> server.js releasePrepare()
  -> package.json version / git tag / GitHub Release asset glob
  -> electron/platform/update.js cmpVer()
  -> Windows update channel prompt
```

不修改 Electron 打包配置、不做签名、不改变 C5 的 repo/env 双通道契约。

## 版本契约

Windows 包 tag：

```text
v<base>-win.<n>
base = x.y.z
n    = 1,2,3...
```

示例：

- `v2.3.3-win.1`：基于上游 `v2.3.3` 的第 1 个 Windows 包。
- `v2.3.3-win.2`：同一上游版本的第 2 个 Windows 包。
- `v2.3.4`：新的上游源码版本，主序高于任何 `2.3.3-win.N`。

比较规则是 release-channel 规则，不完全等同 SemVer prerelease：在相同 base 下，`-win.N` 表示 Windows 包修订，必须高于纯 base，才能让从 `2.3.3` 安装来的 Windows 用户看到 `2.3.3-win.1`。

## Update adapter

`electron/platform/update.js` 保持现有公开函数：

- `cmpVer(a,b)`
- `checkUpstream(opts)`
- `checkRelease(opts)`
- `checkUpdates(opts)`

新增内部解析：

```js
parseReleaseVersion('v2.3.3-win.1')
// { major:2, minor:3, patch:3, win:1 }
```

比较顺序：

1. `major/minor/patch`
2. Windows package revision：纯 base 视为 `0`，`-win.N` 视为 `N`

非 `-win.N` 的其他 suffix 不新增语义，保持近似旧行为，避免把 beta/source prerelease 当成正式升级策略。

## Release wizard

`server.js` 的发版向导新增 channel 概念：

- `source`：普通源码/macOS release，版本必须是 `x.y.z`，保留 `npm run dist` + `.dmg`。
- `win`：Windows 包 release，版本必须是 `x.y.z-win.N`，使用 `npm run dist:win` + `.exe`/`.zip`。

`releaseInspect()` 从 `package.json` 推导：

- `hasWinDist`：是否存在 `scripts["dist:win"]`。
- `nextSourceVersion`：当前 base patch + 1。
- `nextWinVersion`：当前若是 `x.y.z-win.N`，则 `N+1`；否则当前 base 的 `-win.1`。

`public/app.js` 只在 `hasWinDist` 为 true 时显示版本类型选择。用户切换到 Windows 包版本时，版本输入自动切为 `nextWinVersion`，并把打包/Release 文案切为 `.exe/.zip`。

## 兼容与回滚

- 老的 `version` 字段仍是单一字符串，package.json 不新增字段。
- `releasePrepare()` 默认 channel 为 `source`，旧调用方不传 channel 时行为保持。
- Windows release 只改变发版命令序列和 update 比较，不改变 C1 的 artifactName。
- 回滚点：撤回 `server.js` / `public/app.js` 发版向导改动，以及 `electron/platform/update.js` 比较函数和测试。
