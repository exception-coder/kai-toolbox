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
