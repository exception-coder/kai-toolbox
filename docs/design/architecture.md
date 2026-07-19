# kai-toolbox 架构设计

## 1. 定位

个人工具集平台。统一的外壳（侧边栏 + 顶栏），多个工具作为独立模块按需叠加。

形态：**本地单用户工具**。浏览器打开 `localhost:8080`，无登录、无多租户。

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端框架 | Spring Boot 3.4 + Java 21 |
| 后端构建 | Maven 多模块 |
| 持久化 | SQLite + Spring JDBC |
| 实时通信 | SSE（`SseEmitter`） |
| 前端构建 | Vite 6 + TypeScript |
| 前端框架 | React 19 |
| 样式 | Tailwind CSS v4（CSS-first 配置） |
| 组件 | shadcn/ui 风格（手写 + Radix 原语） |
| 路由 | React Router v7 |
| 状态 | 局部状态优先；TanStack Query 处理服务端数据 |

## 3. 模块划分

```
kai-toolbox/
├── pom.xml                     # 父 pom：依赖版本统一管理
├── toolbox-starter/            # Spring Boot 启动入口
├── toolbox-common/             # 公共能力：ToolDescriptor、SSE、SQLite 配置、异常处理
├── tools/
│   └── tool-treesize/          # 第一个工具：磁盘空间分析
└── frontend/                   # Vite + React 单仓
    └── src/
        ├── shell/              # AppShell + Sidebar + TopBar + 路由聚合
        ├── features/treesize/  # TreeSize 工具的前端代码
        └── core/               # 共享：API 客户端、cn、UI 组件
```

## 4. 工具注册机制

**前端为单一事实源**——侧边栏、首页、路由全部从前端 manifest 读取，不依赖后端在线。

### 前端 FeatureManifest

每个 feature 目录提供 `index.tsx`：

```tsx
import { HardDrive } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'
import { TreeSizePage } from './pages/TreeSizePage'

const manifest: FeatureManifest = {
  id: 'treesize',
  name: '磁盘空间分析',
  icon: HardDrive,                  // Lucide 组件直接引用，避免字符串映射
  group: '系统工具',
  description: '...',
  order: 10,
  routes: [{ path: '/tools/treesize', element: <TreeSizePage /> }],
}
export default manifest
```

`shell/featureRegistry.ts` 用 Vite 的 `import.meta.glob('../features/*/index.tsx', { eager: true })` 自动收集，按 `order` 排序。新增工具只需新建目录 + 写 manifest，不需要改任何路由表。

### 后端 ToolDescriptor（可选）

后端依然提供 `ToolDescriptor` 接口 + `GET /api/tools`，留作未来跨工具的服务端发现机制（例如某个工具需要列出其他工具的状态）。**当前前端不依赖此接口**——后端宕机不影响菜单显示。

## 5. TreeSize 工具设计

### 5.1 API

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/treesize/scans` | 启动扫描，返回 `{scanId}` |
| `GET` | `/api/treesize/scans/{id}/events` | SSE：实时进度事件 |
| `GET` | `/api/treesize/scans/{id}` | 获取扫描元信息（状态、统计） |
| `GET` | `/api/treesize/scans/{id}/children?path=...` | 获取指定目录的直接子项 |
| `GET` | `/api/treesize/scans/{id}/cleanup-candidates` | 基于扫描结果生成清理建议候选 |
| `DELETE` | `/api/treesize/scans/{id}` | 取消正在跑的扫描 / 删除已完成结果 |
| `GET` | `/api/treesize/scans` | 历史扫描列表 |
| `GET` | `/api/treesize/ssh-hosts` | TreeSize SSH 主机列表 |
| `POST` | `/api/treesize/ssh-hosts` | 新增 SSH 主机 |
| `PUT` | `/api/treesize/ssh-hosts/{id}` | 更新 SSH 主机 |
| `DELETE` | `/api/treesize/ssh-hosts/{id}` | 删除 SSH 主机 |
| `POST` | `/api/treesize/ssh-hosts/{id}/test` | 测试已保存 SSH 主机连接 |

### 5.2 SSE 事件类型

```
event: progress
data: {"scanned": 12345, "currentPath": "C:/Users/zhang/..."}

event: completed
data: {"totalFiles": 99999, "totalSize": 123456789}

