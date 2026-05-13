package com.exceptioncoder.toolbox.webterm.api.dto;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", include = JsonTypeInfo.As.PROPERTY)
public sealed interface ServerMessage
        permits ServerMessage.Ready, ServerMessage.Output, ServerMessage.Exit, ServerMessage.Error {

    @JsonTypeName("ready")
    // reused = true 表示这次连接被服务端识别为「接回已有 PTY」（attach，或 open 时检测到同 cwd+shell
    // 已有活进程而自动复用）。前端据此跳过 autorun 注入，避免对 claude 重复打命令。
    record Ready(String sessionId, String shell, String cwd, long pid, boolean reused) implements ServerMessage {}

    @JsonTypeName("output")
    record Output(String data) implements ServerMessage {}

    @JsonTypeName("exit")
    record Exit(int code) implements ServerMessage {}

    @JsonTypeName("error")
    record Error(String code, String message) implements ServerMessage {}
}
