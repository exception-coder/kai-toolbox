## ADDED Requirements

### Requirement: 本地测试可作为开发运行验证
系统 SHALL 支持项目配置 maven-test 场景，在本项目指定模块执行本地 Maven 测试，并返回实际运行证据。

#### Scenario: 本地回归成功
- **WHEN** Maven 退出成功且本轮新生成的 Surefire 报告存在实际执行、没有失败或错误
- **THEN** 运行门禁返回 PASSED 和执行数量
- **AND** 不宣称生产环境或目标数据库已验收

#### Scenario: 测试未成功执行
- **WHEN** 命令失败、超时、零测试、全部跳过或只有旧报告
- **THEN** 门禁返回 FAILED 及具体原因

#### Scenario: 工作区隔离
- **WHEN** 配置指定仓库外模块或试图覆盖入口项目根
- **THEN** 拒绝越界模块并始终以入口项目为执行根

#### Scenario: 开发验证不依赖生产
- **WHEN** 项目配置本地 H2 和应用单元回归
- **THEN** 门禁执行这些测试，不要求生产连接、生产部署或启动 Docker
