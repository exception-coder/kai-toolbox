package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;

/** 公共 Session Client 事件；所有字段均可直接暴露给业务参与者。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SessionClientEvent(
        String protocolVersion,
        String type,
        String eventId,
        long seq,
        long sessionVersion,
        Instant occurredAt,
        Object data,
        PublicError error) {

    /** 创建普通公共事件。 */
    public static SessionClientEvent data(String protocolVersion, String type, long seq,
                                          long sessionVersion, Object data) {
        return new SessionClientEvent(protocolVersion, type, eventId(seq), seq, sessionVersion,
                Instant.now(), data, null);
    }

    /** 创建稳定错误事件。 */
    public static SessionClientEvent error(String protocolVersion, long seq, long sessionVersion,
                                           SessionClientErrorCode code, String message) {
        return new SessionClientEvent(protocolVersion, "error", eventId(seq), seq, sessionVersion,
                Instant.now(), null, new PublicError(code.name(), message, code.retryable()));
    }

    private static String eventId(long seq) {
        return seq <= 0 ? null : "evt-" + seq;
    }

    public record PublicError(String code, String message, boolean retryable) {
    }

    public record Ready(String sessionId, String status, List<String> commands) {
    }

    public record Message(String role, String text, String messageId, List<Attachment> attachments) {
        public record Attachment(String id, String name, String mime) {
        }
    }

    public record CommandAccepted(String commandId, String command, int queueSize) {
    }

    public record Progress(String phase, String status, Long outputTokens,
                           String currentTaskId, Integer completedTasks, Integer totalTasks) {
    }

    public record BusinessQuestion(String requestId, List<ClientMessage.Question> questions) {
    }

    public record Completed(String stopReason) {
    }

    public record ReplayGap(long missingFrom, long missingTo) {
    }
}
