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
                ServerMessage.QuestionRequest, ServerMessage.Result, ServerMessage.Error {

    long seq();

    @JsonTypeName("ready")
    record Ready(long seq, String sessionId, String sdkSessionId) implements ServerMessage {}

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

    @JsonTypeName("result")
    record Result(long seq, Map<String, Object> usage, String stopReason) implements ServerMessage {}

    @JsonTypeName("error")
    record Error(long seq, String code, String message) implements ServerMessage {}
}
