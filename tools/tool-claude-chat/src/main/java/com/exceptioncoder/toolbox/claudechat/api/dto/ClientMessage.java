package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;
import java.util.Map;

/** 浏览器 → Java 的 WS 消息。契约见设计文档的 api-current.md §2.1。 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
        @JsonSubTypes.Type(value = ClientMessage.Open.class,          name = "open"),
        @JsonSubTypes.Type(value = ClientMessage.Attach.class,        name = "attach"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchSession.class, name = "switchSession"),
        @JsonSubTypes.Type(value = ClientMessage.ResumeHistory.class, name = "resumeHistory"),
        @JsonSubTypes.Type(value = ClientMessage.ResumeCurrent.class, name = "resumeCurrent"),
        @JsonSubTypes.Type(value = ClientMessage.Send.class,          name = "send"),
        @JsonSubTypes.Type(value = ClientMessage.Decision.class,      name = "decision"),
        @JsonSubTypes.Type(value = ClientMessage.Interrupt.class,     name = "interrupt"),
        @JsonSubTypes.Type(value = ClientMessage.SetMode.class,       name = "setMode"),
        @JsonSubTypes.Type(value = ClientMessage.SetModel.class,      name = "setModel"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchEngine.class,  name = "switchEngine"),
        @JsonSubTypes.Type(value = ClientMessage.SwitchProvider.class, name = "switchProvider"),
        @JsonSubTypes.Type(value = ClientMessage.ForkSession.class,   name = "forkSession"),
})
public sealed interface ClientMessage
        permits ClientMessage.Open, ClientMessage.Attach, ClientMessage.SwitchSession,
                ClientMessage.ResumeHistory, ClientMessage.ResumeCurrent, ClientMessage.Send, ClientMessage.Decision,
                ClientMessage.Interrupt, ClientMessage.SetMode, ClientMessage.SetModel,
                ClientMessage.SwitchEngine, ClientMessage.SwitchProvider, ClientMessage.ForkSession {

    /**
     * 新建会话。mode 为初始权限模式，可空（缺省 default）；engine 引擎 claude/codex，可空（缺省 claude）。
     * apiBaseUrl/authToken 为可选第三方 Anthropic 兼容网关（如 4sapi）：仅本会话生效，空=走官方登录。
     */
    record Open(String cwd, String model, String mode, String engine, String apiBaseUrl, String authToken) implements ClientMessage {}

    /** 重连进行中的会话，请求回放 seq > lastEventSeq 的事件 */
    record Attach(String sessionId, long lastEventSeq) implements ClientMessage {}

    /** 切到工具内会话（触发 sidecar resume） */
    record SwitchSession(String sessionId) implements ClientMessage {}

    /** 续跑磁盘上的某历史会话：为该 sdkSessionId 建元数据行后 resume */
    record ResumeHistory(String sdkSessionId, String cwd) implements ClientMessage {}

    record ResumeCurrent(String sessionId) implements ClientMessage {}

    /** 下发一条用户消息。attachments 可空（旧客户端不带时按纯文本处理）。 */
    record Send(String text, List<Attachment> attachments) implements ClientMessage {
        /** 附件引用：name 展示用，path 为服务端绝对路径，供 Claude 用 Read 读取。 */
        public record Attachment(String name, String path) {}
    }

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

    /** 切换会话模型（ModelInfo.value）。下一轮生效。 */
    record SetModel(String model) implements ClientMessage {}

    /**
     * 会话内切 agent（引擎）：claude / codex / gemini。同一会话 id 不变；
     * sidecar 置新引擎并清 sdkSessionId（新引擎起新 SDK 会话）。
     * 历史开场由前端切换后另发一条 send 带过去（复用发送链路、UI 自然显示）。
     */
    record SwitchEngine(String engine) implements ClientMessage {}

    /**
     * 会话内切服务商（官方 ↔ 第三方 Anthropic 兼容网关，或两网关互切）：同一会话 id 与 sdkSessionId 不变，
     * 沿用原生会话续跑（保留上下文）。apiBaseUrl 空＝切回官方登录；非空＝该网关，authToken 为其 key。
     * 仅 claude/codex/gemini 引擎可用网关；下一轮 query 生效。
     */
    record SwitchProvider(String apiBaseUrl, String authToken) implements ClientMessage {}

    /** 从当前会话的某条用户消息分叉出新会话。upToMessageId 为该消息的 SDK transcript uuid。 */
    record ForkSession(String upToMessageId) implements ClientMessage {}

    /** AskUserQuestion 的单个问题结构（供前端渲染，回灌走 Decision.answers） */
    record Question(String question, String header, List<Option> options, boolean multiSelect) {
        public record Option(String label, String description) {}
    }
}
