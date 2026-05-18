# browser-request · 变量内嵌到 SavedRequest（取消会话变量池）· 技术方案

## 背景

当前变量分两套：
- **会话变量池**（`browser_request_var`，全局列表）—— 用户「从响应提取为变量」、手动加变量都进这里
- **SavedRequest.outputs**（OutputSpec[] 配置）—— 已保存请求的输出"规则"，但没存"实际值"

两套并存导致：
1. 变量池里的变量看不出来自哪个请求
2. 编辑某条 saved 时，用户期望"变量是它的出参"——但实际变量在另一个面板
3. 「提取为变量」对话框写入全局池，跟产生它的请求脱钩

## 目标

**变量永远归属于某条 SavedRequest**——「请求 → 它的出参」永远在一起。编排里引用变量时，渲染器从所有 saved 的"最近提取值"合并成全局 map。

## 不做

- ❌ 不引入命名空间 `{{saved.field}}`——保持 `{{name}}` 简洁；同名冲突在写入时拒绝
- ❌ 不强制迁移历史数据——保留 `browser_request_var` 表做向后兼容（read-only fallback）
- ❌ 不取消「手动添加变量」需求时再考虑——目前没人提

## 数据模型

### SavedRequest 增加列

```sql
ALTER TABLE browser_request_saved ADD COLUMN last_extracted_values_json TEXT;
```

存储格式：`{"slug":"oyfmian...", "content":"<!doctype...."}`（每个 output 名 → 提取后的 stringified 值）

### domain

```java
public class SavedRequest {
    ...
    private String lastExtractedValuesJson;
}
```

### 跨 saved 变量名唯一

写入 saved 时（createSaved / updateSaved）校验：当前会话下 `outputs.name` 不能与其他 saved 的 outputs.name 冲突。冲突时返回 400 + 具体错误名字。

## 引用查找顺序

`{{name}}` 渲染时：

1. **chain vars** — pipeline 当前运行的 step 输出（瞬态，跑完丢）
2. **saved extracted vars** — 把当前会话所有 SavedRequest.lastExtractedValues 合并成 map（新）
3. **legacy session vars** — `browser_request_var` 表（**只读、兼容旧数据**）

同优先级内一般不会冲突（saved 跨表唯一已校验，chain vars 单 step 内自洽）。

## "提取为变量" 行为变化

### 旧

`ExtractVarDialog` 调 `upsertVar(sessionId, name, value)` → 写入 `browser_request_var`。

### 新

`ExtractVarDialog` 改写：

```
┌─ 从响应提取为输出 ───────────────────────────────┐
│ 目标已保存请求: [选择 ▼]   ← 必选                 │
│ JSONPath:      [$.data.slug          ]          │
│ 当前求值结果:   "oyfmian..."                     │
│ 变量名:        [slug             ]              │
│                              [取消] [保存到该请求] │
└─────────────────────────────────────────────────┘
```

保存时：

1. 校验"目标 saved 的 outputs"里有没有同名 output；
   - 没有 → 把新 OutputSpec 追加到 saved.outputs，并把当前值写到 saved.lastExtractedValues
   - 有同名 → 更新它的 jsonPath（如果用户改了）+ 更新值
2. 校验跨 saved 唯一（同会话下其他 saved 没有同名 output）
3. 调 `updateSaved` 一次落库

### 自动绑定来源 saved

`RequestExecutor` 维护"当前请求关联的 saved"概念（`loadedFrom` 已经有）。响应面板「提取为变量」按钮：
- 如果 `loadedFrom` 存在 → Dialog 默认选中那条 saved
- 否则 → 弹出"先保存请求才能提取变量"提示，引导用户先保存

## PipelineExecutor 集成

执行 step 前：

```java
Map<String, String> savedVars = new LinkedHashMap<>();
for (SavedRequest s : savedRepo.findBySession(sessionId)) {
    Map<String, String> extracted = parseExtractedValues(s.getLastExtractedValuesJson());
    savedVars.putAll(extracted);
}
// 兼容旧数据
Map<String, String> legacySessionVars = varRepo.asMap(sessionId);

// 优先级：chainVars > savedVars > legacySessionVars
Map<String, String> merged = new LinkedHashMap<>();
merged.putAll(legacySessionVars);  // 先放最低优
merged.putAll(savedVars);          // 覆盖
// chainVars 是 JsonNode 类型由 TemplateRenderer 内部单独查
```

