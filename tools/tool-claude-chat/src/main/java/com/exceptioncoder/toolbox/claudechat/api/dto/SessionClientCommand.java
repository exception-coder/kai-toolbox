package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.List;
import java.util.Map;

/** 业务参与者可提交的独立、默认拒绝公共 WebSocket 协议。 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = SessionClientCommand.Attach.class, name = "attach"),
        @JsonSubTypes.Type(value = SessionClientCommand.Send.class, name = "send"),
        @JsonSubTypes.Type(value = SessionClientCommand.AnswerQuestion.class, name = "answerQuestion"),
        @JsonSubTypes.Type(value = SessionClientCommand.InterruptOwnTurn.class, name = "interruptOwnTurn"),
        @JsonSubTypes.Type(value = SessionClientCommand.Acknowledge.class, name = "acknowledge")
})
public sealed interface SessionClientCommand permits SessionClientCommand.Attach, SessionClientCommand.Send,
        SessionClientCommand.AnswerQuestion, SessionClientCommand.InterruptOwnTurn,
        SessionClientCommand.Acknowledge {

    /** 绑定票据中固定的会话并从指定水位恢复。 */
    record Attach(String protocolVersion, long lastEventSeq) implements SessionClientCommand {
    }

    /** 提交一条受配额和乐观版本约束的业务消息。 */
    record Send(String commandId, long expectedSessionVersion, String text,
                List<Attachment> attachments) implements SessionClientCommand {
        public record Attachment(String id, String name, String mime) {
        }
    }

    /** 只回答 AskUserQuestion，不能用于批准工具调用。 */
    record AnswerQuestion(String commandId, long expectedSessionVersion, String requestId,
                          Map<String, Object> answers) implements SessionClientCommand {
    }

    /** 只中断当前授权参与者发起的回合。 */
    record InterruptOwnTurn(String commandId, long expectedSessionVersion) implements SessionClientCommand {
    }

    /** 确认本端已经处理到指定公共事件序号。 */
    record Acknowledge(String commandId, long expectedSessionVersion, long eventSeq)
            implements SessionClientCommand {
    }
}
