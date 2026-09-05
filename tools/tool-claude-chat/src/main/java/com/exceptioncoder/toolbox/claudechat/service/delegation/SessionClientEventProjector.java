package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientProtocol;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;

/** 将管理端内部事件显式投影为无路径、无凭据、无工具细节的公共事件。 */
@Component
public class SessionClientEventProjector {

    private final ObjectMapper mapper;

    public SessionClientEventProjector(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 未列出的内部事件默认丢弃。 */
    public SessionClientEvent project(ServerMessage message, long sessionVersion) {
        return switch (message) {
            case ServerMessage.Ready ready -> event("ready", ready.seq(), sessionVersion,
                    new SessionClientEvent.Ready(ready.sessionId(), ready.status(),
                            List.of("attach", "send", "answerQuestion", "interruptOwnTurn", "acknowledge")));
            case ServerMessage.AssistantDelta delta -> event("message", delta.seq(), sessionVersion,
                    new SessionClientEvent.Message("assistant", delta.text(), null, List.of()));
            case ServerMessage.QueueDispatched dispatched -> event("message", dispatched.seq(), sessionVersion,
                    new SessionClientEvent.Message("user", dispatched.displayText() == null
                            ? dispatched.text() : dispatched.displayText(), dispatched.messageId(),
                            dispatched.attachments() == null ? List.of() : dispatched.attachments().stream()
                                    .map(item -> new SessionClientEvent.Message.Attachment(
                                            item.id(), item.name(), item.mime()))
                                    .toList()));
            case ServerMessage.SendAccepted accepted -> event("commandAccepted", accepted.seq(), sessionVersion,
                    new SessionClientEvent.CommandAccepted(accepted.messageId(), "send", 0));
            case ServerMessage.QueueAccepted accepted -> event("commandAccepted", accepted.seq(), sessionVersion,
                    new SessionClientEvent.CommandAccepted(accepted.messageId(), "send", accepted.queueSize()));
            case ServerMessage.QuestionRequest question -> event("businessQuestion", question.seq(), sessionVersion,
                    new SessionClientEvent.BusinessQuestion(question.reqId(), question.questions()));
            case ServerMessage.TurnProgress progress -> event("progress", progress.seq(), sessionVersion,
                    new SessionClientEvent.Progress("RUNNING", "RUNNING", progress.outputTokens(),
                            null, null, null));
            case ServerMessage.TurnActivity progress -> event("progress", progress.seq(), sessionVersion,
                    new SessionClientEvent.Progress(progress.phase(), progress.status(), null,
                            null, null, null));
            case ServerMessage.AutopilotState autopilot -> projectAutopilot(autopilot, sessionVersion);
            case ServerMessage.Result result -> event("completed", result.seq(), sessionVersion,
                    new SessionClientEvent.Completed(result.stopReason()));
            case ServerMessage.ReplayGap gap -> event("replayGap", gap.seq(), sessionVersion,
                    new SessionClientEvent.ReplayGap(gap.missingFrom(), gap.missingTo()));
            case ServerMessage.Error error -> publicError(error, sessionVersion);
            default -> null;
        };
    }

    private SessionClientEvent projectAutopilot(ServerMessage.AutopilotState event, long sessionVersion) {
        JsonNode state = mapper.valueToTree(event.state());
        JsonNode progress = state.path("progress");
        return event("progress", event.seq(), sessionVersion, new SessionClientEvent.Progress(
                text(state, "phase"), text(state, "state"), null, text(state, "currentTaskId"),
                number(progress, "completedTasks"), number(progress, "totalTasks")));
    }

    private SessionClientEvent publicError(ServerMessage.Error error, long sessionVersion) {
        SessionClientErrorCode code = switch (error.code()) {
            case "TURN_BUSY", "SESSION_STATE_UNCONFIRMED", "SYSTEM_UPDATING" -> SessionClientErrorCode.HOST_OFFLINE;
            case "INVALID_QUEUE_MESSAGE", "MESSAGE_REJECTED", "BAD_MESSAGE" -> SessionClientErrorCode.INVALID_INPUT;
            default -> SessionClientErrorCode.SERVER_ERROR;
        };
        String message = code == SessionClientErrorCode.SERVER_ERROR
                ? "会话执行暂时失败，请稍后重试或联系会话所有者" : "当前请求暂时无法执行，请稍后重试";
        return SessionClientEvent.error(SessionClientProtocol.VERSION, error.seq(), sessionVersion, code, message);
    }

    private SessionClientEvent event(String type, long seq, long sessionVersion, Object data) {
        return SessionClientEvent.data(SessionClientProtocol.VERSION, type, seq, sessionVersion, data);
    }

    private static String text(JsonNode node, String name) {
        JsonNode value = node.path(name);
        return value.isTextual() ? value.asText() : null;
    }

    private static Integer number(JsonNode node, String name) {
        JsonNode value = node.path(name);
        return value.isInt() || value.isLong() ? value.asInt() : null;
    }
}
