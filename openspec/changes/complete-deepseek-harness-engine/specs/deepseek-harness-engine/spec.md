## ADDED Requirements

### Requirement: 本地 Harness 会话闭环
系统 SHALL 复用既有 DeepSeek 引擎 Adapter、消息流及权限流程，使用锁定版本官方 SDK 运行本地 Harness；不得泄露 Key、跨项目复用会话或将失败标记为完成。

#### Scenario: 本机已登记凭据
- **WHEN** 用户选择已握手就绪的 DeepSeek Harness 引擎
- **THEN** 系统只向该引擎子进程传递适用凭据，在当前工作目录创建或恢复对应会话
- **AND** 不改写原有用户 Harness Web 配置

#### Scenario: 停止后继续原会话
- **WHEN** 用户停止一个正在执行的 Harness 轮次后再次发送消息
- **THEN** 系统回收原子进程，恢复同一原生会话与工作目录
- **AND** 不自动重发先前输入，恢复失败时不创建替代会话

#### Scenario: 工具审批与异常
- **WHEN** Harness 请求工具批准或用户回答
- **THEN** 系统使用既有 Forge 权限与问题交互处理
- **AND** 未知请求、缺失处理器、取消、超时和执行失败不能被视为授权或成功
