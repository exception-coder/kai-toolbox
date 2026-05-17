# browser-request 响应体查看器升级 · 轻量设计

## 背景

`tool-browser-request` 的响应展示当前用原生 `<pre>` 渲染纯文本：
- 响应体 1.8MB JSON 时浏览器 layout 假死、无法滚动
- 已加 200KB 截断兜底，但用户看不到完整内容，只能下载到外部工具阅读

## 目标

让响应体在 KB ~ 数十 MB 量级下都能在页内流畅查看（滚动、搜索、折叠、高亮），不阻塞主线程。

## 方案

引入 **CodeMirror 6**（通过 `@uiw/react-codemirror`）替换 `<pre>`。

### 依赖

- `@uiw/react-codemirror` — React 包装层
- `@codemirror/lang-json` / `lang-xml` / `lang-html` — 语言包，按 Content-Type 动态选

总 gzip ≈ 200KB，单工具承担得起。

### 核心机制

1. **Viewport rendering**：CodeMirror 6 只把当前视口可见行渲染到 DOM，滚动时滑动窗口。文件多大 DOM 节点数恒定（百级别）。
2. **增量 Lezer parser**：语法树按 chunk 解析并缓存，可中断、可恢复，不一次性 parse 整个文档。
3. **不可变 doc 模型**：底层是 piece-table 风格的 `Text`，append/slice 是 O(log n)，不是字符串拼接。

### 渲染策略（三档）

| 体积 | 策略 |
|---|---|
| ≤ 2 MB | 启用语言扩展（高亮 + 折叠） + JSON 美化 |
| 2 MB ~ 30 MB | 关闭语言扩展，仅行号 + 软换行；不美化 |
| > 30 MB | 直接提示「太大请下载」，不渲染 |

### 兼容现有 UI

- 保留 status / headers / 下载按钮 / 复制按钮
- 暗色模式订阅 `document.documentElement.classList` 的 `dark` 类（MutationObserver），切换 CodeMirror `theme`

## 不做

- 不做 JSON 树视图（探索式视图后续按需）
- 不在 Web Worker 做美化（< 2MB 主线程 < 50ms 可接受）
- 不引入 Monaco（体积过大，不适合工具箱内一个模块）

## 影响范围

仅 `frontend/src/features/browser-request/pages/BrowserRequestPage.tsx` 的 `ResponseView` 组件，其他 feature 不动。
