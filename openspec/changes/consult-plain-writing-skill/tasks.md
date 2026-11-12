## 实现与验证
- [x] 仓库咨询Skill与Maven单源打包，统一出口及旧会话装配。
- [x] 移除内置强制六段，保留识别块及证据边界。
- [x] 同步架构、README及面向业务人员更新记录（标明待验收）。
- [x] Skill校验通过（Windows以UTF-8模式读取）；Java装配回归15项、纸签回归4项通过；OpenSpec严格校验通过。
- [x] 项目门禁JSON PASSED且退出0，仅既有9项API探测，executedCheckers为空，不证明模型输出或新版本已运行。
- [x] 已提交HEAD加本次咨询改动的隔离副本41模块宿主package通过（跳过测试及前端重建，回归证据复用上项）；模块JAR与宿主嵌套JAR的Skill逐字节匹配仓库唯一源，原有schema保留。原工作区打包在并行tool-ops新增SqlConnectionPools.java处失败（DruidDataSource无getCreateError）；该任务保持不动且未纳入本次提交。
- [ ] 用户确认更新服务后进行新咨询、连续追问和技术问题真实回答验收（本轮未重启）。

## 2026-11-07 核查与业务答复强化（L2）

- [x] 复用唯一Skill及既有新咨询、历史追问、冻结流程和SDK装配，补充资源失败分类、版本对应、SQL小样本/统计口径、实际操作入口和最新条件保留规则。
- [x] 更新acceptance.md为原因、处理路径、证据缺口三项验收；用户汇总不是已读取的30会话原始记录，未填报真实模型通过。
- [x] 模块打包、现有定向回归、Skill资源一致性与质量门禁。
- [ ] [MANUAL_CONFIRMATION] 目标实例授权加载后使用原始案例验收；真实绑定修复、现场部署版本对应和业务知识核实需各自证据，不能以本次规则变更宣称已完成。

本批只改变同仓Skill的核查和表达规则，不修改身份、资源授权、工具、SQL执行能力、API合同或历史存储。源码定位：ReadonlyResourceService以规范化目录精确匹配ProjectSystemDirectory，零匹配或多匹配会拒绝；ConsultResourceService另核对服务端焦点和冻结流程绑定。未读取用户所述纱批会话的实际配置，因此没有自动修改关联或猜选系统。源码同步结果不证明现场版本一致。未增加规则引擎或自动知识写入；整体AI编程架构的职责/证据流和交付生命周期无变化。

验证：咨询模块及依赖package退出0，既有ConsultPlainWritingSkillTest、ConsultOrchestrationPipelineTest、ConsultToolAssemblyProviderTest、ConsultBackendIntegrationTest、ConsultResourceServiceTest共44项通过，无失败/跳过；模型调用使用替身，仅证明装配和合同回归。classes与模块JAR中的Skill与唯一源逐字节一致。OpenSpec严格校验、Markdown围栏和git diff --check通过。质量门禁phase all退出0且JSON PASSED，executedCheckers为空，仅运行toolbox-api-tools HTTP200探测，不能证明新规则运行或真实模型效果。无前端、依赖/宿主装配或运行配置改动，不追加全仓构建；未重启、未改业务数据、未推送。

## 2026-11-03 回复宪法强化（L2）

沿用已有统一装配及任务；无权限、工具、存储、协议和架构边界变更。工作区基线b73045ba0，无已有跟踪修改，未跟踪缓存保留。Graphify查询因713MiB图超过512MiB安全上限失败，使用定向源码定位，未提高上限或重建。

- [x] 唯一Skill补充八项宪法、发送前自检、具体协助及规则/实际原因区分；保留结构化协议和证据留存边界。
- [x] 整理4个真实咨询案例及3个边界变体的事实和验收标准，未预填模型通过。
- [x] 集中验证各角色首问/追问、冻结流程与旧会话、SDK实际调用边界的装配，并核对打包资源和项目门禁。
- [ ] [MANUAL_CONFIRMATION] 授权加载后按acceptance.md记录真实问题、证据、回答和逐例结论；本轮未重启，不宣称模型效果已验收。

本次验证：`mvn -pl tools/tool-fore-consult -am package "-Dtest=ConsultPlainWritingSkillTest,ConsultOrchestrationPipelineTest,ConsultToolAssemblyProviderTest,ConsultBackendIntegrationTest" "-Dsurefire.failIfNoSpecifiedTests=false" -q`退出0，2+8+3+22=35项通过，无失败/跳过。模块JAR及target/classes的Skill与仓库唯一源逐字节一致；未改宿主装配/依赖，不追加全仓宿主及前端构建。Skill格式、OpenSpec严格校验、受影响Markdown围栏及相对链接、git diff --check通过。

