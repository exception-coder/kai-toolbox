# 计划评审需求表达与纠偏编码摘要

对应完整文档：`计划评审需求表达与纠偏-current.md`

## 变更记录

| 版本 | 日期 | 变更内容摘要 |
|---|---|---|
| v1 | 2026-08-22 | 移除单轮重复模型改写，增加理解校对和确定性草稿投影 |

---

## 1. 核心业务规则

- `REQUIREMENT` 主回复必须包含需求标题、理解校对、需求说明、待确认项和验收场景。
- 回复结论先行且只处理本轮问题，禁止寒暄、复述历史、重复结论和泛泛建议。
- 一轮最多追问一个阻塞结论的问题；需求待确认项最多一个，理解校对和验收场景最多三点。
- `CONSULTATION` 以“结论”为主，仅在必要时追加“依据”或“需要确认”。
- 分享规格、系统现状、核心索引和完整对话足以推导答案时直接采用，不重复询问业务人员。
- 明确功能目标或期望结果必须判为 `REQUIREMENT`；缺少实现细节或当前系统不支持不是追问、拒绝或降为 `UNKNOWN` 的理由。
- 只有答案会改变需求对象、范围、规则或验收结果且上下文无法消除分歧时，才允许追问一个问题。
- `validateAfterReply` 不得再次调用 LLM 提炼本轮草稿。
- 结构化回复由代码提取标题，正文移除标题和兼容标记后原样保留。
- 非结构化需求回复只能以用户原始诉求生成待确认草稿，不得复制工具过程或失败套话。
- `CONSULTATION` 不生成草稿；来源已处理时不再次调用归并器。
- `MERGE/UPDATE/REMOVE` 只能引用当前清单中真实存在的目标 ID。
- 最终清单继续由前端确定性拼接并使用快照指纹幂等提交。

---

## 2. 接口入口指针

| 接口 | 实现类 #方法 |
|---|---|
| 评审 WebSocket 消息终态 | `ClaudeChatService#onResult` |
| `POST /api/claude-chat/reviews/public/{token}/requirements/sync` | `ReviewRequirementController#synchronize` |
| `POST /api/claude-chat/reviews/public/{token}/feedback` | `ReviewSpaceController#submitFeedback` |

---

## 3. 涉及类清单

| 全路径 | 操作 | 说明 |
|---|---|---|
| `com.exceptioncoder.toolbox.claudechat.service.ReviewIntentService` | 修改 | 确定性解析主回复并提供安全降级草稿 |
| `com.exceptioncoder.toolbox.claudechat.ai.ReviewRequirementCompiler` | 重命名 | 只保留 `compile` 局部归并职责 |
| `com.exceptioncoder.toolbox.claudechat.service.ReviewSpaceService` | 修改 | 更新业务理解校对提示协议 |
| `com.exceptioncoder.toolbox.claudechat.service.ReviewIntentServiceTest` | 修改 | 覆盖结构化解析和无二次 LLM 调用 |

### 关键方法签名与职责

```text
ReviewIntentService#validateAfterReply(String reviewSessionId, String turnId, String userText, String assistantText): Optional<ReviewIntentAssessment> — 校验意图并生成单轮增量草稿
ReviewIntentService#requirementDraftFromReply(String userText, String assistantText, boolean structured): RequirementDraft — 解析结构化回复或生成待确认降级草稿
ReviewRequirementCompiler#compile(String compilerContext): Compilation — 对一个未处理来源提出受控局部动作
```

---

## 4. 数据结构

不新增表、字段或对外 DTO。沿用 `ReviewIntentAssessment.extractedTitle/extractedContent`、`ReviewRequirement.Source` 和稳定 `sourceMessageId`。

---

## 5. 重要约束与边界

- 幂等键：评审用户消息对应的稳定 `sourceMessageId`。
- 事务范围：单来源归并动作、来源证据登记在同一事务内。
- 模型边界：归并模型只提出一个封闭枚举动作；应用层验证目标、长度和必填字段。
- 不处理的场景：不在自动同步阶段执行整份清单润色，不自动确认业务差异。

---

## 6. 下游依赖调用

```text
ReviewIntentService -> ReviewIntentClassifier：仅在显式规则不能判定时分类
ReviewRequirementService -> ReviewRequirementCompiler#compile：仅处理新的需求来源
```

---

## 7. 异常处理要点

- 主回复结构缺失 → 使用用户原始诉求生成带待确认标记的草稿。
- 归并模型异常或非法输出 → 降级为独立 `CREATE`，不得丢失来源。
- 重复来源 → 直接跳过，不重新调用模型或覆盖现有需求。
