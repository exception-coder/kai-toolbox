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

菜单 RBAC 也以这份 manifest 为事实源。`frontend/scripts/generate-feature-permissions.mjs` 在 `npm run dev` /
`npm run build` 前读取所有 manifest，排除 `hidden:true` 与 `layout:'showcase'`，并生成
`frontend/public/feature-menu-permissions.json`。普通工具默认得到 `menu:<id>`，显式
`requiredPermission` 则沿用该权限码。生产构建会把目录复制到 `classpath:/static/`，后端
`MenuPermissions` 启动时加载目录，再由 `PermissionRegistryService` 幂等同步数据库。

因此新增、改名、换组、调整排序或删除菜单时，**只修改 FeatureManifest**；不要再维护 Java 菜单清单。
`npm run feature-catalog:check` 会检查生成目录是否与 manifest 一致。

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
| `GET` | `/api/treesize/devclean/probe` | 开发机清理：测量每条配方的当前占用 |
| `GET` | `/api/treesize/devclean/capability` | 开发机清理：回收站是否可用 |
| `GET` | `/api/treesize/devclean/recipes/{recipeId}/entries` | 开发机清理：按可信配方核对具体文件/目录 |
| `GET` | `/api/treesize/devclean/package-caches` | 开发机清理：查询 npm、pip、Maven 当前缓存配置 |
| `POST` | `/api/treesize/devclean/package-caches/{managerId}/configure` | 开发机清理：备份配置并切换未来缓存目录 |
| `GET` | `/api/treesize/devclean/fixed-directory-migrations` | 开发机清理：查询白名单固定软件目录迁移状态 |
| `POST` | `/api/treesize/devclean/fixed-directory-migrations/{migrationId}/execute` | 开发机清理：复制、创建 Junction、校验并回滚 |
| `POST` | `/api/treesize/devclean/execute` | 开发机清理：执行选中配方（入参只有 `recipeIds`） |

### 5.1.1 开发机清理（devclean）为何与扫描并列而非合并

同一个工具下的两套清理机制，差别是**知识来源**：

| | `CleanupAdvisor`（扫描页签） | `DevCleanCatalog`（开发机清理页签） |
|---|---|---|
| 前置条件 | 必须先扫完一个目录 | 无，目标先验已知 |
| 候选来源 | 在 `treesize_node` 上跑正则/SQL **推断** | 代码里**声明**的常量配方表 |
| 安全等级 | 从路径形状猜 | 人工写死 |
| 动作 | 删单个文件 | 清目录内容 / 删目录 / 保留最新 N 版 / 只提示 |

三条安全约束（改动这块前必读）：

1. **接口只收 `recipeId`，永不收路径。** 可被删除的目录集合在编译期由 `DevCleanCatalog` 固定，可在一个文件内审计完。加一个可删目录 = 改后端。
2. **`DevCleanCatalog.permitted()` 双名单。** `forbiddenSubtrees()`（Windows 目录、Program Files、`Code\User`、`.ssh`/`.aws`/`.kai-toolbox`）上下双向禁删；`containerRoots()`（`%USERPROFILE%` / `%APPDATA%` / `%LOCALAPPDATA%`）只禁删自身及其祖先，否则会把整个配方表全否掉。
3. **`TrashBin` 只走回收站，没有永久删除兜底**（与 `FileDeleteService` 的关键区别）—— 单次调用可能带走数 GB，而用户只是按类别授权的。失败**不**写入 `FailedDeleteRegistry`（那条重试链路是单文件 `Files.delete`，对目录必然永久失败），改为随响应内联返回。
4. **固定软件目录迁移只收 `migrationId` 和目标路径。** 源路径由 `FixedDirectoryMigrationService` 白名单决定；先复制并核对文件数、字节数和相对路径，再备份源目录、创建 Windows Junction。失败恢复源目录，成功后原备份仍保留，避免迁移过程把清理授权扩大为任意路径文件操作。

需要专用工具回收或会中断运行中进程的项（`pnpm store prune`、`docker system prune`、WSL `ext4.vhdx` 压缩、清空回收站）一律是 `ADVISORY`：只测体积 + 给命令，不代执行。

包管理器缓存配置迁移只修改 npm、pip、Maven 的用户级配置，并固定拼接管理器子目录；旧缓存不自动搬运或删除，仍由配方测量后交给用户核对。Gradle 的用户目录混有 wrapper、daemon 和初始化配置，不按普通缓存自动迁移。

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
TreeSizePage                 # Segmented 页签：空间扫描 | 开发机清理
├── [空间扫描]
│   ├── ScanForm             # 路径输入 + 启动按钮
│   ├── ScanProgress         # SSE 进度条（运行中显示）
│   ├── BreadcrumbNav        # 当前所在路径，点击回上层
│   ├── Treemap              # 当前目录子项的可视化（recharts Treemap）
│   ├── ChildrenList         # 当前目录子项列表，按大小排序，点击下钻
│   └── CleanupRecommendations
└── [开发机清理]
    └── DevCleanPanel        # 测量 → 勾选 → 执行；ADVISORY 项只展示命令
```

页签而非独立 feature：两者共享回收站删除语义与体积格式化，拆开要复制一套失败清单/重试面板。
「失败清单」入口只在扫描页签露出 —— 开发机清理的失败不进 `FailedDeleteRegistry`，在清理页签给入口会把用户导向一个必然为空的地方。

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
