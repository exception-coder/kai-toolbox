## 实现与验证
- [x] 仓库咨询Skill与Maven单源打包，统一出口及旧会话装配。
- [x] 移除内置强制六段，保留识别块及证据边界。
- [x] 同步架构、README及面向业务人员更新记录（标明待验收）。
- [x] Skill校验通过（Windows以UTF-8模式读取）；Java装配回归15项、纸签回归4项通过；OpenSpec严格校验通过。
- [x] 项目门禁JSON PASSED且退出0，仅既有9项API探测，executedCheckers为空，不证明模型输出或新版本已运行。
- [x] 已提交HEAD加本次咨询改动的隔离副本41模块宿主package通过（跳过测试及前端重建，回归证据复用上项）；模块JAR与宿主嵌套JAR的Skill逐字节匹配仓库唯一源，原有schema保留。原工作区打包在并行tool-ops新增SqlConnectionPools.java处失败（DruidDataSource无getCreateError）；该任务保持不动且未纳入本次提交。
- [ ] 用户确认更新服务后进行新咨询、连续追问和技术问题真实回答验收（本轮未重启）。

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
