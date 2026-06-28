# "Database" Guidelines

> 本项目**没有数据库、没有 ORM、没有迁移**。持久层是用户主目录下的 JSON 配置文件。

---

## Overview

复述一遍以避免子代理误套模板：FanBox 是本地个人工具，**不用数据库**。需要持久化的状态全部落在用户主目录的文件里：

| 用途 | 路径 | 形式 |
|------|------|------|
| 应用配置 / 用户偏好 | `~/.fanbox/config.json` | JSON 文件，`JSON.stringify(cfg, null, 2)` 缩进 |
| 缩略图缓存 | `~/.fanbox/thumbs/` | 普通文件 |

`CONFIG_DIR = path.join(os.homedir(), '.fanbox')`，`CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')`（均定义在 `server.js` 头部）。

---

## Query Patterns → 读写 config 的真实模式

配置读写不是直接 `fs.readFile`/`writeFile`，而是走两个内部函数：

- `readConfig()`（`server.js:101`）——读取并缓存当前 cfg。
- `updateConfig(mutator)`（`server.js` 头部业务区）——**带原子写与串行化队列**：写盘用「写临时文件 → fsync → rename」三步，避免崩溃写半截；多次并发更新挂到 `_cfgChain` 队列串行执行（**写 config 必须走它，禁止直接覆盖文件**）。详见 error-handling.md 的「原子写失败冒泡」约定。配置变更的 mutator 模式见真实调用：传入一个 `(cfg) => { cfg.recentOpened = ...; }` 函数就地改字段，由 `updateConfig` 负责回写。

---

## Migrations → schema 演化约定

没有迁移框架。`config.json` 的字段演化靠**读取时容缺**：

- 读侧用 `cfg.favorites || []`、`cfg.recentOpened || []` 这类 `|| 默认值` 兜底（见 `server.js:2132`/`2135`）。
- 新增字段：在所有读取点补 `||` 默认值即可，老 config 文件无需迁移。
- 删除/重命名字段：清理掉读取点即可，残留旧字段无害（下次写盘自然消失）。

**禁止**为配置加 schema 校验库或迁移工具——这是刻意的最小化。

---

## Naming Conventions

- 配置字段：`camelCase`、语义化（`recentOpened`, `favorites`, `lang`），与前端 localStorage 的 `fb_lang` 风格区分。
- 路径相关常量集中头部，避免散落业务函数。

---

## Common Mistakes

- ❌ 直接 `fsp.writeFile(CONFIG_FILE, ...)` 绕过 `updateConfig`——破坏原子写与并发安全。
- ❌ 读 config 时假定某字段一定存在而不加 `|| 默认值`——老用户首次升级会读到 `undefined`。
- ❌ 给 config 加 schema/Zod 校验——违背最小化设计；读取容缺已足够。