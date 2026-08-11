# Java8 股模块重构编码摘要

## 1. 核心业务规则

- 种子导入以节点稳定 ID 幂等执行，不覆盖数据库已有节点。
- 关系查询同时返回出边和入边，并标明方向。
- Controller 只做 HTTP 适配，聚合和初始化由 Service 编排。
- Repository 使用参数化 SQL，显式列出查询字段。

---

## 2. 接口入口指针

| 接口 | 实现类 |
|---|---|
| `GET /api/java8/categories` | `Java8guKnowledgeController#categories` |
| `GET /api/java8/nodes/{id}` | `Java8guKnowledgeController#node` |
| `GET /api/java8/nodes/{id}/relations` | `Java8guKnowledgeController#relations` |
| `GET /api/java8/interviews/{nodeId}` | `Java8guKnowledgeController#interviews` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.java8gu.api.Java8guKnowledgeController` | 新增 | 只读 HTTP 入口 |
| `com.exceptioncoder.toolbox.java8gu.domain.Java8Knowledge` | 新增 | 节点、示例、面试、关系记录 |
| `com.exceptioncoder.toolbox.java8gu.repository.Java8KnowledgeRepository` | 新增 | JDBC 持久化 |
| `com.exceptioncoder.toolbox.java8gu.service.Java8KnowledgeService` | 新增 | 初始化与聚合查询 |

---

## 4. 关键代码路径

| 文件 | 位置 | 说明 |
|---|---|---|
| `tools/tool-java8gu/src/main/resources/db/java8gu-schema.sql` | 文件末尾 | 幂等 DDL |
| `tools/tool-java8gu/src/main/java/com/exceptioncoder/toolbox/java8gu/api/Java8guController.java` | 类声明处 | 既有 `/api/java8gu` 契约，保持不变 |
| `frontend/src/features/java8gu/pages/Java8guHubPage.tsx` | `Java8guHubPage` | 替换首页数据源和布局 |
| `frontend/src/features/java8gu/components/markdown/MarkdownViewer.tsx` | 组件入口 | 复用 Markdown 与代码高亮 |

---

## 5. 重要约束

- 不新增框架依赖，不访问语雀或 GitHub 作为知识库运行时数据源。
- 保留旧 `/tools/java8gu/c/:cid`、`/q/:qid`、`/ask` 路由。
- 本轮查询为只读 API；CRUD 写接口后续按编辑需求单独设计。
