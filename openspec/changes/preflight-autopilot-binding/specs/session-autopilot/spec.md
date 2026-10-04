## ADDED Requirements

### Requirement: 会话上下文推荐可绑定规格
系统 SHALL 在当前会话内按最近文本和标题推荐本项目活动 OpenSpec change，并展示候选任务进度；选中候选后展示启动前校验状态。推荐分数不得自动代替用户选择。

#### Scenario: 一句话请求推进
- **WHEN** 用户在会话输入明确的“按当前规划推进”指令
- **THEN** 系统显示候选选择弹层和预检状态，不直接派发 Agent 轮次
- **AND** 用户可取消、重新探索或选择其他候选

#### Scenario: 规格无任务或校验失败
- **WHEN** 候选没有未完成 task 或 OpenSpec strict validation 失败
- **THEN** 页面展示具体原因并禁止确认该候选

#### Scenario: AI 根据会话语义推荐多个规格
- **WHEN** 用户打开自动推进候选
- **THEN** 目录候选先可选择，AI 依据最近会话与现有规格摘要推荐至多五项并优先展示
- **AND** AI 返回的 ID 必须属于当前项目活动目录；AI 失败时仍可人工选择

### Requirement: 多规格按序推进
系统 SHALL 允许用户勾选多个活动 change，并在同一会话中按勾选顺序逐项推进。每项须独立通过预检，确认时服务端再次核对全部 revision、未完成任务和 strict validation；任一项失败则不启动批次。

#### Scenario: 多项全部通过
- **WHEN** 用户勾选多个规格且全部预检通过并确认
- **THEN** 系统持久化有序批次，先监督第一项，并显示当前项序号与总数
- **AND** 当前项完成后重新检查下一项，再派发下一轮

#### Scenario: 后续规格在切换时失效
- **WHEN** 当前项完成而下一项已无可执行任务或严格校验失败
- **THEN** 批次停在待处理并展示具体原因，不跳过该项或宣称全部完成

### Requirement: 确认绑定时重新检查规格
系统 MUST 在启动自动监督前复核所选 change 的 revision、未完成任务和 strict validation；不得仅依赖浏览器先前的预检结果。

#### Scenario: 预检后规格改变
- **WHEN** 用户确认时规格 revision 与预览不同
- **THEN** 启动被拒绝，用户可以重新探索并确认

#### Scenario: 重复确认活动绑定
- **WHEN** 当前会话已有同一 change 的活动监督运行
- **THEN** 系统返回现有运行，不创建额外代次或派发重复轮次

### Requirement: 当前会话展示自动推进任务状态
系统 SHALL 在“推进”页签展示用户可访问且规划未锁定的受监督会话，并可按状态筛选。系统 MAY 按当前会话最近上下文把同项目相关 change 标为推荐；点击运行 SHALL 跳转到所属会话的推进详情，展示绑定目标、运行状态、当前阶段、预算、OpenSpec task 清单和最近执行报告。

#### Scenario: 锁定会话不占用看板位置
- **WHEN** 某受监督会话的规划状态为已过期且只读
- **THEN** 推进总览的列表、分页与状态数量均不包含该会话
- **AND** 解锁后该会话重新可见，原监督记录不丢失

#### Scenario: 推荐运行并跳转
- **WHEN** 当前会话文本与同项目受监督 change ID 匹配
- **THEN** 全部列表中的对应运行显示“推荐”标识
- **AND** 用户点击后进入该运行所属会话的推进详情，不改变运行状态

#### Scenario: 查看当前任务
- **WHEN** 用户打开已绑定会话的“推进”页签
- **THEN** 系统读取该会话绑定的 OpenSpec task 状态并标出当前 task
- **AND** 暂停、恢复、停止使用同一运行版本和原控制接口

#### Scenario: 任务快照暂不可读
- **WHEN** OpenSpec task 读取失败
- **THEN** 运行摘要仍可见，任务区提供重试，不将未知任务标为完成

### Requirement: 外部验证缺失时继续可执行工作
系统 SHALL 将不可用的外部验证环境记录为未完成项，并继续当前 task 内不依赖该环境的授权步骤。没有可执行步骤时才能等待用户；不得把未运行的数据库验证标为通过或勾选任务。

#### Scenario: 数据库环境暂不可用
- **WHEN** MySQL/MariaDB 容器在 SQL 执行前启动失败，且同一 task 尚有可独立实施或验证的步骤
- **THEN** Agent 上报 CONTINUE、明确 nextAction 和 remainingWork 中的未验证项
- **AND** Runtime 保持当前 task 未完成，后续回归数据库验证

#### Scenario: 自动推进以无容器路径验证
- **WHEN** 受监督任务包含数据库迁移验证而当前没有可用目标库
- **THEN** 自动推进不启动 Docker、WSL 或隐式触发 Testcontainers 的测试套件
- **AND** Sidecar 对受监督轮次中经权限回调的直接容器命令拒绝，Forge 验证工具拒绝直接容器命令
- **AND** 可用 H2 MySQL 模式检查兼容的脚本与应用接线，明确记录已执行范围
- **AND** 若规格仍要求目标 MySQL/MariaDB，H2 结果不替代该验收项

#### Scenario: 等待状态下同轮继续
- **WHEN** 运行已在 WAITING_USER，同一活动轮次没有待用户决策，并上报有明确下一步与未完成项的 CONTINUE
- **THEN** Runtime 恢复 ACTIVE 并保存未完成验证证据，不直接判定任务完成
- **AND** 其他等待或暂停状态返回 HTTP 409、当前版本和恢复入口

#### Scenario: 旧写入绑定占用新范围
- **WHEN** 本会话旧执行的写入范围与新的完整文件清单冲突
- **THEN** WORKSPACE_BUSY 指明占用会话、执行 ID 与范围，并引导审计旧绑定
- **AND** 不自动解除写入权或删除工作文件
