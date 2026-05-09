package com.exceptioncoder.toolbox.webterm.api.dto;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", include = JsonTypeInfo.As.PROPERTY)
public sealed interface ServerMessage
        permits ServerMessage.Ready, ServerMessage.Output, ServerMessage.Exit, ServerMessage.Error {

    @JsonTypeName("ready")
    record Ready(String sessionId, String shell, String cwd, long pid) implements ServerMessage {}

    @JsonTypeName("output")
    record Output(String data) implements ServerMessage {}

    @JsonTypeName("exit")
    record Exit(int code) implements ServerMessage {}

    @JsonTypeName("error")
    record Error(String code, String message) implements ServerMessage {}
}
