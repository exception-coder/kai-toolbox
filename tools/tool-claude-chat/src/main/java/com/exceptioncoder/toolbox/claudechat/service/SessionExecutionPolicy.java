package com.exceptioncoder.toolbox.claudechat.service;

import java.net.URI;

/**
 * 会话执行能力边界。该策略由服务端根据 WebSocket 入口决定，不能由浏览器自行声明或降级。
 */
public final class SessionExecutionPolicy {

    public static final String STANDARD = "standard";
    public static final String CONSULT_READONLY = "consult-readonly";
    public static final String REVIEW_ONLY = "review-only";
    public static final String DELEGATED_DEVELOPMENT = "delegated-development";
    public static final String DELEGATED_REQUEST_ONLY = "delegated-request-only";
    public static final String CONSULT_WS_PATH = "/api/claude-chat/consult/ws";
    public static final String REVIEW_WS_PATH = "/api/claude-chat/review/ws";
    public static final String SESSION_CLIENT_WS_PATH = "/api/session-client/v1/ws";
    public static final String CONSULT_GROUP_NAME = "业务咨询";

    private SessionExecutionPolicy() {
    }

    public static String forWebSocket(URI uri) {
        if (uri != null && CONSULT_WS_PATH.equals(uri.getPath())) return CONSULT_READONLY;
        if (uri != null && REVIEW_WS_PATH.equals(uri.getPath())) return REVIEW_ONLY;
        if (uri != null && SESSION_CLIENT_WS_PATH.equals(uri.getPath())) return DELEGATED_DEVELOPMENT;
        return STANDARD;
    }

    public static String normalize(String value) {
        if (CONSULT_READONLY.equals(value)) return CONSULT_READONLY;
        if (REVIEW_ONLY.equals(value)) return REVIEW_ONLY;
        if (DELEGATED_DEVELOPMENT.equals(value)) return DELEGATED_DEVELOPMENT;
        if (DELEGATED_REQUEST_ONLY.equals(value)) return DELEGATED_REQUEST_ONLY;
        return STANDARD;
    }

    public static boolean isConsultReadonly(String value) {
        return CONSULT_READONLY.equals(normalize(value));
    }

    public static boolean isReviewOnly(String value) {
        return REVIEW_ONLY.equals(normalize(value));
    }

    public static boolean isDelegatedDevelopment(String value) {
        return DELEGATED_DEVELOPMENT.equals(normalize(value));
    }

    public static boolean isDelegatedTurn(String value) {
        String normalized = normalize(value);
        return DELEGATED_DEVELOPMENT.equals(normalized) || DELEGATED_REQUEST_ONLY.equals(normalized);
    }

    /** WebSocket 入口和目标会话必须属于同一执行域，避免咨询与开发会话交叉接管。 */
    public static boolean canBind(String channelPolicy, String targetPolicy) {
        String channel = normalize(channelPolicy);
        String target = normalize(targetPolicy);
        return channel.equals(target)
                || (STANDARD.equals(channel) && REVIEW_ONLY.equals(target))
                || (DELEGATED_DEVELOPMENT.equals(channel) && STANDARD.equals(target));
    }

    /** 官方 Claude/Codex 会话保留浏览器指定的 Codex 授权目录，供会话内切换到 Codex 时复用。 */
    public static String resolveCodexHome(String engine, String apiBaseUrl, String requestedCodexHome) {
        if (apiBaseUrl != null || (!"claude".equals(engine) && !"codex".equals(engine))) {
            return null;
        }
        return requestedCodexHome == null || requestedCodexHome.isBlank() ? null : requestedCodexHome.trim();
    }
}
