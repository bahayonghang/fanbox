# Type Safety

> 本项目**没有 TypeScript**。前/后端全部纯 JS。没有 `tsconfig.json`、没有 `.d.ts`、无运行时校验库（Zod/Yup/io-ts）。本节记录在不加类型系统的约束下，项目实际怎么保持数据形状一致。

---

## Overview

「类型安全」靠三件事兜底，而不是类型系统：

1. **后端是数据形状的唯一来源**——前端解构 `api()`/`apiPost()` 的返回值时按后端约定。
2. **跨层数据见 `.trellis/spec/guides/cross-layer-thinking-guide.md`**——加 event kind / JSONL record / RPC payload / config 字段时先查既有字段。
3. **关键边界处手写守卫**，而非整层校验。

不要为本项目引入 TS、不要加 Zod——会与「零依赖、单文件」约定冲突（见 backend/quality-guidelines.md）。

---

## Type Organization

- **没有 `types/` 目录、没有 shared types 文件**。前后端「共享类型」即后端 `server.js` 里构造返回对象的字面量，前端按它解构。
- 新增/修改 `/api` 返回字段时：①后端构造处加字段；②前端取用处读它，用 `|| 默认值` 兜老响应。**两处都要改**，靠先读 `cross-layer-thinking-guide.md` 防漏。

---

## Validation

- **运行时校验只用在边界**：路径入口走 `resolvePath`（`server.js:92`，拒绝 `\0`、规范化），危险 URL 走 `originAllowed`/`hostAllowed`/正则（`electron/main.js:220` 限 `^https://github.com/`）。
- **不要**给每个 API 响应包 Zod schema——本机回环 + 自有后端，强校验是过度设计。
- 用户可见输入（如重命名/路径）在 handler 里做最小必要性校验（空字符串、非法字符），错误走 throw → 顶层兜底。

---

## Common Patterns

- **`x || 默认值`** 兜 undefined（后端读 config 如此，前端解构响应同约定）。
- **`data.ok` / `data.error`** 软失败协议（见 backend/error-handling.md），前端据此分支。
- **类型 guard 用 `typeof` / `Array.isArray`** 内联判断，不抽工具库。
- **`escapeHtml`** 是把「不可信字符串」安全塞进 HTML 的唯一守门人——前端所有动态文本入 `innerHTML` 必须过它（见 component-guidelines.md）。

---

## Forbidden Patterns

- ❌ 引入 TypeScript / `tsc` / `tsconfig.json`。
- ❌ 引入 Zod/Yup/io-ts 运行时校验库。
- ❌ 给每个 API 响应包整层 schema 校验——违背最小化。
- ❌ 引入 JSDoc `@typedef` 给整个项目铺类型——既有代码几乎没有，逐个补是噪音；只在导出公共 helper 时可酌情加一行 JSDoc 参数说明。
- ❌ 用 `any`/`as`（没有 TS，本就无处可用——这条提醒是防止子代理「顺手迁到 TS」）。