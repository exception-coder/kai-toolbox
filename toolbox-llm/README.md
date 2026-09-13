# 公共 LLM 与一次性 Agent 能力

业务模块依赖 `toolbox-llm`，通过构造器注入 `AgentOneShotRunner` 即可执行一次性任务。宿主装配 `tool-claude-chat` 后，由已有 `AgentOneShotService` 提供该 Bean；业务模块不要直接依赖实现模块或管理 Sidecar 进程。

```xml
<dependency>
    <groupId>com.exceptioncoder</groupId>
    <artifactId>toolbox-llm</artifactId>
    <version>${project.version}</version>
</dependency>
```

## 调用

以下片段在已有业务服务中使用，`runner` 为构造器注入的 `AgentOneShotRunner`，`content` 为业务提供的文本，`sendDelta` 为已有增量输出方法：

```java
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;

String text = runner.runText("请提炼以下内容的要点：……");

var request = ExecutionRequest.textBuilder()
        .systemPrompt("只根据提供的内容生成摘要")
        .userPrompt(content)
        .engine("codex")
        .build();
String result = runner.runOnce(request);
String streamed = runner.stream(request, delta -> sendDelta(delta));
```

`runText(userPrompt)` 和 `streamText(userPrompt, onDelta)` 默认使用 Claude。builder 的 `model(...)` 可选，省略时使用引擎默认模型。`textBuilder` 固定 `toolPolicy=disabled`，仅根据提供的内容执行文本任务，不传工作目录或凭据覆盖；高级执行继续使用现有 `ExecutionRequest` 构造器。历史位置参数方法保持原有策略，不自动变成禁用工具。

## 支持与执行边界

| 能力 | 公共入口与含义 |
| --- | --- |
| 完整文本 | `runOnce` 等待执行完成后返回全文 |
| 流式文本 | `stream` 回调每个增量，并在结束后返回全文 |
| 执行证据 | `runObserved(request)` 返回文本、traceId、证据和执行标识；缺失字段可以为空 |
| 引擎声明 | `supportedEngines()` 当前 Bean 返回 `claude`、`codex`，不代表本机已安装或登录 |
| 持续聊天 | 使用现有会话服务及 Sidecar `AgentEngineAdapter`；不属于本接口 |
| 模型 API | 使用 `ChatModelRouter`；与这里的 Agent 运行时调用分别保留 |

OpenCode 的持续会话支持不代表一次性接口支持。一次性请求传入 OpenCode 或未知引擎会明确失败，不会自动切换为 Claude。账号登录、API Key 和额度由所选引擎的现有配置管理；公共 Bean 不新增认证系统。无需创建平台聊天记录，底层临时上下文在执行结束后清理；引擎自身的日志仍可能保留。

## 线程与错误

- 这些方法是阻塞调用；在业务已有的虚拟线程任务中执行，任务取消时中断该执行线程。不要在 WebSocket 事件线程或 SSE 推送线程中阻塞等待，也不要为每次调用创建独立线程池。
- 空请求、空白 userPrompt 和不支持的引擎在 Sidecar 启动前抛出 `IllegalArgumentException`。
- 运行时不可用、登录失效、额度不足、超时或执行失败向调用方抛出异常；不得把异常当作成功文本。
- `stream` 回调抛异常会取消当前任务。调用方应在自身任务状态或 SSE 中呈现失败，并提供重试入口。
- 超时沿用 `toolbox.claude-chat.agent-one-shot-timeout-ms`；本能力不增加自动重试或跨引擎降级。
- 模型输出是不可信内容；结构化数据应由业务代码解析和校验。带工具的高级请求不能无条件重试。

宿主未装配执行实现时，必需能力采用普通构造器注入以启动失败显式暴露缺失；可选功能可使用 `ObjectProvider<AgentOneShotRunner>`，在缺失时返回明确的能力不可用状态。
