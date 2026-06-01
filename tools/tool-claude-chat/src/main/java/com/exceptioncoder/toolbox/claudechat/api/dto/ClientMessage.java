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
        @JsonSubTypes.Type(value = ClientMessage.Send.class,          name = "send"),
        @JsonSubTypes.Type(value = ClientMessage.Decision.class,      name = "decision"),
        @JsonSubTypes.Type(value = ClientMessage.Interrupt.class,     name = "interrupt"),
        @JsonSubTypes.Type(value = ClientMessage.SetMode.class,       name = "setMode"),
})
public sealed interface ClientMessage
        permits ClientMessage.Open, ClientMessage.Attach, ClientMessage.SwitchSession,
                ClientMessage.ResumeHistory, ClientMessage.Send, ClientMessage.Decision,
                ClientMessage.Interrupt, ClientMessage.SetMode {

    /** 新建会话。mode 为初始权限模式，可空（缺省按 default）。 */
    record Open(String cwd, String model, String mode) implements ClientMessage {}

    /** 重连进行中的会话，请求回放 seq > lastEventSeq 的事件 */
    record Attach(String sessionId, long lastEventSeq) implements ClientMessage {}

    /** 切到工具内会话（触发 sidecar resume） */
    record SwitchSession(String sessionId) implements ClientMessage {}

    /** 续跑磁盘上的某历史会话：为该 sdkSessionId 建元数据行后 resume */
    record ResumeHistory(String sdkSessionId, String cwd) implements ClientMessage {}

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

    /** AskUserQuestion 的单个问题结构（供前端渲染，回灌走 Decision.answers） */
    record Question(String question, String header, List<Option> options, boolean multiSelect) {
        public record Option(String label, String description) {}
    }
}