event: error
data: {"message": "..."}
```

### 5.3 扫描引擎

- **入口**：`ScanService.startScan(rootPath)` 提交一个 `ScanTask` 到虚拟线程执行器
- **遍历**：`Files.walkFileTree` + `SimpleFileVisitor`，目录退出时聚合子项 size
- **进度**：每扫描 1000 个文件推送一次 SSE 事件，避免事件风暴
- **写库**：批量插入（每 500 节点 commit 一次），不等扫完一次性写
- **取消**：`ScanTask` 持有 `volatile boolean cancelled`，visitor 检查后抛 `CancellationException`
- **符号链接**：默认不跟随（`FileVisitOption` 不传），避免 `/proc` 之类环路
- **远程扫描**：扫描 source 分为 `LOCAL_WINDOWS` 与 `SSH`。SSH 模式通过保存的主机配置连接远端，执行 Linux/GNU `find -P <path> -depth -printf ...` 流式回传节点，再在应用侧聚合目录大小并写入同一套 `treesize_node` 表。远程扫描结果只支持空间分析与目录下钻，不复用本地文件播放/删除接口。
- **清理建议**：扫描完成后可从节点表派生候选项，不自动删除。分类包括大文件久未修改、重复文件疑似、缓存/构建产物、Docker 占用、数据库/上传/业务数据风险提示；安全等级为 `SAFE`、`REVIEW`、`DANGEROUS`。

### 5.4 数据模型（SQLite）

```sql
CREATE TABLE treesize_scan (
    id           TEXT PRIMARY KEY,
    root_path    TEXT NOT NULL,
    status       TEXT NOT NULL,     -- RUNNING | COMPLETED | FAILED | CANCELLED
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    total_files  INTEGER DEFAULT 0,
    total_dirs   INTEGER DEFAULT 0,
    total_size   INTEGER DEFAULT 0,
    error_msg    TEXT
);

CREATE TABLE treesize_node (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id      TEXT NOT NULL,
    parent_path  TEXT,
    path         TEXT NOT NULL,
    name         TEXT NOT NULL,
    is_dir       INTEGER NOT NULL,  -- 0/1
    size         INTEGER NOT NULL,  -- 目录是子项总和
    file_count   INTEGER DEFAULT 0,
    dir_count    INTEGER DEFAULT 0,
    depth        INTEGER NOT NULL
);

CREATE INDEX idx_node_scan_parent ON treesize_node(scan_id, parent_path);
CREATE INDEX idx_node_scan_path   ON treesize_node(scan_id, path);

CREATE TABLE treesize_node_meta (
    scan_id      TEXT NOT NULL,
    path         TEXT NOT NULL,
    modified_at  INTEGER,
    PRIMARY KEY (scan_id, path)
);

CREATE TABLE treesize_scan_source (
    scan_id       TEXT PRIMARY KEY,
    source_type   TEXT NOT NULL, -- LOCAL_WINDOWS | SSH
    ssh_host_id   TEXT,
    display_name  TEXT
);

CREATE TABLE treesize_ssh_host (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    host           TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 22,
    username       TEXT NOT NULL,
    auth_type      TEXT NOT NULL, -- PASSWORD | KEY
    password       TEXT,
    private_key    TEXT,
    passphrase     TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);
