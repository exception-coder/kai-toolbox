# 工作助理实施

- [x] 核实运行、资源、Git、语音与 Skill 能力，记录设计和首期边界。
- [x] 实现独立会话、Skill 快照、幂等任务执行与恢复。
- [x] 实现受控 Git 周报采集与结果导出。
- [x] 实现资源安全登记、原记录跳转与凭据加密兼容。
- [x] 实现机器人首页、常驻助理坞与文本/语音输入。
- [x] 执行定向测试、类型与构建装配、项目质量检查，形成独立代码提交。
- [ ] 用户确认重启后验证真实账号、语音、资源登记及 60 秒稳定性；未授权不重启。

## 验证与交付状态

- 2026-10-19：`mvn -pl toolbox-starter -am package -Dskip.frontend=true -Dtest=AssistantConversationServiceTest,AssistantResourceEnrollmentTest,OpsCredentialCipherTest,GitReportEvidenceTest -Dsurefire.failIfNoSpecifiedTests=false` 通过，41 个模块宿主装配成功；指定的 10 项测试全部通过，没有执行全套测试。
- 隔离快照 `npx vite build --outDir dist/work-assistants-verify` 通过，6415 个模块完成转换，耗时 9 分 33 秒；保留已有大 chunk 和 delivery-center 混合导入警告，未放宽阈值。
- 最终前端定向用例 15 项通过：草稿和迟到响应、重复请求、语音只回填、安全登记预览与重试、登录身份隔离、文件拖放和移动导航。前端测试与类型检查使用独立源码快照。
- 隔离快照 `npm run typecheck` 通过，菜单目录 60 项一致，Feature boundaries 无新增违规。新增架构图经 Mermaid 解析，文档任务链接有效，OpenSpec 严格校验通过。
- 宿主 `package` 默认绑定前端 `npm run build`。首次终止命令后仍遗留 Windows 子构建，曾重写同版 SDK 清单；发现后核验构建进程树并停止。SDK IIFE、ESM 与 loader 均与构建前基线哈希一致，已从旧 `frontend/dist` 恢复 stable 与 release 清单，未重启受管服务。最终使用 `-Dskip.frontend=true` 验证后端宿主装配，前端另外执行隔离 Vite 构建；后端装配制品不作为已嵌入新 UI 的部署包交付。
- 测试暴露的本地解析器继承属性问题已修正，特殊字段名也只按白名单处理；运行中任务的 SQLite 冲突不再依赖特定异常子类，显式返回冲突且取消后迟到成功不覆盖终态。
- 质量 CLI 返回 `status=PASSED`、exit 0；实际执行了 9 项既有 API 探测，`executedCheckers=[]`。这些探测针对当前旧服务，不证明新增助理 API 已运行。
- 目标版本尚未启动，真实 Claude/Codex 账号、语音服务、资源实际登记、浏览器视觉与真机拖放/窄屏验收、启动后 60 秒稳定观察均待执行。当前浏览器访问受工具策略限制，不绕过该限制；本次未重启或推送。
- 收尾只读状态检查确认 backend/frontend/wechat/studio 均 ready/online，受管 PID 与重启次数均未变化；这是原运行版本状态，不作为新功能运行验收。
- SQL context `d1bfcf63-836f-4388-9921-ef1cd1d92afc` 为 PARTIAL，**DDL 未核验**：共享基线缺少 `chat_work_assistant_session`、`chat_work_assistant_turn`、`ops_assistant_enrollment` 和 `ops_application_resource`；仅 `ops_datasource` 命中。前三张为本次应用启动自动创建的表，应用账号表以仓库现有 `ops-resource-schema.sql` 为依据；临时 SQLite 用例验证实际仓库 DDL，不据此声称共享基线或运行库已更新。不产出人工执行脚本，不登记待执行 SQL。
