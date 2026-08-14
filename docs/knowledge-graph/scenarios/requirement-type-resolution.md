# 需求类型解析与同步

## 事实层

- 稳定枚举和解析端口位于 `toolbox-common/.../requirement`。
- `PrdRequirementTypeResolver` 是当前 Agent 适配器；需求池只注入公共端口。
- 独立需求在创建及标题/描述变化时解析。
- PRD 镜像从非草稿会话读取 `req_type`，来源记为 `PRD_SESSION`。
- PRD 草稿的默认 `NEW_MODULE` 只是占位值，需求池不得把它当作确认事实。
- 需求池在 `req_pool_item` 保存类型、来源和置信度，API 对存量空值投影为 `UNKNOWN/UNKNOWN/0`。
- React 事实质量评分只消费 API 或 PRD 会话类型，不再扫描文本关键词。

## 业务语义

`RequirementType` 是 AI 澄清策略分类，用于决定事实质量判断与 PRD 澄清策略；它不是业务部门维护的原始需求分类。

## 约束

- `tool-reqpool` 不得依赖 `tool-prd-clarify` 实现包。
- 非法模型输出不得转换成 `NEW_MODULE` 对外传播。
- `UNKNOWN` 不享受新增模块的“模块尚未创建”定位豁免。
- PRD 为兼容既有流程，可以在模块内部将未知结果降级到 `NEW_MODULE`，但该降级不写成需求池事实。

## 失败与恢复

- 分类适配器缺失、抛错、输出非法枚举或非法置信度时保存标准未知值。
- 存量未知记录可在下一次需求事实编辑时重新解析，也可在 PRD 进入澄清后由同步流程覆盖。
- PRD 同步幂等比较类型和来源，即使其他事实未变化也会补齐旧记录。

## 验收证据

- `PrdRequirementTypeResolverTest` 覆盖合法输出、非法类型和 PRD 兼容降级。
- `ReqRequirementTypeServiceTest` 覆盖端口解析、适配器缺失和 PRD 确认类型。
- `factQuality.test.ts` 覆盖浏览器不再推断与 `UNKNOWN` 的保守评分。
