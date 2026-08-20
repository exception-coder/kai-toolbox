package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;
import java.util.Map;

/** 浏览器 → Java 的 WS 消息。契约见设计文档的 api-current.md §2.1。 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = ClientMessage.Open.class,          name = "open"),
        @JsonSubTypes.Type(value = ClientMessage.Attach.class,        name = "attach"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchSession.class, name = "switchSession"),
        @JsonSubTypes.Type(value = ClientMessage.DuplicateSession.class, name = "duplicateSession"),
        @JsonSubTypes.Type(value = ClientMessage.ResumeHistory.class, name = "resumeHistory"),
        @JsonSubTypes.Type(value = ClientMessage.ResumeCurrent.class, name = "resumeCurrent"),
        @JsonSubTypes.Type(value = ClientMessage.Send.class,          name = "send"),
        @JsonSubTypes.Type(value = ClientMessage.Queue.class,         name = "queue"),
        @JsonSubTypes.Type(value = ClientMessage.AssistantIntentRoute.class, name = "assistantIntentRoute"),
        @JsonSubTypes.Type(value = ClientMessage.AssistantContextSave.class, name = "assistantContextSave"),
        @JsonSubTypes.Type(value = ClientMessage.AssistantDraftCreate.class, name = "assistantDraftCreate"),
        @JsonSubTypes.Type(value = ClientMessage.AssistantDraftConfirm.class, name = "assistantDraftConfirm"),
        @JsonSubTypes.Type(value = ClientMessage.AssistantUsersList.class, name = "assistantUsersList"),
        @JsonSubTypes.Type(value = ClientMessage.Decision.class,      name = "decision"),
        @JsonSubTypes.Type(value = ClientMessage.Interrupt.class,     name = "interrupt"),
        @JsonSubTypes.Type(value = ClientMessage.SetMode.class,       name = "setMode"),
        @JsonSubTypes.Type(value = ClientMessage.SetAutoApprove.class, name = "setAutoApprove"),
        @JsonSubTypes.Type(value = ClientMessage.SetModel.class,      name = "setModel"),
        @JsonSubTypes.Type(value = ClientMessage.RefreshModels.class, name = "refreshModels"),
        @JsonSubTypes.Type(value = ClientMessage.RefreshCapabilities.class, name = "refreshCapabilities"),
        @JsonSubTypes.Type(value = ClientMessage.SetCodexOptions.class, name = "setCodexOptions"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchEngine.class,  name = "switchEngine"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchProvider.class, name = "switchProvider"),
        @JsonSubTypes.Type(value = ClientMessage.ForkSession.class,   name = "forkSession"),
})
public sealed interface ClientMessage
        permits ClientMessage.Open, ClientMessage.Attach, ClientMessage.SwitchSession, ClientMessage.DuplicateSession,
                ClientMessage.ResumeHistory, ClientMessage.ResumeCurrent, ClientMessage.Send, ClientMessage.Decision,
                ClientMessage.Queue,
                ClientMessage.AssistantIntentRoute, ClientMessage.AssistantContextSave,
                ClientMessage.AssistantDraftCreate, ClientMessage.AssistantDraftConfirm,
                ClientMessage.AssistantUsersList,
                ClientMessage.Interrupt, ClientMessage.SetMode, ClientMessage.SetAutoApprove,
                ClientMessage.SetModel, ClientMessage.RefreshModels, ClientMessage.RefreshCapabilities,
                ClientMessage.SetCodexOptions,
                ClientMessage.SwitchEngine, ClientMessage.SwitchProvider, ClientMessage.ForkSession {

    /**
     * 新建会话。mode 为初始权限模式，可空（缺省 default）；engine 引擎 claude/codex，可空（缺省 claude）。
     * apiBaseUrl/authToken 为可选第三方 Anthropic 兼容网关（如 4sapi）：仅本会话生效，空=走官方登录。
     */
    record Open(String cwd, String model, String mode, String engine, String apiBaseUrl, String authToken,
                String codexHome, String codexReasoningEffort, String codexSpeed,
                List<String> consultEvidenceSystems) implements ClientMessage {}

    /** 重连进行中的会话，请求回放 seq > lastEventSeq 的事件 */
    record Attach(String sessionId, long lastEventSeq) implements ClientMessage {}

    /** 切到工具内会话（触发 sidecar resume） */
    record SwitchSession(String sessionId) implements ClientMessage {}

    /** 复制会话配置并创建一个不带历史消息的新会话。 */
    record DuplicateSession(String sourceSessionId, String codexHome) implements ClientMessage {}

    /** 续跑磁盘上的某历史会话：为该 sdkSessionId 建元数据行后 resume */
    record ResumeHistory(String sdkSessionId, String cwd) implements ClientMessage {}

    record ResumeCurrent(String sessionId) implements ClientMessage {}

    /** 下发一条用户消息。attachments 可空（旧客户端不带时按纯文本处理）。 */
    record Send(String text, List<Attachment> attachments, String developerInstructions,
                AssistantEnvelope assistant, String messageId) implements ClientMessage {
        /** 附件引用：name 展示用，path 为服务端绝对路径，供 Claude 用 Read 读取。 */
        public record Attachment(String name, String path) {}
    }

    /** 当前回合不可写时，将消息幂等保存到服务端待发送队列。 */
    record Queue(String id, String text, String displayText, String developerInstructions,
                 List<Attachment> attachments, Long createdAt) implements ClientMessage {
        /** 待发送附件引用。 */
        public record Attachment(String name, String path, String mime) {}
    }

    /**
     * 嵌入式助手的版本化请求元数据。未知上下文字段保留在 Map 中，旧客户端不传时为 null。
     */
    record AssistantEnvelope(String protocolVersion, String mode, Map<String, Object> contextSnapshot) {}

    /** 嵌入式助手意图识别命令；requestId 用于关联连接级响应。 */
    record AssistantIntentRoute(String requestId, String mode, String text) implements ClientMessage {}

    /** 保存当前会话的一份不可变、已脱敏上下文快照。 */
    record AssistantContextSave(String requestId, String sessionId, String protocolVersion,
                                Map<String, Object> contextSnapshot) implements ClientMessage {}

    /** 创建 Bug 或建议草稿，不直接登记正式需求。 */
    record AssistantDraftCreate(String requestId, String sessionId, String kind, String title,
                                String description, Map<String, Object> contextSnapshot,
                                Map<String, Object> evidence) implements ClientMessage {}

    /** 用户确认后以幂等键登记草稿。 */
    record AssistantDraftConfirm(String requestId, String draftId, String idempotencyKey,
                                 Long engineerUserId) implements ClientMessage {}

    /** 查询当前来源系统可选择的启用用户。 */
    record AssistantUsersList(String requestId) implements ClientMessage {}

    /**
     * 回灌权限 / 提问决策。
     * behavior: "allow" | "deny"；
     * updatedInput: allow 时可改写的工具参数（权限场景）；
     * answers: AskUserQuestion 的回答，键为 question 文本，值为 String 或 List<String>。
     */
    record Decision(String reqId, String behavior,
                    Map<String, Object> updatedInput,
                    Map<String, Object> answers) implements ClientMessage {}

    /** 中断当前轮 */
    record Interrupt() implements ClientMessage {}

    /** 切换会话权限模式：default / acceptEdits / plan / bypassPermissions。下一轮生效。 */
    record SetMode(String mode) implements ClientMessage {}

    /**
     * 切换「弹窗自动允许」兜底开关。服务端持有并随每次 resume 回灌 sidecar，
     * 由 sidecar 内同步裁决——不再依赖浏览器页面活着才能自动点「允许」。
     */
    record SetAutoApprove(boolean autoApprove) implements ClientMessage {}

    /** 切换会话模型（ModelInfo.value）。下一轮生效。 */
    record SetModel(String model) implements ClientMessage {}

    /** 主动同步 Claude 模型清单：让 sidecar 重新询问 claude 二进制并回发最新 models（Claude Code 自更新后用）。 */
    record RefreshModels() implements ClientMessage {}

    /** 主动重发当前会话能力清单：Codex 重新计算运行时 MCP，Claude 返回最近一次 SDK init 快照。 */
    record RefreshCapabilities() implements ClientMessage {}

    record SetCodexOptions(String reasoningEffort, String speed) implements ClientMessage {}

    /**
     * 会话内切 agent（引擎）：claude / codex / antigravity / opencode。同一会话 id 不变；
     * sidecar 置新引擎并清 sdkSessionId（新引擎起新 SDK 会话）。
     * 历史开场由前端切换后另发一条 send 带过去（复用发送链路、UI 自然显示）。
     */
    record SwitchEngine(String engine) implements ClientMessage {}

    /**
     * 会话内切服务商（官方 ↔ 第三方 Anthropic 兼容网关，或两网关互切）：同一会话 id 与 sdkSessionId 不变，
     * 沿用原生会话续跑（保留上下文）。apiBaseUrl 空＝切回官方登录；非空＝该网关，authToken 为其 key。
     * 仅 claude/codex 引擎可用网关；下一轮 query 生效。
     */
    record SwitchProvider(String apiBaseUrl, String authToken) implements ClientMessage {}

    /**
     * 保留到指定回答为止并分叉原生会话。upToMessageId：
     * Claude 为 SDK transcript UUID，Codex 为 App Server turn ID。
     */
    record ForkSession(String upToMessageId) implements ClientMessage {}

    /** AskUserQuestion 的单个问题结构（供前端渲染，回灌走 Decision.answers） */
    record Question(String question, String header, List<Option> options, boolean multiSelect) {
        public record Option(String label, String description) {}
    }
}
