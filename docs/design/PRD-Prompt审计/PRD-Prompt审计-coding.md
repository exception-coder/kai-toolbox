# PRD Prompt Catalog 与 AI Run 审计编码摘要

> 对应：[PRD Prompt Catalog 与 AI Run 审计设计](PRD-Prompt审计-current.md)

## 变更记录

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1 | 2026-08-14 | 三条 Prompt 执行链首批接入 |

---

## 1. 核心业务规则

- Prompt 内容只从 catalog 注册的版本资源读取，调用方不得持有版本常量。
- AI Run 必须先插入 `RUNNING` 再调用模型。
- 运行时异常或结构校验失败结束为 `FAILED`，有效输出结束为 `SUCCEEDED`。
- 账本不保存 Prompt、输入、输出正文和鉴权字段，只保存 SHA-256 与运行元数据。
- 文档变更快照必须包含 Analyzer/Verifier 的版本与哈希。
- Progress 产物写入 `source_hash` 和 `prompt_version`，并绑定 run 与 artifact。

---

## 2. 接口入口指针

本阶段不新增或修改 HTTP 接口。

| 入口 | 实现类#方法 |
|---|---|
| 文档变更分析 | `PrdDocChangeAnalysisService#analyze` |
| 文档变更重分析 | `PrdDocChangeAnalysisService#reanalyze` |
| 进度评估 SSE | `PrdClarifyService#evaluateProgress` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptPurpose` | 新增 | 三类稳定 purpose |
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdPromptDefinition` | 新增 | purpose/version/content/sha256 |
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRunStatus` | 新增 | 运行状态 |
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdAiRun` | 新增 | 审计记录 |
| `com.exceptioncoder.toolbox.prdclarify.repository.PrdAiRunRepository` | 新增 | 显式 SQL |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdPromptCatalog` | 新增 | 资源单一事实源 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdAiRunService` | 新增 | 生命周期与关联 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDocChangeAgentAnalyzer` | 修改 | 资源化并返回审计结果 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDocChangeAgentVerifier` | 修改 | 资源化并返回审计结果 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdDocChangeAnalysisService` | 修改 | Prompt 快照与候选绑定 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService` | 修改 | Progress 审计与产物关联 |

### 关键方法签名与职责

```text
PrdPromptCatalog#get(PrdPromptPurpose): PrdPromptDefinition — 返回不可变 Prompt 定义
PrdPromptCatalog#analysisProtocolFingerprint(): String — 组合 Analyzer/Verifier 身份
PrdAiRunService#begin(PrdPromptDefinition, RunContext): RunHandle — 插入 RUNNING
PrdAiRunService#succeed(RunHandle, String): void — 写输出哈希与成功时间
PrdAiRunService#fail(RunHandle, String, Throwable): void — 写输出哈希、错误与失败时间
PrdAiRunService#bindCandidate(Collection<String>, String): void — 绑定阶段运行与候选
PrdAiRunService#bindArtifact(String, String): void — 绑定运行与产物
PrdDocChangeAgentAnalyzer#analyzeWithAudit(PrdDocChangeEvidenceBundle): AuditedAnalysis — 分析并返回 runId
PrdDocChangeAgentVerifier#verifyWithAudit(PrdDocChangeEvidenceBundle, PrdDocChangeAnalysisResult): AuditedVerification — 复核并返回可空 runId
```

---

## 4. 数据结构

### prd_ai_run

```sql
CREATE TABLE IF NOT EXISTS prd_ai_run (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    purpose TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    prompt_sha256 TEXT NOT NULL,
    input_fingerprint TEXT NOT NULL,
    engine TEXT,
    model TEXT,
    candidate_id TEXT,
    artifact_id TEXT,
    status TEXT NOT NULL,
    output_sha256 TEXT,
    last_error TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

---

## 5. 重要约束与边界

- 幂等：AI Run 不是幂等结果缓存，每次真实模型调用创建新 ID。
- 并发：状态完成 SQL 带 `WHERE status = 'RUNNING'`，首个终结结果胜出。
- 事务：不跨 LLM 调用开启事务；单次 INSERT/UPDATE 使用 JDBC 短事务语义。
- 安全：`last_error` 最长 500 字，禁止写 request、auth token、apiBaseUrl。
- 兼容：现有 `analyze/verify` 方法保留并委托新审计方法，避免测试和潜在调用方断裂。

---

## 6. 下游依赖调用

```text
PrdPromptCatalog -> ClassPathResource
PrdAiRunService -> PrdAiRunRepository -> JdbcTemplate
Analyzer/Verifier/Progress -> AgentOneShotRunner
Progress -> PrdArtifactService
```

---

## 7. 异常处理要点

- Prompt 资源不存在或为空：抛 `IllegalStateException`，不调用模型。
- AI Run `RUNNING` 插入失败：原异常上抛，禁止无审计降级。
- Agent 运行失败：先尽力结束 run 为 `FAILED`，再沿用现有业务降级或 SSE error。
- 输出契约无效：run 记为 `FAILED`，Analyzer/Verifier 返回现有安全降级结果。
- 关联更新失败：不篡改已完成状态，异常向上暴露或附加到原异常。
