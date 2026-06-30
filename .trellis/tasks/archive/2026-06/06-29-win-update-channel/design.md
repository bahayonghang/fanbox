# 设计：C5 更新通道拆分

## 范围

本任务只改 Electron 更新检查链路：`electron/main.js`、新增 `electron/platform/update.js`、`public/app.js` 的提示渲染。它不实现自动下载/安装，不定义 release tag 规范，不改 Windows 打包配置。

## 数据流

```text
GitHub Releases
  -> electron/platform/update.js
  -> electron/main.js checkUpdate()
  -> IPC update:available / update:get
  -> public/app.js bindUpdateNotice()
  -> update pill / update:open
```

## Adapter 契约

`electron/platform/update.js` 负责平台无关的 release 查询与筛选：

- `checkUpstream(opts) -> Promise<{ kind:"source", repo, tag, version, url } | null>`
- `checkRelease(opts) -> Promise<{ kind:"release", repo, tag, version, url, assetName? } | null>`
- `checkUpdates(opts) -> Promise<{ upstream, release, primary }>`
- `cmpVer(a,b) -> number`

默认 repo：

- `FANBOX_UPSTREAM_REPO || "alchaincyf/fanbox"`：源码版本。
- `FANBOX_RELEASE_REPO || "bahayonghang/fanbox"`：Windows 包版本。

Windows 上 `primary` 优先 `release`，因为用户可执行动作是下载安装包；如果 release repo 未配置、请求失败、没有新版本或没有 `.exe`/`.zip` asset，则退回上游源码提示。macOS 上 `primary` 只使用 upstream，避免 Windows release 噪声。

## GitHub 查询与降级

沿用现有策略：先查 GitHub API `repos/:owner/:repo/releases/latest`，失败后走 `https://github.com/:repo/releases/latest` 重定向拿 tag，避免 API 限流让更新检查完全失效。

Windows release 通道额外筛选 API assets：

- 下载候选只接受 `.exe` / `.zip`。
- 优先 `.exe`，其次 `.zip`。
- 有 asset 时 `url` 指向 `browser_download_url`；只有 redirect fallback 时 `checkRelease()` 不产生安装包提示，因为无法证明目标是 Windows 产物。

## IPC / UI Payload

保持 `window.fanboxUpdate` API 名称不变，避免改 preload 调用面。`pendingUpdate` 从单一 `{version,url}` 扩展为：

```js
{
  kind: "release" | "source",
  version,
  url,
  repo,
  title,
  action,
  secondary?: { kind, version, url, repo, title, action }
}
```

老前端只看 `version/url` 仍可工作；新前端根据 `kind/title/action` 显示：

- `release`：`Windows 包 vX 已发布` / `下载安装包`
- `source`：`上游源码 vX 已发布` / `查看源码版本`

## 手动检查

菜单的"检查更新"复用同一 `checkUpdate({ manual:true })`。手动对话框：

- `release` newer：提示下载 Windows 安装包，按钮打开 asset URL。
- `source` newer：提示同步源码，按钮打开 release page。
- 无更新：按平台描述当前已是最新可用版本。
- 查询失败：保留现有中文/英文失败提示。

## 兼容与回滚

- macOS 不查询 Windows release repo，旧行为等价于只看 upstream。
- `FANBOX_RELEASE_REPO=""` 明确关闭 Windows release 通道，退回 upstream。
- `update:open` 仍只允许 `https://github.com/`，不放宽外链。
- 回滚点很小：删除 `platform/update.js`，`main.js` 恢复原 `fetchLatestRelease()`，前端保留老 payload 兼容字段即可。
