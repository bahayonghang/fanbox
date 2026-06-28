# Component Guidelines

> 本项目**没有组件框架**。所谓「组件」就是手写函数 → 返回 HTML 模板字符串 → 插进 DOM，靠事件委托与 `data-*` 属性拆分。

---

## Overview

FanBox 前端是 vanilla JS，没有 React 组件、没有 props 传递、没有 JSX。渲染模式是统一的：

```js
function renderXxx(state) {
  return `<div class="item" data-path="${escapeHtml(e.path)}">${escapeHtml(e.name)}</div>`;
}
container.innerHTML = items.map(renderXxx).join('');
```

「组件复用」靠：①把渲染抽成纯函数返回 HTML 字符串；②用 `data-*` 属性在事件委托里重新取回数据。

---

## Component Structure

典型「组件」是一个返回 HTML 字符串的函数，与其事件绑定紧挨：

```js
// 渲染：纯函数，输入数据 → 输出 HTML 字符串
function fileCard(e) {
  return `<div class="item" data-path="${escapeHtml(e.path)}" data-kind="${e.kind}">
    <span class="svg-icon">${iconSvg(e)}</span>
    <span class="fname">${escapeHtml(e.name)}</span>
  </div>`;
}
// 事件：靠委托挂在容器上，靠 data-* 取回
$('#file-area').addEventListener('click', (ev) => {
  const item = ev.target.closest('.item');
  if (!item) return;
  const path = item.dataset.path;
  // ...
});
```

- 渲染函数尽量纯（输入数据 → 字符串），副作用（事件、fetch）放在调用方或独立的 bind 函数里。
- 列表渲染：`arr.map(renderXxx).join('')` 再赋值给 `innerHTML`（见 `app.js:415` 起的 `#file-area` 处理）。

---

## Props Conventions

没有 props。跨「组件」传数据用：

1. **`data-*` 属性**：渲染时埋 `data-path`/`data-kind`/`data-fb`，事件里 `ev.target.closest(...).dataset` 取回。
2. **闭包变量 / 顶层 state**：模块作用域 `let` 变量（见 state-management.md）。
3. **不要**模仿 React props 给函数堆超过 3 个位置参数——超过就传一个对象：`renderFoo(e, { compact, selected })`。

---

## Styling Patterns

- 全部样式在 `style.css`（单体），无 CSS Modules / Tailwind / styled-components / CSS-in-JS。
- 类名 `kebab-case`，区块前缀语义清晰（`.file-area`, `.nav-empty`, `.wx-loading`, `.svg-icon`）。
- 主题色 / 共享变量用 CSS 变量在 `:root` 定义（沿用既有），不在 JS 内联样式里硬编码颜色——需要临时态用 `classList.toggle('active')` 切类，不写 `style.color=`。
- SVG 图标统一走 `iconSvg()`/`SVG` 表（`app.js:9` 起），不内联 emoji。

---

## Accessibility

- 可点击元素优先用 `<button>` / `<a>` 语义标签；用 `<div onclick>` 时记得加 `tabindex="0"` + 键盘 handler——子代理新增交互别退化到只能鼠标。
- 图标按钮补 `title` 属性（`i18n.js` 会翻译 `title`，见 `app.js:858` 的 `[title]` 扫描）。
- 新增可见文本走 i18n：**直接写中文原文**，由 `i18n.js` 的 MutationObserver 自动翻译（见 hook-guidelines「i18n」节）——**不要手动调 `t()` 那类函数**，本项目没有。

---

## Common Mistakes

- ❌ 引入 React/Vue/JSX，或写 `class Foo extends Component`——本项目没有框架。
- ❌ 拼接用户内容时不 `escapeHtml`——XSS。所有动态文本入 HTML 前必须 `escapeHtml(x)`（项目多处如此，例 `app.js:2355`, `4363`）。
- ❌ 在渲染函数里直接 `fetch`/改 DOM 副作用——分离纯渲染与副作用。
- ❌ 在 `innerHTML` 模板里漏 `data-*`，导致事件委托拿不到数据。
- ❌ 手动调翻译函数——i18n 是 MutationObserver 自动翻译，直接写中文原文即可（见 i18n.js 顶部注释）。