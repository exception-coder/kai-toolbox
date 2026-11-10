## Context

本次为 M 档公共接口增量。基线 HEAD 为 30602227；工作区已有其他前端和文档改动，仅提交本次范围。当前 AgentOneShotRunner 位于 toolbox-llm/spi，AgentOneShotService 是 tool-claude-chat 中已有 Spring Bean；Sidecar sessionManager.oneShot 负责执行上下文回收。持续会话的 AgentEngineAdapter 不作为一次性引擎支持清单。

## Goals / Non-Goals

提供可直接注入的公共一次性能力，支持简洁文本、命名参数和流式结果；旧调用兼容。非目标见 proposal：不新增传输入口或框架、不迁移全部业务、不扩大引擎支持范围。

## Decisions

### 公共边界

继续使用 AgentOneShotRunner Bean；增加 runText(userPrompt)、streamText(userPrompt, onDelta)，通过 ExecutionRequest.textBuilder 构建纯文本请求。独立 AgentTextRequestBuilder 提供命名参数，不依赖注解处理生成公共方法。builder 仅开放 systemPrompt/userPrompt/model/engine，固定 disabled 工具策略；高级 cwd、凭据等配置保留现有 ExecutionRequest 构造路径。

不另建平行 facade 或第二个 Bean。调用依赖方向为业务模块 → toolbox-llm SPI ← tool-claude-chat 实现 → Sidecar。认证交由现有引擎运行环境，不能把订阅认证等同 API Key。官方研究已在前序会话核对：Codex SDK/App Server、Claude 登录和 OpenCode SDK 均为各自集成入口；本次不新增外部 SDK 用法。

### 校验与结果

实现公开不可变 supportedEngines，默认 SPI 实现返回空集合表示未声明。实际 Bean 只声明 claude/codex；未知引擎或空提示词在启动 Sidecar 前拒绝。默认引擎 Claude；model 为空沿用底层默认。纯文本入口不创建平台持久聊天记录，返回完整文本；流式返回并继续使用既有取消、超时、观测逻辑。原构造器及高级请求保持兼容。

### 文档与验证

toolbox-llm/README.md 为公共能力接入正文，docs/INDEX.md 只加链接。说明阻塞调用应在既有虚拟线程任务中执行、回调失败取消、结果不可信与不可无条件重试。

测试覆盖 Spring 按 SPI 装配、默认禁用工具、两种真实声明引擎的分发与结果聚合、流式回调、空输入/未知引擎快速失败、底层错误和既有取消路径。构建覆盖受影响模块与宿主装配，执行 Forge all；目标后端启动后核对进程、HTTP、日志并观察至少 60 秒。

## Risks / Trade-offs

- 引擎安装、登录与额度影响真实推理 → 支持清单仅声明实现支持，不声称当前账号可用；环境问题独立报告。
- 旧位置参数默认工具策略保持原行为 → 推荐公共文本入口明确 disabled，不顺带改变所有存量任务权限。
- 自动重试可能重复工具副作用 → 此层不增加自动重试或跨引擎降级。

## Migration Plan

增量发布，无数据库迁移。现有调用不必迁移。回滚本次接口增量与文档，重新构建宿主；恢复版本不视为本次交付成功。

## Open Questions

无。
