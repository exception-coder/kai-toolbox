# PRD 产物账本编码摘要

本文档是 PRD 产物账本第一阶段的实施坐标。对应设计文档：`PRD产物账本-current.md`。

## 1. 核心规则

- 新增写入顺序固定为 `WRITING → 临时文件 → 原子替换 → READY → 旧字段兼容更新`。
- 不模拟数据库与文件系统的跨资源事务，中间态由启动核验收敛。
- `PrdClarifyService` 只做一行委托，不承载摘要、路径、状态推进或重试逻辑。
- 文件不存在不得作为空字符串成功读取；本批先保证新增账本读取严格，旧 `read` 兼容行为后续切换。
- 不删除旧字段、旧备份和孤儿文件。

---

## 2. 接口入口指针

本批不新增或修改外部 API。

| 现有入口 | 实现位置 |
|---|---|
| PRD 生成 SSE | `PrdClarifyService#generate` |
| 开发文档生成 SSE | `PrdClarifyService#generateDevDoc` |
| 进度评估 SSE | `PrdClarifyService#evaluateProgress` |
| PRD 手工保存 | `PrdClarifyService#saveContent` |
| 后台修订 | `PrdClarifyService#createBackgroundRevision` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifact` | 新增 | 账本记录与核验元数据 |
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType` | 新增 | PRD、开发文档、进度报告文件名规则 |
| `com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactState` | 新增 | `WRITING/READY/MISSING/CORRUPT` |
| `com.exceptioncoder.toolbox.prdclarify.repository.PrdArtifactRepository` | 新增 | 显式 SQL、版本查询和状态推进 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdArtifactService` | 新增 | 写入用例和同键串行控制 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdArtifactReconciler` | 新增 | 启动核验、恢复与孤儿报告 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdFileStore` | 修改 | 受控路径、原子写入、摘要和扫描 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService` | 修改 | 六处 PRD 类写入和两处派生产物写入改为委托 |

### 3.1 关键方法签名与职责

```text
PrdArtifactService#write(String sessionId, PrdArtifactType type, String content, ArtifactMetadata metadata): PrdArtifact
  创建版本、原子落盘并推进 READY；失败保留可恢复状态。

PrdArtifactReconciler#reconcileAll(): ReconciliationReport
  按磁盘实际存在性和摘要收敛全部账本状态，并报告孤儿文件。

PrdArtifactRepository#nextVersion(String sessionId, PrdArtifactType type): int
  读取当前最大版本并返回下一版本。

PrdArtifactRepository#insertWriting(PrdArtifact artifact): void
  写入不可重复的 WRITING 记录。

PrdArtifactRepository#updateVerification(...): void
  更新 READY、MISSING 或 CORRUPT 及核验元数据。

PrdFileStore#writeAtomically(String relativePath, String content): StoredFile
  在同目录创建临时文件并原子替换目标文件。
```

---

## 4. 数据结构

```sql
CREATE TABLE IF NOT EXISTS prd_artifact (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    version INTEGER NOT NULL,
    state TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    sha256 TEXT,
    size_bytes INTEGER,
    source_hash TEXT,
    prompt_version TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (session_id, artifact_type, version)
);
```

索引：

- `idx_prd_artifact_latest(session_id, artifact_type, version DESC)`
- `idx_prd_artifact_state(state, updated_at)`

---

## 5. 重要约束与边界

- 幂等与并发键：`sessionId + artifactType`；同键在单进程内串行，数据库唯一键兜底。
- 事务范围：单条账本 SQL 各自原子；文件系统操作不放入伪事务。
- 路径：只允许 `~/.kai-toolbox/prd/` 下的文件名，不接受调用方任意绝对路径。
- 空内容：允许，摘要为 SHA-256 空内容值，大小为 0。
- 不处理场景：存量全量 backfill、API 读切换、旧字段删除、自动孤儿导入与删除。

---

## 6. 异常处理要点

- 创建 `WRITING` 失败：不触碰文件，异常上抛。
- 临时文件或原子移动失败：保留 `WRITING` 并写 `last_error`，异常上抛。
- `READY` 更新失败：不可变版本文件保留，`WRITING` 供启动核验恢复，异常上抛。
- 兼容主文件或旧字段更新失败：不可变账本保留，调用失败，不把兼容投影误报为成功。
- 路径逃逸：抛 `IllegalArgumentException`，不进行任何文件操作。
- 启动核验单条失败：记录带 artifact ID 的警告，继续核验其它记录。

---

## 7. 关键代码坐标

| 文件与位置 | 说明 |
|---|---|
| `PrdFileStore.java:35-58` | 当前覆盖写、缺失返回空串和删除行为 |
| `PrdClarifyService.java:488-493` | PRD 生成写文件后再更新 DONE |
| `PrdClarifyService.java:955-972` | 开发文档文件、路径、时间、历史分步更新 |
| `PrdClarifyService.java:1707-1719` | 进度报告文件和三次数据库更新分离 |
| `PrdClarifyService.java:2036-2044` | 编辑器手工保存 PRD |
| `PrdClarifyService.java:2079-2105` | 后台修订子节点复制写入 |
| `PrdClarifyService.java:2147-2157` | 根 PRD 从备份恢复 |
| `PrdSessionRepository.java:179-197` | PRD 与开发文档兼容路径写入 |
| `PrdSessionRepository.java:316-330` | 进度路径、时间和历史写入 |
| `prd-schema.sql:8-115` | 旧会话表及三类路径字段 |

---

## 8. 验证命令

```powershell
mvn -pl tools/tool-prd-clarify -am test
powershell -ExecutionPolicy Bypass -File scripts/quality-gate.ps1
```
