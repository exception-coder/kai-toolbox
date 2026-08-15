# Delivery 结构化证据编码摘要

> 对应设计：`Delivery结构化证据-current.md`

## 1. 核心规则

- LLM 输出是不可信提议，状态、ID、路径、行号和证据由 Java 裁决。
- 完成 claim 没有 VERIFIED evidence 时不得保持 COMPLETED。
- 手动验证 API 只接受 `commandId`，不接受 shell/cwd/argv。
- 模型调用和外部进程均在数据库事务外；只有账本写入使用短事务。
- 服务端是 overallProgress 唯一事实源。

---

## 2. 入口与关键坐标

| 入口 | 当前位置 | 改造意图 |
|---|---|---|
| 生成进度报告 | `PrdClarifyService.java:1615` | 解析、校验、写 artifact 后绑 ledger |
| Markdown 解析 | `ProgressReportParser.java:31` | 保留 legacy 展示，取消 marker 对权威计分的影响 |
| 单需求投影 | `DeliveryOverviewService.java:99` | 优先读 claim/run，返回服务端分数 |
| 整体评分 | `DeliveryMetrics.java:34` | 10/10/60/20 |
| Delivery API | `PrdDeliveryController.java:30` | 新增 verification run POST |
| 前端重复公式 | `viewModel.ts:19` | 改为读 `requirement.overallProgress` |

---

## 3. 涉及类清单

| 全类名 | 操作 | 职责 |
|---|---|---|
| `com.exceptioncoder.toolbox.prdclarify.delivery.ProgressClaimLedgerParser` | 新增 | 解析固定 JSON marker |
| `com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryEvidenceVerifier` | 新增 | 项目根内验证证据 |
| `com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryClaimLedgerService` | 新增 | ledger 事务和读模型 |
| `com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryVerificationService` | 新增 | 白名单运行编排 |
| `com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryOverviewService` | 修改 | 权威投影 |
| `com.exceptioncoder.toolbox.prdclarify.delivery.DeliveryMetrics` | 修改 | 四段评分 |
| `com.exceptioncoder.toolbox.prdclarify.api.PrdDeliveryController` | 修改 | API 适配 |
| `com.exceptioncoder.toolbox.prdclarify.service.PrdClarifyService` | 修改 | 产物与 ledger 编排 |

---

## 4. 契约与上限

- Claim JSON marker：`<!-- DELIVERY_CLAIMS_JSON` 到 `DELIVERY_CLAIMS_JSON -->`。
- 最多 300 claims；每 claim 最多 10 条 evidence；标题 300 字；symbol 300 字；相对路径 1000 字。
- 验证输出摘要最多 32 KiB；错误摘要最多 1000 字。
- 同 session 一次只允许一个 RUNNING verification。
- 命令超时来自配置，服务端限制在 1–3600 秒。
- Windows 下只在 PATH 中实际存在同名入口时将 `mvn/npm` 解析为 `.cmd`，仍由 `ProcessBuilder` 直接执行，不调用 shell。

---

## 5. 数据与事务

- `delivery_claim` 与 `delivery_claim_evidence` 在同一 `@Transactional` 方法批量写入。
- `delivery_verification_run` 先独立 INSERT RUNNING，进程结束后条件 UPDATE `WHERE status='RUNNING'`。
- 查询不返回绝对项目路径；只返回 relativePath/gitHead/commandId 和脱敏摘要。

---

## 6. 失败行为

| 失败 | 行为 |
|---|---|
| Claim JSON 无效 | 评估失败，不覆盖旧报告 |
| Evidence 无效 | 记录验证状态；COMPLETED 自动降 PARTIAL |
| Ledger 写失败 | 抛异常并保持未验证投影，禁止伪成功 |
| 白名单 ID 不存在 | HTTP 400 |
| 项目不可用 | HTTP 400，不创建 run |
| spawn/timeout | run 终结为 ERROR |
| exitCode 非 0 | run 终结为 FAILED |

---

## 7. 验证命令

```powershell
mvn -pl tools/tool-prd-clarify -am test
cd frontend
npm run test
npm run typecheck
npm run build
cd ..
powershell -ExecutionPolicy Bypass -File scripts/quality-gate.ps1
```
