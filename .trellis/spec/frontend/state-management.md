# State Management

> 本项目**没有状态框架**（无 Redux/Zustand/Jotai/Context）。状态=模块作用域的顶层 `let` 变量 + 渲染函数读它。这是 vanilla JS 唯一现实。

---

## Overview

`app.js` 的状态是一组顶层 `let state = ...` 变量，分散在脚本各处对应业务区。改状态=直接赋值，然后手动触发对应区的重渲染（调用对应的 `renderXxx()` 把 `innerHTML` 重写）。“状态→UI 单向流”靠**约定与纪律**实现，不是靠框架订阅。

---

## State Categories

| 类别 | 存放 | 例子 |
|------|------|------|
| UI 临时态 | 顶层 `let` 区变量 | 当前选中项、当前展开目录、终端主题等 |
| 持久偏好 | `localStorage`（渲染层） + `config.json`（Electron 菜单读） | `localStorage['fb_lang']`（`i18n.js:13`） |
| 服务端状态 | 不缓存或弱缓存，按需 `api()` 重取 | 文件列表每次 `/api/list` 重拉 |

- **没有全局 store 对象**。别为子代理新增「集中 state 单例」——既有是分散顶层变量，沿用。
- **别引入 React Context / Provider**。

---

## When to Use Global State

「全局」=顶层 `let`。把变量提到顶层作用域的条件：**至少两个业务区要读它**。只在单个函数里用的就别外提。

派生态（derived）：**不预先存它**，渲染时即时从基础态算（如 `entries.map(...)` 现场排序）。子代理别为「派生态」单独存一份并手动同步——会过期。

---

## Server State

- 列表/文件内容/搜索结果：**不在前端长期缓存**，刷新即重拉 `api('/api/list?path=...')`、`api('/api/read?path=...')`。
- 文件系统变更走 IPC `window.fanboxFs.onChanged`（preload 暴露），桌面分支得到通知后重渲染，不维护本地镜像。
- “重新渲染”=重新 `api()` 拉 + 重写对应容器 `innerHTML`，不要尝试做局部 diff（无虚拟 DOM）。

---

## Common Mistakes

- ❌ 引入 Redux/Zustand/Context API——本项目无框架，新增会显得格格不入（见 quality-guidelines）。
- ❌ 为派生态（如「已排序的文件列表」）存独立变量并同步——重渲染时直接重算。
- ❌ 直接改一个状态变量后忘记触发重渲染——vanilla JS 无订阅，改完要手动 `renderXxx()`。
- ❌ 桌面文件变更通知来了却重拉整个应用状态——只重拉受影响的那一块容器。