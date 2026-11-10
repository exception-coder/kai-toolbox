# 必要设计

## 实现与边界

使用官方项目级 schema 扩展点，保留 proposal/specs/tasks 身份和 tasks.md 勾选协议；删除强制 design artifact 与其依赖，按需设计模板由 tasks/apply 指令引用。配置只附加规则，模板控制大纲。历史无元数据的活动 Change 固定 spec-driven，不覆盖既有 metadata、正文与任务。新版本仍通过官方 status/instructions/validate 供 Forge 消费，不修改运行调度或增加平行任务库。

适用 AI-01、EVID-01、CTRL-01、IDEM-01：主对象是项目与 Change 路径，复用原工具和身份；无导航、弹框、键盘和手机交互变化，无新增交互恢复例外。失败保留原材料并可修改模板重试，不自动派发、归档或重启。

## 风险与验证

CLI 升级会加强旧增量完整性检查，须保留原有 Scenario，按当前策略更新预期。用真实 CLI 验证简版无设计可就绪、skip_specs、必需文档缺失会阻断、已有设计指引与旧 schema 固定；在隔离临时目录验证归档与同步。按项目入口执行质量门禁，不为配置修改跑全仓构建或新建单元测试。CLI 与配置生效不代表真实模型遵循质量或服务已加载新版。
