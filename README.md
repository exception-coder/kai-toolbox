# kai-toolbox

个人工具集平台 —— 一个壳子 + 多个工具模块，按需叠加。

## 当前工具

| Tool ID | 名称 | 模块 |
|---|---|---|
| `treesize` | 磁盘空间分析 | `tools/tool-treesize` |

## 架构

- **后端**：Java 21 + Spring Boot 3.4 + Maven 多模块 + SQLite
- **前端**：Vite + React 19 + Tailwind v4 + shadcn/ui 风格组件
- **形态**：本地工具，浏览器打开 `http://localhost:8080`

工具通过 `ToolDescriptor` 接口自动注册到侧边栏；前端 feature 通过 manifest 自动收集到路由。

## 开发

### 后端

```bash
mvn clean install
cd toolbox-starter && mvn spring-boot:run
```

服务运行在 `http://localhost:8080`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

开发模式运行在 `http://localhost:5173`，Vite 会代理 `/api` 到后端 `8080`。

## 文档

- 架构设计：`docs/design/architecture.md`
