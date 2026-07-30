package com.exceptioncoder.toolbox.claudechat.service;

import java.net.URI;

/**
 * 会话执行能力边界。该策略由服务端根据 WebSocket 入口决定，不能由浏览器自行声明或降级。
 */
public final class SessionExecutionPolicy {

    public static final String STANDARD = "standard";
    public static final String CONSULT_READONLY = "consult-readonly";
    public static final String CONSULT_WS_PATH = "/api/claude-chat/consult/ws";
    public static final String CONSULT_CODEX_HOME = "C:\\Users\\zhang\\.codex-account-yx";

    private SessionExecutionPolicy() {
    }

    public static String forWebSocket(URI uri) {
        return uri != null && CONSULT_WS_PATH.equals(uri.getPath()) ? CONSULT_READONLY : STANDARD;
    }

    public static String normalize(String value) {
        return CONSULT_READONLY.equals(value) ? CONSULT_READONLY : STANDARD;
    }

    public static boolean isConsultReadonly(String value) {
        return CONSULT_READONLY.equals(normalize(value));
    }
}
