# AI 交付链路质量基线编码摘要

本文档是 P0 质量基线的实施坐标。对应设计文档：`AI交付链路质量基线-current.md`。

## 1. 核心规则

- 不修改生产业务逻辑、接口、状态机或数据结构。
- Vitest 使用独立配置，禁止导入现有 `vite.config.ts`。
- 测试只验证公开函数的业务结果和失败边界。
- 本地质量脚本在任一命令失败时立即停止并返回非零退出码。
- CI 必须继续运行已有前端与后端架构守卫。

---

## 2. 接口入口指针

本批不新增或修改外部 API。

| 入口 | 实现位置 |
|---|---|
| `npm run test` | `frontend/package.json` |
| `npm run typecheck` | `frontend/package.json` |
| `npm run build` | `frontend/package.json` |
| `npm test` | `sidecar/claude-agent/package.json` |
| `mvn test` | 根 `pom.xml` Maven Reactor |
| 本地统一门禁 | `scripts/quality-gate.ps1` |

---

## 3. 涉及文件清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `frontend/package.json` | 修改 | 新增 test 脚本和开发依赖 |
| `frontend/package-lock.json` | 修改 | npm 锁文件同步 |
| `frontend/vitest.config.ts` | 新增 | jsdom、setup 与 `@` alias |
| `frontend/src/test/setup.ts` | 新增 | 注册 jest-dom 断言 |
| `frontend/src/features/fore-consult/consultAudit.test.ts` | 新增 | 审计分类测试 |
| `frontend/src/features/reqpool/factQuality.test.ts` | 新增 | 事实评分测试 |
| `tools/tool-prd-clarify/src/test/java/com/exceptioncoder/toolbox/prdclarify/service/PrdProgressEvaluationTest.java` | 修改 | 同步当前测试核查协议并稳定异步等待窗口 |
| `scripts/quality-gate.ps1` | 新增 | 本地质量入口 |
| `.github/workflows/quality.yml` | 新增 | CI 质量门禁 |

### 关键代码路径

| 文件与位置 | 说明 |
|---|---|
| `frontend/src/features/fore-consult/consultAudit.ts:70` | `buildConsultTurnAudits` 是咨询审计公开入口 |
| `frontend/src/features/reqpool/factQuality.ts:66` | `evaluateRequirementFacts` 是需求事实评分公开入口 |
| `frontend/package.json:6` | scripts 与 devDependencies 修改入口 |
| `tools/tool-prd-clarify/src/test/java/com/exceptioncoder/toolbox/prdclarify/service/PrdProgressEvaluationTest.java:27` | PRD 进度评估异步契约测试 |
| `toolbox-starter/src/test/java/com/exceptioncoder/toolbox/architecture/ModuleDependencyArchitectureTest.java:20` | 后端模块边界守卫已由 Maven 测试承载 |
| `frontend/scripts/check-feature-boundaries.mjs:1` | 前端 Feature 边界守卫由 typecheck 和 build 调用 |

---

## 4. 关键实现约定

### 4.1 Vitest 配置

`frontend/vitest.config.ts`：

- `environment` 使用 `jsdom`。
- `setupFiles` 指向 `src/test/setup.ts`。
- `resolve.alias` 与生产代码保持 `@ -> frontend/src`。
- 不引用 `vite.config.ts`，避免加载 mkcert。
- 默认匹配 `src/**/*.test.ts` 与 `src/**/*.test.tsx`。

### 4.2 咨询审计测试

使用完整 `ChatItem` 联合类型构造最小事件流，至少覆盖：

- 领域知识工具与 Graphify shell 查询被识别。
- 明确声明测试环境的 DB 查询通过。
- 带单据线索但未声明测试环境的 DB 查询告警。
- 合法与非法 BUG block 得到不同标签。
- 最后一轮运行中显示 running，而不是提前 pass。

### 4.3 需求事实评分测试

使用 `ReqItemView` 工厂，至少覆盖：

- BUG 文本在无 PRD session 时被推断为 `BUG_FIX`。
- 新模块无现存模块名时获得定位豁免。
- URL 可以补足页面定位，但结果仍标记为推断类型。
- 完整事实获得高等级；空事实保持低等级并产生扣分。

### 4.4 本地门禁脚本

脚本从自身目录解析仓库根，不依赖当前工作目录；每个命令调用后检查 `$LASTEXITCODE`，失败时抛出带阶段名的错误。执行顺序：

脚本优先检查 `JAVA_HOME`，无效时从 `PATH` 中定位 Java 21，并只在脚本进程内设置 Maven 使用的 `JAVA_HOME`；找不到 Java 21 时明确失败，禁止降级到 Java 8。

1. frontend test
2. frontend typecheck
3. frontend build
4. sidecar test
5. Maven clean test

脚本不执行 `npm install`，避免本地验证隐式改锁文件。

### 4.5 CI

拆成 frontend、sidecar、backend 三个 job：

- frontend 使用 `npm ci` 后依次执行 test、typecheck、build。
- sidecar 使用 `npm ci` 后执行 test。
- backend 使用 Java 21 和 Maven cache 执行 `mvn -B clean test`，避免复用由其它 JDK 或编码环境生成的陈旧 class。

---

## 5. 数据结构

无数据库、DTO、事件或外部协议变更。

---

## 6. 重要约束与边界

- 事务范围：无。
- 幂等：测试与质量检查可重复运行，不写运行数据库。
- 失败行为：任何阶段失败均停止当前入口并返回失败。
- 不处理场景：浏览器端到端测试、真实 Agent 调用、真实业务数据库查询暂不属于 P0。
- 工作树边界：不得修改已存在的 sidecar Engine 草案、README 和 supervisor 相关文件。

---

## 7. 验证命令

```powershell
cd frontend
npm run test
npm run typecheck
npm run build

cd ../sidecar/claude-agent
npm test

cd ../..
mvn clean test
```

统一入口：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/quality-gate.ps1
```