TemplateRenderer 接 `chainVars` (JsonNode) + `flatVars` (String) 两个参数，按上述优先级查。

## 数据迁移

不强制迁移。保留 `browser_request_var` 表做兼容读：

1. 旧数据用户能继续看到（在 PipelinePanel step editor 的「可用变量」徽章里仍出现，标 `(legacy)`）
2. 新提取的变量都进 saved.lastExtractedValues
3. 老用户后续如果需要"清理"可手动删变量池条目（功能不在本期实现）

UI 上：「变量池」Tab 内容改名为「会话变量（旧）」，加红字"以后请用「保存请求」的输出配置"。VarsPanel 仍能编辑/删除旧数据，但不再有"添加"按钮的强引导。

## 前端 UI 变更

### 1. SavedRequestPanel 每条 saved 展开后

新增展示"当前提取的值"：

```
🟦 目录                                            [✏] [⬆] [🗑]
   curl 'https://...?book_id=63622563'
   ▼ 输出（点击展开编辑）
     slug    = "oyfmian8u3tgmppk"      [JSONPath: $.data[0].slug] [✏]
     [+ 输出]
```

值列实时显示，编辑器仍是 OutputsEditor，但 input 行新增"最近提取值"灰色文本（只读）。

### 2. ExtractVarDialog 改写

字段从 [name + jsonPath] 变成 [target saved + name + jsonPath]，保存时调新 API `POST /saved/{savedId}/extract`（service 内部走 updateSaved + 把值写到 lastExtractedValues）。

### 3. SessionTabs 调整

「请求 / 变量」Tab 内容从 [SavedRequestPanel + VarsPanel + RequestExecutor] 变为 [SavedRequestPanel + RequestExecutor]——VarsPanel 移到「JS 捕获」Tab 下方作为"会话变量（旧）"区域，标识 deprecated。

或者更激进：直接把 VarsPanel 收到 SavedRequestPanel 的某条折叠下「未绑定的旧变量」分组里。

### 4. 编排 step 编辑器的「可用变量徽章」

按 saved 分组显示：

```
可用变量（点击复制 {{name}}）：
  来自「目录」：[{{slug}}]
  来自「文章」：[{{content}}]
  会话变量（旧）：[{{xxx}}]
```

## API 变化

| 端点 | 变化 |
|---|---|
| `POST /sessions/{sid}/saved` | request body 仍兼容；保存时校验 outputs.name 跨 saved 唯一 |
| `PUT /saved/{id}` | 同上 |
| `POST /saved/{id}/extract` | **新增**：body `{ name, jsonPath, responseBody }`，后端用 SimpleJsonPath 求值后写到 saved.outputs（追加/更新）+ saved.lastExtractedValues |
| `GET /sessions/{sid}/vars` | **不变**（保留兼容）；返回值含 legacy session vars |
| `PUT /sessions/{sid}/vars/{name}` | **标记 deprecated**，前端不再调用，但接口保留以防外部调用 |

## 阶段拆分

| 阶段 | 内容 | 工作量 |
|---|---|---|
| 1 | 后端 schema + domain + repo + service + 跨 saved 唯一校验 | 半天 |
| 2 | 后端 `POST /saved/{id}/extract` endpoint + ExtractVarDialog 改写 | 半天 |
| 3 | PipelineExecutor 集成 savedVars merge | 1 小时 |
| 4 | 前端 UI 改造：SavedRequestPanel 显示值 / 移除 VarsPanel / 编排徽章分组 | 半天 |

总计约 **1.5 天**，与之前估算一致。

## 风险

| 风险 | 缓解 |
|---|---|
| 现有变量池数据"变怪" | 保留兼容读取，加 (legacy) 标签 |
| 跨 saved 同名冲突 | 写入时校验拒绝，错误信息明确 |
| `lastExtractedValuesJson` 长度无限增长 | 每个 value 截到 64KB（足够大多数 token / 数组 JSON） |
| 用户保存请求但没执行 → 提取按钮没数据 | UI 警告"请先执行该请求再提取" |
