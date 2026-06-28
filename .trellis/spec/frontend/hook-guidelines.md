# Hook Guidelines

> 本项目**没有 React、没有 React Hooks**。这一节重点说明 vanilla JS 的等价约定，以及子代理最容易误套的「i18n 调用」陷阱。

---

## Overview

`use*` 风格的 React Hooks 在本项目**不存在**（无 React，无 TS，无 prettier-use-hooks 规则）。共享有状态逻辑的方式是模块作用域的闭包函数 + 顶层 `let` 状态 + 事件监听。如果子代理想表达「自定义 hook」，应该写成普通函数 `function setupXxx() { ... }` 或事件初始化块。

---

## Custom Hook Patterns → 真实等价

- **「useEffect / 一次性初始化」**：在 `app.js` 中段（domContentLoaded 之后或脚本末尾顶层执行）直接调用 setup 函数。例：事件委托绑定、`MutationObserver` 启动（见 `i18n.js`）。
- **「useState」**：模块作用域 `let state = initialValue`，由 `updateXxx()` 函数改写并触发重渲染。新状态别用闭包私有变量若需跨函数访问——直接顶层 `let`。
- **「useEffect 清理」**：原生 `addEventListener` 配 `removeEventListener`；IPC 订阅走 preload 返回的 unsubscribe 函数（见下）。

---

## Data Fetching

后端通信统一走顶层两个 helper（`app.js:5`–`6`），**不要直接手写 fetch**：

```js
const api     = (p)     => fetch(p).then((r) => r.json());                       // GET → JSON
const apiPost = (p,body)=> fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());  // POST → JSON
```

- **Electron 桌面分支**：终端、剪贴板、文件监听、微信桥接等走 `window.fanbox*`（`electron/preload.js` 的 `contextBridge.exposeInMainWorld`），返回 Promise 或返回一个 unsubscribe 函数：

  ```js
  // preload 暴露的事件订阅，标准三步：on + 返回 unsubscribe
  onData: (cb) => { const h=(e,m)=>cb(m); ipcRenderer.on('pty:data',h); return ()=>ipcRenderer.removeListener('pty:data',h); }
  ```
  调用方约定：`const off = window.fanboxPty.onData(cb); ... off()` 清理。新增 IPC 订阅必须沿用这模式。

- **错误处理**：`api()`/`apiPost()` 解 JSON 后看 `data.ok` / `data.error`（后端软失败见 backend/error-handling.md）。前端展示 fallback 而不抛——见 `app.js:4404` `'读取失败'` 兜底。

---

## Naming Conventions

- 无 `use*` 前缀。setup 类用 `setupXxx`/`bindXxx`/`initXxx`，渲染用 `renderXxx`/`<type>Card`/`<type>Row`。
- IPC 桥接对象集中在 `window.fanbox<Purpose>`（`fanboxPty`/`fanboxRec`/`fanboxFs`/`fanboxWechat`...），方法名 `camelCase`。

---

## Common Mistakes

- ❌ 引入 `useState`/`useEffect`/`useMemo` 等 React Hook API。
- ❌ 直接 `fetch('/api/...')` 而不用 `api`/`apiPost` helper——重复啰嗦且不统一 Content-Type。
- ❌ 新增 IPC 事件订阅 `on` 不返回 unsubscribe——内存泄漏，违背 preload 既有模式（`electron/preload.js` 所有 `on` 都返回清理函数）。
- ❌ 调用不存在的 `t('...')` 翻译函数——见 hook-guidelines/i18n：本项目用 MutationObserver 自动翻译，直接写中文原文（`i18n.js` 顶部注释明说「app.js 不需要散布翻译调用」）。
- ❌ 桌面分支硬编码走 `api()` 而忽略 IPC——能用 `window.fanbox*` 的能力优先用 IPC（终端/剪贴板/文件监听在浏览器分支无等价物）。