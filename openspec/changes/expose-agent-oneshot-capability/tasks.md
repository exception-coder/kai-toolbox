## 1. 公共入口

- [x] 1.1 按 design 公共边界扩展 AgentOneShotRunner，保留现有调用兼容；覆盖默认文本、显式引擎和流式场景。
- [x] 1.2 按 design 校验与结果完善 AgentOneShotService 的支持声明和快速失败；覆盖空输入、未知引擎与底层失败场景。

## 2. 验证与交付

- [x] 2.1 补充公共 Bean 装配与执行回归，执行受影响模块测试和宿主构建。
- [x] 2.2 发布 toolbox-llm 接入文档并维护索引，严格验证 OpenSpec。
- [x] 2.3 完成 Forge all、目标版本启动与至少 60 秒稳定验收，核对任务范围后提交。

## 验证证据

- Java 21 宿主构建：`mvn -pl toolbox-starter -am package -Dskip.frontend=true -Dtest=AgentOneShot*Test -Dsurefire.failIfNoSpecifiedTests=false -q` exit 0；公共专项 8 项通过。无前端源码改动，使用项目已有后端构建选项；旧单参数 runOnce 的重载歧义通过 runText/streamText 命名消除，宿主下游测试编译通过。
- 完整相关模块回归：`mvn -pl toolbox-llm,tools/tool-claude-chat -am test -q` exit 0；toolbox-common 21、toolbox-llm 7、tool-claude-chat 393，合计 420 通过、1 跳过、0 失败。原始报告在各模块 target/surefire-reports。
- Forge CLI `verify -Project . -Format json` exit 0，status/staticStatus/runtimeStatus 均 PASSED；executedCheckers 为空，不能声称运行了静态规则；API-RUNTIME-001 执行 9 个现有 18080 场景通过。编译与专项测试单独提供静态和公共 Bean 行为证据。
- 隔离宿主在 18092 启动，PID 87544，启动日志无致命异常；13 次取样覆盖至少 60 秒，/api/tools 与 /api/claude-chat/sessions/activity 均 200，进程未变化或退出，无自动重启，oneShotCount 为 0；结束后清理自有进程。复用项目 startup measurement 运行器的隔离数据与可选集成配置，未重启日常实例。
- 目标 JAR SHA-256：fb58e6356d6f5279ba44132f4d6296ffe0948e961c3812f2199e917ff8eb3f81；公共 SPI、builder、实现的内嵌字节码与本次 target/classes 一致。隔离原始证据：outputs/agent-oneshot-capability/fe4f9933-0a64-4b93-bb8a-aa1c14dca0ac/{report.json,runtime.json,stability.json,application.log}，属于本地验证产物，不提交。
- 本次未进行真实账号模型推理；引擎登录和额度可用性未验证。日常实例的 wechat 辅助服务开始前已不就绪，属于本次范围外；本次未修改其配置或重启它。
- OpenSpec 严格校验通过；主规格未自动归档，保留活动 change 与完整验收记录。Agent 自审确认公开入口、工具策略、失败边界与上述场景一致。
