package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;

import java.util.List;
import java.util.Map;

/**
 * Java → 浏览器的 WS 消息。契约见 api-current.md §2.2。
 * 每条都带单调递增 {@code seq}，断连重连按 seq 回放，保证无丢无重。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", include = JsonTypeInfo.As.PROPERTY)
public sealed interface ServerMessage
        permits ServerMessage.Ready, ServerMessage.AssistantDelta, ServerMessage.ToolUse,
                ServerMessage.ToolResult, ServerMessage.PermissionRequest,
                ServerMessage.QuestionRequest, ServerMessage.DecisionResolved,
                ServerMessage.Models, ServerMessage.UserMessage, ServerMessage.Forked,
                ServerMessage.ReplayGap, ServerMessage.Result, ServerMessage.TurnInfo,
                ServerMessage.TurnProgress, ServerMessage.Error, ServerMessage.BackgroundTasks {

    long seq();

    /** 会话就绪。{@code epoch} 标识当前内存会话实例：后端重启/会话重建会换新值，
     *  前端据此判定服务端 seq 计数器已复位，重置自己的去重高水位，避免把重启后低 seq 消息全丢弃。
     *  {@code backgroundTasks} 是切会话/重连那一刻的后台任务快照（见 BackgroundTasks 说明），
     *  让前端"切换会话时"就能查到当时是否还有后台任务在跑，不用等下一次变化事件推送。 */
    @JsonTypeName("ready")
    record Ready(long seq, String sessionId, String sdkSessionId, List<String> slashCommands, String status, String epoch, String engine, String providerKind, String providerBaseUrl,
                 List<String> skills, List<String> agents, List<McpServer> mcpServers, String outputStyle,
                 List<BackgroundTaskInfo> backgroundTasks) implements ServerMessage {}

    /** 会话激活的 MCP 服务（来自 SDK init）。 */
    record McpServer(String name, String status) {}

    @JsonTypeName("assistantDelta")
    record AssistantDelta(long seq, String text) implements ServerMessage {}

    @JsonTypeName("toolUse")
    record ToolUse(long seq, String toolName, Object input) implements ServerMessage {}

    @JsonTypeName("toolResult")
    record ToolResult(long seq, String toolName, String output, boolean isError) implements ServerMessage {}

    @JsonTypeName("permissionRequest")
    record PermissionRequest(long seq, String reqId, String toolName, Object input) implements ServerMessage {}

    @JsonTypeName("questionRequest")
    record QuestionRequest(long seq, String reqId, List<ClientMessage.Question> questions) implements ServerMessage {}

    /** 某权限/提问请求已被某端处理，通知其它端关闭同一弹窗（多端同看）。 */
    @JsonTypeName("decisionResolved")
    record DecisionResolved(long seq, String reqId) implements ServerMessage {}

    /** 会话可用模型清单（来自 SDK supportedModels）+ 当前模型。 */
    @JsonTypeName("models")
    record Models(long seq, List<ModelInfo> models, String current) implements ServerMessage {}

    /** 关联刚发出的用户消息与其 SDK transcript uuid，供前端「从此处分叉」定位。 */
    @JsonTypeName("userMessage")
    record UserMessage(long seq, String uuid) implements ServerMessage {}

    /** 分叉完成：sessionId 为新建的工具内会话 id，前端 switchTo 续跑。 */
    @JsonTypeName("forked")
    record Forked(long seq, String sessionId) implements ServerMessage {}

    /**
     * 重连回放出现空洞：客户端上次收到的 seq 早于缓冲窗口最旧 seq，中间事件已被环形缓冲淘汰。
     * 非致命，仅提示前端「本端显示可能不全，建议下拉刷新/重进会话读 transcript」。seq 固定 0（连接级提示，不入缓冲）。
     */
    @JsonTypeName("replayGap")
    record ReplayGap(long seq, long missingFrom, long missingTo) implements ServerMessage {}

    @JsonTypeName("result")
    record Result(long seq, Map<String, Object> usage, String stopReason) implements ServerMessage {}

    /**
     * 本轮调用诊断：{@code requestedModel}=前端选的/发出去的模型；{@code responseModel}=API 响应里
     * 实际返回的模型（来自 assistant message 的 model 字段，权威，非模型自述）；{@code viaGateway}/{@code baseUrl}
     * =是否经第三方网关及其地址。供前端「调用诊断」区块展示，便于排查是否真走了三方 / 被网关回退。
     */
    @JsonTypeName("turnInfo")
    record TurnInfo(long seq, String requestedModel, String responseModel, boolean viaGateway, String baseUrl) implements ServerMessage {}

    /** 本轮进行中的实时输出 token 数（来自 SDK 流式 message_delta 的累计 output_tokens），供「进行时」指示器展示。 */
    @JsonTypeName("turnProgress")
    record TurnProgress(long seq, long outputTokens) implements ServerMessage {}

    @JsonTypeName("error")
    record Error(long seq, String code, String message) implements ServerMessage {}

    /**
     * 该会话当前存活的后台任务快照（Agent 工具后台化的子任务，如「先在后台调查，稍后告诉你」这类）。
     * sidecar 收到 SDK 的 system/background_tasks_changed 事件（REPLACE 语义：每次都是全量存活任务）
     * 就整体转发一份，收到即覆盖，空数组＝当前没有后台任务在跑。
     * <p>
     * 存在的意义：主回合的 {@link Result} 事件只代表"这一轮可见回复结束了"，不代表会话触发的所有
     * 后台工作都结束——用户可能看到回复说"我先在后台查，稍后告诉你"，但可见回合已经显示完成，
     * 不看这个字段就无法区分"真的没事干了"和"后台还在查、还没回来"。
     * <p>
     * 局限：这份状态只在 sidecar 进程与 SDK 的连接存活期间准确；sidecar 重启/宿主进程被杀后，
     * 之前挂着的后台任务是死是活无法判断（SDK 本身不提供跨进程重启的任务状态查询能力）。
     */
    @JsonTypeName("backgroundTasks")
    record BackgroundTasks(long seq, List<BackgroundTaskInfo> tasks) implements ServerMessage {}

    record BackgroundTaskInfo(String taskId, String taskType, String description) {}
}
