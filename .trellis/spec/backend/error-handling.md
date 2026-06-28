# Error Handling

> 后端统一约定：错误兜底在路由层，业务函数只管 `throw`，返回值只管成功态。

---

## Overview

`server.js` 的路由分发整段被一个顶层 `try/catch` 兜住（`server.js:1979` 打开，`2140` 兜底）：

```js
try {
  if (p === '/api/list') return sendJSON(res, 200, await listDir(...));
  // ... 所有路由 ...
  return await serveStatic(req, res, p);
} catch (err) {
  return sendJSON(res, 500, { error: err.message });
}
```

因此：**业务函数直接 `throw new Error('中文原因')`，路由层自动转成 `{ error }` JSON 回给前端。**不需要在每个 handler 里手写 try/catch。

---

## Error Types

没有自定义 Error 子类。约定是 `throw new Error('中文人话原因')`——消息本身是给用户看的中文（`'非法路径'`、`'文件已被外部修改'`、`'这里没有 package.json——发版向导目前只认 node 项目'`）。子代理新增错误时沿用**中文消息、口语化、说清原因**的风格，不要写 `throw new Error('ERR_INVALID_PATH')` 这种机器码风。

---

## Error Handling Patterns

1. **顶层兜底**（上）：路由 `throw` → 自动 500 `{ error: err.message }`。
2. **乐观操作静默吞**：很多文件系统副作用用 `.catch(() => {})` 或 `try { ... } catch { /* ignore */ }` 吞掉（见 `server.js:1188` `unlink(tmp).catch(() => {})`、`server.js:160`/`189` 的 `catch { /* ignore */ }`）——说明这是「本机个人工具」，无权限/文件不存在之类是常态，**不该让一个副作用失败拖垮整条请求**。
3. **关键写冒泡**：原子写配置失败必须 `throw` 传给调用方，**绝不静默成功**——`server.js:123` 注释原话：「写盘失败要冒泡给调用方，别静默成功」。这是和第 2 条的分界线：读/删/查可吞，**写 config 必须冒泡**。
4. **业务级「软失败」返回值**：`parseClaudeSession` 等解析函数返回 `{ ok: false, error: '...' }`，由路由透传给前端（`server.js:2054` `{ ok:false, conflict, error }`）。即：**解析/校验类失败用返回值表达，系统类失败用 throw**。

---

## API Error Responses

- `sendJSON(res, code, obj)`（`server.js:130`）是唯一 JSON 出口：`JSON.stringify(obj)` + `application/json; charset=utf-8`。
- 路由层兜底固定 `{ error: err.message }` + 500。
- 业务软失败按真实约定：`{ ok:false, error: '中文原因' }`（部分还带 `conflict: true` 等附加字段，见 `server.js:2054`）。
- 静态/危险前置检查直接写头返回：`res.writeHead(403); res.end('forbidden host')`（`server.js:1973`）。

---

## Common Mistakes

- ❌ 在业务 handler 套自己的 try/catch 又包一层——顶层已兜底，重复。
- ❌ 写 config 失败 `catch { return; }` 吞掉——会静默成功，违反第 3 条。
- ❌ 错误消息用英文机器码风格——本项目消息是给用户看的中文。
- ❌ 把 `catch { /* ignore */ }` 用在写 config 等关键路径——只在读/删/查副作用上吞。