```

**为什么用扁平表 + parent_path 索引**：相比嵌套集合（nested set）模型，这种结构插入快、按层查询快、实现简单；适合"扫完一次性写、按目录懒加载读"的访问模式。

### 5.5 前端交互

```
TreeSizePage
├── ScanForm          # 路径输入 + 启动按钮
├── ScanProgress      # SSE 进度条（运行中显示）
├── BreadcrumbNav     # 当前所在路径，点击回上层
├── Treemap           # 当前目录子项的可视化（recharts Treemap）
└── ChildrenList      # 当前目录子项列表，按大小排序，点击下钻
```

懒加载：每次切换目录调 `/children?path=...`，只加载直接子项，不全量加载。

## 6. 公共基础设施（toolbox-common）

| 组件 | 职责 |
|---|---|
| `ToolDescriptor` | 工具注册接口 |
| `ToolRegistry` + `ToolController` | 收集 + 暴露 `/api/tools` |
| `SseEmitterRegistry` | 按 key 维护活跃 SseEmitter，工具按需推送事件 |
| `SqliteConfig` | SQLite 数据源配置（WAL 模式、外键约束开） |
| `GlobalExceptionHandler` | 统一异常响应 |

**明确不预埋**：任务调度、消息队列、Redis、通知系统。任何工具需要时再叠加对应中间件。

> **可选鉴权能力（默认关闭）**：`toolbox-common` 内提供一套通用 JWT 鉴权能力库（`common.auth` 包，对标 `featureconfig`），由 `toolbox.auth.enabled` 守门，**缺省为 false——所有 bean / 过滤器 / 接口都不加载，默认仍是无鉴权单用户**。仅当某个工具需要保护接口时显式开启并配置 `protected-patterns`。设计见 `ai-docs/kai-toolbox/design/JWT鉴权/`。这是「待命能力」而非已生效中间件，不改变默认无鉴权的事实。

## 7. 部署

最终形态：单 fat JAR，前端构建产物嵌入 `toolbox-starter/src/main/resources/static/`。

```bash
cd frontend && npm run build && cp -r dist/* ../toolbox-starter/src/main/resources/static/
mvn -pl toolbox-starter -am clean package
java -jar toolbox-starter/target/toolbox-starter-*.jar
```

开发模式两端分离：后端 8080，前端 Vite 5173 代理。

## 8. 后续演进的扩展点

仅作记录，**当前不实现**：

- 多个 SSE emitter 复用一个 scan（多 tab 同时观察）→ 现在按 scanId 单 emitter
- 增量扫描（只扫 mtime 变化的目录）→ 现在每次全量
- agent 模式远程扫描 → 当前远程能力是 SSH 直连执行 `find`，暂不引入常驻 agent
- 工具间数据互通 → 各工具独立 schema，互不感知

需要时再加，不预埋抽象。

## 9. WebPPT 风格中心工具设计（tool-webppt）

作为「工具即插件」约定的又一实例：`tools/tool-webppt` 提供一套**统一、可版本追溯的 WebPPT（网页版演示文稿）风格规范**，
本身不做内容生成，只做「规范资产的读取与版本管理」。

### 9.1 分层

- **Layer 0 — 内容组织原则**：如何把素材拆成标题层/论点层/证据层/行动层，固化在 `resources/style/prompt/vX.Y.Z.md` 中，与具体渲染载体无关。
- **Layer 1 — Design Token**：配色/字体/间距/圆角/母版类型等视觉变量，固化在 `resources/style/design-token/vX.Y.Z.json`，是唯一真源。
- **Layer 2 — 渲染适配层**：把 Token + 内容落地为某种可交付载体。当前只有 reveal.js 一种实现（`resources/style/samples/<sampleId>/index.html`，
  可直接双击在浏览器打开验证）。未来新增 PPTX 等适配器时，只需新增 `tools/tool-webppt` 下的新适配目录 + Controller 方法，
  Design Token 与 Prompt 文档零改动——这是验证"修改 Token 色值后无需改动提示词结构描述"的关键设计。

### 9.2 风格资产即文件，不建业务表

不引入 SQLite 表；版本追溯通过文件名版本号（`vX.Y.Z`）+ `resources/style/CHANGELOG.md` 实现。
`WebPptStyleService` 启动后按需扫描 classpath 下的 `style/design-token/*.json` 得到可用版本列表，
`latest` 取语义化版本号最大者；`CHANGELOG.md` 中 `## vX.Y.Z - YYYY-MM-DD` 起始的段落解析为版本的发布时间与摘要。

### 9.3 只读 API（挂载于 `/api/webppt`，遵循「每个工具 `/api/<tool-id>`」的既有路由约定）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/webppt/style/token?version=latest` | 获取指定/最新版本 Design Token（JSON） |
| GET | `/api/webppt/style/prompt?version=latest` | 获取风格提示词原文（`text/markdown`） |
| GET | `/api/webppt/style/versions` | 版本列表（含发布时间、摘要、是否为当前生效版本） |
| GET | `/api/webppt/samples` | reveal.js 落地样例清单 |
| GET | `/api/webppt/samples/{sampleId}/content` | 样例完整 HTML（`text/html`，供前端 iframe 沙箱内嵌预览） |

版本/样例缺失返回结构化 `404`（`errorCode: VERSION_NOT_FOUND` / `SAMPLE_NOT_FOUND`），资产文件损坏返回结构化 `500`
（`errorCode: STYLE_ASSET_MALFORMED`），均由模块内 `WebPptExceptionHandler` 统一包装，不抛 Spring 默认 500 页面。

### 9.4 前端

`frontend/src/features/webppt/`：Design Token 可视化预览（配色色板 + 字号阶梯）、提示词一键复制、版本切换（`Segmented`）、
reveal.js 样例 iframe 沙箱预览。均走既有 `Card`/`Button`/`Segmented` 组件与 `lib/api.ts` 的 `http`/`authFetch`，
无二次确认交互，未引入原生 `alert/confirm/prompt`。