项目门禁phase all退出0、JSON status PASSED；static executedCheckers为空，runtime仅实际执行toolbox-api-tools一项API探测，不能作为新版Skill生效或模型语义通过的证据。无新增页面、SQL或运行配置；未重启、未改运行库、未回写旧问答。真实案例尚未执行，验收状态保留待确认。

## 2026-11-03 强制尾注冲突修复（L2）

基线bfb611a55，无已有跟踪修改。用户两张同一BOM咨询截图显示：已加强表达规则后仍有来源、源码过程和未使用的DEV数据库尾注。源码证据与影响分析见design.md最后一段；不能据此声称截图中的服务已加载哪个版本。

- [x] 收紧唯一Skill为默认一小段业务结论，动作和协助按用户实际任务提供，未知根因就地说明一次。
- [x] 同时修正默认节点、v1/v2/v4、数据库装配提示及SDK候选的无条件展开要求；冻结快照不改库，统一当前正文规则，不改机器字段或资源权限。
- [x] 增强默认/冻结流程及旧会话数据库装配回归，补充截图尾注反例，保留真实测试数据范围和根因不确定性。
- [x] 模块打包、集中定向回归、资源一致性与项目门禁。
- [ ] [MANUAL_CONFIRMATION] 目标实例授权加载新规则后，以截图咨询的同一事实进行新一轮真实模型回归，核对正文止于结论且无固定尾注；旧回答不自动改写。

首次37项回归有1项失败：v1测试要求保留“当前未连接生产数据库和日志”的内部安全前提。已恢复该前提，仅取消固定展开到业务正文和强制复现步骤的要求，未删除或放宽测试。最终同一组37项全部通过（2+8+3+2+22），无失败或跳过，模块package退出0；JAR中的Skill与仓库源逐字节一致。

Skill格式、OpenSpec严格校验、受影响Markdown围栏/本地链接及git diff --check通过。项目门禁phase all退出0、JSON PASSED；未执行静态检查器，runtime仅现有toolbox-api-tools一项HTTP探测，不代表新增规则已加载或真实回答语义通过。未改依赖/宿主装配，按影响只构建咨询模块及依赖；无前端变更、SQL或运行配置。未重启、未回写旧问答，实际模型回归保持待验收。

## 2026-11-12 自主核查、结论收口与正常设计（L2）

基线已有README归档链接调整，未纳入本次提交。无组件职责、权限或架构契约变化，不更新整体架构。

- [x] 补强现有Skill：授权内有界核查直接继续、不播报查询过程、充分结论不追加无关疑问、正常筛选不直接判Bug。
- [x] 修正v1默认“先询问”及整体待验证提示；首问、追问和冻结流程沿用既有当前Skill注入，不改历史回答。
- [x] 三个业务反馈加入有来源的验收案例；生管规则来自用户纠正，限定ERP场景，未写入其他项目知识原文或当作全局规则。
- [x] 10项既有定向测试通过（流程8、Skill装配2），Maven退出0；已复制资源与Skill源文件哈希一致。OpenSpec strict、git diff --check通过。
- [x] 项目质量入口all退出0、JSON PASSED；executedCheckers为空，运行仅当前/api/tools HTTP200，不证明本次规则已加载。
- [ ] [MANUAL_CONFIRMATION] 授权加载后对三例执行真实模型验收，确认实际继续核查、输出收口及不误判缺陷。本次未重启、未运行真实模型。

## 2026-11-12 页面参数与链接补充（L2）

- [x] 在原Skill补充截图实际筛选、页面默认/重置值、请求参数和后端条件的自主核查要求；业务单号不推定为日期或内部ID。
- [x] 已核实路由提供只读链接，支持参数才预填；否则给列表和最少筛选操作，保持当前环境、用户登录与权限，不夹带凭据或写入动作。
- [x] 补充当前品控单截图案例及参数、环境、ID反例；仅为规则验收输入，未访问ERP或查询该单。
- [x] 2项既有Skill装配测试、模块及依赖编译通过，源Skill与复制资源哈希一致，OpenSpec strict和diff检查通过。质量入口all退出0、PASSED，无静态checker，运行仅现有API-RUNTIME-001探测。
- [ ] [MANUAL_CONFIRMATION] 目标实例加载后真实验证：能自行发现默认参数影响、给准确操作及可用链接。本次未重启、未执行真实模型或外部页面验收。

无架构、权限或机器合同变化；保留已有README未提交改动，不纳入本次提交。
