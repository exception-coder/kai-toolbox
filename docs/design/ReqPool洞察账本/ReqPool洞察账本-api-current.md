# ReqPool 洞察账本 API 契约

## 1. 保持不变的端点

| 方法与路径 | 行为 |
|---|---|
| `POST /api/reqpool/items/{id}/analyze` | 生成单条洞察，校验成功后写历史和当前投影 |
| `POST /api/reqpool/portfolio-analyze` | 对当前活跃根需求生成组合排序并原子提交 |
| `GET /api/reqpool/items` | 返回条目及最新洞察的新鲜度元数据 |
| `GET /api/reqpool/items/{id}` | 返回条目及最新洞察的新鲜度元数据 |

---

## 2. `ReqItemView` 新增字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `aiInsightType` | `ITEM \| PORTFOLIO \| null` | 最新历史洞察类型 |
| `aiInsightPromptVersion` | `string \| null` | 生成该洞察的提示词版本 |
| `aiInsightGeneratedAt` | `number \| null` | 生成时间戳 |
| `aiInsightStale` | `boolean` | 当前事实是否已使洞察失效 |
| `aiInsightStaleReason` | `SOURCE_CHANGED \| PORTFOLIO_CHANGED \| LEGACY_UNVERIFIED \| null` | 失效原因 |

现有 `aiInsight` 字段继续返回 JSON 字符串，保证旧前端兼容。

---

## 3. 错误语义

模型输出不符合契约时端点失败，错误信息说明校验原因；系统不得保存未经校验的原文，也不得返回“成功但只更新部分条目”。
