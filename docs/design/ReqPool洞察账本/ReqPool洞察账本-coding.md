# ReqPool 洞察账本编码摘要

## 1. 分层落点

| 层 | 类或文件 | 职责 |
|---|---|---|
| API | `ReqPoolController.java`、`ReqItemView.java` | 一次用例调用与新鲜度字段投影 |
| Application | `ReqInsightApplicationService.java` | 单条及组合分析编排、事务边界 |
| Domain | `ReqInsight.java`、`ReqInsightValidator.java`、`ReqInsightFingerprint.java` | 历史实体、确定性校验、源指纹 |
| Repository | `ReqInsightRepository.java` | 洞察历史和兼容投影 SQL |
| Compatibility | `ReqAnalysisService.java` | 保留原注入点，降级为一行委托门面 |
| Frontend | `types.ts`、`ReqPoolPage.tsx` | 展示生成时间和过期原因，不自行判断事实哈希 |

---

## 2. 关键代码路径

| 文件 | 当前坐标 | 改造动作 |
|---|---:|---|
| `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/service/ReqAnalysisService.java` | 30 | 抽离分析编排与验证，保留兼容门面 |
| `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/repository/ReqItemRepository.java` | 85 | 停止由分析服务直接逐条覆盖 |
| `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/ReqPoolController.java` | 326 | 继续只调用分析用例并返回视图 |
| `tools/tool-reqpool/src/main/java/com/exceptioncoder/toolbox/reqpool/api/dto/ReqItemView.java` | 10 | 增加生成时间、类型和失效信息 |
| `tools/tool-reqpool/src/main/resources/db/reqpool-schema.sql` | 29 | 新增幂等表与索引，不删除旧列 |
| `frontend/src/features/reqpool/types.ts` | 6 | 同步新增可选元数据字段 |
| `frontend/src/features/reqpool/pages/ReqPoolPage.tsx` | 1974 | 洞察卡展示过期状态 |

---

## 3. 硬约束

- 模型输出先解析、全量校验，后落库。
- 组合写入方法由 Spring 事务代理承载，禁止同类自调用绕过事务。
- Repository 禁止 `SELECT *`；新表 SQL 明确字段。
- 历史记录不可更新；兼容投影只保存最新 payload。
- 失败日志保留 item ID 或组合规模与异常堆栈，不记录完整敏感需求正文。
- 不修改本阶段之外的 Controller 分层、提示词内容或现有 API 路径。

---

## 4. 验证清单

- 单条合法、非法 JSON、枚举越界、工时负数。
- 组合外来 ID、缺失 ID、重复 ID、重复 rank、部分写失败回滚。
- 源事实变化和组合集合变化的新鲜度计算。
- 旧兼容记录返回 `LEGACY_UNVERIFIED`。
- `mvn -pl tools/tool-reqpool -am test` 与前端 typecheck/test。
