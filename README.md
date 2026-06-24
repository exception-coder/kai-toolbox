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

## 项目工作台 · 知识库模块树

「项目工作台」选中一个项目后，会列出该项目的业务模块供点击建会话。模块来源有两档：

1. **知识库声明（优先）**：从 `project-domain-knowledge` 知识库读取该项目的模块树（业务中文名 + 代码路径）。
2. **自动识别（回退）**：知识库未配置或找不到该项目声明时，按构建标志文件（`pom.xml` / `build.gradle` / `package.json` / `go.mod` / `Cargo.toml` / `pyproject.toml` 等）自动识别模块。

### 配置

在 `toolbox-starter/src/main/resources/application.yml` 的 `toolbox.claude-chat.workspace` 下：

```yaml
toolbox:
  claude-chat:
    workspace:
      roots:
        - "D:\\path\\to\\projects"        # 工作台可选的项目根（仅扫一级子目录）
      knowledge-base-dir: "D:\\path\\to\\project-domain-knowledge\\knowledge"
```

`knowledge-base-dir` 指向知识库本地 clone 的 **`knowledge/` 目录**。后端读取路径为：

```
{knowledge-base-dir}/{项目目录名}/impl/modules.json
```

### 注意事项（务必遵守）

- **项目目录名必须 == 知识库 project key**。匹配方式是「按目录名」：工作区里项目文件夹叫 `yoooni`，知识库里就要有 `knowledge/yoooni/`。不一致则匹配不到，自动回退到构建文件识别。
- **`modules.json` 放在该项目的 `impl/` 子目录下**（实现级事实，与业务知识区隔离），不是项目根。
- **后端只读本地文件，不联网、不执行 git**。知识库更新后，需自行 `git pull` 拉取本地副本，工作台才会看到新模块（缓存 TTL 见 `cache-ttl-seconds`）。
- `knowledge-base-dir` 为空 = 不启用知识库模块树，始终走自动识别。
- `modules.json` 里的 `codePath`（后端代码目录）与 `webPath`（前端代码目录，`WebRoot` 下）均为相对项目根的路径；越界（`../` 逃出项目根）的条目会被忽略。
- **开会话的 cwd 以 `webPath` 为准**（前端常是问题暴露入口，从前端进场后靠路由映射关联到后端）；`webPath` 缺省时退回 `codePath`。前后端无法 1:1 对应的模块（如 crm）可把 `webPath` 留空，待知识图谱按真实对应登记。

`modules.json` 结构示例：

```json
{
  "project": "yoooni",
  "modules": [
    { "key": "sale", "name": "销售",
      "codePath": "src/com/maxtile/application/erp/sale",
      "webPath": "WebRoot/erp/sale" },
    { "key": "crm", "name": "客户关系",
      "codePath": "src/com/maxtile/application/crm",
      "webPath": "",
      "children": [
        { "key": "customer", "name": "客户",
          "codePath": "src/com/maxtile/application/crm/customer", "webPath": "" }
      ] }
  ]
}
```

## 文档

- 架构设计：`docs/design/architecture.md`
