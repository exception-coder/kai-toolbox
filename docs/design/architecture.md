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
| `DELETE` | `/api/treesize/scans/{id}` | 取消正在跑的扫描 / 删除已完成结果 |
| `GET` | `/api/treesize/scans` | 历史扫描列表 |

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

**明确不预埋**：任务调度、消息队列、Redis、Auth、通知系统。任何工具需要时再叠加对应中间件。

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
- 远程扫描（agent 模式）→ 当前只本地
- 工具间数据互通 → 各工具独立 schema，互不感知

需要时再加，不预埋抽象。
